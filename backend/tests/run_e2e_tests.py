#!/usr/bin/env python3
"""
Quick E2E Test Runner for Inngest Workflows
============================================
Run this script to test all workflows without pytest.

Usage:
    python tests/run_e2e_tests.py

Requirements:
    - Docker containers must be running: docker compose up
"""

import sys
import time
from typing import Any

import requests


BASE_URL = "http://localhost:8080"
TIMEOUT_SEC = 120  # Increased for slow workflows like ga4_tracking
POLL_INTERVAL_SEC = 1
TRIGGER_TIMEOUT_SEC = 30  # Timeout for trigger requests

# ANSI colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"
BOLD = "\033[1m"


def check_services() -> bool:
    """Check if required services are running."""

    try:
        requests.get(f"{BASE_URL}/api/audits/session", timeout=5)
    except requests.ConnectionError:
        return False

    try:
        requests.get("http://localhost:8288/health", timeout=5)
    except requests.ConnectionError:
        return False

    return True


def trigger_audit(audit_type: str) -> tuple[bool, str]:
    """Trigger an audit and return (success, run_id)."""
    try:
        resp = requests.post(f"{BASE_URL}/api/audits/run/{audit_type}", timeout=TRIGGER_TIMEOUT_SEC)
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"

        data = resp.json()
        if not data.get("async"):
            return False, "Not async"

        return True, data.get("run_id", "unknown")
    except Exception as e:
        return False, str(e)


def wait_for_completion(audit_type: str) -> tuple[str, dict[str, Any]]:
    """Wait for audit to complete. Returns (status, result)."""
    start_time = time.time()

    while time.time() - start_time < TIMEOUT_SEC:
        try:
            resp = requests.get(f"{BASE_URL}/api/audits/session", timeout=10)
            if resp.status_code == 200:
                session = resp.json().get("session", {})
                result = session.get("audits", {}).get(audit_type)

                if result and result.get("status") not in ["running", None]:
                    return result["status"], result
        except Exception as e:
            # Ignore transient errors during polling (connection issues, timeouts, etc.)
            # Logging would be too verbose for expected polling behavior
            _ = e  # Acknowledge the exception
            continue

        time.sleep(POLL_INTERVAL_SEC)

    return "timeout", {}


def verify_result(result: dict[str, Any], expected_steps: list[str]) -> list[str]:
    """Verify result structure. Returns list of issues."""
    issues = []

    if result.get("execution_mode") != "inngest":
        issues.append(f"execution_mode is '{result.get('execution_mode')}', expected 'inngest'")

    steps = result.get("steps", [])
    step_ids = [s["id"] for s in steps]

    issues.extend(
        [f"Missing step: {expected}" for expected in expected_steps if expected not in step_ids]
    )

    issues.extend(
        [
            f"Invalid step status: {step['id']} = {step['status']}"
            for step in steps
            if step["status"]
            not in ["pending", "running", "success", "warning", "error", "skipped"]
        ]
    )

    return issues


def test_workflow(audit_type: str, expected_steps: list[str]) -> bool:
    """Test a single workflow. Returns True if passed."""

    # Trigger
    success, _run_id = trigger_audit(audit_type)
    if not success:
        return False

    # Wait for completion
    status, result = wait_for_completion(audit_type)

    if status == "timeout":
        return False

    # Verify async mode
    exec_mode = result.get("execution_mode", "unknown")
    if exec_mode != "inngest":
        return False

    # Verify steps
    issues = verify_result(result, expected_steps)
    return not issues


def main() -> None:
    """Run all E2E tests."""

    if not check_services():
        sys.exit(1)

    # Define all workflows and their expected steps
    workflows = {
        "onboarding": [
            "shopify_connection",
            "ga4_config",
            "meta_config",
            "gmc_config",
            "gsc_config",
        ],
        "theme_code": [
            "theme_access",
            "ga4_code",
            "meta_code",
            "gtm_code",
            "issues_detection",
        ],
        "ga4_tracking": [
            "ga4_connection",
            "collections_coverage",
            "products_coverage",
            "events_coverage",
            "transactions_match",
        ],
        "meta_pixel": [
            "meta_connection",
            "pixel_config",
            "events_check",
            "pixel_status",
        ],
        "search_console": [
            "gsc_connection",
            "indexation",
            "errors",
            "sitemaps",
        ],
        "merchant_center": [
            "gmc_connection",
            "products_status",
            "feed_sync",
            "issues_check",
        ],
    }

    results = {}

    for audit_type, expected_steps in workflows.items():
        results[audit_type] = test_workflow(audit_type, expected_steps)
        time.sleep(1)  # Small delay between tests

    # Summary
    passed = sum(1 for v in results.values() if v)
    total = len(results)

    if passed == total:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
