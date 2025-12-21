"""
Customer Data Readiness Audit Workflow.

Inngest workflow that analyzes customer data to determine Ads readiness:
1. Check customer count (1000+ for Meta Lookalikes)
2. Analyze data history (90+ days for patterns)
3. Validate data quality (emails, order values)
"""

import json
from pathlib import Path
from typing import Any

import inngest

from jobs.audit_workflow import inngest_client
from services.customer_data_analyzer import CustomerDataAnalyzer


def _init_result() -> dict[str, Any]:
    """Initialize empty audit result structure."""
    return {
        "audit_category": "metrics",
        "status": "running",
        "progress": 0,
        "steps": {
            "customer_count": {"status": "pending"},
            "data_history": {"status": "pending"},
            "data_quality": {"status": "pending"},
        },
        "ready_for_ads": False,
        "customer_count": {},
        "data_history": {},
        "data_quality": {},
        "recommendations": [],
        "error": None,
    }


def _save_progress(result: dict[str, Any]) -> None:
    """Save audit progress to session file."""
    storage_dir = Path(__file__).parent.parent.parent / "data" / "audits"
    storage_dir.mkdir(parents=True, exist_ok=True)
    latest_file = storage_dir / "latest_session.json"

    if latest_file.exists():
        with latest_file.open() as f:
            session = json.load(f)
    else:
        session = {
            "id": "customer_data_session",
            "created_at": result.get("started_at", ""),
            "updated_at": "",
            "audits": {},
        }

    session["audits"]["customer_data"] = result
    session["updated_at"] = result.get("completed_at") or result.get("started_at", "")

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)


def create_customer_data_audit_workflow() -> inngest.Function | None:
    """
    Create Customer Data Readiness Audit workflow.

    Returns:
        Inngest Function that can be served, or None if Inngest not enabled.
    """
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="customer-data-audit",
        trigger=inngest.TriggerEvent(event="audit/customer-data.trigger"),
        retries=1,
    )
    async def customer_data_audit_fn(ctx: inngest.Context) -> dict[str, Any]:
        """
        Customer Data Readiness Audit workflow.

        Analyzes customer data to determine if store is ready for Ads campaigns.

        Steps:
        1. Check customer count (minimum 1000 for Meta Lookalike Audiences)
        2. Analyze data history (minimum 90 days for seasonal patterns)
        3. Validate data quality (email presence, order values)

        Returns:
            Audit result with readiness status and recommendations
        """
        result = _init_result()
        _save_progress(result)

        analyzer = CustomerDataAnalyzer()

        # Step 1: Check customer count
        count_result = await ctx.step.run(
            "check-customer-count",
            lambda: _check_customer_count(analyzer, result),
        )
        result = count_result
        _save_progress(result)

        # Step 2: Analyze data history
        history_result = await ctx.step.run(
            "analyze-data-history",
            lambda: _analyze_data_history(analyzer, result),
        )
        result = history_result
        _save_progress(result)

        # Step 3: Validate data quality
        quality_result = await ctx.step.run(
            "validate-data-quality",
            lambda: _validate_data_quality(analyzer, result),
        )
        result = quality_result
        _save_progress(result)

        # Mark as completed
        result["status"] = "completed"
        result["progress"] = 100
        _save_progress(result)

        return result

    return customer_data_audit_fn


# Create the function if enabled
customer_data_audit_function = create_customer_data_audit_workflow()


def _check_customer_count(analyzer: CustomerDataAnalyzer, result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 1: Check customer count.

    Args:
        analyzer: CustomerDataAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    result["steps"]["customer_count"]["status"] = "running"
    _save_progress(result)

    if not analyzer.is_configured():
        result["steps"]["customer_count"] = {
            "status": "error",
            "message": "Shopify credentials not configured",
        }
        result["error"] = "Shopify credentials not configured"
        result["status"] = "error"
        return result

    count_data = analyzer.get_customer_count()

    if "error" in count_data:
        result["steps"]["customer_count"] = {
            "status": "error",
            "message": count_data["error"],
        }
        result["error"] = count_data["error"]
        result["status"] = "error"
        return result

    result["customer_count"] = count_data
    result["steps"]["customer_count"] = {
        "status": "success",
        "message": count_data.get("message", ""),
    }
    result["progress"] = 33

    return result


def _analyze_data_history(analyzer: CustomerDataAnalyzer, result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 2: Analyze data history length.

    Args:
        analyzer: CustomerDataAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    result["steps"]["data_history"]["status"] = "running"
    _save_progress(result)

    history_data = analyzer.get_data_history()

    if "error" in history_data:
        result["steps"]["data_history"] = {
            "status": "error",
            "message": history_data["error"],
        }
        result["error"] = history_data["error"]
        result["status"] = "error"
        return result

    result["data_history"] = history_data
    result["steps"]["data_history"] = {
        "status": "success",
        "message": history_data.get("message", ""),
    }
    result["progress"] = 66

    return result


def _validate_data_quality(
    analyzer: CustomerDataAnalyzer, result: dict[str, Any]
) -> dict[str, Any]:
    """
    Step 3: Validate data quality.

    Args:
        analyzer: CustomerDataAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    result["steps"]["data_quality"]["status"] = "running"
    _save_progress(result)

    quality_data = analyzer.check_data_quality()

    if "error" in quality_data:
        result["steps"]["data_quality"] = {
            "status": "error",
            "message": quality_data["error"],
        }
        result["error"] = quality_data["error"]
        result["status"] = "error"
        return result

    result["data_quality"] = quality_data
    result["steps"]["data_quality"] = {
        "status": "success",
        "message": quality_data.get("message", ""),
    }

    # Determine overall readiness
    ready = (
        result["customer_count"].get("sufficient", False)
        and result["data_history"].get("sufficient", False)
        and result["data_quality"].get("sufficient", False)
    )

    result["ready_for_ads"] = ready

    # Generate recommendations
    result["recommendations"] = analyzer.generate_recommendations(
        result["customer_count"],
        result["data_history"],
        result["data_quality"],
    )

    result["progress"] = 100

    return result
