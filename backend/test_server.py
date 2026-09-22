import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import unittest
from fastapi.testclient import TestClient
try:
    from .server import app, controller
except ImportError:
    from server import app, controller

class TestFastAPIServer(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)
        # Reset controller before each test
        controller.reset_state()

    def test_health_endpoint(self):
        """Test 1: GET /api/health returns HTTP 200 and status healthy."""
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("mode", data)
        self.assertEqual(data["backend"], "runtime-controller")

    def test_resources_endpoint(self):
        """Test 2: GET /api/resources returns resource DTO list."""
        response = self.client.get("/api/resources")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertTrue(len(data) > 0)
        flash_res = next((r for r in data if r["id"] == "gemini-2.5-flash"), None)
        self.assertIsNotNone(flash_res)
        self.assertIn("capacity", flash_res)
        self.assertIn("health", flash_res)

    def test_graph_endpoint(self):
        """Test 3: GET /api/graph returns nodes and edges."""
        response = self.client.get("/api/graph")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("nodes", data)
        self.assertIn("edges", data)
        self.assertTrue(len(data["nodes"]) > 0)
        self.assertTrue(len(data["edges"]) > 0)

    def test_scheduler_endpoint(self):
        """Test 4: GET /api/scheduler/workloads returns workloads state."""
        response = self.client.get("/api/scheduler/workloads")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertTrue(len(data) > 0)

    def test_predictions_endpoint(self):
        """Test 5: GET /api/predictions returns prediction data."""
        response = self.client.get("/api/predictions")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)

    def test_events_endpoint(self):
        """Test 6: GET /api/events returns event list."""
        response = self.client.get("/api/events")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertTrue(len(data) > 0)

    def test_alternatives_endpoint(self):
        """Test 7: GET /api/alternatives returns fallback relationships."""
        response = self.client.get("/api/alternatives")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertTrue(len(data) > 0)
        alt = next((a for a in data if a["primaryResourceId"] == "gemini-2.5-flash"), None)
        self.assertIsNotNone(alt)

    def test_settings_endpoint(self):
        """Test 8: GET /api/settings returns settings without exposing secrets."""
        response = self.client.get("/api/settings")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("general", data)
        self.assertIn("runtime", data)
        self.assertIn("api", data)
        self.assertNotIn("api_key", str(data).lower())

    def test_simulate_reset(self):
        """Test 9: POST /api/simulate/reset resets demo state."""
        response = self.client.post("/api/simulate/reset")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "reset_complete")

    def test_simulate_step(self):
        """Test 10: POST /api/simulate/step advances time."""
        response = self.client.post("/api/simulate/step", json={"action": "run_step"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")

    def test_rate_limit_simulation_step(self):
        """Test 11: Rate-limit simulation step produces failure and fallback events."""
        response = self.client.post("/api/simulate/step", json={"action": "rate_limit", "resource_id": "gemini-2.5-flash", "workflow_id": "W1"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        
        # Verify gemini-2.5-flash became CONSTRAINED
        res = controller.rm.get_resource("gemini-2.5-flash")
        self.assertEqual(res.state.value, "CONSTRAINED")

    def test_create_workflow(self):
        """Test 12: POST /api/workflows registers a new workflow."""
        response = self.client.post("/api/workflows", json={
            "workflow_id": "W6",
            "name": "Custom Data Pipeline",
            "priority": 5.0,
            "task_sequence": ["search", "gemini-2.5-flash"]
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["workflow"]["id"], "W6")

if __name__ == "__main__":
    unittest.main()
