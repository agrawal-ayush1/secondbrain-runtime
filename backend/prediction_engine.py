from typing import Dict, List, Optional, Any
from models import Workflow, Prediction, Resource
from service_graph import ServiceGraph

DEFAULT_RESOURCE_REQUIREMENTS: Dict[str, Dict[str, float]] = {
    "gemini-2.5-flash": {"rpm": 1.0, "tpm": 5000.0, "rpd": 1.0},
    "gemini-2.5-flash-lite": {"rpm": 1.0, "tpm": 4000.0, "rpd": 1.0},
    "gemini-flash": {"rpm": 1.0},
    "gemini-flash-lite": {"rpm": 1.0},
    "postgres-db": {"connections": 1.0},
    "postgresql": {"connections": 1.0},
    "docker-worker": {"concurrent_jobs": 1.0},
    "pdf-generator": {"concurrent_jobs": 1.0},
    "vector-db": {"queries": 1.0},
    "github": {"api_calls": 1.0},
    "search": {"queries": 1.0},
}

class PredictionEngine:
    """Dependency Prediction Engine that predicts next resource requirements

    using workflow task sequences, historical transition frequencies, and ServiceGraph dependencies.
    """

    def __init__(
        self,
        service_graph: ServiceGraph,
        transition_history: Optional[Dict[str, Dict[str, int]]] = None,
        default_requirements: Optional[Dict[str, Dict[str, float]]] = None
    ):
        self.service_graph = service_graph
        self.transition_history: Dict[str, Dict[str, int]] = transition_history or {}
        self.default_requirements = default_requirements or DEFAULT_RESOURCE_REQUIREMENTS
        self._pred_counter: int = 0

    def record_transition(self, from_resource: str, to_resource: str) -> None:
        """Records an actual runtime resource transition to update historical probability frequencies."""
        if from_resource not in self.transition_history:
            self.transition_history[from_resource] = {}
        self.transition_history[from_resource][to_resource] = (
            self.transition_history[from_resource].get(to_resource, 0) + 1
        )

    def predict(
        self,
        workflow: Workflow,
        available_resources: Optional[List[str]] = None,
        top_k: int = 3
    ) -> List[Prediction]:
        """Predicts the next top_k likely resource dependencies for a workflow."""
        curr_task = workflow.current_task
        if not curr_task and workflow.completed_tasks:
            curr_task = workflow.completed_tasks[-1]

        task_sequence: List[str] = workflow.metadata.get("task_sequence", [])

        # Gather candidate next resources
        candidates: List[str] = []

        # 1. Sequence candidates
        if task_sequence:
            if curr_task in task_sequence:
                idx = task_sequence.index(curr_task)
                for item in task_sequence[idx + 1:]:
                    if item not in candidates:
                        candidates.append(item)
            else:
                for item in task_sequence:
                    if item not in candidates:
                        candidates.append(item)

        # 2. Graph candidates
        if curr_task:
            for target in self.service_graph.get_next_resources(curr_task):
                if target not in candidates:
                    candidates.append(target)
            for alt in self.service_graph.get_alternatives(curr_task):
                if alt not in candidates:
                    candidates.append(alt)

        # 3. Historical transition candidates
        if curr_task and curr_task in self.transition_history:
            for target in self.transition_history[curr_task].keys():
                if target not in candidates:
                    candidates.append(target)

        # Score candidates
        scored_predictions: List[Prediction] = []

        for res_id in candidates:
            if res_id == curr_task:
                continue

            # Workflow Sequence Score (0.0 to 1.0)
            wf_score = 0.0
            if task_sequence and curr_task in task_sequence:
                idx = task_sequence.index(curr_task)
                if idx + 1 < len(task_sequence) and task_sequence[idx + 1] == res_id:
                    wf_score = 1.0
                elif idx + 2 < len(task_sequence) and task_sequence[idx + 2] == res_id:
                    wf_score = 0.7
                elif res_id in task_sequence[idx + 1:]:
                    wf_score = 0.4
            elif task_sequence and res_id in task_sequence:
                wf_score = 0.5

            # Historical Transition Score (0.0 to 1.0)
            hist_score = 0.5
            if curr_task and curr_task in self.transition_history:
                history = self.transition_history[curr_task]
                total = sum(history.values())
                if total > 0:
                    hist_score = history.get(res_id, 0) / float(total)

            # ServiceGraph Score (0.0 to 1.0)
            graph_score = 0.0
            if curr_task:
                next_res = self.service_graph.get_next_resources(curr_task)
                alts = self.service_graph.get_alternatives(curr_task)
                if res_id in next_res:
                    graph_score = 1.0
                elif res_id in alts:
                    graph_score = 0.5
            else:
                graph_score = 0.5

            # Hybrid Confidence Formula: 0.5 * wf_score + 0.3 * hist_score + 0.2 * graph_score
            confidence = min(1.0, max(0.0, 0.5 * wf_score + 0.3 * hist_score + 0.2 * graph_score))

            if available_resources is not None and res_id not in available_resources:
                continue

            # Reason tag
            if hist_score > 0.5 and history.get(res_id, 0) > 0:
                reason = "historical_transition"
            elif wf_score > 0.5:
                reason = "workflow_sequence"
            else:
                reason = "service_graph"

            self._pred_counter += 1
            pred_id = f"pred-{workflow.id}-{self._pred_counter}"
            req_dims = self.default_requirements.get(res_id, {"rpm": 1.0})

            prediction = Prediction(
                id=pred_id,
                workflow_id=workflow.id,
                resource_id=res_id,
                requested_dimensions=req_dims,
                confidence=round(confidence, 2),
                estimated_duration=2.0,
                reason=reason
            )
            scored_predictions.append(prediction)

        # Sort descending by confidence
        scored_predictions.sort(key=lambda p: p.confidence, reverse=True)

        return scored_predictions[:top_k]
