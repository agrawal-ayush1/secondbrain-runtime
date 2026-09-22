import sys
import os
import unittest
from fastapi.testclient import TestClient

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from .server import app, controller
except ImportError:
    from server import app, controller


class TestSyncEndpoint(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)
        controller.reset_state()

    def test_sync_workflow_and_reservation(self):
        """Test sync endpoint processes offline operations and returns updated snapshot."""
        payload = {
            "clientId": "browser-test-client",
            "baseVersion": 1,
            "operations": [
                {
                    "operationId": "op-sync-001",
                    "type": "CREATE_WORKFLOW",
                    "timestamp": "10:02",
                    "payload": {
                        "id": "W3",
                        "name": "Deep Research Agent",
                        "priority": 9.0,
                        "task_sequence": ["search", "gemini-2.5-flash", "postgres-db"]
                    }
                },
                {
                    "operationId": "op-sync-002",
                    "type": "RESERVE_RESOURCE",
                    "timestamp": "10:02",
                    "payload": {
                        "workflow_id": "W3",
                        "resource_id": "gemini-2.5-flash",
                        "dimensions": {"rpm": 1.0}
                    }
                }
            ]
        }

        response = self.client.post("/api/v1/sync", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("op-sync-001", data["syncedOperations"])
        self.assertIn("op-sync-002", data["syncedOperations"])
        self.assertIn("snapshot", data)

        # Verify workflow W3 was registered in backend
        wf = controller.scheduler.workflows.get("W3")
        self.assertIsNotNone(wf)
        self.assertEqual(wf.name, "Deep Research Agent")

    def test_sync_idempotency(self):
        """Test sending the exact same operationId twice is idempotent."""
        payload = {
            "clientId": "browser-test-client",
            "baseVersion": 1,
            "operations": [
                {
                    "operationId": "op-sync-dup-001",
                    "type": "CREATE_WORKFLOW",
                    "timestamp": "10:05",
                    "payload": {
                        "id": "W99",
                        "name": "Duplicate Test Agent",
                        "priority": 5.0,
                        "task_sequence": ["search"]
                    }
                }
            ]
        }

        # First sync call
        res1 = self.client.post("/api/v1/sync", json=payload)
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        self.assertIn("op-sync-dup-001", data1["syncedOperations"])

        # Second sync call with same op ID
        res2 = self.client.post("/api/v1/sync", json=payload)
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertIn("op-sync-dup-001", data2["syncedOperations"])

        # Ensure no duplicate creation or crash occurred
        all_wfs = [w for w in controller.scheduler.workflows.values() if w.id == "W99"]
        self.assertEqual(len(all_wfs), 1)


if __name__ == "__main__":
    unittest.main()
