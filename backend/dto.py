"""
Data Transfer Object (DTO) mapper module for SecondBrain Runtime.
Maps core backend model objects (Resource, Workflow, ServiceGraph, FailureEvent, Prediction)
into JSON serializable dictionaries matching the React frontend schemas.
"""

from typing import Dict, Any, List, Optional

try:
    from .models import Resource, Workflow, FailureEvent, ResourceHealthState
    from .service_graph import ServiceGraph
    from .resource_manager import ResourceManager
    from .prediction_engine import Prediction
except ImportError:
    from models import Resource, Workflow, FailureEvent, ResourceHealthState
    from service_graph import ServiceGraph
    from resource_manager import ResourceManager
    from prediction_engine import Prediction


RESOURCE_BASELINES = {
    "search": {"cpu": 15, "p99": 18.0, "conns": 5, "base_qps": 2},
    "gemini-2.5-flash": {"cpu": 35, "p99": 240.0, "conns": 12, "base_qps": 1},
    "gemini-2.5-flash-lite": {"cpu": 20, "p99": 110.0, "conns": 8, "base_qps": 1},
    "gemini-flash": {"cpu": 30, "p99": 220.0, "conns": 10, "base_qps": 1},
    "gemini-flash-lite": {"cpu": 18, "p99": 100.0, "conns": 6, "base_qps": 1},
    "postgres-db": {"cpu": 10, "p99": 4.5, "conns": 3, "base_qps": 5},
    "pdf-generator": {"cpu": 45, "p99": 850.0, "conns": 2, "base_qps": 1},
    "docker-worker": {"cpu": 50, "p99": 1200.0, "conns": 1, "base_qps": 1},
    "vector-db": {"cpu": 25, "p99": 14.0, "conns": 4, "base_qps": 3},
    "github": {"cpu": 5, "p99": 85.0, "conns": 2, "base_qps": 1},
}

def _compute_resource_telemetry(resource: Resource) -> Dict[str, Any]:
    """Calculates deterministic telemetry derived from actual runtime resource usage, reservations, and health state."""
    dim_key = list(resource.capacity.keys())[0] if resource.capacity else "capacity"
    total_cap = float(resource.capacity.get(dim_key, 100.0))
    used_cap = float(resource.usage.get(dim_key, 0.0))
    res_cap = float(resource.reserved.get(dim_key, 0.0))
    soft_cap = float(resource.soft_reserved.get(dim_key, 0.0))

    load_sum = used_cap + res_cap + soft_cap
    utilization = min(1.0, max(0.0, load_sum / total_cap)) if total_cap > 0 else 0.0

    baseline = RESOURCE_BASELINES.get(resource.id, {"cpu": 20, "p99": 50.0, "conns": 5, "base_qps": 1})
    res_state = getattr(resource, "state", ResourceHealthState.AVAILABLE)

    if res_state == ResourceHealthState.UNAVAILABLE:
        cpu = 0
        p99_str = "N/A"
        error_rate_str = "100.00%"
        status_str = "offline"
    elif res_state == ResourceHealthState.CONSTRAINED:
        cpu = min(100, int(baseline["cpu"] + utilization * (100 - baseline["cpu"]) + 30))
        p99_val = round(baseline["p99"] * 3.5 * (1.0 + utilization), 1)
        p99_str = f"{p99_val}ms"
        err_rate = round(min(100.0, 15.0 + getattr(resource, "failure_count", 0) * 5.0), 2)
        error_rate_str = f"{err_rate:.2f}%"
        status_str = "degraded"
    else:  # AVAILABLE
        cpu = min(100, int(baseline["cpu"] + utilization * (95 - baseline["cpu"])))
        p99_val = round(baseline["p99"] * (1.0 + utilization * 0.8), 1)
        p99_str = f"{p99_val}ms"
        error_rate_str = "0.00%"
        status_str = "healthy"

    qps_val = baseline["base_qps"] + int(used_cap + res_cap)
    conns_val = baseline["conns"] + int(used_cap)

    return {
        "cpu": cpu,
        "p99Latency": p99_str,
        "errorRate": error_rate_str,
        "conns": conns_val,
        "qps": f"{qps_val} req/s",
        "status": status_str,
        "utilization": round(utilization * 100, 1)
    }


def map_resource_to_dto(resource: Resource, quota_tracker: Optional[Any] = None) -> Dict[str, Any]:
    """Map Resource dataclass to JSON DTO matching frontend Resource schema."""
    dim_key = list(resource.capacity.keys())[0] if resource.capacity else "capacity"
    total_cap = float(resource.capacity.get(dim_key, 100.0))
    used_cap = float(resource.usage.get(dim_key, 0.0))
    res_cap = float(resource.reserved.get(dim_key, 0.0))
    avail_dict = resource.get_available()
    avail_cap = float(avail_dict.get(dim_key, 0.0))

    res_state = getattr(resource, "state", ResourceHealthState.AVAILABLE)
    telemetry = _compute_resource_telemetry(resource)

    cat = "ingress" if ("gateway" in resource.id.lower() or "search" in resource.id.lower()) else ("db" if resource.type == "database" else ("compute" if resource.type == "llm" else "service"))

    return {
        "id": resource.id,
        "name": resource.name,
        "type": resource.type.upper(),
        "category": cat,
        "status": telemetry["status"],
        "runtime": f"SecondBrain Controller ({resource.type})",
        "endpoint": f"http://localhost:8000/api/v1/resources/{resource.id}",
        "namespace": "default",
        "protocols": ["HTTP/2", "gRPC"],
        "dependencies": [],
        "dependents": [],
        "alternatives": [],
        "uptime": "100%",
        "lastUpdated": "Just now",
        "health": telemetry["status"],
        "capacity": {
            "total": total_cap,
            "used": used_cap,
            "reserved": res_cap,
            "available": max(0.0, avail_cap),
            "unit": dim_key.upper()
        },
        "limits": {
            "rpm": resource.capacity.get("rpm", resource.capacity.get("queries", 10.0)),
            "tpm": resource.capacity.get("tpm", 250000.0),
            "rpd": resource.capacity.get("rpd", 20.0)
        },
        "metrics": {
            "cpu": telemetry["cpu"],
            "memory": "256 MB",
            "p99Latency": telemetry["p99Latency"],
            "replicas": "1 / 1",
            "errorRate": telemetry["errorRate"],
            "conns": telemetry["conns"],
            "qps": telemetry["qps"]
        },
        "cooldown_remaining": int(resource.cooldown_until - 0.0) if (hasattr(resource, "cooldown_until") and resource.cooldown_until) else 0
    }


def map_graph_to_dto(service_graph: ServiceGraph, resource_manager: Optional[ResourceManager] = None) -> Dict[str, Any]:
    """Map ServiceGraph networkx graph to JSON DTO matching frontend Graph schema."""
    nodes = []
    edges = []

    pos_map = {
        "search": {"x": 100, "y": 150},
        "gemini-2.5-flash": {"x": 300, "y": 100},
        "gemini-2.5-flash-lite": {"x": 300, "y": 250},
        "postgres-db": {"x": 500, "y": 150},
        "pdf-generator": {"x": 700, "y": 150},
        "docker-worker": {"x": 500, "y": 280}
    }

    for node_id in service_graph.graph.nodes():
        node_attr = service_graph.graph.nodes[node_id]
        res = resource_manager.get_resource(node_id) if resource_manager else None

        res_type = res.type if res else "service"
        res_state = getattr(res, "state", ResourceHealthState.AVAILABLE) if res else ResourceHealthState.AVAILABLE
        res_status = "healthy" if res_state == ResourceHealthState.AVAILABLE else ("degraded" if res_state == ResourceHealthState.CONSTRAINED else "offline")

        telemetry = _compute_resource_telemetry(res) if res else {"p99Latency": "50ms", "cpu": 20}

        pos = pos_map.get(node_id, {"x": 400, "y": 200})

        nodes.append({
            "id": node_id,
            "resourceId": node_id,
            "label": node_attr.get("name", res.name if res else node_id),
            "subtitle": f"{res_type.upper()} • Active",
            "type": res_type,
            "status": res_status,
            "x": pos["x"],
            "y": pos["y"],
            "isConstrained": res_state == ResourceHealthState.CONSTRAINED if res else False,
            "capacity": res.capacity if res else {},
            "metrics": {
                "p99": telemetry["p99Latency"],
                "cpu": f"{telemetry['cpu']}%",
                "replicas": "1 / 1"
            }
        })

    for u, v, data in service_graph.graph.edges(data=True):
        edge_type = data.get("type", "in_band")
        if edge_type == "dependency":
            edge_type = "in_band"

        edges.append({
            "id": f"{u}-{v}-{edge_type}",
            "source": u,
            "target": v,
            "type": edge_type,
            "animated": True,
            "probability": data.get("probability", 1.0)
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "totalActive": len(nodes),
        "totalStandby": 1,
        "healthyCount": len([n for n in nodes if n["status"] == "healthy"]),
        "degradedCount": len([n for n in nodes if n["status"] == "degraded"]),
        "offlineCount": 0,
        "activeWireFlows": len(edges),
        "alternativesConfigured": len([e for e in edges if e["type"] == "fallback"])
    }


def map_workflow_to_dto(
    workflow: Workflow,
    scheduler: Optional[Any] = None,
    predictions: Optional[List[Prediction]] = None
) -> Dict[str, Any]:
    """Map Workflow object to JSON DTO matching frontend Workload schema."""
    task_seq = workflow.metadata.get("task_sequence", [workflow.current_task]) if workflow.metadata else [workflow.current_task]
    
    is_queued = False
    effective_priority = workflow.priority
    waiting_time = 0.0

    if scheduler and hasattr(scheduler, "waiting_requests"):
        for req in scheduler.waiting_requests:
            if req.workflow.id == workflow.id:
                is_queued = True
                effective_priority = req.effective_priority
                waiting_time = req.wait_minutes
                break

    predictions_dto = []
    if predictions:
        for p in predictions:
            predictions_dto.append({
                "id": p.id,
                "workflow_id": p.workflow_id,
                "resource_id": p.resource_id,
                "confidence": p.confidence,
                "reason": p.reason,
                "requested_dimensions": p.requested_dimensions,
                "estimated_duration": p.estimated_duration
            })

    status_str = "queued" if is_queued else ("running" if workflow.status.value == "RUNNING" or workflow.current_task else "completed")

    return {
        "id": workflow.id,
        "name": workflow.name,
        "targetResourceId": workflow.current_task or "search",
        "targetResourceName": workflow.current_task or "search",
        "targetEndpoint": f"http://localhost:8000/api/resources/{workflow.current_task or 'search'}",
        "status": status_str,
        "started": "Just now",
        "duration": "1m 30s",
        "schedulerDecision": f"Assigned to {workflow.current_task or 'search'} based on graph topology & priority",
        "selectedResource": workflow.current_task or "search",
        "alternativesEvaluated": [
            {"name": "gemini-2.5-flash-lite", "score": 0.95, "note": "Eligible fallback", "status": "ready"}
        ],
        "eventTrace": [
            {"time": "10:00", "message": f"Task {workflow.current_task} assigned", "type": "info"}
        ],
        "current_task": workflow.current_task,
        "priority": workflow.priority,
        "effective_priority": effective_priority,
        "is_queued": is_queued,
        "waiting_time_minutes": waiting_time,
        "task_sequence": task_seq,
        "predictions": predictions_dto
    }


def map_alternative_to_dto(primary_id: str, alt_id: str, resource_manager: Optional[ResourceManager] = None) -> Dict[str, Any]:
    """Map primary resource alternative pair to JSON DTO matching Frontend Alternative interface."""
    primary_res = resource_manager.get_resource(primary_id) if resource_manager else None
    alt_res = resource_manager.get_resource(alt_id) if resource_manager else None

    alt_state = getattr(alt_res, "state", ResourceHealthState.AVAILABLE) if alt_res else ResourceHealthState.AVAILABLE
    primary_name = primary_res.name if primary_res else primary_id
    alt_name = alt_res.name if alt_res else alt_id

    return {
        "id": f"alt-{primary_id}-{alt_id}",
        "name": f"{alt_name} (Fallback)",
        "primary_resource_id": primary_id,
        "primaryResourceId": primary_id,
        "primary_name": primary_name,
        "primaryResourceName": primary_name,
        "primaryName": primary_name,
        "alternative_resource_id": alt_id,
        "alternativeResourceId": alt_id,
        "alternative_name": alt_name,
        "alternativeName": alt_name,
        "primaryEndpoint": f"http://localhost:8000/api/resources/{primary_id}",
        "fallbackEndpoint": f"http://localhost:8000/api/resources/{alt_id}",
        "tier": "Tier-1",
        "substitutionType": "Hot-Standby Dynamic Failover",
        "status": "available" if (alt_res and alt_state == ResourceHealthState.AVAILABLE) else "standby",
        "trafficDiverted": 0,
        "trafficVolume": "0 req/sec (Standby)",
        "compatibility": 100,
        "syncLag": "< 1ms",
        "lastHealthCheck": "Just now",
        "readinessSla": "99.99%",
        "zone": "us-central1-a",
        "hardwareMatch": "Identical Quota Pool",
        "priority_offset": 1,
        "priorityOffset": 1
    }


def map_event_to_dto(raw_msg: str, event_id: str = "evt-1") -> Dict[str, Any]:
    """Map raw event log string to structured JSON DTO matching frontend Event schema."""
    level = "info"
    category = "WORKFLOW"
    evt_type = "Scheduling Decision"

    if "FAILURE" in raw_msg or "RATE_LIMITED" in raw_msg or "QUOTA" in raw_msg:
        level = "warning"
        category = "FAILURE_RECOVERY"
        evt_type = "Dependency Failure"
    elif "CONSTRAINED" in raw_msg:
        level = "error"
        category = "RESOURCE_CONSTRAINT"
        evt_type = "Dependency Failure"
    elif "FALLBACK" in raw_msg or "REROUTED" in raw_msg:
        level = "info"
        category = "DYNAMIC_REROUTE"
        evt_type = "Alternative Selected"
    elif "RESERVED" in raw_msg:
        level = "success"
        category = "RESERVATION"
        evt_type = "Scheduling Decision"

    timestamp = "10:00"
    if raw_msg.startswith("[") and "]" in raw_msg:
        timestamp = raw_msg[1:raw_msg.index("]")]

    return {
        "id": event_id,
        "timestamp": timestamp,
        "relativeTime": "Just now",
        "severity": level,
        "type": evt_type,
        "resource": "gemini-2.5-flash",
        "resourceId": "gemini-2.5-flash",
        "description": raw_msg,
        "chips": [
            {"label": "Level", "value": level.upper()},
            {"label": "Scope", "value": category}
        ],
        "details": {
            "latency": "12ms",
            "trigger": category,
            "strategy": "Dynamic Fallback"
        },
        "rawJson": {"raw": raw_msg},
        "message": raw_msg
    }
