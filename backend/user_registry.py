"""
UserRegistry Abstraction for SecondBrain Runtime.

Provides user storage, registration validation, and active status checks.
Can be backed by in-memory dict, database, or environment config.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import os

try:
    from .config import SMTP_USERNAME, SMTP_FROM
except ImportError:
    from config import SMTP_USERNAME, SMTP_FROM


class BaseUserRegistry(ABC):
    """Abstract Base Class for User Management and Verification."""

    @abstractmethod
    def get_user(self, email: str) -> Optional[Dict[str, Any]]:
        """Retrieve user profile dictionary by email address."""
        pass

    @abstractmethod
    def is_active_user(self, email: str) -> bool:
        """Check if an email belongs to an active registered user."""
        pass

    @abstractmethod
    def register_user(
        self,
        email: str,
        name: str = "Registered User",
        role: str = "operator",
        active: bool = True
    ) -> Dict[str, Any]:
        """Register a new user account."""
        pass

    @abstractmethod
    def list_users(self) -> List[Dict[str, Any]]:
        """Return list of all registered users."""
        pass


class InMemoryUserRegistry(BaseUserRegistry):
    """Production-ready User Registry implementation backed by in-memory storage
    with automatic environment configuration seeding.
    """

    def __init__(self):
        self.users: Dict[str, Dict[str, Any]] = {}
        self._seed_default_users()

    def _seed_default_users(self):
        """Seeds default operator accounts, configured SMTP address, and env-configured emails."""
        default_accounts = [
            ("sre-admin@secondbrain.ai", "SRE Admin", "sre-admin"),
            ("operator@secondbrain.ai", "Cluster Operator", "operator"),
            ("admin@secondbrain.ai", "System Admin", "admin")
        ]
        for email, name, role in default_accounts:
            self.register_user(email=email, name=name, role=role, active=True)

        # Seed configured SMTP email if present
        smtp_email = (SMTP_FROM or SMTP_USERNAME or "").strip().lower()
        if smtp_email and smtp_email not in self.users:
            self.register_user(email=smtp_email, name="Configured SMTP Operator", role="admin", active=True)

        # Support REGISTERED_USERS env variable (comma-separated list of additional registered emails)
        env_registered = os.environ.get("REGISTERED_USERS", "")
        if env_registered:
            for em in env_registered.split(","):
                em_clean = em.strip().lower()
                if em_clean and em_clean not in self.users:
                    self.register_user(email=em_clean, name="Configured Operator", role="operator", active=True)

    def get_user(self, email: str) -> Optional[Dict[str, Any]]:
        email_clean = email.strip().lower()
        return self.users.get(email_clean)

    def is_active_user(self, email: str) -> bool:
        user = self.get_user(email)
        return bool(user and user.get("active", True))

    def register_user(
        self,
        email: str,
        name: str = "Registered User",
        role: str = "operator",
        active: bool = True
    ) -> Dict[str, Any]:
        email_clean = email.strip().lower()
        user_info = {
            "email": email_clean,
            "name": name,
            "role": role,
            "active": active
        }
        self.users[email_clean] = user_info
        return user_info

    def set_active_status(self, email: str, active: bool) -> bool:
        user = self.get_user(email)
        if user:
            user["active"] = active
            return True
        return False

    def list_users(self) -> List[Dict[str, Any]]:
        return list(self.users.values())
