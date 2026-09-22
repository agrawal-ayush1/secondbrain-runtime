import os
from dataclasses import dataclass
from typing import Dict

GEMINI_MODE = os.environ.get("GEMINI_MODE", "simulated")

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
}
