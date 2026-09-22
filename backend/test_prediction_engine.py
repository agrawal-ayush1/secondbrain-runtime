import unittest
from models import Resource, Workflow, WorkflowStatus, ReservationStatus
from resource_manager import ResourceManager
from service_graph import ServiceGraph
from reservation_engine import ReservationEngine
from prediction_engine import PredictionEngine

class TestPredictionEngine(unittest.TestCase):

    def setUp(self):
        self.rm = ResourceManager()

        # Add resources
        self.rm.add_resource(Resource(id="search", name="Search Service", type="service", capacity={"queries": 10.0}))
        self.rm.add_resource(Resource(id="gemini-2.5-flash", name="Gemini 2.5 Flash", type="llm", capacity={"rpm": 5.0}))
        self.rm.add_resource(Resource(id="gemini-2.5-flash-lite", name="Gemini 2.5 Flash Lite", type="llm", capacity={"rpm": 10.0}))
        self.rm.add_resource(Resource(id="postgres-db", name="PostgreSQL DB", type="database", capacity={"connections": 5.0}))
        self.rm.add_resource(Resource(id="pdf-generator", name="PDF Generator", type="service", capacity={"concurrent_jobs": 2.0}))

        # Build Service Graph
        self.sg = ServiceGraph()
        self.sg.add_resource("search")
        self.sg.add_resource("gemini-2.5-flash")
        self.sg.add_resource("gemini-2.5-flash-lite")
        self.sg.add_resource("postgres-db")
        self.sg.add_resource("pdf-generator")

        self.sg.add_dependency("search", "gemini-2.5-flash")
        self.sg.add_dependency("gemini-2.5-flash", "postgres-db")
        self.sg.add_dependency("postgres-db", "pdf-generator")
        self.sg.add_alternative("gemini-2.5-flash", "gemini-2.5-flash-lite")

        self.prediction_engine = PredictionEngine(service_graph=self.sg)
        self.reservation_engine = ReservationEngine(resource_manager=self.rm)

    def test_research_workflow_predicts_llm(self):
        """Test 1: Research workflow at Search predicts LLM as high-confidence next dependency."""
        w1 = Workflow(
            id="W1",
            name="Research Report",
            current_task="search",
            metadata={"task_sequence": ["search", "gemini-2.5-flash", "postgres-db", "pdf-generator"]}
        )
        predictions = self.prediction_engine.predict(w1, top_k=3)
        self.assertTrue(len(predictions) > 0)
        self.assertEqual(predictions[0].resource_id, "gemini-2.5-flash")
        self.assertGreaterEqual(predictions[0].confidence, 0.7)

    def test_top_k_limiting(self):
        """Test 2: Prediction returns at most top_k resources."""
        w1 = Workflow(
            id="W1",
            name="Research Report",
            current_task="search",
            metadata={"task_sequence": ["search", "gemini-2.5-flash", "postgres-db", "pdf-generator"]}
        )
        predictions = self.prediction_engine.predict(w1, top_k=2)
        self.assertLessEqual(len(predictions), 2)

    def test_predictions_sorted_by_confidence(self):
        """Test 3: Predictions are sorted descending by confidence."""
        w1 = Workflow(
            id="W1",
            name="Research Report",
            current_task="search",
            metadata={"task_sequence": ["search", "gemini-2.5-flash", "postgres-db", "pdf-generator"]}
        )
        predictions = self.prediction_engine.predict(w1, top_k=3)
        confidences = [p.confidence for p in predictions]
        self.assertEqual(confidences, sorted(confidences, reverse=True))

    def test_historical_transitions_influence_scores(self):
        """Test 4: Historical transitions influence prediction probabilities."""
        engine = PredictionEngine(service_graph=self.sg)

        # Record 8 transitions to Flash and 2 transitions to Flash Lite
        for _ in range(8):
            engine.record_transition("search", "gemini-2.5-flash")
        for _ in range(2):
            engine.record_transition("search", "gemini-2.5-flash-lite")

        w = Workflow(id="W1", name="W1", current_task="search")
        preds = engine.predict(w, top_k=3)

        flash_pred = next((p for p in preds if p.resource_id == "gemini-2.5-flash"), None)
        lite_pred = next((p for p in preds if p.resource_id == "gemini-2.5-flash-lite"), None)

        self.assertIsNotNone(flash_pred)
        self.assertIsNotNone(lite_pred)
        self.assertGreater(flash_pred.confidence, lite_pred.confidence)

    def test_service_graph_dependency_predictions(self):
        """Test 5: Prediction uses ServiceGraph dependencies."""
        w = Workflow(id="W_graph", name="Graph WF", current_task="postgres-db")
        preds = self.prediction_engine.predict(w, top_k=3)

        pdf_pred = next((p for p in preds if p.resource_id == "pdf-generator"), None)
        self.assertIsNotNone(pdf_pred)
        self.assertGreater(pdf_pred.confidence, 0.0)

    def test_resource_requirement_estimates_included(self):
        """Test 6: Resource requirement estimates are included in predictions."""
        w = Workflow(
            id="W1",
            name="W1",
            current_task="search",
            metadata={"task_sequence": ["search", "gemini-2.5-flash"]}
        )
        preds = self.prediction_engine.predict(w, top_k=1)
        self.assertEqual(len(preds), 1)
        self.assertIn("rpm", preds[0].requested_dimensions)

    def test_prediction_correction_via_recorded_transition(self):
        """Test 7: Wrong prediction can be corrected by recording actual transition."""
        engine = PredictionEngine(service_graph=self.sg)
        w = Workflow(id="W1", name="W1", current_task="search")

        # Record multiple actual transitions to Flash Lite
        for _ in range(10):
            engine.record_transition("search", "gemini-2.5-flash-lite")

        preds = engine.predict(w, top_k=2)
        top_pred = preds[0]
        self.assertEqual(top_pred.resource_id, "gemini-2.5-flash-lite")

    def test_soft_reservation_capacity_limits(self):
        """Test 8: Soft predictive reservation respects resource capacity and prevents over-allocation."""
        small_res = Resource(id="small-model", name="Small Model", type="llm", capacity={"rpm": 2.0})
        self.rm.add_resource(small_res)

        pred1 = self.prediction_engine.predict(
            Workflow(id="w1", name="W1", current_task="search", metadata={"task_sequence": ["search", "small-model"]}),
            top_k=1
        )[0]
        pred1.requested_dimensions = {"rpm": 2.0}

        # Soft reserve full capacity (2.0 RPM)
        soft_res = self.reservation_engine.soft_reserve(pred1)
        self.assertIsNotNone(soft_res)
        self.assertEqual(soft_res.status, ReservationStatus.SOFT_RESERVED)
        self.assertEqual(self.rm.get_available("small-model")["rpm"], 0.0)

        # Attempting second soft reserve exceeding capacity should fail
        pred2 = self.prediction_engine.predict(
            Workflow(id="w2", name="W2", current_task="search", metadata={"task_sequence": ["search", "small-model"]}),
            top_k=1
        )[0]
        pred2.requested_dimensions = {"rpm": 1.0}

        soft_res2 = self.reservation_engine.soft_reserve(pred2)
        self.assertIsNone(soft_res2)

if __name__ == "__main__":
    unittest.main()
