import sys
import os
import time
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from .email_adapter import SMTPEmailAdapter, SMTPConfigError, SMTPSendError
    from .auth_manager import AuthManager
    from .server import app
except ImportError:
    from email_adapter import SMTPEmailAdapter, SMTPConfigError, SMTPSendError
    from auth_manager import AuthManager
    from server import app


class TestRealSMTPAuth(unittest.TestCase):

    def setUp(self):
        self.mock_email_adapter = MagicMock()
        self.auth = AuthManager(email_adapter=self.mock_email_adapter)
        self.auth.register_user("sre-admin@secondbrain.ai", "SRE Admin", "sre-admin")

    def test_smtp_adapter_missing_config_raises_error(self):
        """Test 1: SMTPEmailAdapter raises SMTPConfigError when credentials are missing."""
        adapter = SMTPEmailAdapter(username="", password="")
        with self.assertRaises(SMTPConfigError):
            adapter.send_otp_email("user@example.com", "123456")

    @patch("smtplib.SMTP")
    def test_smtp_adapter_send_success(self, mock_smtp):
        """Test 2: SMTPEmailAdapter connects over TLS and dispatches MIME message."""
        instance = mock_smtp.return_value.__enter__.return_value
        adapter = SMTPEmailAdapter(
            host="smtp.gmail.com",
            port=587,
            username="sender@gmail.com",
            password="app-password-123",
            use_tls=True
        )

        success = adapter.send_otp_email("user@example.com", "987654")
        self.assertTrue(success)
        instance.starttls.assert_called_once()
        instance.login.assert_called_once_with("sender@gmail.com", "app-password-123")
        instance.send_message.assert_called_once()

    def test_unregistered_user_denied_otp(self):
        """Test 3: Unregistered user receives HTTP 403 Forbidden when requesting OTP."""
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            self.auth.request_otp("unregistered-random-user@domain.com")
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("not a registered user account", ctx.exception.detail)

    def test_otp_hashing_and_no_plaintext_stored(self):
        """Test 4: OTP is cryptographically hashed and stored only as SHA-256 string."""
        res = self.auth.request_otp("sre-admin@secondbrain.ai")
        self.assertEqual(res["status"], "success")

        # Verify OTP was dispatched via EmailAdapter
        self.mock_email_adapter.send_otp_email.assert_called_once()
        sent_email, sent_otp = self.mock_email_adapter.send_otp_email.call_args[0]
        self.assertEqual(sent_email, "sre-admin@secondbrain.ai")
        self.assertEqual(len(sent_otp), 6)

        # Inspect internal storage: MUST NOT contain raw sent_otp
        record = self.auth.otp_store.get("sre-admin@secondbrain.ai")
        self.assertIsNotNone(record)
        self.assertNotIn("otp", record)
        self.assertNotIn(sent_otp, str(record))
        self.assertIn("hash", record)
        self.assertIn("salt", record)

    def test_resend_cooldown_enforced(self):
        """Test 5: Resend cooldown (60s) rejects duplicate requests."""
        from fastapi import HTTPException
        self.auth.request_otp("sre-admin@secondbrain.ai")
        with self.assertRaises(HTTPException) as ctx:
            self.auth.request_otp("sre-admin@secondbrain.ai")
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Resend Cooldown Active", ctx.exception.detail)

    def test_max_verification_attempts_limit(self):
        """Test 6: Invalid verification attempts are capped at 5 max attempts."""
        from fastapi import HTTPException
        self.auth.request_otp("sre-admin@secondbrain.ai")

        # Submit 5 wrong OTP attempts (5th attempt exceeds limit and raises 429)
        for i in range(5):
            with self.assertRaises(HTTPException) as ctx:
                self.auth.verify_otp("sre-admin@secondbrain.ai", "000000")
            if i < 4:
                self.assertEqual(ctx.exception.status_code, 401)
            else:
                self.assertEqual(ctx.exception.status_code, 429)

        # Subsequent attempt fails because OTP record was invalidated
        with self.assertRaises(HTTPException) as ctx:
            self.auth.verify_otp("sre-admin@secondbrain.ai", "000000")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid or expired verification request", ctx.exception.detail)

    def test_otp_invalidation_after_successful_verification(self):
        """Test 7: Successful verification invalidates OTP and issues valid JWT session token."""
        self.auth.request_otp("sre-admin@secondbrain.ai")
        raw_otp = self.mock_email_adapter.send_otp_email.call_args[0][1]

        verify_res = self.auth.verify_otp("sre-admin@secondbrain.ai", raw_otp)
        self.assertEqual(verify_res["status"], "success")
        self.assertIn("token", verify_res)

        # Confirm OTP was deleted from store immediately
        self.assertNotIn("sre-admin@secondbrain.ai", self.auth.otp_store)

        # Re-submitting same OTP must be rejected
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            self.auth.verify_otp("sre-admin@secondbrain.ai", raw_otp)

    def test_jwt_session_token_validation(self):
        """Test 8: JWT session token is properly signed and verified."""
        user = {"email": "sre-admin@secondbrain.ai", "name": "SRE Admin", "role": "admin"}
        token = self.auth.create_session_token(user)

        payload = self.auth.verify_session_token(token)
        self.assertEqual(payload["sub"], "sre-admin@secondbrain.ai")
        self.assertEqual(payload["role"], "admin")

    def test_auth_api_endpoints_flow(self):
        """Test 9: End-to-end FastAPI endpoint integration test."""
        client = TestClient(app)
        
        with patch("backend.auth_manager.auth_manager.email_adapter.send_otp_email") as mock_send:
            mock_send.return_value = True

            # 1. Request OTP
            resp1 = client.post("/api/v1/auth/request-otp", json={"email": "sre-admin@secondbrain.ai"})
            self.assertEqual(resp1.status_code, 200)
            data1 = resp1.json()
            self.assertEqual(data1["status"], "success")
            self.assertNotIn("otp", data1)

            mock_send.assert_called_once()
            raw_otp = mock_send.call_args[0][1]

            # 2. Verify OTP
            resp2 = client.post("/api/v1/auth/verify-otp", json={"email": "sre-admin@secondbrain.ai", "otp": raw_otp})
            self.assertEqual(resp2.status_code, 200)
            data2 = resp2.json()
            token = data2["token"]

    def test_multiple_registered_emails_otp_delivery(self):
        """Test 10: Multiple different registered emails can request OTP and each OTP is delivered to the target address."""
        emails = [
            "sre-admin@secondbrain.ai",
            "operator@secondbrain.ai",
            "custom-dev@secondbrain.ai"
        ]
        self.auth.register_user("custom-dev@secondbrain.ai", "Dev User", "developer")

        for email in emails:
            self.mock_email_adapter.reset_mock()
            res = self.auth.request_otp(email)
            self.assertEqual(res["status"], "success")
            self.mock_email_adapter.send_otp_email.assert_called_once()
            sent_to, sent_otp = self.mock_email_adapter.send_otp_email.call_args[0]
            self.assertEqual(sent_to, email)
            self.assertEqual(len(sent_otp), 6)

    def test_inactive_user_rejected(self):
        """Test 11: Inactive registered user is denied OTP request with 403 Forbidden."""
        from fastapi import HTTPException
        self.auth.register_user("inactive-user@secondbrain.ai", "Inactive User", "operator", active=False)

        with self.assertRaises(HTTPException) as ctx:
            self.auth.request_otp("inactive-user@secondbrain.ai")
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("currently inactive", ctx.exception.detail)

    def test_fifth_attempt_succeeds_if_correct(self):
        """Test 12: The 5th verification attempt is allowed to succeed if the OTP is correct."""
        from fastapi import HTTPException
        self.auth.request_otp("sre-admin@secondbrain.ai")
        raw_otp = self.mock_email_adapter.send_otp_email.call_args[0][1]

        # Submit 4 WRONG attempts (attempts 1..4 fail with 401)
        for _ in range(4):
            with self.assertRaises(HTTPException) as ctx:
                self.auth.verify_otp("sre-admin@secondbrain.ai", "000000")
            self.assertEqual(ctx.exception.status_code, 401)

        # 5th attempt WITH CORRECT OTP must succeed!
        res = self.auth.verify_otp("sre-admin@secondbrain.ai", raw_otp)
        self.assertEqual(res["status"], "success")
        self.assertIn("token", res)


if __name__ == "__main__":
    unittest.main()
