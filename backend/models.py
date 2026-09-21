from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional

class ReservationStatus(Enum):
    ACTIVE = "ACTIVE"
    CONSUMED = "CONSUMED"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"

class WorkflowStatus(Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

@dataclass
class Resource:
    id: str
    name: str
    type: str
    capacity: Dict[str, float]
    usage: Dict[str, float] = field(default_factory=dict)
    reserved: Dict[str, float] = field(default_factory=dict)

    def __post_init__(self):
        for dim in self.capacity:
            if dim not in self.usage:
                self.usage[dim] = 0.0
            if dim not in self.reserved:
                self.reserved[dim] = 0.0

    def get_available(self) -> Dict[str, float]:
        """Calculates available capacity: available = capacity - usage - reserved."""
        return {
            dim: cap - self.usage.get(dim, 0.0) - self.reserved.get(dim, 0.0)
            for dim, cap in self.capacity.items()
        }

@dataclass
class Workflow:
    id: str
    name: str
    status: WorkflowStatus = WorkflowStatus.PENDING
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Prediction:
    id: str
    workflow_id: str
    resource_id: str
    requested_dimensions: Dict[str, float]
    confidence: float = 1.0
    time_horizon_seconds: float = 0.0

@dataclass
class Reservation:
    id: str
    workflow_id: str
    resource_id: str
    dimensions: Dict[str, float]
    status: ReservationStatus = ReservationStatus.ACTIVE
