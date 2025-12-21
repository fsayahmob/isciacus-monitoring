"""
Cart Recovery Analysis Audit Workflow.

Inngest workflow that analyzes abandoned carts for Ads retargeting:
1. Check cart abandonment tracking availability
2. Analyze abandonment volume (minimum 50/month)
3. Check email capture rate in checkout
4. Calculate recovery revenue potential
"""

import json
from pathlib import Path
from typing import Any

import inngest

from jobs.audit_workflow import inngest_client
from services.cart_recovery_analyzer import CartRecoveryAnalyzer


STEPS = [
    {
        "id": "cart_tracking",
        "name": "Tracking paniers",
        "description": "Vérification du suivi des abandons",
    },
    {
        "id": "abandonment_volume",
        "name": "Volume abandons",
        "description": "Analyse du volume (50+/mois minimum)",
    },
    {
        "id": "email_capture",
        "name": "Capture emails",
        "description": "Taux de capture email (60%+ requis)",
    },
    {
        "id": "recovery_potential",
        "name": "Potentiel récupération",
        "description": "Estimation du revenu récupérable",
    },
]


def _init_result() -> dict[str, Any]:
    """Initialize empty audit result structure."""
    from datetime import UTC, datetime

    now = datetime.now(tz=UTC).isoformat()
    return {
        "id": "cart_recovery_audit",
        "audit_type": "cart_recovery",
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
        "ready_for_retargeting": False,
        "cart_tracking": {},
        "abandonment_volume": {},
        "email_capture": {},
        "recovery_potential": {},
        "recommendations": [],
        "issues": [],
        "summary": {},
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
            "id": "cart_recovery_session",
            "created_at": result.get("started_at", ""),
            "updated_at": "",
            "audits": {},
        }

    session["audits"]["cart_recovery"] = result
    session["updated_at"] = result.get("completed_at") or result.get("started_at", "")

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)


def create_cart_recovery_audit_workflow() -> inngest.Function | None:
    """
    Create Cart Recovery Analysis Audit workflow.

    Returns:
        Inngest Function that can be served, or None if Inngest not enabled.
    """
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="cart-recovery-audit",
        trigger=inngest.TriggerEvent(event="audit/cart-recovery.trigger"),
        retries=1,
    )
    async def cart_recovery_audit_fn(ctx: inngest.Context) -> dict[str, Any]:
        """
        Cart Recovery Analysis Audit workflow.

        Analyzes abandoned carts to determine retargeting readiness.

        Steps:
        1. Check cart tracking availability
        2. Analyze abandonment volume (minimum 50/month for retargeting)
        3. Check email capture rate (minimum 60% for audiences)
        4. Calculate recovery revenue potential

        Returns:
            Audit result with retargeting readiness and recommendations
        """
        result = _init_result()
        _save_progress(result)

        analyzer = CartRecoveryAnalyzer()

        # Step 1: Check cart tracking
        tracking_result = await ctx.step.run(
            "check-cart-tracking",
            lambda: _check_cart_tracking(analyzer, result),
        )
        result = tracking_result
        _save_progress(result)

        # If tracking not enabled, skip remaining steps
        if not result["cart_tracking"].get("enabled"):
            result["status"] = "completed"
            result["progress"] = 100
            _save_progress(result)
            return result

        # Step 2: Analyze abandonment volume
        volume_result = await ctx.step.run(
            "analyze-abandonment-volume",
            lambda: _analyze_abandonment_volume(analyzer, result),
        )
        result = volume_result
        _save_progress(result)

        # Step 3: Check email capture
        email_result = await ctx.step.run(
            "check-email-capture",
            lambda: _check_email_capture(analyzer, result),
        )
        result = email_result
        _save_progress(result)

        # Step 4: Calculate recovery potential
        potential_result = await ctx.step.run(
            "calculate-recovery-potential",
            lambda: _calculate_recovery_potential(analyzer, result),
        )
        result = potential_result
        _save_progress(result)

        # Mark as completed
        result["status"] = "completed"
        result["progress"] = 100
        _save_progress(result)

        return result

    return cart_recovery_audit_fn


# Create the function if enabled
cart_recovery_audit_function = create_cart_recovery_audit_workflow()


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


def _check_cart_tracking(analyzer: CartRecoveryAnalyzer, result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 1: Check cart abandonment tracking.

    Args:
        analyzer: CartRecoveryAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    _update_step(result, "cart_tracking", "running")
    _save_progress(result)

    if not analyzer.is_configured():
        _update_step(
            result,
            "cart_tracking",
            "error",
            error_message="Shopify credentials not configured",
        )
        result["error"] = "Shopify credentials not configured"
        result["status"] = "error"
        return result

    tracking_data = analyzer.check_cart_tracking()

    if "error" in tracking_data:
        _update_step(
            result,
            "cart_tracking",
            "warning",
            error_message=tracking_data["error"],
        )
        result["cart_tracking"] = tracking_data
        # Don't mark as error - this is expected for basic Shopify plans
        result["progress"] = 25
        return result

    result["cart_tracking"] = tracking_data
    _update_step(
        result,
        "cart_tracking",
        "success",
        step_result={"message": tracking_data.get("message", "")},
    )
    result["progress"] = 25

    return result


def _analyze_abandonment_volume(
    analyzer: CartRecoveryAnalyzer, result: dict[str, Any]
) -> dict[str, Any]:
    """
    Step 2: Analyze abandonment volume.

    Args:
        analyzer: CartRecoveryAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    _update_step(result, "abandonment_volume", "running")
    _save_progress(result)

    volume_data = analyzer.get_abandonment_volume()

    if "error" in volume_data:
        _update_step(
            result,
            "abandonment_volume",
            "warning",
            error_message=volume_data["error"],
        )
        result["abandonment_volume"] = volume_data
        result["progress"] = 50
        return result

    result["abandonment_volume"] = volume_data
    _update_step(
        result,
        "abandonment_volume",
        "success",
        step_result={"message": volume_data.get("message", "")},
    )
    result["progress"] = 50

    return result


def _check_email_capture(analyzer: CartRecoveryAnalyzer, result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 3: Check email capture rate.

    Args:
        analyzer: CartRecoveryAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    _update_step(result, "email_capture", "running")
    _save_progress(result)

    email_data = analyzer.check_email_capture()

    if "error" in email_data:
        _update_step(
            result,
            "email_capture",
            "warning",
            error_message=email_data["error"],
        )
        result["email_capture"] = email_data
        result["progress"] = 75
        return result

    result["email_capture"] = email_data
    _update_step(
        result,
        "email_capture",
        "success",
        step_result={"message": email_data.get("message", "")},
    )
    result["progress"] = 75

    return result


def _calculate_recovery_potential(
    analyzer: CartRecoveryAnalyzer, result: dict[str, Any]
) -> dict[str, Any]:
    """
    Step 4: Calculate recovery potential.

    Args:
        analyzer: CartRecoveryAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    _update_step(result, "recovery_potential", "running")
    _save_progress(result)

    potential_data = analyzer.calculate_recovery_potential()

    if "error" in potential_data:
        _update_step(
            result,
            "recovery_potential",
            "warning",
            error_message=potential_data["error"],
        )
        result["recovery_potential"] = potential_data
        result["progress"] = 100
        return result

    result["recovery_potential"] = potential_data
    _update_step(
        result,
        "recovery_potential",
        "success",
        step_result={"message": potential_data.get("message", "")},
    )

    # Determine overall readiness
    ready = result["cart_tracking"].get("enabled", False) and (
        result["abandonment_volume"].get("sufficient", False)
        or result["email_capture"].get("sufficient", False)
    )

    result["ready_for_retargeting"] = ready

    # Generate recommendations
    result["recommendations"] = analyzer.generate_recommendations(
        result["cart_tracking"],
        result["abandonment_volume"],
        result["email_capture"],
        result["recovery_potential"],
    )

    result["progress"] = 100

    return result
