from typing import Tuple
from models import Resource, Workflow, FailureEvent, FailureType
from resource_manager import ResourceManager
from service_graph import ServiceGraph
from scheduler import Scheduler
from reservation_engine import ReservationEngine
from prediction_engine import PredictionEngine

def initialize_simulator() -> Tuple[ResourceManager, ServiceGraph]:
    """Initializes simulated resources and runtime ServiceGraph."""
    rm = ResourceManager()

    # Search Service
    rm.add_resource(Resource(
        id="search",
        name="Search Service",
        type="service",
        capacity={"queries": 10.0}
    ))

    # Gemini 2.5 Flash
    rm.add_resource(Resource(
        id="gemini-2.5-flash",
        name="Gemini 2.5 Flash",
        type="llm",
        capacity={"rpm": 4.0, "tpm": 250000.0, "rpd": 20.0}
    ))

    # Gemini 2.5 Flash Lite
    rm.add_resource(Resource(
        id="gemini-2.5-flash-lite",
        name="Gemini 2.5 Flash Lite",
        type="llm",
        capacity={"rpm": 10.0, "tpm": 250000.0, "rpd": 20.0}
    ))

    # PostgreSQL Database
    rm.add_resource(Resource(
        id="postgres-db",
        name="PostgreSQL Database",
        type="database",
        capacity={"connections": 3.0}
    ))

    # Docker Worker
    rm.add_resource(Resource(
        id="docker-worker",
        name="Docker Worker",
        type="worker",
        capacity={"concurrent_jobs": 1.0}
    ))

    # PDF Generator Service
    rm.add_resource(Resource(
        id="pdf-generator",
        name="PDF Generator Service",
        type="service",
        capacity={"concurrent_jobs": 2.0}
    ))

    # Build Service Graph dependencies and fallbacks
    sg = ServiceGraph()
    sg.add_resource("search", attributes={"name": "Search Service"})
    sg.add_resource("gemini-2.5-flash", attributes={"name": "Gemini 2.5 Flash"})
    sg.add_resource("gemini-2.5-flash-lite", attributes={"name": "Gemini 2.5 Flash Lite"})
    sg.add_resource("postgres-db", attributes={"name": "PostgreSQL Database"})
    sg.add_resource("pdf-generator", attributes={"name": "PDF Generator Service"})

    # Graph Dependencies
    sg.add_dependency("search", "gemini-2.5-flash", probability=0.9)
    sg.add_dependency("gemini-2.5-flash", "postgres-db", probability=1.0)
    sg.add_dependency("postgres-db", "pdf-generator", probability=1.0)
    sg.add_dependency("gemini-2.5-flash-lite", "postgres-db", probability=1.0)

    # Alternative fallback: Gemini Flash Lite is alternative for Gemini Flash
    sg.add_alternative("gemini-2.5-flash", "gemini-2.5-flash-lite")

    return rm, sg


from typing import Tuple
from models import Resource, Workflow, FailureEvent, FailureType
from resource_manager import ResourceManager
from service_graph import ServiceGraph
from scheduler import Scheduler
from reservation_engine import ReservationEngine
from prediction_engine import PredictionEngine
from gemini_adapter import SimulatedGeminiAdapter, QuotaTracker
from config import ModelQuotaConfig

def initialize_simulator() -> Tuple[ResourceManager, ServiceGraph]:
    """Initializes simulated resources and runtime ServiceGraph."""
    rm = ResourceManager()

    # Search Service
    rm.add_resource(Resource(
        id="search",
        name="Search Service",
        type="service",
        capacity={"queries": 10.0}
    ))

    # Gemini 2.5 Flash
    rm.add_resource(Resource(
        id="gemini-2.5-flash",
        name="Gemini 2.5 Flash",
        type="llm",
        capacity={"rpm": 4.0, "tpm": 250000.0, "rpd": 20.0}
    ))

    # Gemini 2.5 Flash Lite
    rm.add_resource(Resource(
        id="gemini-2.5-flash-lite",
        name="Gemini 2.5 Flash Lite",
        type="llm",
        capacity={"rpm": 10.0, "tpm": 250000.0, "rpd": 20.0}
    ))

    # PostgreSQL Database
    rm.add_resource(Resource(
        id="postgres-db",
        name="PostgreSQL Database",
        type="database",
        capacity={"connections": 3.0}
    ))

    # Docker Worker
    rm.add_resource(Resource(
        id="docker-worker",
        name="Docker Worker",
        type="worker",
        capacity={"concurrent_jobs": 1.0}
    ))

    # PDF Generator Service
    rm.add_resource(Resource(
        id="pdf-generator",
        name="PDF Generator Service",
        type="service",
        capacity={"concurrent_jobs": 2.0}
    ))

    # Build Service Graph dependencies and fallbacks
    sg = ServiceGraph()
    sg.add_resource("search", attributes={"name": "Search Service"})
    sg.add_resource("gemini-2.5-flash", attributes={"name": "Gemini 2.5 Flash"})
    sg.add_resource("gemini-2.5-flash-lite", attributes={"name": "Gemini 2.5 Flash Lite"})
    sg.add_resource("postgres-db", attributes={"name": "PostgreSQL Database"})
    sg.add_resource("pdf-generator", attributes={"name": "PDF Generator Service"})

    # Graph Dependencies
    sg.add_dependency("search", "gemini-2.5-flash", probability=0.9)
    sg.add_dependency("gemini-2.5-flash", "postgres-db", probability=1.0)
    sg.add_dependency("postgres-db", "pdf-generator", probability=1.0)
    sg.add_dependency("gemini-2.5-flash-lite", "postgres-db", probability=1.0)

    # Alternative fallback: Gemini Flash Lite is alternative for Gemini Flash
    sg.add_alternative("gemini-2.5-flash", "gemini-2.5-flash-lite")

    return rm, sg


def run_scheduler_simulation() -> Scheduler:
    """Runs a demonstration of Milestone 5 Quota-Aware Runtime Execution."""
    print("=" * 70)
    print("  SecondBrain Milestone 5 - Quota-Aware Runtime Execution")
    print("=" * 70)

    rm, sg = initialize_simulator()
    scheduler = Scheduler(resource_manager=rm, service_graph=sg, aging_factor=2.0, default_cooldown=180.0)
    prediction_engine = PredictionEngine(service_graph=sg)
    reservation_engine = ReservationEngine(resource_manager=rm)
    
    # Configure Quota Tracker for demo
    quota_tracker = QuotaTracker({
        "gemini-2.5-flash": ModelQuotaConfig(rpm_limit=5, tpm_limit=250000, rpd_limit=20),
        "gemini-2.5-flash-lite": ModelQuotaConfig(rpm_limit=10, tpm_limit=250000, rpd_limit=20)
    })
    adapter = SimulatedGeminiAdapter(quota_tracker=quota_tracker)

    w1 = Workflow(
        id="W1",
        name="Research Report",
        current_task="search",
        priority=10.0,
        metadata={"task_sequence": ["search", "gemini-2.5-flash", "postgres-db", "pdf-generator"]}
    )

    print("\n--- Event Log ---")
    scheduler.set_time("10:00")
    scheduler.log_event("W1 current task -> search")

    # 1. Predictive Soft & Hard Reservation
    predictions = prediction_engine.predict(w1, top_k=1)
    top_pred = predictions[0]
    scheduler.log_event(f"Prediction -> {top_pred.resource_id} (confidence={top_pred.confidence:.2f})")

    soft_res = reservation_engine.soft_reserve(top_pred)
    if soft_res:
        scheduler.log_event(f"{w1.id} -> {top_pred.resource_id} -> SOFT RESERVED")

    confirmed_res = reservation_engine.confirm_prediction(top_pred)
    if confirmed_res:
        scheduler.log_event(f"{w1.id} -> {top_pred.resource_id} -> HARD RESERVED")

    # 2. Execution & Quota Check OK
    scheduler.set_time("10:01")
    scheduler.log_event(f"{w1.id} -> {top_pred.resource_id} -> EXECUTING")
    exec_res1 = adapter.execute(
        w1.id, top_pred.resource_id, estimated_tokens=1200, timestamp="10:01",
        current_time_num=601.0, reservation_id=confirmed_res.id, resource_manager=rm
    )
    if exec_res1.success:
        scheduler.log_event("Gemini quota check -> OK")
        scheduler.log_event(f"{w1.id} -> {top_pred.resource_id} -> SUCCESS (tokens_used={exec_res1.tokens_used})")

    # 3. Rate Limit Quota Failure & Rerouting Demo
    scheduler.set_time("10:02")
    w2 = Workflow(id="W2", name="Summarization Workflow", priority=8.0)
    res_w2 = scheduler.request_resource(w2, "gemini-2.5-flash", {"rpm": 2.0}, allow_fallback=True, timestamp="10:02")
    scheduler.log_event(f"{w2.id} -> gemini-2.5-flash -> EXECUTING")

    # Force RATE_LIMITED failure
    adapter.force_failure("gemini-2.5-flash", FailureType.RATE_LIMITED)
    exec_res2 = adapter.execute(w2.id, "gemini-2.5-flash", estimated_tokens=2000, timestamp="10:02", current_time_num=602.0)
    scheduler.log_event("Gemini quota check -> RATE_LIMITED")
    scheduler.handle_failure(exec_res2.failure_event, dimensions={"rpm": 2.0})

    # Execute fallback on Flash Lite
    scheduler.set_time("10:03")
    scheduler.log_event(f"{w2.id} -> gemini-2.5-flash-lite -> EXECUTING")
    exec_res3 = adapter.execute(w2.id, "gemini-2.5-flash-lite", estimated_tokens=950, timestamp="10:03", current_time_num=603.0)
    if exec_res3.success:
        scheduler.log_event(f"{w2.id} -> gemini-2.5-flash-lite -> SUCCESS (tokens_used={exec_res3.tokens_used})")

    # 4. Daily RPD Quota Exhaustion Demo
    scheduler.set_time("10:05")
    scheduler.log_event("Demonstrating daily RPD quota exhaustion...")
    adapter.force_failure("gemini-2.5-flash", FailureType.QUOTA_EXHAUSTED)
    exec_res4 = adapter.execute("W3", "gemini-2.5-flash", timestamp="10:05", current_time_num=605.0)
    scheduler.log_event("Gemini daily check -> QUOTA_EXHAUSTED")
    scheduler.handle_failure(exec_res4.failure_event, dimensions={"rpm": 2.0})

    print("\n" + "=" * 70)
    print("  Simulation Completed Successfully")
    print("=" * 70 + "\n")

    return scheduler

if __name__ == "__main__":
    run_scheduler_simulation()



