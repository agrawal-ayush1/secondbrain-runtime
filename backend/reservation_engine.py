from typing import Optional
from models import Prediction, Reservation
from resource_manager import ResourceManager

class ReservationEngine:
    def __init__(self, resource_manager: ResourceManager):
        self.resource_manager = resource_manager

    def evaluate_and_reserve(self, prediction: Prediction) -> Optional[Reservation]:
        """Evaluates a workflow prediction and attempts to reserve resources."""
        reservation_id = f"res-{prediction.id}"
        return self.resource_manager.reserve(
            reservation_id=reservation_id,
            workflow_id=prediction.workflow_id,
            resource_id=prediction.resource_id,
            dimensions=prediction.requested_dimensions
        )
