"""
Cart Recovery Analysis Audit Workflow.

Inngest workflow that analyzes abandoned carts for Ads retargeting:
1. Check cart abandonment tracking availability
2. Analyze abandonment volume (minimum 50/month)
3. Check email capture rate in checkout
4. Calculate recovery revenue potential
"""

from typing import Any

from inngest import Inngest
from inngest.function import InngestFunction
from services.storage import save_audit_result

from services.cart_recovery_analyzer import CartRecoveryAnalyzer


def _init_result() -> dict[str, Any]:
    """Initialize empty audit result structure."""
    return {
        "audit_category": "metrics",
        "status": "running",
        "progress": 0,
        "steps": {
            "cart_tracking": {"status": "pending"},
            "abandonment_volume": {"status": "pending"},
            "email_capture": {"status": "pending"},
            "recovery_potential": {"status": "pending"},
        },
        "ready_for_retargeting": False,
        "cart_tracking": {},
        "abandonment_volume": {},
        "email_capture": {},
        "recovery_potential": {},
        "recommendations": [],
        "error": None,
    }


def _save_progress(result: dict[str, Any]) -> None:
    """Save audit progress to storage."""
    save_audit_result("cart_recovery", result)


def create_cart_recovery_audit_workflow(inngest_client: Inngest) -> InngestFunction:
    """
    Create Cart Recovery Analysis Audit workflow.

    Args:
        inngest_client: Inngest client instance

    Returns:
        InngestFunction that can be served
    """

    @inngest_client.create_function(
        fn_id="cart-recovery-audit",
        trigger=inngest_client.create_trigger(event="audit/cart-recovery.trigger"),
    )
    async def cart_recovery_audit_fn(_ctx: Any, step: Any) -> dict[str, Any]:
        """
        Cart Recovery Analysis Audit workflow.

        Analyzes abandoned carts to determine retargeting readiness.

        Steps:
        1. Check cart tracking availability
        2. Analyze abandonment volume (minimum 50/month for retargeting)
        3. Check email capture rate (minimum 60% for audiences)
        4. Calculate recovery revenue potential

        Args:
            _ctx: Inngest context (unused)
            step: Inngest step runner

        Returns:
            Audit result with retargeting readiness and recommendations
        """
        result = _init_result()
        _save_progress(result)

        analyzer = CartRecoveryAnalyzer()

        # Step 1: Check cart tracking
        tracking_result = await step.run(
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
        volume_result = await step.run(
            "analyze-abandonment-volume",
            lambda: _analyze_abandonment_volume(analyzer, result),
        )
        result = volume_result
        _save_progress(result)

        # Step 3: Check email capture
        email_result = await step.run(
            "check-email-capture",
            lambda: _check_email_capture(analyzer, result),
        )
        result = email_result
        _save_progress(result)

        # Step 4: Calculate recovery potential
        potential_result = await step.run(
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


def _check_cart_tracking(analyzer: CartRecoveryAnalyzer, result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 1: Check cart abandonment tracking.

    Args:
        analyzer: CartRecoveryAnalyzer instance
        result: Current audit result

    Returns:
        Updated audit result
    """
    result["steps"]["cart_tracking"]["status"] = "running"
    _save_progress(result)

    if not analyzer.is_configured():
        result["steps"]["cart_tracking"] = {
            "status": "error",
            "message": "Shopify credentials not configured",
        }
        result["error"] = "Shopify credentials not configured"
        result["status"] = "error"
        return result

    tracking_data = analyzer.check_cart_tracking()

    if "error" in tracking_data:
        result["steps"]["cart_tracking"] = {
            "status": "error",
            "message": tracking_data["error"],
        }
        result["cart_tracking"] = tracking_data
        # Don't mark as error - this is expected for basic Shopify plans
        result["progress"] = 25
        return result

    result["cart_tracking"] = tracking_data
    result["steps"]["cart_tracking"] = {
        "status": "success",
        "message": tracking_data.get("message", ""),
    }
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
    result["steps"]["abandonment_volume"]["status"] = "running"
    _save_progress(result)

    volume_data = analyzer.get_abandonment_volume()

    if "error" in volume_data:
        result["steps"]["abandonment_volume"] = {
            "status": "error",
            "message": volume_data["error"],
        }
        result["abandonment_volume"] = volume_data
        result["progress"] = 50
        return result

    result["abandonment_volume"] = volume_data
    result["steps"]["abandonment_volume"] = {
        "status": "success",
        "message": volume_data.get("message", ""),
    }
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
    result["steps"]["email_capture"]["status"] = "running"
    _save_progress(result)

    email_data = analyzer.check_email_capture()

    if "error" in email_data:
        result["steps"]["email_capture"] = {
            "status": "error",
            "message": email_data["error"],
        }
        result["email_capture"] = email_data
        result["progress"] = 75
        return result

    result["email_capture"] = email_data
    result["steps"]["email_capture"] = {
        "status": "success",
        "message": email_data.get("message", ""),
    }
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
    result["steps"]["recovery_potential"]["status"] = "running"
    _save_progress(result)

    potential_data = analyzer.calculate_recovery_potential()

    if "error" in potential_data:
        result["steps"]["recovery_potential"] = {
            "status": "error",
            "message": potential_data["error"],
        }
        result["recovery_potential"] = potential_data
        result["progress"] = 100
        return result

    result["recovery_potential"] = potential_data
    result["steps"]["recovery_potential"] = {
        "status": "success",
        "message": potential_data.get("message", ""),
    }

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
