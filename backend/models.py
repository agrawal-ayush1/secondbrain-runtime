from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional, List

class ReservationStatus(Enum):
    ACTIVE = "ACTIVE"
    CONSUMED = "CONSUMED"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"
    SOFT_RESERVED = "SOFT_RESERVED"

class WorkflowStatus(Enum):
    PENDING = "PENDING"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class FailureType(Enum):
    RATE_LIMITED = "RATE_LIMITED"
    QUOTA_EXHAUSTED = "QUOTA_EXHAUSTED"
    TIMEOUT = "TIMEOUT"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    EXECUTION_FAILED = "EXECUTION_FAILED"
    RESERVATION_EXPIRED = "RESERVATION_EXPIRED"

class ResourceHealthState(Enum):
    AVAILABLE = "AVAILABLE"
    CONSTRAINED = "CONSTRAINED"
    UNAVAILABLE = "UNAVAILABLE"


@dataclass
class FailureEvent:
    workflow_id: str
    resource_id: str
    failure_type: FailureType
    timestamp: str = "10:00"
    message: str = ""


@dataclass
class Resource:
    id: str
    name: str
    type: str
    capacity: Dict[str, float]
    usage: Dict[str, float] = field(default_factory=dict)
    reserved: Dict[str, float] = field(default_factory=dict)
    soft_reserved: Dict[str, float] = field(default_factory=dict)
    state: ResourceHealthState = ResourceHealthState.AVAILABLE
    failure_count: int = 0
    last_failure: Optional[FailureEvent] = None
    cooldown_until: Optional[float] = None

    def __post_init__(self):
        for dim in self.capacity:
            if dim not in self.usage:
                self.usage[dim] = 0.0
            if dim not in self.reserved:
                self.reserved[dim] = 0.0
            if dim not in self.soft_reserved:
                self.soft_reserved[dim] = 0.0

    def is_available_state(self, current_time: float = 0.0) -> bool:
        if self.state == ResourceHealthState.CONSTRAINED:
            if self.cooldown_until is not None and current_time >= self.cooldown_until:
                self.state = ResourceHealthState.AVAILABLE
                self.cooldown_until = None
        return self.state == ResourceHealthState.AVAILABLE

    def get_available(self) -> Dict[str, float]:
        """Calculates available capacity: available = capacity - usage - reserved - soft_reserved."""
        return {
            dim: cap - self.usage.get(dim, 0.0) - self.reserved.get(dim, 0.0) - self.soft_reserved.get(dim, 0.0)
            for dim, cap in self.capacity.items()
        }

@dataclass
class Workflow:
    id: str
    name: str
    current_task: Optional[str] = None
    completed_tasks: List[str] = field(default_factory=list)
    priority: float = 1.0
    waiting_time: float = 0.0
    status: WorkflowStatus = WorkflowStatus.PENDING
    retry_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def get_effective_priority(self, aging_factor: float = 1.0) -> float:
        """Calculates effective priority: effective_priority = base_priority + aging_factor * waiting_time."""
        return self.priority + (aging_factor * self.waiting_time)



@dataclass
class Prediction:
    id: str
    workflow_id: str
    resource_id: str
    requested_dimensions: Dict[str, float] = field(default_factory=dict)
    confidence: float = 1.0
    estimated_duration: float = 0.0
    time_horizon_seconds: float = 0.0
    reason: str = "graph"

@dataclass
class Reservation:
    id: str
    workflow_id: str
    resource_id: str
    dimensions: Dict[str, float]
    status: ReservationStatus = ReservationStatus.ACTIVE

