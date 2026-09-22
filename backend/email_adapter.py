"""
EmailAdapter Interface & SMTP Email Provider Implementation.

Provides real production-grade email delivery abstraction for SecondBrain Runtime.
"""

from abc import ABC, abstractmethod
import smtplib
import socket
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

try:
    from .config import (
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USERNAME,
        SMTP_PASSWORD,
        SMTP_FROM,
        SMTP_USE_TLS
    )
except ImportError:
    from config import (
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USERNAME,
        SMTP_PASSWORD,
        SMTP_FROM,
        SMTP_USE_TLS
    )


class SMTPConfigError(Exception):
    """Raised when mandatory SMTP configuration parameters are missing or invalid."""
    pass


class SMTPSendError(Exception):
    """Raised when SMTP connection or message dispatch fails."""
    pass


class EmailAdapter(ABC):
    """Abstract interface for authentication email delivery."""

    @abstractmethod
    def send_otp_email(self, to_email: str, otp_code: str) -> bool:
        """Sends an OTP authentication code to a recipient email address."""
        pass


class SMTPEmailAdapter(EmailAdapter):
    """Production SMTP email adapter delivering real authentication emails over TLS."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        from_addr: Optional[str] = None,
        use_tls: Optional[bool] = None
    ):
        self.host = host if host is not None else SMTP_HOST
        self.port = port if port is not None else SMTP_PORT
        self.username = username if username is not None else SMTP_USERNAME
        self.password = password if password is not None else SMTP_PASSWORD
        self.from_addr = from_addr if from_addr is not None else (SMTP_FROM or self.username)
        self.use_tls = use_tls if use_tls is not None else SMTP_USE_TLS

    def validate_config(self) -> None:
        """Verifies that mandatory SMTP credentials and host settings are configured."""
        if not self.host:
            raise SMTPConfigError("SMTP host is not configured (SMTP_HOST missing).")
        if not self.username or not self.password:
            raise SMTPConfigError(
                "SMTP credentials missing. Please configure SMTP_USERNAME and SMTP_PASSWORD in backend/.env."
            )

    def send_otp_email(self, to_email: str, otp_code: str) -> bool:
        """Delivers real 6-digit OTP code to recipient via SMTP protocol over TLS."""
        self.validate_config()

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "SecondBrain Runtime - Verification Code"
        msg["From"] = f"SecondBrain Security <{self.from_addr}>"
        msg["To"] = to_email

        text_content = (
            f"Your SecondBrain Runtime authentication verification code is: {otp_code}\n\n"
            "This code will expire in 5 minutes. If you did not request this code, please ignore this email."
        )

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; margin: 0; padding: 20px; }}
            .container {{ max-width: 500px; margin: 0 auto; background: #131b2e; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
            .brand {{ font-size: 18px; font-weight: bold; color: #38bdf8; letter-spacing: 1px; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }}
            .title {{ font-size: 20px; font-weight: 600; color: #f8fafc; margin-bottom: 12px; }}
            .text {{ font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }}
            .otp-box {{ background: #0f172a; border: 1px solid #38bdf8; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; }}
            .otp-code {{ font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: bold; color: #38bdf8; letter-spacing: 8px; }}
            .footer {{ font-size: 12px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.05); pt: 16px; margin-top: 24px; text-align: center; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="brand">⚡ SECONDBRAIN RUNTIME</div>
            <div class="title">Authentication Code</div>
            <div class="text">Use the 6-digit verification code below to complete your sign-in to the SecondBrain Runtime Operator Console:</div>
            <div class="otp-box">
              <div class="otp-code">{otp_code}</div>
            </div>
            <div class="text">This verification code expires in <strong>5 minutes</strong>. Do not share this code with anyone.</div>
            <div class="footer">SecondBrain Runtime &bull; Concurrent Workload Orchestration</div>
          </div>
        </body>
        </html>
        """

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        try:
            with smtplib.SMTP(self.host, self.port, timeout=10.0) as server:
                server.ehlo()
                if self.use_tls:
                    server.starttls()
                    server.ehlo()
                server.login(self.username, self.password)
                server.send_message(msg)
            return True
        except smtplib.SMTPAuthenticationError as e:
            raise SMTPSendError(f"SMTP Authentication Failed: {e.smtp_error.decode('utf-8', errors='ignore') if isinstance(e.smtp_error, bytes) else str(e)}")
        except (smtplib.SMTPException, socket.error, OSError) as e:
            raise SMTPSendError(f"SMTP Connection / Delivery Failed: {str(e)}")
