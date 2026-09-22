# SecondBrain Runtime

> **Runtime Resource Orchestration Platform for Concurrent Agentic AI Workloads**

SecondBrain Runtime is a deterministic, capacity-aware resource orchestration controller designed to prevent contention, rate-limiting, and resource starvation across concurrent AI agent workflows. By combining dependency prediction, network topology mapping, capacity reservation, priority aging, and automated fallback rerouting, SecondBrain Runtime ensures predictable runtime execution for complex multi-agent systems.

---

## 1. Problem Statement

Modern AI applications deploy multiple concurrent agents performing multi-step workflows (e.g., search, synthesis, database state updates, report rendering). As concurrent agent workloads scale, they compete for shared runtime dependencies—such as LLM API quotas (RPM, TPM, RPD), database connection pools, vector index query throughput, and containerized compute workers.

Without runtime orchestration, systems experience:
- **API Contention & Throttling**: Concurrent agents exhaust LLM rate limits (`RATE_LIMITED` / `QUOTA_EXHAUSTED`), causing unhandled request drops.
- **Resource Starvation**: Low-priority background agents block critical user-facing agent tasks without priority aging or soft reservations.
- **Cascading Failures**: A single bottlenecked downstream microservice or database connection pool halts upstream agent execution.
- **Brittle Retries**: Traditional exponential backoffs repeat failed calls against saturated primary endpoints instead of intelligently rerouting to available alternative models or fallbacks.

---

## 2. Solution & Core Concepts

SecondBrain Runtime acts as a dynamic runtime controller between AI workflows and underlying services or APIs:

- **Dependency Prediction (`PredictionEngine`)**: Analyzes sequential workflow specs, historical resource transition probabilities, and service graph topology to anticipate upcoming resource dependencies.
- **Service Graph Topology (`ServiceGraph`)**: Maps directed dependency trees and fallback alternative paths between resources using NetworkX graph structures.
- **Capacity-Aware Reservations (`ResourceManager` & `ReservationEngine`)**: Supports multi-dimensional capacity tracking (RPM, TPM, RPD, DB connections, concurrent jobs) with both hard (active) and soft (predictive) capacity reservations.
- **Priority Aging & Fair Scheduling (`Scheduler`)**: Prevents task starvation using dynamic priority calculation:
  $$\text{Effective Priority} = \text{Base Priority} + (\text{Aging Factor} \times \text{Waiting Time})$$
- **Failure Detection & Circuit Breaker**: Intercepts execution failures (`RATE_LIMITED`, `QUOTA_EXHAUSTED`, `TIMEOUT`, `SERVICE_UNAVAILABLE`) and temporarily marks constrained endpoints in a cooldown state.
- **Dynamic Fallback Rerouting**: Automatically reroutes blocked tasks to pre-configured alternative resources (e.g., rerouting `gemini-2.5-flash` to `gemini-2.5-flash-lite`) without crashing the calling workflow.

---

## 3. System Architecture

Workflows pass through a closed-loop runtime control pipeline:

```
                  +-----------------------------------+
                  |  AI Workflow Submission (API/CLI) |
                  +-----------------+-----------------+
                                    |
                                    v
                  +-----------------+-----------------+
                  |       Prediction Engine           |
                  | (Graph + History + Sequence)      |
                  +-----------------+-----------------+
                                    |
                                    v
                  +-----------------+-----------------+
                  |      Reservation Engine           |
                  |   (Soft / Hard Capacity Check)    |
                  +-----------------+-----------------+
                                    |
                                    v
                  +-----------------+-----------------+
                  |      Capacity-Aware Scheduler     |
                  |    (Priority Queue + Aging)       |
                  +-----------------+-----------------+
                                    |
                                    v
                  +-----------------+-----------------+
                  |       Resource Adapter           |
                  | (Execution & Quota Tracking)      |
                  +--------+----------------+---------+
                           |                |
                Success    |                | Failure (Rate Limit)
                           v                v
                 +---------+---+    +-------+-----------------+
                 | Completed   |    | Circuit Breaker /       |
                 |  Workload   |    | Cooldown Triggered      |
                 +-------------+    +-------+-----------------+
                                            |
                                            v
                                    +-------+-----------------+
                                    | Dynamic Fallback        |
                                    | Reroute (ServiceGraph)  |
                                    +-------------------------+
```

---

## 4. Backend Architecture

The backend (`backend/`) is structured into decoupled python modules:

| Module | Description |
| :--- | :--- |
| [`models.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/models.py) | Core dataclasses (`Resource`, `Workflow`, `Prediction`, `Reservation`, `FailureEvent`) and state Enums (`ResourceHealthState`, `ReservationStatus`, `WorkflowStatus`, `FailureType`). |
| [`resource_manager.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/resource_manager.py) | Multi-dimensional capacity tracking (`reserved`, `soft_reserved`, `usage`), resource state transitions (`AVAILABLE`, `CONSTRAINED`, `UNAVAILABLE`), and atomic capacity verification. |
| [`reservation_engine.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/reservation_engine.py) | Lifecycle management for hard and soft capacity reservations evaluated against `PredictionEngine` outputs. |
| [`prediction_engine.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/prediction_engine.py) | Hybrid prediction algorithm scoring candidate next resources via sequence matching (50%), historical transition frequency (30%), and ServiceGraph edges (20%). |
| [`scheduler.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/scheduler.py) | Priority queue processor with time aging, failure handling, circuit breaker cooldown enforcement, and fallback rerouting. |
| [`service_graph.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/service_graph.py) | NetworkX-backed directed graph containing resource nodes, probabilistic dependency edges, and alternative fallback mappings. |
| [`resource_adapter.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/resource_adapter.py) | Abstract `ResourceAdapter` interface and `SimulatedResourceAdapter` for resource execution. |
| [`gemini_adapter.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/gemini_adapter.py) | Simulated Gemini model adapter (`SimulatedGeminiAdapter`) with deterministic `QuotaTracker` managing RPM, TPM, and RPD limits. |
| [`server.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/server.py) | FastAPI server exposing public versioned REST APIs (`/api/v1/*`), compatibility endpoints (`/api/*`), and deterministic simulation controls (`/api/simulate/*`). |
| [`config.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/config.py) | Configuration constants (`GEMINI_MODE`, `DEFAULT_MODEL_QUOTAS`). |
| [`dto.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/dto.py) | Data Transfer Object mappers bridging backend domain models to frontend React components. |
| [`simulator.py`](file:///c:/Users/hp/Desktop/secondbrain-runtime/backend/simulator.py) | CLI simulation runner demonstrating deterministic scenario execution. |

---

## 5. Frontend Dashboard

The frontend (`Frontend/`) is built with **React 19**, **TypeScript**, **Vite**, **TailwindCSS (v4)**, **Lucide React**, **Motion**, and **React Router DOM v7**.

### Dashboard Views

- **Overview (`/`)**: High-level KPI metrics, real-time backend controller status, active rate-limit warning banners, topology preview, recent scheduler decisions, resource fleet quick-glance, and audit event logs.
- **Service Graph (`/service-graph`)**: Visual canvas rendering runtime resource nodes, active wire flows, fallback links, and health states.
- **Resources (`/resources`)**: Comprehensive resource registry featuring status toggles (Available / Degraded / Offline), capacity breakdown, dependent microservices, and rolling restart controls.
- **Alternatives (`/alternatives`)**: Configuration matrix for primary-to-fallback resource pairs, readiness SLAs, substitution triggers, and traffic diversion controls.
- **Scheduler (`/scheduler`)**: Live workload orchestrator displaying active workloads, target candidate scoring matrices, execution event traces, and manual step execution buttons.
- **Events (`/events`)**: Audit logging stream with severity filtering and raw JSON payload inspection.
- **Developer (`/developer`)**: Interactive API request sandbox, simulation trigger controls, and backend status indicators.
- **Settings (`/settings`)**: Runtime configuration controls for circuit breakers, refresh intervals, gRPC timeouts, and notification rules.

---

## 6. API Reference

The FastAPI backend exposes versioned Public APIs (`/api/v1/*`), legacy compatibility routes (`/api/*`), and simulation controls (`/api/simulate/*`).

### Public Integration API (`/api/v1`)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/health` | `GET` | Controller status, operational mode, and timestamp. |
| `/api/v1/workflows` | `GET` | Retrieve all active, queued, and completed workflows. |
| `/api/v1/workflows` | `POST` | Submit a new workflow specification to the controller. |
| `/api/v1/workflows/{workflow_id}` | `GET` | Get details, predictions, and queue status for a workflow. |
| `/api/v1/reservations` | `GET` | List active and soft capacity reservations. |
| `/api/v1/reservations` | `POST` | Create a hard or soft resource capacity reservation. |
| `/api/v1/reservations/{reservation_id}` | `GET` | Get reservation details by ID. |
| `/api/v1/reservations/{reservation_id}` | `DELETE` | Release a held capacity reservation. |
| `/api/v1/resources` | `GET` | List all managed resources and live telemetry. |
| `/api/v1/resources/{resource_id}` | `GET` | Retrieve specifications and telemetry for a specific resource. |
| `/api/v1/predictions/{workflow_id}` | `GET` | Fetch top predicted upcoming resource dependencies for a workflow. |
| `/api/v1/service-graph` | `GET` | Fetch graph nodes, dependency edges, and alternative links. |
| `/api/v1/events` | `GET` | Fetch runtime event audit trace logs. |

### Simulation Controls (`/api/simulate`)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/simulate/step` | `POST` | Execute manual simulation step (`run_step`, `rate_limit`, `quota_exhausted`, `live`). |
| `/api/simulate/reset` | `POST` | Reset runtime controller to initial deterministic state. |

### API Request & Response Example

#### Submit Workflow (`POST /api/v1/workflows`)

**Request:**
```json
{
  "id": "wf-research-01",
  "name": "Research Assistant Agent",
  "priority": 8.0,
  "task_sequence": ["search", "gemini-2.5-flash", "postgres-db"]
}
```

**Response:**
```json
{
  "success": true,
  "workflow": {
    "id": "wf-research-01",
    "name": "Research Assistant Agent",
    "targetResourceId": "search",
    "targetResourceName": "search",
    "targetEndpoint": "http://localhost:8000/api/resources/search",
    "status": "running",
    "started": "Just now",
    "duration": "0s",
    "schedulerDecision": "Assigned to search based on graph topology & priority",
    "selectedResource": "search",
    "alternativesEvaluated": [],
    "eventTrace": [
      {
        "time": "10:00",
        "message": "Task search assigned",
        "type": "info"
      }
    ]
  },
  "message": "Workflow wf-research-01 (Research Assistant Agent) submitted -> search (RESERVED)"
}
```

---

## 7. Workflow Execution Example

Consider a scenario where two research workflows run concurrently:

1. **Workflow Submission**: `W1` ("Research Report") and `W2` ("Summarization Workflow") submit tasks requiring `search` then `gemini-2.5-flash`.
2. **Reservation**: `W1` secures a capacity reservation for `gemini-2.5-flash` (`rpm: 1.0`, `tpm: 50000`).
3. **Contention & Rate Limit**: Under simulated peak load, `gemini-2.5-flash` triggers a `RATE_LIMITED` failure event.
4. **Failure Interception**: The controller intercepts the failure, marks `gemini-2.5-flash` as `CONSTRAINED`, and starts a cooldown timer.
5. **Dynamic Rerouting**: The `Scheduler` consults `ServiceGraph` alternative mappings, identifies `gemini-2.5-flash-lite` as an eligible fallback, and reroutes `W1` seamlessly.
6. **Continuation**: `W1` resumes execution on `gemini-2.5-flash-lite` without failing the workflow.

---

## 8. Resource Adapters

SecondBrain Runtime uses an adapter abstraction to decouples orchestration logic from underlying infrastructure:

```python
class ResourceAdapter(ABC):
    @abstractmethod
    def execute(self, workflow_id: str, resource_id: str, **kwargs) -> ExecutionResult:
        pass

    @abstractmethod
    def force_failure(self, resource_id: str, failure_type: FailureType) -> None:
        pass
```

- **`SimulatedResourceAdapter`**: Standard simulated adapter tracking quota limits across arbitrary resources.
- **`SimulatedGeminiAdapter`**: Specialized adapter equipped with `QuotaTracker` to enforce model RPM/TPM/RPD limits deterministically.

*Note: Current adapters operate in simulated mode to evaluate orchestration algorithms deterministically without incurring real external API costs.*

---

## 9. Simulation & Telemetry

The simulation system (`backend/simulator.py` and `/api/simulate/*`) provides deterministic testing of edge cases:

- **Step Ticks**: Advance simulation time in 1-minute increments.
- **Fault Injection**: Manually inject `RATE_LIMITED` or `QUOTA_EXHAUSTED` faults into specific resources.
- **Deterministic Metrics**: Resource capacity, CPU/memory stats, and latency metrics displayed in the UI are software-generated telemetry models for evaluating orchestration behaviors.

---

## 10. Installation & Local Setup

### Prerequisites

- **Python**: 3.10 or higher
- **Node.js**: 18.0 or higher
- **npm**: 9.0 or higher

### Environment Variables

Rename `.env.example` in `Frontend/` or export directly:

```env
GEMINI_MODE="simulated"
GEMINI_API_KEY="" # Optional: for future live API integration
```

### 1. Backend Setup

```bash
# Navigate to repository root
cd secondbrain-runtime

# Create Python virtual environment (optional but recommended)
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux/macOS:
source venv/bin/activate

# Install backend dependencies
pip install fastapi uvicorn pydantic networkx pytest requests
```

### 2. Frontend Setup

```bash
# Navigate to Frontend directory
cd Frontend

# Install node dependencies
npm install
```

---

## 11. Running the Application

### Start Backend Controller

From the root directory (`secondbrain-runtime`):

```bash
python -m uvicorn backend.server:app --reload --port 8000
```

- **Backend API Server**: `http://localhost:8000`
- **Interactive OpenAPI (Swagger) Docs**: `http://localhost:8000/docs`

### Start Frontend Dashboard

From the `Frontend/` directory:

```bash
npm run dev
```

- **Frontend Dashboard**: `http://localhost:3000`

---

## 12. Testing

The repository includes a comprehensive test suite containing **55 unit and integration tests** covering API endpoints, prediction scoring, scheduling logic, resource reservations, and Gemini adapter quota tracking.

Run the backend test suite:

```bash
# From root directory or backend directory
pytest backend/
```

### Test Files Breakdown

- `test_api_v1.py` (9 tests): Public `/api/v1/*` REST endpoint validation.
- `test_gemini_adapter.py` (13 tests): Quota tracker and Gemini adapter simulation tests.
- `test_prediction_engine.py` (8 tests): Dependency prediction engine scoring tests.
- `test_scheduler.py` (13 tests): Priority aging, queueing, and fallback rerouting tests.
- `test_server.py` (12 tests): Controller state reset and simulation step endpoint tests.

---

## 13. Production Architecture & Extensibility

SecondBrain Runtime is designed with a production-shaped architecture:

- **Pluggable Adapters**: Real cloud API adapters (e.g. Google GenAI SDK, PostgreSQL connection pools, Redis client adapters) can be attached by implementing the `ResourceAdapter` interface.
- **REST & OpenAPI Standards**: Fully typed Pydantic models with OpenAPI/Swagger compatibility.
- **State Decoupling**: Pure Python domain engine decoupled from framework routes, enabling deployment as a standalone sidecar proxy, API gateway plugin, or central cluster controller.

---

## 14. Limitations & Future Work

- **Simulated Infrastructure**: Resource execution and quota tracking currently execute against deterministic software models rather than live external production infrastructure.
- **In-Memory State**: State is currently maintained in-memory within the singleton `RuntimeController`.
- **Future Roadmap**:
  - Persistence backend (Redis / PostgreSQL) for distributed state.
  - Live API proxying middleware for Google Gemini & OpenAI API calls.
  - OpenTelemetry (OTel) trace ingestion for dynamic graph weight learning.

---

## 15. License

This project is licensed under the **Apache License 2.0**. See headers across source files for details.
