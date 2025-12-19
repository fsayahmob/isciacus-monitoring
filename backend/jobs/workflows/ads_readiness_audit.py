"""
Ads Readiness Audit Workflow - Inngest Job
===========================================
Audit global de préparation pour lancer des campagnes publicitaires.

Vérifie :
1. Qualité du tracking (GA4, Meta, GTM)
2. Données de conversion complètes
3. Segmentation disponible
4. Attribution multi-touch possible
5. Métriques ROAS/CPA/LTV calculables

Score final : X/100 avec détails des problèmes.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import inngest

from jobs.audit_workflow import inngest_client


STEPS = [
    {
        "id": "tracking_quality",
        "name": "Qualité Tracking",
        "description": "Vérification qualité des données GA4/Meta",
    },
    {
        "id": "conversion_completeness",
        "name": "Conversions Complètes",
        "description": "Validation données de conversion",
    },
    {
        "id": "segmentation_data",
        "name": "Données Segmentation",
        "description": "Device, country, source/medium disponibles",
    },
    {
        "id": "attribution_readiness",
        "name": "Attribution Multi-Touch",
        "description": "UTM tracking et user journey",
    },
    {
        "id": "ads_metrics_calculable",
        "name": "Métriques Ads",
        "description": "ROAS, CPA, LTV calculables",
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

    session["audits"]["ads_readiness"] = result
    session["updated_at"] = datetime.now(tz=UTC).isoformat()

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result."""
    return {
        "id": run_id,
        "audit_type": "ads_readiness",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "steps": [],
        "issues": [],
        "summary": {},
    }


def _check_tracking_quality() -> dict[str, Any]:
    """
    Step 1: Vérifier la qualité du tracking GA4 et Meta.

    Vérifie :
    - GA4 : Événements avec paramètres complets (currency, value, items)
    - Meta : Événements avec paramètres complets (content_id, value, currency)
    - Pas de doublons d'événements
    - Pas de valeurs nulles/aberrantes
    """
    step = {
        "id": "tracking_quality",
        "name": "Qualité Tracking",
        "description": "Vérification qualité des données GA4/Meta",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []
    score = 0

    try:
        # Import des services nécessaires
        from services.theme_analyzer import ThemeAnalyzerService

        theme_analyzer = ThemeAnalyzerService()

        # Analyser le thème pour détecter les événements
        theme_analysis = theme_analyzer.analyze_theme(force_refresh=True)

        ga4_events_found = theme_analysis.ga4_events_found
        meta_events_found = theme_analysis.meta_events_found

        # Score GA4 Events Quality
        required_ga4_events = [
            "page_view",
            "view_item",
            "add_to_cart",
            "begin_checkout",
            "purchase",
        ]
        ga4_events_present = [e for e in required_ga4_events if e in ga4_events_found]
        ga4_score = (len(ga4_events_present) / len(required_ga4_events)) * 30

        if len(ga4_events_present) < len(required_ga4_events):
            missing = [e for e in required_ga4_events if e not in ga4_events_found]
            issues.append(
                {
                    "id": "ga4_events_missing",
                    "audit_type": "ads_readiness",
                    "severity": "high",
                    "title": f"Événements GA4 manquants ({len(missing)})",
                    "description": f"Événements manquants : {', '.join(missing)}",
                    "action_available": True,
                    "action_label": "Ajouter événements GA4",
                    "action_id": "fix_ga4_events",
                    "action_status": "available",
                }
            )

        # Score Meta Events Quality
        required_meta_events = [
            "PageView",
            "ViewContent",
            "AddToCart",
            "InitiateCheckout",
            "Purchase",
        ]
        meta_events_present = [e for e in required_meta_events if e in meta_events_found]
        meta_score = (len(meta_events_present) / len(required_meta_events)) * 20

        if len(meta_events_present) < len(required_meta_events):
            missing_meta = [e for e in required_meta_events if e not in meta_events_found]
            issues.append(
                {
                    "id": "meta_events_missing",
                    "audit_type": "ads_readiness",
                    "severity": "high",
                    "title": f"Événements Meta manquants ({len(missing_meta)})",
                    "description": f"Événements manquants : {', '.join(missing_meta)}",
                    "action_available": True,
                    "action_label": "Ajouter événements Meta",
                    "action_id": "fix_meta_events",
                    "action_status": "available",
                }
            )

        score = int(ga4_score + meta_score)

        # Détection de CAPI (Meta Conversion API)
        has_capi = False  # TODO: Implémenter détection CAPI
        if not has_capi:
            issues.append(
                {
                    "id": "meta_capi_missing",
                    "audit_type": "ads_readiness",
                    "severity": "medium",
                    "title": "Meta CAPI non configuré",
                    "description": "Conversion API server-side recommandé pour iOS14+",
                    "action_available": True,
                    "action_label": "Configurer CAPI",
                    "action_url": "https://developers.facebook.com/docs/marketing-api/conversions-api",
                    "action_status": "available",
                }
            )

        step["status"] = "success" if score >= 40 else "warning"
        step["result"] = {
            "score": score,
            "max_score": 50,
            "ga4_events_found": len(ga4_events_present),
            "ga4_events_required": len(required_ga4_events),
            "meta_events_found": len(meta_events_present),
            "meta_events_required": len(required_meta_events),
            "has_capi": has_capi,
        }

    except ImportError as e:
        step["status"] = "error"
        step["error_message"] = f"Service import failed: {e}"
        score = 0
    except ValueError as e:
        step["status"] = "error"
        step["error_message"] = f"Configuration error: {e}"
        score = 0

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def _check_conversion_completeness() -> dict[str, Any]:
    """
    Step 2: Vérifier que les conversions sont complètes et cohérentes.

    Vérifie :
    - Match rate GA4 ↔ Shopify > 90%
    - Données de conversion avec currency, value, items
    - User ID propagé dans les événements
    """
    step = {
        "id": "conversion_completeness",
        "name": "Conversions Complètes",
        "description": "Validation données de conversion",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []
    score = 0

    try:
        from services.shopify_analytics import ShopifyAnalyticsService

        shopify_service = ShopifyAnalyticsService()

        # Récupérer les données Shopify
        funnel = shopify_service.fetch_conversion_funnel(days=30, force_refresh=True)

        shopify_orders = funnel.purchases
        has_checkout_data = funnel.checkout > 0

        # TODO: Implémenter vérification GA4 match rate via ga4_audit
        # Pour l'instant, score basé sur la présence de données de checkout
        if has_checkout_data and shopify_orders > 0:
            score = 15  # Données Shopify présentes
        elif shopify_orders > 0:
            score = 10  # Seulement des commandes
        else:
            score = 0  # Pas de données

        if shopify_orders == 0:
            issues.append(
                {
                    "id": "no_shopify_orders",
                    "audit_type": "ads_readiness",
                    "severity": "high",
                    "title": "Aucune commande Shopify sur 30 jours",
                    "description": (
                        "Impossible de calculer les métriques de conversion "
                        "sans données historiques"
                    ),
                    "action_available": False,
                }
            )

        step["status"] = "success" if score >= 10 else "warning"
        step["result"] = {
            "score": score,
            "max_score": 20,
            "shopify_orders": shopify_orders,
            "has_checkout_data": has_checkout_data,
            "note": "GA4 match rate check à implémenter",
        }

    except ImportError as e:
        step["status"] = "error"
        step["error_message"] = f"Service import failed: {e}"
        score = 0
    except (ValueError, KeyError, AttributeError) as e:
        step["status"] = "error"
        step["error_message"] = f"Data error: {e}"
        score = 0

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def _check_segmentation_data() -> dict[str, Any]:
    """
    Step 3: Vérifier que les données de segmentation sont disponibles.

    Vérifie :
    - Device (mobile, desktop, tablet)
    - Country / City
    - Source / Medium (organic, paid, direct, referral)
    """
    step = {
        "id": "segmentation_data",
        "name": "Données Segmentation",
        "description": "Device, country, source/medium disponibles",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []

    # TODO: Implémenter vérification réelle des données de segmentation
    # Pour l'instant, score basique basé sur la configuration
    score = 10  # Score par défaut

    issues.append(
        {
            "id": "segmentation_not_verified",
            "audit_type": "ads_readiness",
            "severity": "medium",
            "title": "Segmentation non vérifiée",
            "description": (
                "Les données de segmentation (device, country, source/medium) "
                "ne sont pas encore vérifiées automatiquement"
            ),
            "action_available": False,
        }
    )

    step["status"] = "warning"
    step["result"] = {
        "score": score,
        "max_score": 15,
        "verified": False,
    }
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def _check_attribution_readiness() -> dict[str, Any]:
    """
    Step 4: Vérifier que l'attribution multi-touch est possible.

    Vérifie :
    - UTM parameters tracking
    - Source / Medium cohérents
    - User journey tracking possible
    """
    step = {
        "id": "attribution_readiness",
        "name": "Attribution Multi-Touch",
        "description": "UTM tracking et user journey",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []

    # TODO: Implémenter vérification UTM tracking
    score = 5  # Score par défaut

    issues.append(
        {
            "id": "utm_tracking_not_verified",
            "audit_type": "ads_readiness",
            "severity": "high",
            "title": "UTM tracking non vérifié",
            "description": (
                "Les paramètres UTM (source, medium, campaign) ne sont pas vérifiés. "
                "Attribution multi-touch limitée."
            ),
            "action_available": False,
        }
    )

    step["status"] = "warning"
    step["result"] = {
        "score": score,
        "max_score": 10,
        "verified": False,
    }
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def _check_ads_metrics() -> dict[str, Any]:
    """
    Step 5: Vérifier que les métriques Ads sont calculables.

    Vérifie :
    - ROAS calculable (revenue / ad spend)
    - CPA calculable (cost / conversions)
    - LTV estimable
    """
    step = {
        "id": "ads_metrics_calculable",
        "name": "Métriques Ads",
        "description": "ROAS, CPA, LTV calculables",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []

    # TODO: Vérifier que les métriques sont calculables
    score = 5  # Score par défaut

    issues.append(
        {
            "id": "ads_metrics_not_verified",
            "audit_type": "ads_readiness",
            "severity": "medium",
            "title": "Métriques Ads non vérifiées",
            "description": "ROAS, CPA, LTV ne sont pas encore calculés automatiquement",
            "action_available": False,
        }
    )

    step["status"] = "warning"
    step["result"] = {
        "score": score,
        "max_score": 5,
        "verified": False,
    }
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def create_ads_readiness_audit_function() -> inngest.Function | None:
    """Create the Ads Readiness audit Inngest function."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="ads-readiness-audit",
        trigger=inngest.TriggerEvent(event="audit/ads_readiness.requested"),
        retries=1,
    )
    async def ads_readiness_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run Ads Readiness audit with step-by-step progress."""
        run_id = ctx.event.data.get("run_id", ctx.run_id)
        result = _init_result(run_id)
        _save_progress(result)

        total_score = 0
        max_total_score = 100

        # Step 1: Tracking Quality
        step1_result = await ctx.step.run("check-tracking-quality", _check_tracking_quality)
        result["steps"].append(step1_result["step"])
        result["issues"].extend(step1_result["issues"])
        total_score += step1_result["score"]
        _save_progress(result)

        # Step 2: Conversion Completeness
        step2_result = await ctx.step.run(
            "check-conversion-completeness", _check_conversion_completeness
        )
        result["steps"].append(step2_result["step"])
        result["issues"].extend(step2_result["issues"])
        total_score += step2_result["score"]
        _save_progress(result)

        # Step 3: Segmentation Data
        step3_result = await ctx.step.run("check-segmentation-data", _check_segmentation_data)
        result["steps"].append(step3_result["step"])
        result["issues"].extend(step3_result["issues"])
        total_score += step3_result["score"]
        _save_progress(result)

        # Step 4: Attribution Readiness
        step4_result = await ctx.step.run(
            "check-attribution-readiness", _check_attribution_readiness
        )
        result["steps"].append(step4_result["step"])
        result["issues"].extend(step4_result["issues"])
        total_score += step4_result["score"]
        _save_progress(result)

        # Step 5: Ads Metrics
        step5_result = await ctx.step.run("check-ads-metrics", _check_ads_metrics)
        result["steps"].append(step5_result["step"])
        result["issues"].extend(step5_result["issues"])
        total_score += step5_result["score"]
        _save_progress(result)

        # Finalize
        has_errors = any(s.get("status") == "error" for s in result["steps"])
        has_warnings = any(s.get("status") == "warning" for s in result["steps"])
        result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
        result["completed_at"] = datetime.now(tz=UTC).isoformat()

        # Calculate readiness level
        if total_score >= 80:
            readiness_level = "excellent"
        elif total_score >= 60:
            readiness_level = "good"
        elif total_score >= 40:
            readiness_level = "fair"
        else:
            readiness_level = "poor"

        result["summary"] = {
            "total_score": total_score,
            "max_score": max_total_score,
            "percentage": round((total_score / max_total_score) * 100, 1),
            "readiness_level": readiness_level,
            "critical_issues": len([i for i in result["issues"] if i["severity"] == "critical"]),
            "high_issues": len([i for i in result["issues"] if i["severity"] == "high"]),
            "medium_issues": len([i for i in result["issues"] if i["severity"] == "medium"]),
        }

        _save_progress(result)
        return result

    return ads_readiness_audit


ads_readiness_audit_function = create_ads_readiness_audit_function()
