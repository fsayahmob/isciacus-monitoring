"""
Customer Data Readiness Audit Workflow.

Inngest workflow that analyzes customer data to determine Ads readiness:
1. Check customer count (1000+ for Meta Lookalikes)
2. Analyze data history (90+ days for patterns)
3. Validate data quality (emails, order values)
"""

from typing import Any

import inngest

from jobs.audit_workflow import inngest_client
from jobs.pocketbase_progress import save_audit_progress
from services.customer_data_analyzer import CustomerDataAnalyzer


AUDIT_TYPE = "customer_data"

STEPS = [
    {
        "id": "customer_count",
        "name": "Nombre de clients",
        "description": "Vérification du nombre minimum (1000+)",
    },
    {
        "id": "data_history",
        "name": "Historique données",
        "description": "Analyse de la profondeur historique (90+ jours)",
    },
    {
        "id": "data_quality",
        "name": "Qualité des données",
        "description": "Vérification emails et valeurs commandes",
    },
]


def _init_result() -> dict[str, Any]:
    """Initialize empty audit result structure."""
    from datetime import UTC, datetime

    now = datetime.now(tz=UTC).isoformat()
    return {
        "id": "customer_data_audit",
        "audit_type": "customer_data",
        "audit_category": "metrics",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": now,
        "completed_at": None,
        "progress": 0,
        "steps": [
            {
                "id": step["id"],
                "name": step["name"],
                "description": step["description"],
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "duration_ms": None,
                "result": None,
                "error_message": None,
            }
            for step in STEPS
        ],
        "ready_for_ads": False,
        "customer_count": {},
        "data_history": {},
        "data_quality": {},
        "recommendations": [],
        "issues": [],
        "summary": {},
        "error": None,
    }




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
        session_id = ctx.event.data.get("session_id", "customer_data_session")
        pb_record_id = ctx.event.data.get("pocketbase_record_id")

        result = _init_result()
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        analyzer = CustomerDataAnalyzer()

        # Step 1: Check customer count
        count_result = await ctx.step.run(
            "check-customer-count",
            lambda: _check_customer_count(analyzer, result),
        )
        result = count_result
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Step 2: Analyze data history
        history_result = await ctx.step.run(
            "analyze-data-history",
            lambda: _analyze_data_history(analyzer, result),
        )
        result = history_result
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Step 3: Validate data quality
        quality_result = await ctx.step.run(
            "validate-data-quality",
            lambda: _validate_data_quality(analyzer, result),
        )
        result = quality_result
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Mark as completed
        from datetime import UTC, datetime

        result["status"] = "success"
        result["progress"] = 100
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        return result

    return customer_data_audit_fn


# Create the function if enabled
customer_data_audit_function = create_customer_data_audit_workflow()


def _find_step(result: dict[str, Any], step_id: str) -> dict[str, Any] | None:
    """Find a step by ID in the steps list."""
    for step in result["steps"]:
        if step["id"] == step_id:
            return step
    return None


def _update_step(
    result: dict[str, Any],
    step_id: str,
    status: str,
    error_message: str | None = None,
    step_result: dict[str, Any] | None = None,
) -> None:
    """Update a step's status and optionally its result."""
    from datetime import UTC, datetime

    step = _find_step(result, step_id)
    if step:
        now = datetime.now(tz=UTC).isoformat()
        if status == "running" and step["started_at"] is None:
            step["started_at"] = now
        step["status"] = status
        if status in ("success", "error", "warning"):
            step["completed_at"] = now
            if step["started_at"]:
                from datetime import datetime as dt

                started = dt.fromisoformat(step["started_at"])
                completed = dt.fromisoformat(now)
                step["duration_ms"] = int((completed - started).total_seconds() * 1000)
        if error_message:
            step["error_message"] = error_message
        if step_result:
            step["result"] = step_result


def _check_customer_count(analyzer: CustomerDataAnalyzer, result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 1: Check customer count.

    Args:
        analyzer: CustomerDataAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    _update_step(result, "customer_count", "running")

    if not analyzer.is_configured():
        _update_step(
            result,
            "customer_count",
            "error",
            error_message="Shopify credentials not configured",
        )
        result["error"] = "Shopify credentials not configured"
        result["status"] = "error"
        return result

    count_data = analyzer.get_customer_count()

    if "error" in count_data:
        _update_step(
            result,
            "customer_count",
            "error",
            error_message=count_data["error"],
        )
        result["error"] = count_data["error"]
        result["status"] = "error"
        return result

    result["customer_count"] = count_data
    _update_step(
        result,
        "customer_count",
        "success",
        step_result={"message": count_data.get("message", "")},
    )
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
    _update_step(result, "data_history", "running")

    history_data = analyzer.get_data_history()

    if "error" in history_data:
        _update_step(
            result,
            "data_history",
            "error",
            error_message=history_data["error"],
        )
        result["error"] = history_data["error"]
        result["status"] = "error"
        return result

    result["data_history"] = history_data
    _update_step(
        result,
        "data_history",
        "success",
        step_result={"message": history_data.get("message", "")},
    )
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
    _update_step(result, "data_quality", "running")

    quality_data = analyzer.check_data_quality()

    if "error" in quality_data:
        _update_step(
            result,
            "data_quality",
            "error",
            error_message=quality_data["error"],
        )
        result["error"] = quality_data["error"]
        result["status"] = "error"
        return result

    result["data_quality"] = quality_data
    _update_step(
        result,
        "data_quality",
        "success",
        step_result={"message": quality_data.get("message", "")},
    )

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
