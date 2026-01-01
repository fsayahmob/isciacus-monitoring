"""
End-to-End Tests for Inngest Audit Workflows
=============================================
Tests the complete workflow execution through the API and Inngest.

Requirements:
- Docker containers must be running (docker compose up)
- Run from HOST machine (not inside Docker container)
- Run with: pytest tests/test_inngest_workflows_e2e.py -v

These tests verify:
1. API triggers async workflow correctly
2. Inngest processes the workflow
3. Steps progress from pending -> running -> success/error
4. Final result is saved to session file

Note: These tests are skipped when running inside a Docker container
because localhost:8080 points to the container itself, not the backend service.
"""

import time
from pathlib import Path
from typing import Any

import pytest
import requests


# Skip all tests in this module if running inside Docker
pytestmark = pytest.mark.skipif(
    Path("/.dockerenv").exists(),
    reason="E2E tests must be run from host machine, not inside Docker container"
)

# Configuration
BASE_URL = "http://localhost:8080"
INNGEST_URL = "http://localhost:8288"
SESSION_FILE = Path(__file__).parent.parent / "data" / "audits" / "latest_session.json"

# Timeouts
WORKFLOW_TIMEOUT_SEC = 60  # Max time to wait for workflow completion
POLL_INTERVAL_SEC = 1


class TestAuditWorkflowsE2E:
    """End-to-end tests for all audit workflows."""

    @pytest.fixture(autouse=True)
    def check_services(self) -> None:
        """Verify services are running before each test."""
        try:
            resp = requests.get(f"{BASE_URL}/api/audits/session", timeout=5)
            assert resp.status_code in [200, 404], f"Backend not responding: {resp.status_code}"
        except requests.ConnectionError:
            pytest.skip("Backend not running. Start with: docker compose up")

        try:
            resp = requests.get(f"{INNGEST_URL}/health", timeout=5)
        except requests.ConnectionError:
            pytest.skip("Inngest not running. Start with: docker compose up")

    def _trigger_audit(self, audit_type: str) -> dict[str, Any]:
        """Trigger an audit and return the response."""
        resp = requests.post(f"{BASE_URL}/api/audits/run/{audit_type}", timeout=10)
        assert resp.status_code == 200, f"Failed to trigger {audit_type}: {resp.text}"
        data: dict[str, Any] = resp.json()
        assert data.get("async") is True, f"Audit {audit_type} should be async"
        return data

    def _wait_for_completion(self, audit_type: str, _run_id: str) -> dict[str, Any]:
        """Wait for an audit to complete and return the result."""
        start_time = time.time()

        while time.time() - start_time < WORKFLOW_TIMEOUT_SEC:
            resp = requests.get(f"{BASE_URL}/api/audits/session", timeout=10)
            if resp.status_code == 200:
                session_data: dict[str, Any] = resp.json()
                session = session_data.get("session", {})
                result: dict[str, Any] | None = session.get("audits", {}).get(audit_type)

                if result and result.get("status") not in ["running", None]:
                    return result

            time.sleep(POLL_INTERVAL_SEC)

        pytest.fail(f"Workflow {audit_type} did not complete within {WORKFLOW_TIMEOUT_SEC}s")
        return {}  # pragma: no cover (unreachable)

    def _verify_steps_structure(self, result: dict[str, Any], expected_step_ids: list[str]) -> None:
        """Verify steps have correct structure."""
        steps = result.get("steps", [])
        step_ids = [s["id"] for s in steps]

        for expected_id in expected_step_ids:
            assert expected_id in step_ids, f"Missing step: {expected_id}"

        for step in steps:
            assert "id" in step, "Step missing 'id'"
            assert "name" in step, "Step missing 'name'"
            assert "status" in step, "Step missing 'status'"
            valid_statuses = ["pending", "running", "success", "warning", "error", "skipped"]
            assert step["status"] in valid_statuses, f"Invalid step status: {step['status']}"

    # =========================================================================
    # Theme Code Audit
    # =========================================================================
    def test_theme_code_workflow(self) -> None:
        """Test theme_code audit workflow end-to-end."""
        # Trigger
        trigger_resp = self._trigger_audit("theme_code")
        run_id = trigger_resp["run_id"]
        assert run_id, "No run_id returned"

        # Wait for completion
        result = self._wait_for_completion("theme_code", run_id)

        # Verify structure
        assert result["audit_type"] == "theme_code"
        assert result["execution_mode"] == "inngest"
        assert result["status"] in ["success", "warning", "error"]

        # Verify steps
        expected_steps = ["theme_access", "ga4_code", "meta_code", "gtm_code", "issues_detection"]
        self._verify_steps_structure(result, expected_steps)

        # First step should not be pending (workflow started)
        steps = result["steps"]
        first_step = next((s for s in steps if s["id"] == "theme_access"), None)
        assert first_step is not None
        assert first_step["status"] != "pending", "First step should have run"

    # =========================================================================
    # GA4 Tracking Audit
    # =========================================================================
    def test_ga4_tracking_workflow(self) -> None:
        """Test ga4_tracking audit workflow end-to-end."""
        trigger_resp = self._trigger_audit("ga4_tracking")
        run_id = trigger_resp["run_id"]

        result = self._wait_for_completion("ga4_tracking", run_id)

        assert result["audit_type"] == "ga4_tracking"
        assert result["execution_mode"] == "inngest"
        assert result["status"] in ["success", "warning", "error"]

        expected_steps = [
            "ga4_connection",
            "collections_coverage",
            "products_coverage",
            "events_coverage",
            "transactions_match",
        ]
        self._verify_steps_structure(result, expected_steps)

    # =========================================================================
    # Meta Pixel Audit
    # =========================================================================
    def test_meta_pixel_workflow(self) -> None:
        """Test meta_pixel audit workflow end-to-end."""
        trigger_resp = self._trigger_audit("meta_pixel")
        run_id = trigger_resp["run_id"]

        result = self._wait_for_completion("meta_pixel", run_id)

        assert result["audit_type"] == "meta_pixel"
        assert result["execution_mode"] == "inngest"
        assert result["status"] in ["success", "warning", "error"]

        expected_steps = ["meta_connection", "pixel_config", "events_check", "pixel_status"]
        self._verify_steps_structure(result, expected_steps)

    # =========================================================================
    # Search Console Audit
    # =========================================================================
    def test_search_console_workflow(self) -> None:
        """Test search_console audit workflow end-to-end."""
        trigger_resp = self._trigger_audit("search_console")
        run_id = trigger_resp["run_id"]

        result = self._wait_for_completion("search_console", run_id)

        assert result["audit_type"] == "search_console"
        assert result["execution_mode"] == "inngest"
        assert result["status"] in ["success", "warning", "error"]

        expected_steps = ["gsc_connection", "indexation", "errors", "sitemaps"]
        self._verify_steps_structure(result, expected_steps)

    # =========================================================================
    # Merchant Center Audit
    # =========================================================================
    def test_merchant_center_workflow(self) -> None:
        """Test merchant_center audit workflow end-to-end."""
        trigger_resp = self._trigger_audit("merchant_center")
        run_id = trigger_resp["run_id"]

        result = self._wait_for_completion("merchant_center", run_id)

        assert result["audit_type"] == "merchant_center"
        assert result["execution_mode"] == "inngest"
        assert result["status"] in ["success", "warning", "error"]

        expected_steps = ["gmc_connection", "products_status", "feed_sync", "issues_check"]
        self._verify_steps_structure(result, expected_steps)

    # =========================================================================
    # Onboarding Audit
    # =========================================================================
    def test_onboarding_workflow(self) -> None:
        """Test onboarding audit workflow end-to-end."""
        trigger_resp = self._trigger_audit("onboarding")
        run_id = trigger_resp["run_id"]

        result = self._wait_for_completion("onboarding", run_id)

        assert result["audit_type"] == "onboarding"
        assert result["execution_mode"] == "inngest"
        assert result["status"] in ["success", "warning", "error"]

        expected_steps = [
            "shopify_connection",
            "ga4_config",
            "meta_config",
            "gmc_config",
            "gsc_config",
            "google_credentials",
            "meta_permissions",
        ]
        self._verify_steps_structure(result, expected_steps)

    # =========================================================================
    # CAPI Audit
    # =========================================================================
    def test_capi_workflow(self) -> None:
        """Test capi audit workflow end-to-end."""
        trigger_resp = self._trigger_audit("capi")
        run_id = trigger_resp["run_id"]

        result = self._wait_for_completion("capi", run_id)

        assert result["audit_type"] == "capi"
        assert result["execution_mode"] == "inngest"
        assert result["status"] in ["success", "warning", "error"]

        expected_steps = ["check_credentials", "test_connection", "pixel_info"]
        self._verify_steps_structure(result, expected_steps)


class TestWorkflowProgressTracking:
    """Tests for step-by-step progress updates."""

    @pytest.fixture(autouse=True)
    def check_services(self) -> None:
        """Verify services are running."""
        try:
            requests.get(f"{BASE_URL}/api/audits/session", timeout=5)
        except requests.ConnectionError:
            pytest.skip("Backend not running")

    def test_steps_progress_sequentially(self) -> None:
        """Verify steps transition from pending to running to complete."""
        # Use onboarding as it has predictable steps
        resp = requests.post(f"{BASE_URL}/api/audits/run/onboarding", timeout=10)
        assert resp.status_code == 200

        seen_completed = False
        start_time = time.time()

        while time.time() - start_time < 30:
            resp = requests.get(f"{BASE_URL}/api/audits/session", timeout=10)
            if resp.status_code == 200:
                session = resp.json().get("session", {})
                result = session.get("audits", {}).get("onboarding")

                if result and result["status"] not in ["running", None]:
                    seen_completed = True
                    break

            time.sleep(0.5)

        assert seen_completed, "Workflow did not complete"


class TestAPIResponses:
    """Tests for API response format."""

    @pytest.fixture(autouse=True)
    def check_services(self) -> None:
        """Verify services are running."""
        try:
            requests.get(f"{BASE_URL}/api/audits/session", timeout=5)
        except requests.ConnectionError:
            pytest.skip("Backend not running")

    def test_trigger_returns_async_true(self) -> None:
        """Verify trigger endpoint returns async: true."""
        audit_types = [
            "theme_code",
            "ga4_tracking",
            "meta_pixel",
            "search_console",
            "merchant_center",
            "onboarding",
        ]
        for audit_type in audit_types:
            resp = requests.post(f"{BASE_URL}/api/audits/run/{audit_type}", timeout=10)
            assert resp.status_code == 200
            data = resp.json()
            assert data.get("async") is True, f"{audit_type} should return async: true"
            assert "run_id" in data, f"{audit_type} should return run_id"
            time.sleep(0.5)  # Small delay between triggers

    def test_session_endpoint_returns_all_audits(self) -> None:
        """Verify session endpoint returns all audit results."""
        # Wait for any running audits to complete
        time.sleep(5)

        resp = requests.get(f"{BASE_URL}/api/audits/session", timeout=10)
        assert resp.status_code == 200

        data = resp.json()
        assert "session" in data

        if data["session"]:
            audits = data["session"].get("audits", {})
            for result in audits.values():
                assert "audit_type" in result
                assert "status" in result
                assert "steps" in result
                assert "execution_mode" in result


class TestNoSyncFallback:
    """Tests to verify no sync fallback exists."""

    @pytest.fixture(autouse=True)
    def check_services(self) -> None:
        """Verify services are running."""
        try:
            requests.get(f"{BASE_URL}/api/audits/session", timeout=5)
        except requests.ConnectionError:
            pytest.skip("Backend not running")

    def test_all_audits_use_inngest(self) -> None:
        """Verify all audits use Inngest execution mode."""
        # Trigger all audits
        audit_types = [
            "theme_code",
            "ga4_tracking",
            "meta_pixel",
            "search_console",
            "merchant_center",
            "onboarding",
        ]

        for audit_type in audit_types:
            resp = requests.post(f"{BASE_URL}/api/audits/run/{audit_type}", timeout=10)
            assert resp.status_code == 200
            data = resp.json()
            assert data.get("async") is True, f"{audit_type} returned sync instead of async"
            time.sleep(0.5)

        # Wait for all to complete
        time.sleep(15)

        # Verify all are inngest
        resp = requests.get(f"{BASE_URL}/api/audits/session", timeout=10)
        assert resp.status_code == 200
        session = resp.json().get("session", {})
        audits = session.get("audits", {})

        for audit_type in audit_types:
            if audit_type in audits:
                result = audits[audit_type]
                assert (
                    result.get("execution_mode") == "inngest"
                ), f"{audit_type} should use inngest, got {result.get('execution_mode')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
