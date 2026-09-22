"""
AuthManager for SecondBrain Runtime Authentication.

Manages cryptographically hashed OTPs, user registry, rate-limiting cooldowns,
SMTP email dispatch, and JWT session token generation.
"""

import time
import secrets
import hashlib
import hmac
import base64
import json
from typing import Dict, Any, Optional, Set
from fastapi import HTTPException, status

try:
    from .config import (
        JWT_SECRET,
        OTP_EXPIRY_SECONDS,
        OTP_MAX_ATTEMPTS,
        OTP_RESEND_COOLDOWN_SECONDS,
        SMTP_USERNAME,
        SMTP_FROM
    )
    from .email_adapter import EmailAdapter, SMTPEmailAdapter, SMTPConfigError, SMTPSendError
    from .user_registry import BaseUserRegistry, InMemoryUserRegistry
except ImportError:
    from config import (
        JWT_SECRET,
        OTP_EXPIRY_SECONDS,
        OTP_MAX_ATTEMPTS,
        OTP_RESEND_COOLDOWN_SECONDS,
        SMTP_USERNAME,
        SMTP_FROM
    )
    from email_adapter import EmailAdapter, SMTPEmailAdapter, SMTPConfigError, SMTPSendError
    from user_registry import BaseUserRegistry, InMemoryUserRegistry


class AuthManager:
    """Manages secure OTP authentication flow, SMTP dispatch, and session token generation."""

    def __init__(
        self,
        email_adapter: Optional[EmailAdapter] = None,
        user_registry: Optional[BaseUserRegistry] = None
    ):
        self.email_adapter: EmailAdapter = email_adapter or SMTPEmailAdapter()
        self.user_registry: BaseUserRegistry = user_registry or InMemoryUserRegistry()
        self.otp_store: Dict[str, Dict[str, Any]] = {}

    def register_user(self, email: str, name: str = "Registered User", role: str = "operator", active: bool = True) -> Dict[str, Any]:
        """Registers a new user account via the UserRegistry."""
        return self.user_registry.register_user(email=email, name=name, role=role, active=active)

    def is_registered_user(self, email: str) -> bool:
        """Checks whether the given email belongs to a registered user."""
        return self.user_registry.get_user(email) is not None

    def is_active_user(self, email: str) -> bool:
        """Checks whether the given email belongs to an active registered user."""
        return self.user_registry.is_active_user(email)

    def _hash_otp(self, otp: str, salt: str) -> str:
        """Returns SHA-256 hash of OTP concatenated with salt."""
        return hashlib.sha256((otp + salt).encode("utf-8")).hexdigest()

    def request_otp(self, email: str) -> Dict[str, Any]:
        """Validates user eligibility, enforces resend cooldown, generates cryptographic OTP,
        and dispatches via SMTP EmailAdapter. OTP is never stored in plaintext or logged.
        """
        email_clean = email.strip().lower()

        # 1. Enforce requirement: Only registered & active users may request OTP
        user = self.user_registry.get_user(email_clean)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Email address '{email}' is not a registered user account."
            )

        if not user.get("active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: User account for '{email}' is currently inactive."
            )

        now = time.time()
        existing_record = self.otp_store.get(email_clean)

        # 2. Enforce resend cooldown (60 seconds)
        if existing_record:
            resend_after = existing_record.get("resend_after", 0)
            if now < resend_after:
                remaining = int(resend_after - now)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Resend Cooldown Active: Please wait {remaining} seconds before requesting a new code."
                )

        # 3. Cryptographically generate 6-digit numeric OTP
        raw_otp = str(secrets.randbelow(900000) + 100000)
        salt = secrets.token_hex(16)
        otp_hash = self._hash_otp(raw_otp, salt)

        # 4. Dispatch OTP via SMTP EmailAdapter
        try:
            self.email_adapter.send_otp_email(email_clean, raw_otp)
        except SMTPConfigError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Email Configuration Error: {str(e)}"
            )
        except SMTPSendError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Email Delivery Error: {str(e)}"
            )

        # 5. Store ONLY hash, salt, expiry (300s), attempts count (0), and resend_after (60s)
        self.otp_store[email_clean] = {
            "hash": otp_hash,
            "salt": salt,
            "created_at": now,
            "expires_at": now + OTP_EXPIRY_SECONDS,
            "resend_after": now + OTP_RESEND_COOLDOWN_SECONDS,
            "attempts": 0
        }

        # Clear raw OTP variable from local scope immediately
        del raw_otp

        return {
            "status": "success",
            "message": f"Verification code sent to {email_clean}. Please check your email inbox.",
            "expires_in_seconds": OTP_EXPIRY_SECONDS,
            "resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS
        }

    def verify_otp(self, email: str, otp_input: str) -> Dict[str, Any]:
        """Verifies input OTP against stored hash, enforces 5-attempt limit and 300s expiry.
        Invalidates OTP immediately on success or when attempt limit is exceeded.
        """
        email_clean = email.strip().lower()
        record = self.otp_store.get(email_clean)

        if not record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired verification request. Please request a new verification code."
            )

        now = time.time()

        # 1. Check expiration (300 seconds)
        if now > record["expires_at"]:
            self.otp_store.pop(email_clean, None)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code has expired. Please request a new verification code."
            )

        # 2. Check if attempts were already exhausted prior to this request
        if record["attempts"] >= OTP_MAX_ATTEMPTS:
            self.otp_store.pop(email_clean, None)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum verification attempts ({OTP_MAX_ATTEMPTS}) exceeded. Code invalidated. Please request a new code."
            )

        # 3. Hash input and verify match FIRST (allowing 5th attempt to succeed if correct)
        input_hash = self._hash_otp(otp_input.strip(), record["salt"])
        if not secrets.compare_digest(input_hash, record["hash"]):
            record["attempts"] += 1
            if record["attempts"] >= OTP_MAX_ATTEMPTS:
                self.otp_store.pop(email_clean, None)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Maximum verification attempts ({OTP_MAX_ATTEMPTS}) exceeded. Code invalidated. Please request a new code."
                )
            remaining = OTP_MAX_ATTEMPTS - record["attempts"]
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid verification code. {remaining} attempts remaining."
            )

        # 4. Success! Immediately invalidate OTP from store
        self.otp_store.pop(email_clean, None)

        user_info = self.user_registry.get_user(email_clean) or {
            "email": email_clean,
            "name": "Operator",
            "role": "operator"
        }

        # 5. Issue JWT session token
        token = self.create_session_token(user_info)

        return {
            "status": "success",
            "message": "Authentication successful.",
            "token": token,
            "user": user_info
        }

    def create_session_token(self, user_info: Dict[str, Any]) -> str:
        """Creates a signed HMAC-SHA256 JWT session token."""
        header = {"alg": "HS256", "typ": "JWT"}
        now = int(time.time())
        payload = {
            "sub": user_info["email"],
            "name": user_info.get("name", "User"),
            "role": user_info.get("role", "operator"),
            "iat": now,
            "exp": now + 86400  # 24 hours session
        }

        header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
        payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")

        signing_input = f"{header_b64}.{payload_b64}".encode()
        signature = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
        sig_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")

        return f"{header_b64}.{payload_b64}.{sig_b64}"

    def verify_session_token(self, token: str) -> Dict[str, Any]:
        """Verifies JWT token signature and expiration, returning user payload."""
        try:
            parts = token.strip().split(".")
            if len(parts) != 3:
                raise ValueError("Malformed token format")

            header_b64, payload_b64, sig_b64 = parts

            # Re-compute signature
            signing_input = f"{header_b64}.{payload_b64}".encode()
            expected_sig = hmac.new(JWT_SECRET.encode(), signing_input, hashlib.sha256).digest()
            expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")

            if not secrets.compare_digest(sig_b64, expected_sig_b64):
                raise ValueError("Invalid token signature")

            # Decode payload
            padding = "=" * (4 - len(payload_b64) % 4)
            payload_json = base64.urlsafe_b64decode((payload_b64 + padding).encode()).decode()
            payload = json.loads(payload_json)

            if int(time.time()) > payload.get("exp", 0):
                raise ValueError("Session token expired")

            return payload
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid or expired authentication session: {str(e)}"
            )


# Default Singleton AuthManager instance
auth_manager = AuthManager()
