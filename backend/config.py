import os
from dataclasses import dataclass
from typing import Dict

# Resolve path to backend/.env relative to config.py location
CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(CONFIG_DIR, ".env")

try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=ENV_PATH, override=False)
except ImportError:
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key and key not in os.environ:
                        os.environ[key] = val

GEMINI_MODE = os.environ.get("GEMINI_MODE", "simulated")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
OLLAMA_CONCURRENCY = float(os.environ.get("OLLAMA_CONCURRENCY", "1.0"))

# SMTP & Auth Configuration
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", os.environ.get("SMTP_USERNAME", ""))
SMTP_USE_TLS = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"

JWT_SECRET = os.environ.get("JWT_SECRET", "secondbrain-runtime-secret-key-2026")
OTP_EXPIRY_SECONDS = int(os.environ.get("OTP_EXPIRY_SECONDS", "300"))
OTP_MAX_ATTEMPTS = int(os.environ.get("OTP_MAX_ATTEMPTS", "5"))
OTP_RESEND_COOLDOWN_SECONDS = int(os.environ.get("OTP_RESEND_COOLDOWN_SECONDS", "60"))

@dataclass
class ModelQuotaConfig:
    rpm_limit: int
    tpm_limit: int
    rpd_limit: int

DEFAULT_MODEL_QUOTAS: Dict[str, ModelQuotaConfig] = {
    "gemini-2.5-flash": ModelQuotaConfig(rpm_limit=5, tpm_limit=250000, rpd_limit=20),
    "gemini-2.5-flash-lite": ModelQuotaConfig(rpm_limit=10, tpm_limit=250000, rpd_limit=20),
    "gemini-flash": ModelQuotaConfig(rpm_limit=5, tpm_limit=250000, rpd_limit=20),
    "gemini-flash-lite": ModelQuotaConfig(rpm_limit=10, tpm_limit=250000, rpd_limit=20),
    "ollama-local": ModelQuotaConfig(rpm_limit=10, tpm_limit=250000, rpd_limit=100),
}
