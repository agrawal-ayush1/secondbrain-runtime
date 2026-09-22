import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from .models import Resource, Workflow, FailureEvent, FailureType, WorkflowStatus, ReservationStatus
    from .resource_manager import ResourceManager
    from .service_graph import ServiceGraph
    from .scheduler import Scheduler
    from .reservation_engine import ReservationEngine
    from .prediction_engine import PredictionEngine
    from .gemini_adapter import SimulatedGeminiAdapter, QuotaTracker
    from .resource_adapter import SimulatedResourceAdapter, ResourceAdapter
    from .config import GEMINI_MODE, DEFAULT_MODEL_QUOTAS, ModelQuotaConfig
    from .dto import (
        map_resource_to_dto,
        map_graph_to_dto,
        map_workflow_to_dto,
        map_alternative_to_dto,
        map_event_to_dto
    )
except ImportError:
    from models import Resource, Workflow, FailureEvent, FailureType, WorkflowStatus, ReservationStatus
    from resource_manager import ResourceManager
    from service_graph import ServiceGraph
    from scheduler import Scheduler
    from reservation_engine import ReservationEngine
    from prediction_engine import PredictionEngine
    from gemini_adapter import SimulatedGeminiAdapter, QuotaTracker
    from resource_adapter import SimulatedResourceAdapter, ResourceAdapter
    from config import GEMINI_MODE, DEFAULT_MODEL_QUOTAS, ModelQuotaConfig
    from dto import (
        map_resource_to_dto,
        map_graph_to_dto,
        map_workflow_to_dto,
        map_alternative_to_dto,
        map_event_to_dto
    )


class RuntimeController:
    """Singleton runtime controller holding live state for the SecondBrain runtime system."""

    def __init__(self):
        self.rm = ResourceManager()
        self.sg = ServiceGraph()
        self.scheduler = Scheduler(resource_manager=self.rm, service_graph=self.sg, aging_factor=2.0, default_cooldown=180.0)
        self.reservation_engine = ReservationEngine(resource_manager=self.rm)
        self.prediction_engine = PredictionEngine(service_graph=self.sg)
        self.quota_tracker = QuotaTracker()
        self.adapter = SimulatedGeminiAdapter(quota_tracker=self.quota_tracker)
        self.resource_adapter: ResourceAdapter = SimulatedResourceAdapter(quota_tracker=self.quota_tracker)
        self.event_history: List[Any] = []
        self.sim_time_num: float = 600.0  # 10:00
        self.sim_time_str: str = "10:00"
        self._event_counter: int = 0
        self.sim_step_count: int = 0
        self.reset_state()

    def log_event(self, event_msg: str, resource_id: str = "system") -> Dict[str, Any]:
        self._event_counter += 1
        event_id = f"evt-{1000 + self._event_counter}"
        full_msg = f"[{self.sim_time_str}] {event_msg}"
        self.scheduler.event_logs.append(full_msg)
        
        event_obj = {
            "id": event_id,
            "raw": full_msg,
            "resource_id": resource_id,
            "timestamp": self.sim_time_str,
            "time_num": self.sim_time_num
        }
        self.event_history.append(event_obj)
        return map_event_to_dto(full_msg, event_id)

    def reset_state(self):
        """Resets runtime state to default deterministic hackathon demo setup."""
        self.rm = ResourceManager()
        self.sg = ServiceGraph()
        self.scheduler = Scheduler(resource_manager=self.rm, service_graph=self.sg, aging_factor=2.0, default_cooldown=180.0)
        self.reservation_engine = ReservationEngine(resource_manager=self.rm)
        self.prediction_engine = PredictionEngine(service_graph=self.sg)
        self.quota_tracker = QuotaTracker()
        self.adapter = SimulatedGeminiAdapter(quota_tracker=self.quota_tracker)
        self.resource_adapter = SimulatedResourceAdapter(quota_tracker=self.quota_tracker)
        self.event_history.clear()
        self._event_counter = 0
        self.sim_step_count = 0
        self.sim_time_num = 600.0
        self.sim_time_str = "10:00"

        # 1. Register Default Resources
        self.rm.add_resource(Resource(id="search", name="Search Service", type="service", capacity={"queries": 10.0}))
        self.rm.add_resource(Resource(id="gemini-2.5-flash", name="Gemini 2.5 Flash", type="llm", capacity={"rpm": 4.0, "tpm": 250000.0, "rpd": 20.0}))
        self.rm.add_resource(Resource(id="gemini-2.5-flash-lite", name="Gemini 2.5 Flash Lite", type="llm", capacity={"rpm": 10.0, "tpm": 250000.0, "rpd": 20.0}))
        self.rm.add_resource(Resource(id="postgres-db", name="PostgreSQL Database", type="database", capacity={"connections": 3.0}))
        self.rm.add_resource(Resource(id="docker-worker", name="Docker Worker", type="worker", capacity={"concurrent_jobs": 1.0}))
        self.rm.add_resource(Resource(id="pdf-generator", name="PDF Generator Service", type="service", capacity={"concurrent_jobs": 2.0}))

        # 2. Build Service Graph
        self.sg.add_resource("search", attributes={"name": "Search Service"})
        self.sg.add_resource("gemini-2.5-flash", attributes={"name": "Gemini 2.5 Flash"})
        self.sg.add_resource("gemini-2.5-flash-lite", attributes={"name": "Gemini 2.5 Flash Lite"})
        self.sg.add_resource("postgres-db", attributes={"name": "PostgreSQL Database"})
        self.sg.add_resource("pdf-generator", attributes={"name": "PDF Generator Service"})

        self.sg.add_dependency("search", "gemini-2.5-flash", probability=0.9)
        self.sg.add_dependency("gemini-2.5-flash", "postgres-db", probability=1.0)
        self.sg.add_dependency("postgres-db", "pdf-generator", probability=1.0)
        self.sg.add_dependency("gemini-2.5-flash-lite", "postgres-db", probability=1.0)
        self.sg.add_alternative("gemini-2.5-flash", "gemini-2.5-flash-lite")

        # 3. Create Default Workflows
        w1 = Workflow(
            id="W1",
            name="Research Report",
            current_task="search",
            priority=10.0,
            metadata={"task_sequence": ["search", "gemini-2.5-flash", "postgres-db", "pdf-generator"]}
        )
        w2 = Workflow(
            id="W2",
            name="Summarization Workflow",
            current_task="search",
            priority=8.0,
            metadata={"task_sequence": ["search", "gemini-2.5-flash", "postgres-db"]}
        )
        
        self.scheduler.request_resource(w1, "search", {"queries": 1.0}, allow_fallback=False, timestamp="10:00")
        self.scheduler.request_resource(w2, "search", {"queries": 1.0}, allow_fallback=False, timestamp="10:00")

        self.log_event("Runtime Controller initialized with default resources, ServiceGraph, and workflows.")

    def step_live_simulation(self) -> Dict[str, Any]:
        """Advances live simulation scenario deterministically."""
        self.sim_step_count += 1
        self.sim_time_num += 1.0
        minutes = int(self.sim_time_num % 60)
        hours = int((self.sim_time_num // 60) % 24)
        self.sim_time_str = f"{hours:02d}:{minutes:02d}"
        self.scheduler.set_time(self.sim_time_str)

        step_msg = ""
        if self.sim_step_count == 1:
            w3 = Workflow(
                id="W3",
                name="Deep Research Agent",
                current_task="search",
                priority=9.0,
                metadata={"task_sequence": ["search", "gemini-2.5-flash", "postgres-db"]}
            )
            self.scheduler.request_resource(w3, "search", {"queries": 1.0}, allow_fallback=True)
            step_msg = "W3 (Deep Research Agent) submitted to Runtime Controller."
        elif self.sim_step_count == 2:
            w1 = self.scheduler.workflows.get("W1")
            if w1:
                w1.current_task = "gemini-2.5-flash"
                self.scheduler.request_resource(w1, "gemini-2.5-flash", {"rpm": 1.0, "tpm": 50000.0}, allow_fallback=True)
                step_msg = "W1 requested gemini-2.5-flash reservation."
        elif self.sim_step_count == 3:
            self.adapter.force_failure("gemini-2.5-flash", FailureType.RATE_LIMITED)
            exec_res = self.adapter.execute("W1", "gemini-2.5-flash", timestamp=self.sim_time_str, current_time_num=self.sim_time_num)
            self.scheduler.handle_failure(exec_res.failure_event, dimensions={"rpm": 4.0})
            step_msg = "High contention detected: Gemini 2.5 Flash RATE_LIMITED! Dynamic fallback to Flash Lite triggered."
        elif self.sim_step_count == 4:
            w2 = self.scheduler.workflows.get("W2")
            if w2:
                w2.current_task = "gemini-2.5-flash-lite"
                self.scheduler.request_resource(w2, "gemini-2.5-flash-lite", {"rpm": 1.0}, allow_fallback=True)
                step_msg = "W2 rerouted successfully to Gemini 2.5 Flash Lite."
        elif self.sim_step_count == 5:
            self.rm.mark_available("gemini-2.5-flash")
            step_msg = "Gemini 2.5 Flash recovered from cooldown and restored to AVAILABLE state."
        else:
            self.scheduler.advance_time(1.0)
            self.scheduler._process_queue()
            step_msg = f"Live simulation tick at {self.sim_time_str}"

        self.log_event(step_msg)
        return {
            "status": "success",
            "step": self.sim_step_count,
            "sim_time": self.sim_time_str,
            "message": step_msg
        }


controller = RuntimeController()

app = FastAPI(
    title="SecondBrain Runtime Controller API",
    description=(
        "Production-style runtime orchestration API for agentic AI workloads. "
        "Includes versioned Public API endpoints (/api/v1/*) for external AI applications "
        "and simulation endpoints (/api/simulate/*) for testing and evaluation."
    ),
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request Schemas ---

class TaskSpec(BaseModel):
    name: str = Field(..., description="Task identifier or name", example="search")
    resource: str = Field(..., description="Target runtime resource ID", example="gemini-2.5-flash")

class WorkflowCreateRequest(BaseModel):
    id: Optional[str] = Field(None, description="Optional custom workflow ID", example="wf-research-01")
    workflow_id: Optional[str] = Field(None, description="Legacy alias for workflow ID", example="W1")
    name: str = Field("custom-agent", description="Human readable workflow name", example="Research Assistant Agent")
    priority: float = Field(1.0, description="Base scheduling priority (1.0 - 10.0)", example=8.0)
    tasks: Optional[List[TaskSpec]] = Field(None, description="Generic task list specifying task names and target resources")
    task_sequence: Optional[List[str]] = Field(None, description="Sequential array of resource IDs", example=["search", "gemini-2.5-flash", "postgres-db"])

class ReservationCreateRequest(BaseModel):
    workflow_id: str = Field(..., description="Workflow ID making the reservation", example="W1")
    resource_id: str = Field(..., description="Target resource ID to reserve", example="gemini-2.5-flash")
    dimensions: Dict[str, float] = Field(default_factory=lambda: {"rpm": 1.0}, description="Capacity dimensions requested", example={"rpm": 1.0, "tpm": 50000.0})
    soft: bool = Field(False, description="If True, create soft reservation based on predictions", example=False)

class SimulationStepRequest(BaseModel):
    action: str = "run_step"  # "run_step", "rate_limit", "quota_exhausted", "live"
    resource_id: Optional[str] = None
    workflow_id: Optional[str] = None


# ==================================================
# PUBLIC INTEGRATION API (/api/v1)
# ==================================================

@app.get("/api/v1/health", tags=["Public Integration API"], summary="Runtime Controller Health Check")
@app.get("/api/health")
@app.get("/health")
def get_health():
    """Returns the operational status, execution mode, and server timestamp."""
    return {
        "status": "healthy",
        "mode": GEMINI_MODE,
        "backend": "runtime-controller",
        "api_version": "v1",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/v1/workflows", tags=["Public Integration API"], summary="List Workflows")
def list_workflows_v1():
    """Retrieve all active, queued, or completed workflows and their runtime scheduling status."""
    return get_scheduler_workloads()


@app.post("/api/v1/workflows", tags=["Public Integration API"], summary="Submit Workflow")
@app.post("/api/workflows")
def create_workflow_v1(req: WorkflowCreateRequest):
    """Submit a generic AI workflow or sequential workload to the SecondBrain Runtime Controller."""
    wf_id = req.id or req.workflow_id or f"wf-{int(datetime.now().timestamp() * 1000)}"
    
    # Extract task sequence
    if req.tasks:
        task_seq = [t.resource for t in req.tasks if t.resource]
    elif req.task_sequence:
        task_seq = req.task_sequence
    else:
        task_seq = ["search", "gemini-2.5-flash", "postgres-db"]

    first_target = task_seq[0] if task_seq else "search"

    wf = Workflow(
        id=wf_id,
        name=req.name,
        priority=req.priority,
        current_task=first_target,
        metadata={"task_sequence": task_seq}
    )
    
    res = controller.scheduler.request_resource(wf, first_target, {"queries": 1.0} if first_target == "search" else {"rpm": 1.0}, allow_fallback=True)
    
    msg = f"Workflow {wf.id} ({wf.name}) submitted -> {first_target} ({'RESERVED' if res else 'QUEUED'})"
    controller.log_event(msg, resource_id=first_target)
    
    return {
        "success": True,
        "workflow": map_workflow_to_dto(wf, controller.scheduler),
        "message": msg
    }


@app.get("/api/v1/workflows/{workflow_id}", tags=["Public Integration API"], summary="Get Workflow by ID")
def get_workflow_by_id_v1(workflow_id: str = Path(..., description="Workflow ID")):
    """Get workflow details, predictions, and queue state by workflow ID."""
    wf = controller.scheduler.workflows.get(workflow_id)
    if not wf:
        # Check waiting requests
        for req in controller.scheduler.waiting_requests:
            if req.workflow.id == workflow_id:
                wf = req.workflow
                break
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")

    preds = controller.prediction_engine.predict(wf, top_k=3)
    return map_workflow_to_dto(wf, controller.scheduler, predictions=preds)


@app.get("/api/v1/reservations", tags=["Public Integration API"], summary="List Capacity Reservations")
def list_reservations_v1():
    """List all active, soft, or consumed resource reservations."""
    res_list = []
    for res_id, r in controller.rm.reservations.items():
        res_list.append({
            "id": r.id,
            "workflow_id": r.workflow_id,
            "resource_id": r.resource_id,
            "dimensions": r.dimensions,
            "status": r.status.value
        })
    return res_list


@app.post("/api/v1/reservations", tags=["Public Integration API"], summary="Create Capacity Reservation")
def create_reservation_v1(req: ReservationCreateRequest):
    """Explicitly request hard or soft resource capacity reservation for a workflow."""
    res_id = f"res-{req.workflow_id}-{int(datetime.now().timestamp() * 1000)}"
    if req.soft:
        r = controller.rm.soft_reserve(res_id, req.workflow_id, req.resource_id, req.dimensions, current_time=controller.sim_time_num)
    else:
        r = controller.rm.reserve(res_id, req.workflow_id, req.resource_id, req.dimensions, current_time=controller.sim_time_num)

    if not r:
        raise HTTPException(status_code=409, detail=f"Capacity reservation denied for resource '{req.resource_id}' (constrained or insufficient capacity)")

    msg = f"Reservation {r.id} ({'SOFT' if req.soft else 'HARD'}) created on {req.resource_id} for {req.workflow_id}"
    controller.log_event(msg, resource_id=req.resource_id)

    return {
        "success": True,
        "reservation": {
            "id": r.id,
            "workflow_id": r.workflow_id,
            "resource_id": r.resource_id,
            "dimensions": r.dimensions,
            "status": r.status.value
        },
        "message": msg
    }


@app.get("/api/v1/reservations/{reservation_id}", tags=["Public Integration API"], summary="Get Reservation by ID")
def get_reservation_by_id_v1(reservation_id: str = Path(..., description="Reservation ID")):
    """Retrieve details for a specific reservation."""
    r = controller.rm.reservations.get(reservation_id)
    if not r:
        raise HTTPException(status_code=404, detail=f"Reservation '{reservation_id}' not found")
    return {
        "id": r.id,
        "workflow_id": r.workflow_id,
        "resource_id": r.resource_id,
        "dimensions": r.dimensions,
        "status": r.status.value
    }


@app.delete("/api/v1/reservations/{reservation_id}", tags=["Public Integration API"], summary="Release Reservation")
def release_reservation_v1(reservation_id: str = Path(..., description="Reservation ID")):
    """Release a held capacity reservation."""
    r = controller.rm.reservations.get(reservation_id)
    if not r or r.status == ReservationStatus.RELEASED:
        raise HTTPException(status_code=404, detail=f"Active reservation '{reservation_id}' not found")

    res_id = r.resource_id
    success = controller.rm.release(reservation_id)
    if success:
        msg = f"Released reservation {reservation_id} on resource {res_id}"
        controller.log_event(msg, resource_id=res_id)
        return {"success": True, "message": msg}
    raise HTTPException(status_code=400, detail=f"Failed to release reservation '{reservation_id}'")


@app.get("/api/v1/resources", tags=["Public Integration API"], summary="List Managed Resources")
@app.get("/api/resources")
@app.get("/resources")
def get_resources():
    """Retrieve all managed resources with live deterministic telemetry metrics."""
    return [map_resource_to_dto(r) for r in controller.rm.resources.values()]


@app.get("/api/v1/resources/{resource_id}", tags=["Public Integration API"], summary="Get Resource by ID")
@app.get("/api/resources/{resource_id}")
@app.get("/resources/{resource_id}")
def get_resource_by_id(resource_id: str = Path(..., description="Resource ID")):
    """Retrieve resource specifications and live telemetry metrics for a specific resource."""
    res = controller.rm.get_resource(resource_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Resource '{resource_id}' not found")
    return map_resource_to_dto(res)


@app.get("/api/v1/predictions/{workflow_id}", tags=["Public Integration API"], summary="Get Workflow Predictions")
def get_predictions_for_workflow_v1(workflow_id: str = Path(..., description="Workflow ID")):
    """Predict top upcoming resource requirements for a specified workflow."""
    wf = controller.scheduler.workflows.get(workflow_id)
    if not wf:
        for req in controller.scheduler.waiting_requests:
            if req.workflow.id == workflow_id:
                wf = req.workflow
                break
    if not wf:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")

    preds = controller.prediction_engine.predict(wf, top_k=3)
    return [
        {
            "id": p.id,
            "workflow_id": p.workflow_id,
            "resource_id": p.resource_id,
            "confidence": p.confidence,
            "reason": p.reason,
            "requested_dimensions": p.requested_dimensions,
            "estimated_duration": p.estimated_duration
        }
        for p in preds
    ]


@app.get("/api/v1/service-graph", tags=["Public Integration API"], summary="Get Service Topology Graph")
@app.get("/api/graph")
@app.get("/graph")
def get_graph():
    """Retrieve the global service topology graph including dependency links and dynamic alternatives."""
    return map_graph_to_dto(controller.sg, controller.rm)


@app.get("/api/v1/events", tags=["Public Integration API"], summary="Get Runtime Events Trace")
@app.get("/api/events")
@app.get("/events")
def get_events(limit: int = Query(default=50, ge=1, le=200), type: Optional[str] = None):
    """Retrieve event logs for scheduling decisions, reservations, rate-limits, and dynamic fallbacks."""
    events = list(controller.event_history)
    if type and type != "all":
        events = [e for e in events if type.lower() in str(e).lower()]
    
    events = events[-limit:]
    events_dtos = []
    for idx, e in enumerate(events, 1):
        raw_msg = e.get("raw") if isinstance(e, dict) else str(e)
        e_id = e.get("id", f"evt-{idx}") if isinstance(e, dict) else f"evt-{idx}"
        events_dtos.append(map_event_to_dto(raw_msg, e_id))
    
    events_dtos.reverse()
    return events_dtos


# ==================================================
# LEGACY & COMPATIBILITY ENDPOINTS
# ==================================================

@app.get("/api/scheduler/workloads")
@app.get("/api/scheduler")
@app.get("/scheduler/workloads")
def get_scheduler_workloads():
    all_workflows = list(controller.scheduler.workflows.values())
    for req in controller.scheduler.waiting_requests:
        if req.workflow.id not in [w.id for w in all_workflows]:
            all_workflows.append(req.workflow)

    workload_dtos = []
    for wf in all_workflows:
        preds = controller.prediction_engine.predict(wf, top_k=3)
        workload_dtos.append(map_workflow_to_dto(wf, controller.scheduler, predictions=preds))
    return workload_dtos


@app.get("/api/scheduler/decisions")
def get_scheduler_decisions():
    decisions = []
    for idx, log in enumerate(controller.scheduler.event_logs[-10:], 1):
        decisions.append({
            "id": f"dec-{idx}",
            "title": f"Scheduling Pass: {log[:30]}",
            "workloadId": "W1",
            "targetNode": "gemini-2.5-flash",
            "description": log,
            "timeAgo": "Just now",
            "type": "worker"
        })
    return decisions


@app.get("/api/predictions")
def get_predictions():
    results = []
    for wf in controller.scheduler.workflows.values():
        preds = controller.prediction_engine.predict(wf, top_k=3)
        for p in preds:
            results.append({
                "id": p.id,
                "workflow_id": p.workflow_id,
                "resource_id": p.resource_id,
                "confidence": p.confidence,
                "reason": p.reason,
                "requested_dimensions": p.requested_dimensions,
                "estimated_duration": p.estimated_duration
            })
    return results


@app.get("/api/alternatives")
@app.get("/alternatives")
def get_alternatives():
    alternatives_dtos = []
    for u in controller.sg.graph.nodes():
        alts = controller.sg.get_alternatives(u)
        for alt_id in alts:
            alternatives_dtos.append(map_alternative_to_dto(u, alt_id, controller.rm))
    return alternatives_dtos


@app.get("/api/settings")
@app.get("/settings")
def get_settings():
    return {
        "general": {
            "projectName": "SecondBrain Runtime Controller",
            "clusterId": "sb-cluster-prod-01",
            "environment": GEMINI_MODE.upper(),
            "region": "us-central1",
            "timeStandard": "UTC",
            "displayLocalTime": True
        },
        "runtime": {
            "refreshInterval": "2s",
            "healthCheckInterval": 15,
            "grpcTimeout": 5000,
            "retryStrategy": "Exponential Backoff + Jitter",
            "maxRetries": 3,
            "baseDelay": "100ms",
            "maxDelay": "2000ms",
            "circuitBreakerEnabled": True
        },
        "graph": {
            "layoutAlgorithm": "hierarchical",
            "showDependencies": True,
            "showAlternatives": True,
            "packetFlowAnimation": True,
            "targetFps": "60fps"
        },
        "notifications": {
            "rules": [
                {
                    "id": "rule-1",
                    "eventTrigger": "RATE_LIMITED",
                    "description": "Trigger dynamic fallback to Flash Lite when Rate Limited",
                    "severity": "WARNING",
                    "escalation": "Automated Reroute",
                    "enabled": True
                }
            ],
            "slackWebhook": "https://hooks.slack.com/services/demo",
            "pagerDutyKey": "pd-key-demo"
        },
        "api": {
            "baseUrl": "http://localhost:8000/api/v1",
            "backendStatus": "connected",
            "protocol": "HTTP/2 REST",
            "rttLatency": "1.2ms",
            "lastSync": "Just now",
            "activeChannels": 4,
            "memoryBuffer": "64 MB",
            "certExpiryDays": 365,
            "shaValidated": "3be3dfe"
        }
    }


# ==================================================
# SIMULATION & TESTING CONTROLS (/api/simulate/*)
# ==================================================

@app.post("/api/simulate/step", tags=["Simulation Controls"], summary="Trigger Simulation Step")
@app.post("/api/v1/simulate/step", tags=["Simulation Controls"])
def simulate_step(req: SimulationStepRequest):
    """Execute manual simulation actions (step tick, rate limit injection, quota exhaustion, or live scenario step)."""
    if req.action == "live":
        return controller.step_live_simulation()

    controller.sim_time_num += 1.0
    minutes = int(controller.sim_time_num % 60)
    hours = int((controller.sim_time_num // 60) % 24)
    controller.sim_time_str = f"{hours:02d}:{minutes:02d}"
    controller.scheduler.set_time(controller.sim_time_str)

    target_res = req.resource_id or "gemini-2.5-flash"
    target_wf = req.workflow_id or "W1"

    if req.action == "rate_limit":
        controller.adapter.force_failure(target_res, FailureType.RATE_LIMITED)
        exec_res = controller.adapter.execute(target_wf, target_res, timestamp=controller.sim_time_str, current_time_num=controller.sim_time_num)
        controller.log_event(f"Simulation action: RATE_LIMITED forced on {target_res}", resource_id=target_res)
        controller.scheduler.handle_failure(exec_res.failure_event, dimensions={"rpm": 2.0})

    elif req.action == "quota_exhausted":
        controller.adapter.force_failure(target_res, FailureType.QUOTA_EXHAUSTED)
        exec_res = controller.adapter.execute(target_wf, target_res, timestamp=controller.sim_time_str, current_time_num=controller.sim_time_num)
        controller.log_event(f"Simulation action: QUOTA_EXHAUSTED forced on {target_res}", resource_id=target_res)
        controller.scheduler.handle_failure(exec_res.failure_event, dimensions={"rpm": 2.0})

    else:
        controller.scheduler.advance_time(1.0)
        controller.scheduler._process_queue()
        controller.log_event(f"Advanced simulation time to {controller.sim_time_str}")

    return {
        "status": "success",
        "sim_time": controller.sim_time_str,
        "action": req.action,
        "recent_events": [map_event_to_dto(e.get("raw") if isinstance(e, dict) else str(e), f"evt-{idx}") for idx, e in enumerate(controller.event_history[-5:])]
    }


@app.post("/api/simulate/reset", tags=["Simulation Controls"], summary="Reset Simulation State")
@app.post("/api/v1/simulate/reset", tags=["Simulation Controls"])
def simulate_reset():
    """Reset controller environment to clean initial deterministic state."""
    controller.reset_state()
    return {
        "status": "reset_complete",
        "message": "Demo environment reset to initial deterministic state.",
        "sim_time": controller.sim_time_str
    }
