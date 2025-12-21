"""
GA4 Tracking Audit Workflow - Inngest Job
==========================================
Full async workflow with step-by-step progress updates.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import inngest

from jobs.audit_workflow import inngest_client


COVERAGE_RATE_HIGH = 90
COVERAGE_RATE_MEDIUM = 70

STEPS = [
    {
        "id": "ga4_connection",
        "name": "Connexion GA4",
        "description": "Vérification de la connexion",
    },
    {
        "id": "collections_coverage",
        "name": "Couverture Collections",
        "description": "Analyse des collections",
    },
    {
        "id": "products_coverage",
        "name": "Couverture Produits",
        "description": "Analyse des produits",
    },
    {
        "id": "events_coverage",
        "name": "Événements E-commerce",
        "description": "Vérification des événements",
    },
    {
        "id": "transactions_match",
        "name": "Match Transactions",
        "description": "Comparaison GA4 vs Shopify",
    },
    {
        "id": "google_ads_integration",
        "name": "Google Ads Integration",
        "description": "Liaison GA4 → Google Ads",
    },
]


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
            "id": result["id"],
            "created_at": result["started_at"],
            "updated_at": datetime.now(tz=UTC).isoformat(),
            "audits": {},
        }

    session["audits"]["ga4_tracking"] = result
    session["updated_at"] = datetime.now(tz=UTC).isoformat()

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result."""
    return {
        "id": run_id,
        "audit_type": "ga4_tracking",
        "audit_category": "config",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "steps": [],
        "issues": [],
        "summary": {},
    }


def _get_ga4_config() -> dict[str, str]:
    """Get GA4 config from ConfigService."""
    try:
        from services.config_service import ConfigService

        config = ConfigService()
        return config.get_ga4_values()
    except Exception:
        return {}


def _rate_to_status(rate: float) -> str:
    """Convert rate to status."""
    if rate >= COVERAGE_RATE_HIGH:
        return "success"
    if rate >= COVERAGE_RATE_MEDIUM:
        return "warning"
    return "error"


def _step_1_check_connection(measurement_id: str) -> dict[str, Any]:
    """Step 1: Check GA4 connection."""
    step = {
        "id": "ga4_connection",
        "name": "Connexion GA4",
        "description": "Vérification de la connexion",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    if not measurement_id:
        step["status"] = "error"
        step["error_message"] = "GA4 non configuré. Allez dans Settings > GA4."
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False}

    try:
        from services.ga4_analytics import GA4AnalyticsService

        ga4_service = GA4AnalyticsService()

        # Check if GA4 is available
        if not ga4_service.is_available():
            step["status"] = "error"
            step["error_message"] = "Impossible de se connecter à l'API GA4"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {"step": step, "success": False}

        step["status"] = "success"
        step["result"] = {"connected": True, "measurement_id": measurement_id}
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

        return {"step": step, "success": True}

    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False}


def _step_2_run_full_audit(period: int) -> dict[str, Any]:
    """Step 2-5: Run full GA4 audit and return all coverage data."""
    try:
        from services.audit_service import AuditService
        from services.ga4_analytics import GA4AnalyticsService
        from services.shopify_analytics import ShopifyAnalyticsService

        shopify_service = ShopifyAnalyticsService()
        ga4_service = GA4AnalyticsService()
        audit_service = AuditService(shopify_service, ga4_service)
        full_audit = audit_service.run_full_audit(period)
        return {"success": True, "data": full_audit}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _format_coverage_message(
    name: str, tracked: int, total: int, rate: float, missing_count: int
) -> str:
    """Format a coverage message with KPIs."""
    if rate >= 90:
        icon = "✓"
    elif rate >= 70:
        icon = "⚠"
    else:
        icon = "✗"

    msg = f"{icon} {tracked}/{total} {name} trackés ({rate:.0f}%)"
    if missing_count > 0:
        msg += f" - {missing_count} sans visite récente"
    return msg


def _build_coverage_steps(full_audit: dict[str, Any]) -> list[dict[str, Any]]:
    """Build coverage steps from full audit data."""
    steps = []
    coverage = full_audit.get("tracking_coverage", {})

    # Collections coverage
    coll = coverage.get("collections", {})
    coll_rate = coll.get("rate", 0)
    coll_tracked = coll.get("tracked", 0)
    coll_total = coll.get("total", 0)
    coll_missing = len(coll.get("missing", []))
    coll_result = {
        **coll,
        "message": _format_coverage_message(
            "collections", coll_tracked, coll_total, coll_rate, coll_missing
        ),
    }
    steps.append(
        {
            "id": "collections_coverage",
            "name": "Couverture Collections",
            "description": "Analyse des collections",
            "status": _rate_to_status(coll_rate),
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": 100,
            "result": coll_result,
            "error_message": None,
        }
    )

    # Products coverage
    prod = coverage.get("products", {})
    prod_rate = prod.get("rate", 0)
    prod_tracked = prod.get("tracked", 0)
    prod_total = prod.get("total", 0)
    prod_missing = len(prod.get("missing", []))
    prod_result = {
        **prod,
        "message": _format_coverage_message(
            "produits", prod_tracked, prod_total, prod_rate, prod_missing
        ),
    }
    steps.append(
        {
            "id": "products_coverage",
            "name": "Couverture Produits",
            "description": "Analyse des produits",
            "status": _rate_to_status(prod_rate),
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": 100,
            "result": prod_result,
            "error_message": None,
        }
    )

    # Events coverage
    events = coverage.get("events", {})
    events_rate = events.get("rate", 0)
    events_tracked = events.get("tracked", 0)
    events_total = events.get("total", 0)
    events_result = {
        **events,
        "message": f"✓ {events_tracked}/{events_total} événements e-commerce trackés",
    }
    steps.append(
        {
            "id": "events_coverage",
            "name": "Événements E-commerce",
            "description": "Vérification des événements",
            "status": _rate_to_status(events_rate),
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": 100,
            "result": events_result,
            "error_message": None,
        }
    )

    # Transactions match
    trans = full_audit.get("transactions_match", {})
    match_rate = trans.get("match_rate", 0) * 100
    ga4_trans = trans.get("ga4_transactions", 0)
    shopify_orders = trans.get("shopify_orders", 0)
    trans_result = {
        **trans,
        "message": f"✓ {ga4_trans} transactions GA4 / {shopify_orders} commandes Shopify ({match_rate:.0f}% match)",
    }
    steps.append(
        {
            "id": "transactions_match",
            "name": "Match Transactions",
            "description": "Comparaison GA4 vs Shopify",
            "status": _rate_to_status(match_rate),
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": 100,
            "result": trans_result,
            "error_message": None,
        }
    )

    return steps


def _step_google_ads_integration() -> dict[str, Any]:
    """
    Step 6: Check Google Ads integration with GA4.

    Verifies:
    1. GA4 is linked to Google Ads
    2. Conversion imports are active
    3. Remarketing audiences exist
    4. Conversion volume is sufficient
    """
    step = {
        "id": "google_ads_integration",
        "name": "Google Ads Integration",
        "description": "Liaison GA4 → Google Ads",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    # This is a placeholder implementation
    # In production, you would check:
    # 1. Google Ads API to verify GA4 property is linked
    # 2. Check if conversion imports are configured
    # 3. Count remarketing audiences
    # 4. Fetch conversion volume from last 7 days

    # For now, return a "not configured" status
    step["status"] = "warning"
    step["result"] = {
        "linked": False,
        "message": "Google Ads integration check requires Google Ads API credentials",
        "note": "This step will be implemented when Google Ads API is configured",
    }
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": []}


def _build_issues(full_audit: dict[str, Any]) -> list[dict[str, Any]]:
    """Build issues from full audit data."""
    issues = []
    coverage = full_audit.get("tracking_coverage", {})

    # Collections issues
    coll = coverage.get("collections", {})
    if coll.get("missing"):
        rate = coll.get("rate", 0)
        missing_count = len(coll["missing"])
        tracked, total = coll.get("tracked", 0), coll.get("total", 0)

        if rate >= COVERAGE_RATE_MEDIUM:
            severity = "low"
            description = (
                f"{missing_count} collections sans visite récente. "
                f"Le tracking fonctionne ({tracked} pages vues)."
            )
        elif rate >= 50:
            severity = "medium"
            description = f"Collections peu visitées ({tracked}/{total}). Vérifiez leur visibilité."
        else:
            severity = "high"
            description = (
                f"Faible couverture collections ({tracked}/{total}). "
                f"Possible problème de tracking."
            )

        issues.append(
            {
                "id": "missing_collections",
                "audit_type": "ga4_tracking",
                "severity": severity,
                "title": f"{missing_count} collections sans visite",
                "description": description,
                "details": coll["missing"][:10],
                "action_available": False,
            }
        )

    # Products issues
    prod = coverage.get("products", {})
    if prod.get("missing"):
        rate = prod.get("rate", 0)
        missing_count = len(prod["missing"])
        tracked, total = prod.get("tracked", 0), prod.get("total", 0)

        if rate >= COVERAGE_RATE_HIGH:
            severity = "low"
            description = (
                f"{missing_count} produits sans vue récente. " f"Excellent taux ({rate:.0f}%)."
            )
        elif rate >= COVERAGE_RATE_MEDIUM:
            severity = "low"
            description = f"{missing_count} produits sans visite. Bon taux ({rate:.0f}%)."
        elif rate >= 50:
            severity = "medium"
            description = f"Couverture moyenne ({tracked}/{total}). Vérifiez la visibilité."
        else:
            severity = "high"
            description = (
                f"Faible couverture ({tracked}/{total}). "
                f"Possible problème de tracking view_item."
            )

        issues.append(
            {
                "id": "missing_products",
                "audit_type": "ga4_tracking",
                "severity": severity,
                "title": f"{missing_count} produits sans vue récente",
                "description": description,
                "details": prod["missing"][:10],
                "action_available": False,
            }
        )

    # Events issues
    events = coverage.get("events", {})
    critical_events = ["purchase", "add_to_cart"]
    for missing_event in events.get("missing", []):
        is_critical = missing_event in critical_events
        issues.append(
            {
                "id": f"missing_event_{missing_event}",
                "audit_type": "ga4_tracking",
                "severity": "critical" if is_critical else "high",
                "title": f"Événement '{missing_event}' manquant",
                "description": f"L'événement GA4 {missing_event} n'est pas détecté",
                "action_available": True,
                "action_id": f"fix_event_{missing_event}",
                "action_label": "Ajouter au thème",
                "action_status": "available",
            }
        )

    # Transactions match issues
    trans = full_audit.get("transactions_match", {})
    match_rate = trans.get("match_rate", 0) * 100
    if match_rate < COVERAGE_RATE_HIGH:
        ga4_trans = trans.get("ga4_transactions", 0)
        shopify_orders = trans.get("shopify_orders", 0)
        is_critical = match_rate < COVERAGE_RATE_MEDIUM
        issues.append(
            {
                "id": "transactions_mismatch",
                "audit_type": "ga4_tracking",
                "severity": "critical" if is_critical else "high",
                "title": f"Écart transactions: {match_rate:.0f}%",
                "description": f"{ga4_trans} GA4 vs {shopify_orders} Shopify",
                "action_available": False,
            }
        )

    return issues


def create_ga4_audit_function() -> inngest.Function | None:
    """Create the GA4 audit Inngest function."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="ga4-audit",
        trigger=inngest.TriggerEvent(event="audit/ga4.requested"),
        retries=1,
    )
    async def ga4_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run GA4 audit with step-by-step progress."""
        run_id = ctx.event.data.get("run_id", str(uuid4())[:8])
        period = ctx.event.data.get("period", 30)
        result = _init_result(run_id)
        _save_progress(result)

        # Get config
        ga4_config = _get_ga4_config()
        measurement_id = ga4_config.get("measurement_id", "")

        # Step 1: Check connection
        step1_result = await ctx.step.run(
            "check-ga4-connection",
            lambda: _step_1_check_connection(measurement_id),
        )
        result["steps"].append(step1_result["step"])
        _save_progress(result)

        if not step1_result["success"]:
            for step_def in STEPS[1:]:
                result["steps"].append(
                    {
                        "id": step_def["id"],
                        "name": step_def["name"],
                        "description": step_def["description"],
                        "status": "skipped",
                        "started_at": None,
                        "completed_at": None,
                        "duration_ms": None,
                        "result": None,
                        "error_message": None,
                    }
                )
            result["status"] = "error"
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            _save_progress(result)
            return result

        # Step 2-5: Run full audit
        audit_result = await ctx.step.run(
            "run-full-ga4-audit",
            lambda: _step_2_run_full_audit(period),
        )

        if not audit_result["success"]:
            result["status"] = "error"
            result["issues"].append(
                {
                    "id": "audit_error",
                    "audit_type": "ga4_tracking",
                    "severity": "critical",
                    "title": "Erreur d'audit",
                    "description": audit_result.get("error", "Erreur inconnue"),
                    "action_available": False,
                }
            )
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            _save_progress(result)
            return result

        full_audit = audit_result["data"]

        # Add coverage steps
        coverage_steps = _build_coverage_steps(full_audit)
        for step in coverage_steps:
            result["steps"].append(step)
            _save_progress(result)

        # Step 6: Google Ads Integration
        google_ads_result = await ctx.step.run(
            "check-google-ads-integration",
            _step_google_ads_integration,
        )
        result["steps"].append(google_ads_result["step"])
        result["issues"].extend(google_ads_result["issues"])
        _save_progress(result)

        # Build issues
        result["issues"].extend(_build_issues(full_audit))

        # Finalize
        has_errors = any(s.get("status") == "error" for s in result["steps"])
        has_warnings = any(s.get("status") == "warning" for s in result["steps"])
        result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        result["summary"] = full_audit.get("summary", {})

        _save_progress(result)
        return result

    return ga4_audit


ga4_audit_function = create_ga4_audit_function()
