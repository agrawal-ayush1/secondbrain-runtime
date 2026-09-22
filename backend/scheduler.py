from dataclasses import dataclass
from typing import Dict, List, Optional
from models import Workflow, Reservation, WorkflowStatus, FailureEvent, FailureType, ReservationStatus
from resource_manager import ResourceManager
from service_graph import ServiceGraph

@dataclass
class WorkflowRequest:
    """Represents a queued or pending resource request from a workflow."""
    request_id: str
    workflow: Workflow
    resource_id: str
    dimensions: Dict[str, float]
    allow_fallback: bool = True


class Scheduler:
    """Concurrent workflow scheduler handling resource reservation, priority queueing,
    aging, fallback selection, failure recovery, dynamic rerouting, and starvation prevention.
    """

    def __init__(
        self,
        resource_manager: ResourceManager,
        service_graph: Optional[ServiceGraph] = None,
        aging_factor: float = 1.0,
        default_cooldown: float = 60.0
    ):
        self.resource_manager = resource_manager
        self.service_graph = service_graph
        self.aging_factor = aging_factor
        self.default_cooldown = default_cooldown
        self.waiting_requests: List[WorkflowRequest] = []
        self.workflows: Dict[str, Workflow] = {}
        self.event_logs: List[str] = []
        self.current_time_str: str = "10:00"
        self.current_time_num: float = 600.0
        self._request_counter: int = 0

    def _parse_time_str(self, time_str: str) -> float:
        try:
            parts = time_str.split(":")
            if len(parts) == 2:
                return float(parts[0]) * 60.0 + float(parts[1])
            elif len(parts) == 3:
                return float(parts[0]) * 3600.0 + float(parts[1]) * 60.0 + float(parts[2])
        except Exception:
            pass
        try:
            return float(time_str)
        except Exception:
            return self.current_time_num

    def log_event(self, message: str) -> str:
        log_entry = f"[{self.current_time_str}] {message}"
        self.event_logs.append(log_entry)
        print(log_entry)
        return log_entry

    def set_time(self, time_str: str) -> None:
        self.current_time_str = str(time_str)
        self.current_time_num = self._parse_time_str(str(time_str))

    def advance_time(self, waiting_delta: float) -> None:
        """Advances waiting_time for all currently queued workflows and updates current_time_num."""
        self.current_time_num += waiting_delta
        for req in self.waiting_requests:
            req.workflow.waiting_time += waiting_delta

    def request_resource(
        self,
        workflow: Workflow,
        resource_id: str,
        dimensions: Dict[str, float],
        allow_fallback: bool = True,
        timestamp: Optional[str] = None
    ) -> Optional[Reservation]:
        """Attempts to reserve a resource for a workflow.

        If unavailable, attempts fallback alternatives from ServiceGraph.
        If all fail, queues the workflow.
        """
        if timestamp:
            self.set_time(timestamp)

        self.workflows[workflow.id] = workflow
        self._request_counter += 1
        req_id = f"req-{self._request_counter}"
        workflow.current_task = resource_id

        # 1. Try primary resource
        res_id = f"res-{workflow.id}-{resource_id}"
        reservation = self.resource_manager.reserve(
            reservation_id=res_id,
            workflow_id=workflow.id,
            resource_id=resource_id,
            dimensions=dimensions,
            current_time=self.current_time_num
        )

        if reservation:
            workflow.status = WorkflowStatus.RUNNING
            self.log_event(f"{workflow.id} -> {resource_id} -> RESERVED")
            return reservation

        # 2. Try fallback alternatives from ServiceGraph if enabled
        if allow_fallback and self.service_graph:
            alternatives = self.service_graph.get_alternatives(resource_id)
            for alt_id in alternatives:
                fallback_res_id = f"res-{workflow.id}-{alt_id}"
                alt_reservation = self.resource_manager.reserve(
                    reservation_id=fallback_res_id,
                    workflow_id=workflow.id,
                    resource_id=alt_id,
                    dimensions=dimensions,
                    current_time=self.current_time_num
                )
                if alt_reservation:
                    workflow.status = WorkflowStatus.RUNNING
                    self.log_event(f"{workflow.id} -> {resource_id} -> FALLBACK -> {alt_id} -> RESERVED")
                    return alt_reservation

        # 3. If primary and alternatives are unavailable, queue the workflow
        workflow.status = WorkflowStatus.QUEUED
        eff_prio = workflow.get_effective_priority(self.aging_factor)
        wf_req = WorkflowRequest(
            request_id=req_id,
            workflow=workflow,
            resource_id=resource_id,
            dimensions=dimensions,
            allow_fallback=allow_fallback
        )
        self.waiting_requests.append(wf_req)
        self.log_event(
            f"{workflow.id} -> {resource_id} -> QUEUED "
            f"(Effective Priority: {eff_prio:.1f}, Base: {workflow.priority}, Waiting: {workflow.waiting_time:.1f}m)"
        )
        return None

    def handle_failure(
        self,
        failure_event: FailureEvent,
        dimensions: Optional[Dict[str, float]] = None,
        cooldown: Optional[float] = None
    ) -> Optional[Reservation]:
        """Handles resource failure events: releases active reservation, marks resource health,
        and dynamically reroutes workflow to an alternative or requeues it.
        """
        if failure_event.timestamp:
            self.set_time(failure_event.timestamp)

        wf_id = failure_event.workflow_id
        res_id = failure_event.resource_id
        ftype = failure_event.failure_type
        cooldown_val = cooldown if cooldown is not None else self.default_cooldown

        self.log_event(f"{wf_id} -> {res_id} -> FAILURE: {ftype.value}")

        # Find workflow object
        wf = self.workflows.get(wf_id)
        if not wf:
            for req in self.waiting_requests:
                if req.workflow.id == wf_id:
                    wf = req.workflow
                    break
        if wf:
            self.workflows[wf.id] = wf

        # Find active reservation for this workflow and resource if present
        target_res_id = f"res-{wf_id}-{res_id}"
        active_res = self.resource_manager.reservations.get(target_res_id)
        
        # If active reservation not found by convention, search reservations dict
        if not active_res or active_res.status != ReservationStatus.ACTIVE:
            for r in self.resource_manager.reservations.values():
                if r.workflow_id == wf_id and r.resource_id == res_id and r.status == ReservationStatus.ACTIVE:
                    active_res = r
                    target_res_id = r.id
                    break

        req_dims = dimensions or (active_res.dimensions if active_res else {"rpm": 1.0})

        # Release active reservation if present
        if active_res and active_res.status == ReservationStatus.ACTIVE:
            self.resource_manager.release(active_res.id)
            self.log_event(f"{wf_id} -> {res_id} -> RELEASED")

        # Record failure on resource
        resource = self.resource_manager.get_resource(res_id)
        if resource:
            resource.failure_count += 1
            resource.last_failure = failure_event

        # 1. Classify Failure and update resource health state
        cooldown_mins = cooldown_val / 60.0 if cooldown_val >= 10.0 else cooldown_val
        if ftype in (FailureType.RATE_LIMITED, FailureType.QUOTA_EXHAUSTED, FailureType.SERVICE_UNAVAILABLE):
            self.resource_manager.mark_constrained(res_id, cooldown_duration=cooldown_mins, current_time=self.current_time_num)
            self.log_event(f"{res_id} -> CONSTRAINED")
        elif ftype == FailureType.TIMEOUT:
            if wf and wf.retry_count < 1:
                wf.retry_count += 1
                retry_res = self.resource_manager.reserve(
                    reservation_id=target_res_id,
                    workflow_id=wf_id,
                    resource_id=res_id,
                    dimensions=req_dims,
                    current_time=self.current_time_num
                )
                if retry_res:
                    wf.status = WorkflowStatus.RUNNING
                    self.log_event(f"{wf_id} -> {res_id} -> RETRIED -> RESERVED")
                    return retry_res
            self.resource_manager.mark_constrained(res_id, cooldown_duration=cooldown_mins, current_time=self.current_time_num)
            self.log_event(f"{res_id} -> CONSTRAINED")
        elif ftype == FailureType.EXECUTION_FAILED:
            pass
        elif ftype == FailureType.RESERVATION_EXPIRED:
            pass

        # 2. Dynamic rerouting using ServiceGraph alternatives
        if ftype != FailureType.RESERVATION_EXPIRED and self.service_graph:
            alternatives = self.service_graph.get_alternatives(res_id)
            for alt_id in alternatives:
                if self.resource_manager.can_reserve(alt_id, req_dims, current_time=self.current_time_num):
                    alt_res_id = f"res-{wf_id}-{alt_id}"
                    alt_reservation = self.resource_manager.reserve(
                        reservation_id=alt_res_id,
                        workflow_id=wf_id,
                        resource_id=alt_id,
                        dimensions=req_dims,
                        current_time=self.current_time_num
                    )
                    if alt_reservation:
                        self.log_event(f"{wf_id} -> FALLBACK -> {alt_id}")
                        self.log_event(f"{wf_id} -> {alt_id} -> RESERVED")
                        if wf:
                            wf.status = WorkflowStatus.RUNNING
                            wf.current_task = alt_id
                        self._process_queue()
                        return alt_reservation

        # 3. If no alternative is available, put workflow into waiting_requests queue
        if wf:
            wf.status = WorkflowStatus.QUEUED
            existing_req = next((r for r in self.waiting_requests if r.workflow.id == wf_id), None)
            if not existing_req:
                req_id = f"req-retry-{wf_id}"
                self.waiting_requests.append(WorkflowRequest(
                    request_id=req_id,
                    workflow=wf,
                    resource_id=res_id,
                    dimensions=req_dims,
                    allow_fallback=True
                ))
            eff_prio = wf.get_effective_priority(self.aging_factor)
            self.log_event(
                f"{wf_id} -> {res_id} -> QUEUED "
                f"(Effective Priority: {eff_prio:.1f}, Base: {wf.priority}, Waiting: {wf.waiting_time:.1f}m)"
            )

        self._process_queue()
        return None

    def release_reservation(self, reservation_id: str, timestamp: Optional[str] = None) -> bool:
        """Releases a reservation and triggers priority queue re-evaluation."""
        if timestamp:
            self.set_time(timestamp)

        res = self.resource_manager.reservations.get(reservation_id)
        if not res:
            return False

        resource_id = res.resource_id
        wf_id = res.workflow_id
        success = self.resource_manager.release(reservation_id)
        if success:
            self.log_event(f"{wf_id} -> {resource_id} -> RELEASED")
            self._process_queue()
        return success

    def _process_queue(self) -> None:
        """Inspects waiting workflows in priority order and reserves available resources."""
        if not self.waiting_requests:
            return

        # Sort waiting requests by effective priority descending, breaking ties with waiting_time
        self.waiting_requests.sort(
            key=lambda req: (
                req.workflow.get_effective_priority(self.aging_factor),
                req.workflow.waiting_time
            ),
            reverse=True
        )

        to_remove = []
        for req in list(self.waiting_requests):
            wf = req.workflow
            target_res = req.resource_id
            dims = req.dimensions

            # Try primary requested resource
            res_id = f"res-{wf.id}-{target_res}"
            reservation = self.resource_manager.reserve(
                reservation_id=res_id,
                workflow_id=wf.id,
                resource_id=target_res,
                dimensions=dims,
                current_time=self.current_time_num
            )

            if reservation:
                wf.status = WorkflowStatus.RUNNING
                self.log_event(f"{wf.id} -> {target_res} -> RESERVED")
                to_remove.append(req)
                continue

            # Try fallback alternatives if enabled
            if req.allow_fallback and self.service_graph:
                alternatives = self.service_graph.get_alternatives(target_res)
                fallback_success = False
                for alt_id in alternatives:
                    fallback_res_id = f"res-{wf.id}-{alt_id}"
                    alt_reservation = self.resource_manager.reserve(
                        reservation_id=fallback_res_id,
                        workflow_id=wf.id,
                        resource_id=alt_id,
                        dimensions=dims,
                        current_time=self.current_time_num
                    )
                    if alt_reservation:
                        wf.status = WorkflowStatus.RUNNING
                        self.log_event(f"{wf.id} -> {target_res} -> FALLBACK -> {alt_id} -> RESERVED")
                        to_remove.append(req)
                        fallback_success = True
                        break
                if fallback_success:
                    continue

        for req in to_remove:
            if req in self.waiting_requests:
                self.waiting_requests.remove(req)

