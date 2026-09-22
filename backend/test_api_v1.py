import unittest
from fastapi.testclient import TestClient

try:
    from .server import app, controller
    from .models import ResourceHealthState, ReservationStatus
    from .resource_adapter import SimulatedResourceAdapter, ResourceAdapter
except ImportError:
    from server import app, controller
    from models import ResourceHealthState, ReservationStatus
    from resource_adapter import SimulatedResourceAdapter, ResourceAdapter


class TestApiV1(unittest.TestCase):
    def setUp(self):
        controller.reset_state()
        self.client = TestClient(app)

    def test_v1_health(self):
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["api_version"], "v1")

    def test_v1_workflow_creation_and_listing(self):
        # 1. Create generic workflow with tasks
        payload = {
            "id": "wf-agent-99",
            "name": "Research Agent",
            "priority": 7.5,
            "tasks": [
                {"name": "search", "resource": "search"},
                {"name": "summarize", "resource": "gemini-2.5-flash"}
            ]
        }
        res_create = self.client.post("/api/v1/workflows", json=payload)
        self.assertEqual(res_create.status_code, 200)
        create_data = res_create.json()
        self.assertTrue(create_data["success"])
        self.assertEqual(create_data["workflow"]["id"], "wf-agent-99")

        # 2. List workflows
        res_list = self.client.get("/api/v1/workflows")
        self.assertEqual(res_list.status_code, 200)
        workflows = res_list.json()
        wf_ids = [w["id"] for w in workflows]
        self.assertIn("wf-agent-99", wf_ids)

        # 3. Get workflow by ID
        res_get = self.client.get("/api/v1/workflows/wf-agent-99")
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.json()["name"], "Research Agent")

    def test_v1_resource_listing_and_telemetry(self):
        # 1. Get resources
        response = self.client.get("/api/v1/resources")
        self.assertEqual(response.status_code, 200)
        resources = response.json()
        self.assertGreaterEqual(len(resources), 5)
        
        search_res = next(r for r in resources if r["id"] == "search")
        initial_cpu = search_res["metrics"]["cpu"]

        # 2. Create reservation to modify load & telemetry
        res_create = self.client.post("/api/v1/reservations", json={
            "workflow_id": "W1",
            "resource_id": "search",
            "dimensions": {"queries": 5.0}
        })
        self.assertEqual(res_create.status_code, 200)

        # 3. Verify telemetry updated deterministically
        res_updated = self.client.get("/api/v1/resources/search")
        self.assertEqual(res_updated.status_code, 200)
        updated_metrics = res_updated.json()["metrics"]
        self.assertGreater(updated_metrics["cpu"], initial_cpu)

    def test_v1_reservations_creation_and_release(self):
        # 1. Create reservation
        res_create = self.client.post("/api/v1/reservations", json={
            "workflow_id": "W1",
            "resource_id": "gemini-2.5-flash",
            "dimensions": {"rpm": 1.0},
            "soft": False
        })
        self.assertEqual(res_create.status_code, 200)
        res_id = res_create.json()["reservation"]["id"]

        # 2. List reservations
        res_list = self.client.get("/api/v1/reservations")
        self.assertEqual(res_list.status_code, 200)
        res_ids = [r["id"] for r in res_list.json()]
        self.assertIn(res_id, res_ids)

        # 3. Get reservation by ID
        res_get = self.client.get(f"/api/v1/reservations/{res_id}")
        self.assertEqual(res_get.status_code, 200)
        self.assertEqual(res_get.json()["status"], "ACTIVE")

        # 4. Release reservation
        res_del = self.client.delete(f"/api/v1/reservations/{res_id}")
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.json()["success"])

    def test_v1_predictions(self):
        response = self.client.get("/api/v1/predictions/W1")
        self.assertEqual(response.status_code, 200)
        preds = response.json()
        self.assertIsInstance(preds, list)
        self.assertGreater(len(preds), 0)

    def test_v1_service_graph(self):
        response = self.client.get("/api/v1/service-graph")
        self.assertEqual(response.status_code, 200)
        graph = response.json()
        self.assertIn("nodes", graph)
        self.assertIn("edges", graph)
        node_ids = [n["id"] for n in graph["nodes"]]
        self.assertIn("gemini-2.5-flash", node_ids)

    def test_v1_events(self):
        response = self.client.get("/api/v1/events")
        self.assertEqual(response.status_code, 200)
        events = response.json()
        self.assertIsInstance(events, list)

    def test_resource_adapter_interface(self):
        adapter = SimulatedResourceAdapter()
        self.assertTrue(issubclass(SimulatedResourceAdapter, ResourceAdapter))
        health = adapter.health("gemini-2.5-flash", controller.rm)
        self.assertEqual(health, ResourceHealthState.AVAILABLE)
        cap = adapter.capacity("gemini-2.5-flash", controller.rm)
        self.assertIn("rpm", cap)

    def test_live_simulation_progression(self):
        # Step 1: W3 submitted
        s1 = self.client.post("/api/simulate/step", json={"action": "live"}).json()
        self.assertEqual(s1["step"], 1)
        self.assertIn("W3", s1["message"])

        # Step 2: W1 reservation
        s2 = self.client.post("/api/simulate/step", json={"action": "live"}).json()
        self.assertEqual(s2["step"], 2)

        # Step 3: Flash RATE_LIMITED & fallback
        s3 = self.client.post("/api/simulate/step", json={"action": "live"}).json()
        self.assertEqual(s3["step"], 3)
        self.assertIn("RATE_LIMITED", s3["message"])

        # Step 4: Reroute to Flash Lite
        s4 = self.client.post("/api/simulate/step", json={"action": "live"}).json()
        self.assertEqual(s4["step"], 4)

        # Step 5: Recovery
        s5 = self.client.post("/api/simulate/step", json={"action": "live"}).json()
        self.assertEqual(s5["step"], 5)
        self.assertIn("recovered", s5["message"])


if __name__ == "__main__":
    unittest.main()
