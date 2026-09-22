import unittest
from models import Resource, Workflow, WorkflowStatus, FailureType, ResourceHealthState, ReservationStatus
from resource_manager import ResourceManager
from service_graph import ServiceGraph
from scheduler import Scheduler
from config import DEFAULT_MODEL_QUOTAS, ModelQuotaConfig
from gemini_adapter import SimulatedGeminiAdapter, QuotaTracker, ExecutionResult

class TestGeminiAdapter(unittest.TestCase):

    def setUp(self):
        self.rm = ResourceManager()
        self.flash = Resource(id="gemini-2.5-flash", name="Gemini 2.5 Flash", type="llm", capacity={"rpm": 5.0})
        self.flash_lite = Resource(id="gemini-2.5-flash-lite", name="Gemini 2.5 Flash Lite", type="llm", capacity={"rpm": 10.0})
        self.rm.add_resource(self.flash)
        self.rm.add_resource(self.flash_lite)

        self.sg = ServiceGraph()
        self.sg.add_resource("gemini-2.5-flash")
        self.sg.add_resource("gemini-2.5-flash-lite")
        self.sg.add_alternative("gemini-2.5-flash", "gemini-2.5-flash-lite")

        self.scheduler = Scheduler(resource_manager=self.rm, service_graph=self.sg)
        self.quota_tracker = QuotaTracker()
        self.adapter = SimulatedGeminiAdapter(quota_tracker=self.quota_tracker)

    def test_flash_quota_configuration(self):
        """Test 1: Verify Gemini 2.5 Flash quota configuration."""
        config = DEFAULT_MODEL_QUOTAS.get("gemini-2.5-flash")
        self.assertIsNotNone(config)
        self.assertEqual(config.rpm_limit, 5)
        self.assertEqual(config.tpm_limit, 250000)
        self.assertEqual(config.rpd_limit, 20)

    def test_flash_lite_quota_configuration(self):
        """Test 2: Verify Gemini 2.5 Flash Lite quota configuration."""
        config = DEFAULT_MODEL_QUOTAS.get("gemini-2.5-flash-lite")
        self.assertIsNotNone(config)
        self.assertEqual(config.rpm_limit, 10)
        self.assertEqual(config.tpm_limit, 250000)
        self.assertEqual(config.rpd_limit, 20)

    def test_successful_execution(self):
        """Test 3: Verify successful execution output and token reporting."""
        result = self.adapter.execute("W1", "gemini-2.5-flash", estimated_tokens=1500)
        self.assertTrue(result.success)
        self.assertEqual(result.tokens_used, 1500)
        self.assertIsNone(result.failure_event)

    def test_rpm_limit_returns_rate_limited(self):
        """Test 4: Exceeding RPM limit returns FailureType.RATE_LIMITED."""
        custom_tracker = QuotaTracker({
            "gemini-2.5-flash": ModelQuotaConfig(rpm_limit=2, tpm_limit=250000, rpd_limit=20)
        })
        adapter = SimulatedGeminiAdapter(quota_tracker=custom_tracker)

        # 2 allowed requests
        r1 = adapter.execute("W1", "gemini-2.5-flash", current_time_num=10.0)
        r2 = adapter.execute("W2", "gemini-2.5-flash", current_time_num=10.0)
        self.assertTrue(r1.success)
        self.assertTrue(r2.success)

        # 3rd request -> RATE_LIMITED
        r3 = adapter.execute("W3", "gemini-2.5-flash", current_time_num=10.0)
        self.assertFalse(r3.success)
        self.assertIsNotNone(r3.failure_event)
        self.assertEqual(r3.failure_event.failure_type, FailureType.RATE_LIMITED)

    def test_tpm_limit_returns_rate_limited(self):
        """Test 5: Exceeding TPM limit returns FailureType.RATE_LIMITED."""
        custom_tracker = QuotaTracker({
            "gemini-2.5-flash": ModelQuotaConfig(rpm_limit=10, tpm_limit=5000, rpd_limit=20)
        })
        adapter = SimulatedGeminiAdapter(quota_tracker=custom_tracker)

        adapter.execute("W1", "gemini-2.5-flash", estimated_tokens=4000, current_time_num=10.0)
        res = adapter.execute("W2", "gemini-2.5-flash", estimated_tokens=2000, current_time_num=10.0)

        self.assertFalse(res.success)
        self.assertEqual(res.failure_event.failure_type, FailureType.RATE_LIMITED)

    def test_rpd_limit_returns_quota_exhausted(self):
        """Test 6: Exceeding RPD daily limit returns FailureType.QUOTA_EXHAUSTED."""
        custom_tracker = QuotaTracker({
            "gemini-2.5-flash": ModelQuotaConfig(rpm_limit=100, tpm_limit=250000, rpd_limit=2)
        })
        adapter = SimulatedGeminiAdapter(quota_tracker=custom_tracker)

        adapter.execute("W1", "gemini-2.5-flash", current_time_num=10.0)
        adapter.execute("W2", "gemini-2.5-flash", current_time_num=20.0) # different minute, same day

        res = adapter.execute("W3", "gemini-2.5-flash", current_time_num=30.0)
        self.assertFalse(res.success)
        self.assertEqual(res.failure_event.failure_type, FailureType.QUOTA_EXHAUSTED)

    def test_minute_window_resets(self):
        """Test 7: Advancing minute resets minute RPM window."""
        custom_tracker = QuotaTracker({
            "gemini-2.5-flash": ModelQuotaConfig(rpm_limit=1, tpm_limit=250000, rpd_limit=20)
        })
        adapter = SimulatedGeminiAdapter(quota_tracker=custom_tracker)

        # 1st request at t=10.0 succeeds
        r1 = adapter.execute("W1", "gemini-2.5-flash", current_time_num=10.0)
        self.assertTrue(r1.success)

        # 2nd request at t=10.5 fails (same minute 10)
        r2 = adapter.execute("W2", "gemini-2.5-flash", current_time_num=10.5)
        self.assertFalse(r2.success)

        # 3rd request at t=11.0 succeeds (new minute 11)
        r3 = adapter.execute("W3", "gemini-2.5-flash", current_time_num=11.0)
        self.assertTrue(r3.success)

    def test_simulated_failure_rate_limited(self):
        """Test 8: Forced RATE_LIMITED failure returns FailureEvent."""
        self.adapter.force_failure("gemini-2.5-flash", FailureType.RATE_LIMITED)
        res = self.adapter.execute("W1", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.failure_event.failure_type, FailureType.RATE_LIMITED)

    def test_simulated_failure_timeout(self):
        """Test 9: Forced TIMEOUT failure returns FailureEvent."""
        self.adapter.force_failure("gemini-2.5-flash", FailureType.TIMEOUT)
        res = self.adapter.execute("W1", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.failure_event.failure_type, FailureType.TIMEOUT)

    def test_simulated_failure_service_unavailable(self):
        """Test 10: Forced SERVICE_UNAVAILABLE failure returns FailureEvent."""
        self.adapter.force_failure("gemini-2.5-flash", FailureType.SERVICE_UNAVAILABLE)
        res = self.adapter.execute("W1", "gemini-2.5-flash")
        self.assertFalse(res.success)
        self.assertEqual(res.failure_event.failure_type, FailureType.SERVICE_UNAVAILABLE)

    def test_failure_integrates_with_scheduler_fallback(self):
        """Test 11: Adapter failure event integrates with Scheduler.handle_failure and triggers fallback."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        res1 = self.scheduler.request_resource(w1, "gemini-2.5-flash", {"rpm": 2.0}, allow_fallback=True)

        self.adapter.force_failure("gemini-2.5-flash", FailureType.RATE_LIMITED)
        exec_res = self.adapter.execute("w1", "gemini-2.5-flash", timestamp="10:02")

        self.assertFalse(exec_res.success)
        rerouted = self.scheduler.handle_failure(exec_res.failure_event, dimensions={"rpm": 2.0})

        self.assertIsNotNone(rerouted)
        self.assertEqual(rerouted.resource_id, "gemini-2.5-flash-lite")
        self.assertEqual(w1.status, WorkflowStatus.RUNNING)

    def test_success_consumes_resource_correctly(self):
        """Test 12: Successful execution consumes reservation in ResourceManager."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        res1 = self.scheduler.request_resource(w1, "gemini-2.5-flash", {"rpm": 2.0})

        exec_res = self.adapter.execute(
            "w1", "gemini-2.5-flash", reservation_id=res1.id, resource_manager=self.rm
        )
        self.assertTrue(exec_res.success)
        self.assertEqual(res1.status, ReservationStatus.CONSUMED)

    def test_no_overallocation_after_execution(self):
        """Test 13: Verify usage + reserved + soft_reserved <= capacity after execution."""
        w1 = Workflow(id="w1", name="W1", priority=5.0)
        res1 = self.scheduler.request_resource(w1, "gemini-2.5-flash", {"rpm": 3.0})

        self.adapter.execute("w1", "gemini-2.5-flash", reservation_id=res1.id, resource_manager=self.rm)

        res_obj = self.rm.get_resource("gemini-2.5-flash")
        used = res_obj.usage.get("rpm", 0.0)
        reserved = res_obj.reserved.get("rpm", 0.0)
        soft = res_obj.soft_reserved.get("rpm", 0.0)
        cap = res_obj.capacity.get("rpm", 0.0)

        self.assertLessEqual(used + reserved + soft, cap)

if __name__ == "__main__":
    unittest.main()
