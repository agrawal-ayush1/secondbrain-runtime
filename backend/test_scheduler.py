import unittest
from models import Resource, Workflow, WorkflowStatus, FailureEvent, FailureType, ResourceHealthState
from resource_manager import ResourceManager
from service_graph import ServiceGraph
from scheduler import Scheduler

class TestSchedulerAndServiceGraph(unittest.TestCase):

    def setUp(self):
        self.rm = ResourceManager()

        # Add resources
        self.flash = Resource(
            id="gemini-flash",
            name="Gemini Flash",
            type="llm",
            capacity={"rpm": 5.0}
        )
        self.flash_lite = Resource(
            id="gemini-flash-lite",
            name="Gemini Flash Lite",
            type="llm",
            capacity={"rpm": 10.0}
        )
        self.rm.add_resource(self.flash)
        self.rm.add_resource(self.flash_lite)

        # Service Graph
        self.sg = ServiceGraph()
        self.sg.add_resource("gemini-flash")
        self.sg.add_resource("gemini-flash-lite")
        self.sg.add_alternative("gemini-flash", "gemini-flash-lite")

        # Scheduler
        self.scheduler = Scheduler(
            resource_manager=self.rm,
            service_graph=self.sg,
            aging_factor=2.0,
            default_cooldown=60.0
        )

    def test_overallocation_prevention(self):
        """Ensures that capacity limits cannot be exceeded."""
        w1 = Workflow(id="w1", name="W1", priority=1.0)
        w2 = Workflow(id="w2", name="W2", priority=1.0)

        res1 = self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 4.0}, allow_fallback=False)
        self.assertIsNotNone(res1)
        self.assertEqual(self.rm.get_available("gemini-flash")["rpm"], 1.0)

        # Requesting 2.0 RPM when only 1.0 is available should be queued (prevent over-allocation)
        res2 = self.scheduler.request_resource(w2, "gemini-flash", {"rpm": 2.0}, allow_fallback=False)
        self.assertIsNone(res2)
        self.assertEqual(w2.status, WorkflowStatus.QUEUED)
        self.assertEqual(self.rm.get_available("gemini-flash")["rpm"], 1.0)

    def test_queueing(self):
        """Verifies workflows are placed into the priority queue when capacity is unavailable."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        w2 = Workflow(id="w2", name="W2", priority=2.0)

        self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)
        self.scheduler.request_resource(w2, "gemini-flash", {"rpm": 2.0}, allow_fallback=False)

        self.assertEqual(len(self.scheduler.waiting_requests), 1)
        self.assertEqual(self.scheduler.waiting_requests[0].workflow.id, "w2")
        self.assertEqual(w2.status, WorkflowStatus.QUEUED)

    def test_release_and_reallocation(self):
        """Verifies that releasing a resource triggers automatic reallocation to queued workflows."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        w2 = Workflow(id="w2", name="W2", priority=3.0)

        res1 = self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)
        self.scheduler.request_resource(w2, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)

        self.assertEqual(w2.status, WorkflowStatus.QUEUED)

        # Release W1's reservation
        released = self.scheduler.release_reservation(res1.id)
        self.assertTrue(released)

        # W2 should now be allocated and running
        self.assertEqual(w2.status, WorkflowStatus.RUNNING)
        self.assertEqual(len(self.scheduler.waiting_requests), 0)

    def test_priority_aging(self):
        """Tests that effective priority grows correctly over waiting time."""
        w = Workflow(id="w1", name="W1", priority=2.0)
        self.assertEqual(w.get_effective_priority(aging_factor=2.0), 2.0)

        # Advance waiting time by 3.5 minutes
        w.waiting_time += 3.5
        # effective_priority = 2.0 + (2.0 * 3.5) = 9.0
        self.assertEqual(w.get_effective_priority(aging_factor=2.0), 9.0)

    def test_fallback_selection(self):
        """Tests that scheduler queries ServiceGraph and selects alternative when primary resource is busy."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        w2 = Workflow(id="w2", name="W2", priority=5.0)

        # Fill primary resource
        self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)

        # W2 requests gemini-flash with allow_fallback=True
        res2 = self.scheduler.request_resource(w2, "gemini-flash", {"rpm": 5.0}, allow_fallback=True)
        self.assertIsNotNone(res2)
        self.assertEqual(res2.resource_id, "gemini-flash-lite")
        self.assertEqual(w2.status, WorkflowStatus.RUNNING)

    def test_starvation_prevention(self):
        """Tests that priority aging allows older low-priority workflows to overtake newer high-priority workflows."""
        w_low = Workflow(id="w_low", name="Low Priority", priority=1.0)
        w_high = Workflow(id="w_high", name="High Priority", priority=5.0)
        w_holder = Workflow(id="w_holder", name="Holder", priority=10.0)

        # Reserve full capacity
        res_holder = self.scheduler.request_resource(w_holder, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)

        # Queue low priority workflow at t=0
        self.scheduler.request_resource(w_low, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)

        # Advance time by 4 minutes -> w_low eff priority = 1.0 + (2.0 * 4.0) = 9.0
        self.scheduler.advance_time(4.0)

        # Queue high priority workflow at t=4 -> w_high eff priority = 5.0 + (2.0 * 0.0) = 5.0
        self.scheduler.request_resource(w_high, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)

        # Release holder's reservation
        self.scheduler.release_reservation(res_holder.id)

        # w_low (eff prio 9.0) should be promoted ahead of w_high (eff prio 5.0)
        self.assertEqual(w_low.status, WorkflowStatus.RUNNING)
        self.assertEqual(w_high.status, WorkflowStatus.QUEUED)

    def test_service_graph(self):
        """Tests ServiceGraph dependency and alternative lookups."""
        sg = ServiceGraph()
        sg.add_resource("app")
        sg.add_resource("db")
        sg.add_resource("cache")
        sg.add_dependency("app", "db", probability=1.0)
        sg.add_alternative("db", "cache")

        self.assertIn("db", sg.get_next_resources("app"))
        self.assertIn("cache", sg.get_alternatives("db"))

    def test_failure_rate_limited_releases_and_constrains(self):
        """Test 1: W1 reserves Flash, fails with RATE_LIMITED -> reservation released & Flash constrained."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        res1 = self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)
        self.assertIsNotNone(res1)

        fail_event = FailureEvent(
            workflow_id="w1",
            resource_id="gemini-flash",
            failure_type=FailureType.RATE_LIMITED,
            timestamp="10:02"
        )
        self.scheduler.handle_failure(fail_event, dimensions={"rpm": 5.0})

        flash_res = self.rm.get_resource("gemini-flash")
        self.assertEqual(flash_res.state, ResourceHealthState.CONSTRAINED)
        self.assertEqual(res1.status.value, "RELEASED")

    def test_dynamic_rerouting_to_fallback(self):
        """Test 2: Flash has alt Flash Lite. W1 fails on Flash -> controller dynamically reroutes W1 to Flash Lite."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 5.0}, allow_fallback=True)

        fail_event = FailureEvent(
            workflow_id="w1",
            resource_id="gemini-flash",
            failure_type=FailureType.RATE_LIMITED,
            timestamp="10:02"
        )
        new_res = self.scheduler.handle_failure(fail_event, dimensions={"rpm": 5.0})

        self.assertIsNotNone(new_res)
        self.assertEqual(new_res.resource_id, "gemini-flash-lite")
        self.assertEqual(w1.status, WorkflowStatus.RUNNING)

    def test_failure_no_alternative_queues(self):
        """Test 3: Resource fails, no alternative exists -> workflow returns to queue."""
        gpu = Resource(id="gpu-cluster", name="GPU Cluster", type="compute", capacity={"jobs": 1.0})
        self.rm.add_resource(gpu)
        self.sg.add_resource("gpu-cluster")

        w1 = Workflow(id="w1", name="W1", priority=5.0)
        self.scheduler.request_resource(w1, "gpu-cluster", {"jobs": 1.0}, allow_fallback=True)

        fail_event = FailureEvent(
            workflow_id="w1",
            resource_id="gpu-cluster",
            failure_type=FailureType.RATE_LIMITED,
            timestamp="10:02"
        )
        new_res = self.scheduler.handle_failure(fail_event, dimensions={"jobs": 1.0})

        self.assertIsNone(new_res)
        self.assertEqual(w1.status, WorkflowStatus.QUEUED)
        self.assertEqual(gpu.state, ResourceHealthState.CONSTRAINED)

    def test_constrained_resource_not_selected_during_cooldown(self):
        """Test 4: Constrained Flash is not selected during cooldown."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)

        fail_event = FailureEvent(
            workflow_id="w1",
            resource_id="gemini-flash",
            failure_type=FailureType.RATE_LIMITED,
            timestamp="10:00"
        )
        self.scheduler.handle_failure(fail_event, dimensions={"rpm": 5.0}, cooldown=120.0)

        # Advance time by 0.5 minutes (30 seconds, still within 120s / 2.0m cooldown)
        self.scheduler.advance_time(0.5)

        w2 = Workflow(id="w2", name="W2", priority=5.0)
        res2 = self.scheduler.request_resource(w2, "gemini-flash", {"rpm": 2.0}, allow_fallback=False)
        self.assertIsNone(res2)
        self.assertEqual(w2.status, WorkflowStatus.QUEUED)

    def test_cooldown_expiration_makes_resource_available(self):
        """Test 5: Cooldown expires -> Flash becomes available again."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 5.0}, allow_fallback=False)

        fail_event = FailureEvent(
            workflow_id="w1",
            resource_id="gemini-flash",
            failure_type=FailureType.RATE_LIMITED,
            timestamp="10:00"
        )
        self.scheduler.handle_failure(fail_event, dimensions={"rpm": 5.0}, cooldown=60.0)

        # Advance time by 1.5 minutes (90 seconds, past 60s / 1.0m cooldown duration)
        self.scheduler.advance_time(1.5)

        w2 = Workflow(id="w2", name="W2", priority=5.0)
        res2 = self.scheduler.request_resource(w2, "gemini-flash", {"rpm": 2.0}, allow_fallback=False)
        self.assertIsNotNone(res2)
        self.assertEqual(res2.resource_id, "gemini-flash")

    def test_workflow_completion_or_requeue_after_failure(self):
        """Test 6: Workflow does not get stuck after failure (it is either rerouted, requeued, or completed)."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        self.scheduler.request_resource(w1, "gemini-flash", {"rpm": 5.0}, allow_fallback=True)

        fail_event = FailureEvent(
            workflow_id="w1",
            resource_id="gemini-flash",
            failure_type=FailureType.RATE_LIMITED,
            timestamp="10:02"
        )
        # Handle failure with fallback available
        res_rerouted = self.scheduler.handle_failure(fail_event, dimensions={"rpm": 5.0})
        self.assertIsNotNone(res_rerouted)
        self.assertIn(w1.status, [WorkflowStatus.RUNNING, WorkflowStatus.COMPLETED, WorkflowStatus.QUEUED])

if __name__ == "__main__":
    unittest.main()

