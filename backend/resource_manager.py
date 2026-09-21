from typing import Dict, Optional
from models import Resource, Reservation, ReservationStatus

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

    def can_reserve(self, resource_id: str, dimensions: Dict[str, float]) -> bool:
        resource = self.get_resource(resource_id)
        if not resource:
            return False
        
        available = resource.get_available()
        for dim, amount in dimensions.items():
            if dim not in available or available[dim] < amount:
                return False
        return True

    def reserve(self, reservation_id: str, workflow_id: str, resource_id: str, dimensions: Dict[str, float]) -> Optional[Reservation]:
        resource = self.get_resource(resource_id)
        if not resource:
            return None

        if not self.can_reserve(resource_id, dimensions):
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

    def release(self, reservation_id: str) -> bool:
        reservation = self.reservations.get(reservation_id)
        if not reservation or reservation.status != ReservationStatus.ACTIVE:
            return False

        resource = self.get_resource(reservation.resource_id)
        if not resource:
            return False

        # Release reserved capacity
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
