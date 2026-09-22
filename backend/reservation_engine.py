from typing import Optional
from models import Prediction, Reservation
from resource_manager import ResourceManager

class ReservationEngine:
    def __init__(self, resource_manager: ResourceManager):
        self.resource_manager = resource_manager

    def evaluate_and_reserve(self, prediction: Prediction) -> Optional[Reservation]:
        """Evaluates a workflow prediction and attempts to reserve resources (hard reservation)."""
        reservation_id = f"res-{prediction.id}"
        return self.resource_manager.reserve(
            reservation_id=reservation_id,
            workflow_id=prediction.workflow_id,
            resource_id=prediction.resource_id,
            dimensions=prediction.requested_dimensions
        )

    def soft_reserve(self, prediction: Prediction) -> Optional[Reservation]:
        """Creates a soft reservation based on a prediction."""
        reservation_id = f"soft-{prediction.id}"
        return self.resource_manager.soft_reserve(
            reservation_id=reservation_id,
            workflow_id=prediction.workflow_id,
            resource_id=prediction.resource_id,
            dimensions=prediction.requested_dimensions
        )

    def confirm_prediction(self, prediction: Prediction) -> Optional[Reservation]:
        """Confirms a soft reservation, converting it into a hard active reservation."""
        reservation_id = f"soft-{prediction.id}"
        confirmed = self.resource_manager.confirm_soft_reservation(reservation_id)
        if confirmed:
            return confirmed
        # Fallback to direct hard reserve if soft reservation wasn't created yet
        return self.evaluate_and_reserve(prediction)

