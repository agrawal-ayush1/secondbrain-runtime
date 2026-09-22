"""
ResourceAdapter Interface & Implementations for SecondBrain Runtime.

Provides a unified integration boundary for AI model execution providers,
database workers, search tools, and simulated runtime resource adapters.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import sys
import os

try:
    from .models import ResourceHealthState, FailureType, FailureEvent
    from .gemini_adapter import GeminiAdapter, SimulatedGeminiAdapter, RealGeminiAdapter, ExecutionResult, QuotaTracker
    from .ollama_adapter import OllamaAdapter
    from .resource_manager import ResourceManager
except ImportError:
    from models import ResourceHealthState, FailureType, FailureEvent
    from gemini_adapter import GeminiAdapter, SimulatedGeminiAdapter, RealGeminiAdapter, ExecutionResult, QuotaTracker
    from ollama_adapter import OllamaAdapter
    from resource_manager import ResourceManager


class ResourceAdapter(ABC):
    """Abstract base class for all SecondBrain resource adapters."""

    @abstractmethod
    def health(self, resource_id: str, resource_manager: Optional[ResourceManager] = None) -> ResourceHealthState:
        """Query the health state of a resource."""
        pass

    @abstractmethod
    def capacity(self, resource_id: str, resource_manager: Optional[ResourceManager] = None) -> Dict[str, float]:
        """Query total capacity limits for a resource."""
        pass

    @abstractmethod
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
        """Execute a workload unit on a resource."""
        pass

    @abstractmethod
    def release(self, reservation_id: str, resource_manager: Optional[ResourceManager] = None) -> bool:
        """Release a reservation held on a resource."""
        pass


class SimulatedResourceAdapter(ResourceAdapter):
    """Resource adapter providing deterministic simulated runtime execution."""

    def __init__(self, quota_tracker: Optional[QuotaTracker] = None):
        self.gemini_adapter = SimulatedGeminiAdapter(quota_tracker=quota_tracker)
        self.ollama_adapter = OllamaAdapter()

    def health(self, resource_id: str, resource_manager: Optional[ResourceManager] = None) -> ResourceHealthState:
        if resource_id == "ollama-local":
            return self.ollama_adapter.health(resource_id, resource_manager)
        if resource_manager:
            res = resource_manager.get_resource(resource_id)
            if res:
                return res.state
        return ResourceHealthState.AVAILABLE

    def capacity(self, resource_id: str, resource_manager: Optional[ResourceManager] = None) -> Dict[str, float]:
        if resource_id == "ollama-local":
            return self.ollama_adapter.capacity(resource_id, resource_manager)
        if resource_manager:
            res = resource_manager.get_resource(resource_id)
            if res:
                return res.capacity
        return {"rpm": 10.0}

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
        if resource_id == "ollama-local":
            return self.ollama_adapter.execute(
                workflow_id=workflow_id,
                resource_id=resource_id,
                input_data=input_data,
                estimated_tokens=estimated_tokens,
                timestamp=timestamp,
                current_time_num=current_time_num,
                reservation_id=reservation_id,
                resource_manager=resource_manager
            )

        return self.gemini_adapter.execute(
            workflow_id=workflow_id,
            resource_id=resource_id,
            input_data=input_data,
            estimated_tokens=estimated_tokens,
            timestamp=timestamp,
            current_time_num=current_time_num,
            reservation_id=reservation_id,
            resource_manager=resource_manager
        )

    def release(self, reservation_id: str, resource_manager: Optional[ResourceManager] = None) -> bool:
        if resource_manager:
            return resource_manager.release(reservation_id)
        return False


# Register adapters with ResourceAdapter
ResourceAdapter.register(GeminiAdapter)
ResourceAdapter.register(SimulatedGeminiAdapter)
ResourceAdapter.register(RealGeminiAdapter)
ResourceAdapter.register(OllamaAdapter)
