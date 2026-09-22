from typing import Dict, Optional
from models import Resource, Reservation, ReservationStatus, ResourceHealthState

class ResourceManager:
    def __init__(self):
        self.resources: Dict[str, Resource] = {}
        self.reservations: Dict[str, Reservation] = {}

    def add_resource(self, resource: Resource) -> None:
        self.resources[resource.id] = resource

    def get_resource(self, resource_id: str) -> Optional[Resource]:
        return self.resources.get(resource_id)

    def get_available(self, resource_id: str) -> Optional[Dict[str, float]]:
        resource = self.get_resource(resource_id)
        if not resource:
            return None
        return resource.get_available()

    def can_reserve(self, resource_id: str, dimensions: Dict[str, float], current_time: float = 0.0) -> bool:
        resource = self.get_resource(resource_id)
        if not resource:
            return False

        if not resource.is_available_state(current_time):
            return False
        
        available = resource.get_available()
        for dim, amount in dimensions.items():
            if dim not in available or available[dim] < amount:
                return False
        return True

    def reserve(self, reservation_id: str, workflow_id: str, resource_id: str, dimensions: Dict[str, float], current_time: float = 0.0) -> Optional[Reservation]:
        resource = self.get_resource(resource_id)
        if not resource:
            return None

        if not self.can_reserve(resource_id, dimensions, current_time=current_time):
            return None

        # Reserve the requested capacity dimensions
        for dim, amount in dimensions.items():
            resource.reserved[dim] = resource.reserved.get(dim, 0.0) + amount

        reservation = Reservation(
            id=reservation_id,
            workflow_id=workflow_id,
            resource_id=resource_id,
            dimensions=dimensions,
            status=ReservationStatus.ACTIVE
        )
        self.reservations[reservation_id] = reservation
        return reservation

    def soft_reserve(self, reservation_id: str, workflow_id: str, resource_id: str, dimensions: Dict[str, float], current_time: float = 0.0) -> Optional[Reservation]:
        resource = self.get_resource(resource_id)
        if not resource:
            return None

        if not self.can_reserve(resource_id, dimensions, current_time=current_time):
            return None

        for dim, amount in dimensions.items():
            resource.soft_reserved[dim] = resource.soft_reserved.get(dim, 0.0) + amount

        reservation = Reservation(
            id=reservation_id,
            workflow_id=workflow_id,
            resource_id=resource_id,
            dimensions=dimensions,
            status=ReservationStatus.SOFT_RESERVED
        )
        self.reservations[reservation_id] = reservation
        return reservation

    def confirm_soft_reservation(self, reservation_id: str) -> Optional[Reservation]:
        reservation = self.reservations.get(reservation_id)
        if not reservation or reservation.status != ReservationStatus.SOFT_RESERVED:
            return None

        resource = self.get_resource(reservation.resource_id)
        if not resource:
            return None

        for dim, amount in reservation.dimensions.items():
            resource.soft_reserved[dim] = max(0.0, resource.soft_reserved.get(dim, 0.0) - amount)
            resource.reserved[dim] = resource.reserved.get(dim, 0.0) + amount

        reservation.status = ReservationStatus.ACTIVE
        return reservation

    def release_soft_reservation(self, reservation_id: str) -> bool:
        reservation = self.reservations.get(reservation_id)
        if not reservation or reservation.status != ReservationStatus.SOFT_RESERVED:
            return False

        resource = self.get_resource(reservation.resource_id)
        if not resource:
            return False

        for dim, amount in reservation.dimensions.items():
            resource.soft_reserved[dim] = max(0.0, resource.soft_reserved.get(dim, 0.0) - amount)

        reservation.status = ReservationStatus.RELEASED
        return True

    def mark_constrained(self, resource_id: str, cooldown_duration: float = 60.0, current_time: float = 0.0) -> None:
        resource = self.get_resource(resource_id)
        if resource:
            resource.state = ResourceHealthState.CONSTRAINED
            resource.cooldown_until = current_time + cooldown_duration

    def mark_unavailable(self, resource_id: str) -> None:
        resource = self.get_resource(resource_id)
        if resource:
            resource.state = ResourceHealthState.UNAVAILABLE
            resource.cooldown_until = None

    def mark_available(self, resource_id: str) -> None:
        resource = self.get_resource(resource_id)
        if resource:
            resource.state = ResourceHealthState.AVAILABLE
            resource.cooldown_until = None

    def release(self, reservation_id: str) -> bool:
        reservation = self.reservations.get(reservation_id)
        if not reservation or reservation.status not in (ReservationStatus.ACTIVE, ReservationStatus.SOFT_RESERVED):
            return False

        resource = self.get_resource(reservation.resource_id)
        if not resource:
            return False

        if reservation.status == ReservationStatus.SOFT_RESERVED:
            for dim, amount in reservation.dimensions.items():
                resource.soft_reserved[dim] = max(0.0, resource.soft_reserved.get(dim, 0.0) - amount)
        else:
            for dim, amount in reservation.dimensions.items():
                resource.reserved[dim] = max(0.0, resource.reserved.get(dim, 0.0) - amount)

        reservation.status = ReservationStatus.RELEASED
        return True

    def consume(self, reservation_id: str) -> bool:
        reservation = self.reservations.get(reservation_id)
        if not reservation or reservation.status != ReservationStatus.ACTIVE:
            return False

        resource = self.get_resource(reservation.resource_id)
        if not resource:
            return False

        # Move capacity from reserved to actual usage
        for dim, amount in reservation.dimensions.items():
            resource.reserved[dim] = max(0.0, resource.reserved.get(dim, 0.0) - amount)
            resource.usage[dim] = resource.usage.get(dim, 0.0) + amount

        reservation.status = ReservationStatus.CONSUMED
        return True

