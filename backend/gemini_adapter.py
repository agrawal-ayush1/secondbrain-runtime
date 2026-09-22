import os
from dataclasses import dataclass, field
from typing import Dict, Any, Optional
from models import FailureEvent, FailureType, ReservationStatus
from config import ModelQuotaConfig, DEFAULT_MODEL_QUOTAS, GEMINI_MODE
from resource_manager import ResourceManager

@dataclass
class ExecutionResult:
    success: bool
    resource_id: str
    output: Optional[str] = None
    tokens_used: int = 0
    duration: float = 0.0
    failure_event: Optional[FailureEvent] = None


class QuotaTracker:
    """Tracks per-resource RPM, TPM, and RPD usage across simulated time windows."""

    def __init__(self, quotas: Optional[Dict[str, ModelQuotaConfig]] = None):
        self.quotas: Dict[str, ModelQuotaConfig] = quotas or DEFAULT_MODEL_QUOTAS
        self.requests_in_current_minute: Dict[str, int] = {}
        self.tokens_in_current_minute: Dict[str, int] = {}
        self.requests_today: Dict[str, int] = {}
        self.current_minute_window: float = -1.0
        self.current_day_window: float = -1.0

    def _update_windows(self, current_time_num: float) -> None:
        minute_idx = float(int(current_time_num))
        day_idx = float(int(current_time_num // 1440.0))

        if minute_idx != self.current_minute_window:
            self.current_minute_window = minute_idx
            self.requests_in_current_minute.clear()
            self.tokens_in_current_minute.clear()

        if day_idx != self.current_day_window:
            self.current_day_window = day_idx
            self.requests_today.clear()

    def check_quota(
        self,
        resource_id: str,
        estimated_tokens: int = 1000,
        current_time_num: float = 0.0
    ) -> Optional[FailureType]:
        """Checks RPM, TPM, and RPD limits for a resource at current_time_num."""
        self._update_windows(current_time_num)
        config = self.quotas.get(resource_id)
        if not config:
            return None

        # 1. Check daily RPD limit
        current_rpd = self.requests_today.get(resource_id, 0)
        if current_rpd + 1 > config.rpd_limit:
            return FailureType.QUOTA_EXHAUSTED

        # 2. Check minute RPM limit
        current_rpm = self.requests_in_current_minute.get(resource_id, 0)
        if current_rpm + 1 > config.rpm_limit:
            return FailureType.RATE_LIMITED

        # 3. Check minute TPM limit
        current_tpm = self.tokens_in_current_minute.get(resource_id, 0)
        if current_tpm + estimated_tokens > config.tpm_limit:
            return FailureType.RATE_LIMITED

        return None

    def record_usage(self, resource_id: str, tokens_used: int, current_time_num: float = 0.0) -> None:
        """Records executed request and token usage."""
        self._update_windows(current_time_num)
        self.requests_in_current_minute[resource_id] = self.requests_in_current_minute.get(resource_id, 0) + 1
        self.tokens_in_current_minute[resource_id] = self.tokens_in_current_minute.get(resource_id, 0) + tokens_used
        self.requests_today[resource_id] = self.requests_today.get(resource_id, 0) + 1


class ModelAdapter:
    """Provider-agnostic execution adapter interface."""

    def execute(
        self,
        workflow_id: str,
        resource_id: str,
        input_data: Any = None,
        estimated_tokens: int = 1000,
        timestamp: str = "10:00",
        current_time_num: float = 0.0,
        reservation_id: Optional[str] = None,
        resource_manager: Optional[ResourceManager] = None
    ) -> ExecutionResult:
        raise NotImplementedError


class GeminiAdapter(ModelAdapter):
    """Base Gemini model adapter with quota tracking."""

    def __init__(self, quota_tracker: Optional[QuotaTracker] = None):
        self.quota_tracker = quota_tracker or QuotaTracker()


class SimulatedGeminiAdapter(GeminiAdapter):
    """Deterministic simulated Gemini adapter for tests and hackathon demos."""

    def __init__(self, quota_tracker: Optional[QuotaTracker] = None):
        super().__init__(quota_tracker=quota_tracker)
        self.forced_failures: Dict[str, FailureType] = {}

    def force_failure(self, resource_id: str, failure_type: FailureType) -> None:
        """Forces a specific failure type on the next execution of resource_id."""
        self.forced_failures[resource_id] = failure_type

    def clear_forced_failures(self) -> None:
        """Clears all forced failures."""
        self.forced_failures.clear()

    def execute(
        self,
        workflow_id: str,
        resource_id: str,
        input_data: Any = None,
        estimated_tokens: int = 1000,
        timestamp: str = "10:00",
        current_time_num: float = 0.0,
        reservation_id: Optional[str] = None,
        resource_manager: Optional[ResourceManager] = None
    ) -> ExecutionResult:
        # Check forced failure first
        if resource_id in self.forced_failures:
            ftype = self.forced_failures.pop(resource_id)
            fail_event = FailureEvent(
                workflow_id=workflow_id,
                resource_id=resource_id,
                failure_type=ftype,
                timestamp=timestamp,
                message=f"Forced simulation failure: {ftype.value}"
            )
            return ExecutionResult(
                success=False,
                resource_id=resource_id,
                failure_event=fail_event
            )

        # Quota check
        quota_failure = self.quota_tracker.check_quota(resource_id, estimated_tokens, current_time_num)
        if quota_failure:
            fail_event = FailureEvent(
                workflow_id=workflow_id,
                resource_id=resource_id,
                failure_type=quota_failure,
                timestamp=timestamp,
                message=f"Quota check failed: {quota_failure.value}"
            )
            return ExecutionResult(
                success=False,
                resource_id=resource_id,
                failure_event=fail_event
            )

        # Successful execution
        actual_tokens = estimated_tokens
        self.quota_tracker.record_usage(resource_id, actual_tokens, current_time_num)

        if reservation_id and resource_manager:
            resource_manager.consume(reservation_id)

        return ExecutionResult(
            success=True,
            resource_id=resource_id,
            output=f"Simulated output for {workflow_id} on {resource_id}",
            tokens_used=actual_tokens,
            duration=1.2
        )


class RealGeminiAdapter(GeminiAdapter):
    """Optional real Gemini API adapter isolated behind environment variables."""

    def __init__(self, quota_tracker: Optional[QuotaTracker] = None):
        super().__init__(quota_tracker=quota_tracker)
        self.api_key = os.environ.get("GEMINI_API_KEY")

    def execute(
        self,
        workflow_id: str,
        resource_id: str,
        input_data: Any = None,
        estimated_tokens: int = 1000,
        timestamp: str = "10:00",
        current_time_num: float = 0.0,
        reservation_id: Optional[str] = None,
        resource_manager: Optional[ResourceManager] = None
    ) -> ExecutionResult:
        if not self.api_key or GEMINI_MODE != "real":
            fail_event = FailureEvent(
                workflow_id=workflow_id,
                resource_id=resource_id,
                failure_type=FailureType.SERVICE_UNAVAILABLE,
                timestamp=timestamp,
                message="Real Gemini API mode disabled or GEMINI_API_KEY missing."
            )
            return ExecutionResult(success=False, resource_id=resource_id, failure_event=fail_event)

        try:
            # Dynamically import SDK if available
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(resource_id)
            response = model.generate_content(str(input_data or "Hello"))
            
            if reservation_id and resource_manager:
                resource_manager.consume(reservation_id)
            
            return ExecutionResult(
                success=True,
                resource_id=resource_id,
                output=getattr(response, "text", "Success"),
                tokens_used=estimated_tokens,
                duration=1.5
            )
        except Exception as e:
            fail_event = FailureEvent(
                workflow_id=workflow_id,
                resource_id=resource_id,
                failure_type=FailureType.EXECUTION_FAILED,
                timestamp=timestamp,
                message=f"Real Gemini API error: {str(e)}"
            )
            return ExecutionResult(success=False, resource_id=resource_id, failure_event=fail_event)


def get_gemini_adapter(quota_tracker: Optional[QuotaTracker] = None) -> GeminiAdapter:
    """Factory function returning the configured Gemini adapter based on GEMINI_MODE."""
    if GEMINI_MODE == "real" and os.environ.get("GEMINI_API_KEY"):
        return RealGeminiAdapter(quota_tracker=quota_tracker)
    return SimulatedGeminiAdapter(quota_tracker=quota_tracker)
