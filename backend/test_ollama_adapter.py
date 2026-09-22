import sys
import os
import unittest
from unittest.mock import patch, MagicMock

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    from .models import Resource, Workflow, FailureEvent, FailureType, ResourceHealthState
    from .ollama_adapter import OllamaAdapter
    from .server import app, controller
except ImportError:
    from models import Resource, Workflow, FailureEvent, FailureType, ResourceHealthState
    from ollama_adapter import OllamaAdapter
    from server import app, controller


class TestOllamaAdapter(unittest.TestCase):

    def setUp(self):
        controller.reset_state()
        self.adapter = OllamaAdapter()

    @patch("urllib.request.urlopen")
    def test_ollama_health_success(self, mock_urlopen):
        """Test 1: Ollama health check succeeds when LAN endpoint returns 200 OK."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_urlopen.return_value.__enter__.return_value = mock_response

        state = self.adapter.health("ollama-local")
        self.assertEqual(state, ResourceHealthState.AVAILABLE)

    @patch("urllib.request.urlopen")
    def test_ollama_health_failure(self, mock_urlopen):
        """Test 2: Ollama health check returns UNAVAILABLE cleanly when LAN endpoint is unreachable."""
        mock_urlopen.side_effect = Exception("Connection refused / LAN timeout")

        state = self.adapter.health("ollama-local")
        self.assertEqual(state, ResourceHealthState.UNAVAILABLE)

    @patch("urllib.request.urlopen")
    def test_ollama_execute_success(self, mock_urlopen):
        """Test 3: Ollama execute sends prompt payload and returns model output."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b'{"response": "Local Ollama LLM inference completion", "eval_count": 128}'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = self.adapter.execute(workflow_id="W1", input_data="Summarize text")
        self.assertTrue(res.success)
        self.assertIn("Local Ollama LLM inference completion", res.output)
        self.assertEqual(res.resource_id, "ollama-local")

    def test_gemini_to_ollama_fallback_flow(self):
        """Test 4: Gemini failure triggers ServiceGraph fallback to Ollama Local LAN instance."""
        # 1. Verify ollama-local is registered in ServiceGraph alternatives for gemini-2.5-flash
        alts = controller.sg.get_alternatives("gemini-2.5-flash")
        self.assertIn("ollama-local", alts)

        # 2. Force failure on gemini-2.5-flash
        controller.adapter.force_failure("gemini-2.5-flash", FailureType.SERVICE_UNAVAILABLE)
        exec_res = controller.adapter.execute("W1", "gemini-2.5-flash")
        self.assertFalse(exec_res.success)

        # 3. Handle failure in scheduler
        res = controller.scheduler.handle_failure(exec_res.failure_event)
        self.assertIsNotNone(res)
        self.assertEqual(res.resource_id, "ollama-local")

        # 4. Verify Gemini health state became CONSTRAINED / UNAVAILABLE
        flash_res = controller.rm.get_resource("gemini-2.5-flash")
        self.assertEqual(flash_res.state.value, "CONSTRAINED")

    def test_gemini_recovery(self):
        """Test 5: Gemini restores to AVAILABLE state on recovery."""
        controller.rm.mark_constrained("gemini-2.5-flash")
        flash_res = controller.rm.get_resource("gemini-2.5-flash")
        self.assertEqual(flash_res.state.value, "CONSTRAINED")

        controller.rm.mark_available("gemini-2.5-flash")
        self.assertEqual(flash_res.state.value, "AVAILABLE")

    @patch("urllib.request.urlopen")
    def test_live_simulation_executes_ollama_adapter(self, mock_urlopen):
        """Test 6: Live simulation step 3 and 4 call the real Ollama execution path via HTTP POST."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b'{"response": "LAN Ollama response for W1", "eval_count": 500}'
        mock_urlopen.return_value.__enter__.return_value = mock_response

        # Step 1: W3 submit
        controller.step_live_simulation()
        # Step 2: W1 request gemini
        controller.step_live_simulation()

        # Step 3: Gemini failure -> fallback reservation -> real OllamaAdapter.execute() call
        step3_res = controller.step_live_simulation()
        self.assertEqual(step3_res["step"], 3)
        self.assertTrue(mock_urlopen.called)
        
        # Verify event logs contain actual OLLAMA_EXECUTION event
        event_texts = [e["raw"] for e in controller.event_history]
        ollama_exec_events = [e for e in event_texts if "OLLAMA_EXECUTION:" in e]
        self.assertTrue(len(ollama_exec_events) > 0)
        self.assertIn("W1", ollama_exec_events[0])

        # Reset mock call count and test Step 4 (W2 execution on Ollama)
        mock_urlopen.reset_mock()
        step4_res = controller.step_live_simulation()
        self.assertEqual(step4_res["step"], 4)
        self.assertTrue(mock_urlopen.called)

        event_texts_step4 = [e["raw"] for e in controller.event_history]
        step4_ollama_events = [e for e in event_texts_step4 if "OLLAMA_EXECUTION:" in e and "W2" in e]
        self.assertTrue(len(step4_ollama_events) > 0)

    def test_env_file_loading_config(self):
        """Test 7: Verify config.py loads OLLAMA_BASE_URL from backend/.env regardless of CWD."""
        try:
            from .config import OLLAMA_BASE_URL, OLLAMA_MODEL
        except ImportError:
            from config import OLLAMA_BASE_URL, OLLAMA_MODEL

        self.assertTrue(OLLAMA_BASE_URL.startswith("http"))
        self.assertIn("10.77.76.101", OLLAMA_BASE_URL)
        self.assertEqual(OLLAMA_MODEL, "llama3.2")


if __name__ == "__main__":
    unittest.main()
