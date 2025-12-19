"""
Theme Code Audit Workflow - Inngest Job
========================================
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


STEPS = [
    {"id": "theme_access", "name": "Accès Thème", "description": "Récupération des fichiers"},
    {"id": "ga4_code", "name": "Code GA4", "description": "Analyse du code GA4"},
    {"id": "meta_code", "name": "Code Meta Pixel", "description": "Analyse Meta Pixel"},
    {"id": "gtm_code", "name": "Google Tag Manager", "description": "Détection GTM"},
    {"id": "issues_detection", "name": "Détection Erreurs", "description": "Identification des problèmes"},
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

    session["audits"]["theme_code"] = result
    session["updated_at"] = datetime.now(tz=UTC).isoformat()

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result."""
    return {
        "id": run_id,
        "audit_type": "theme_code",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "steps": [],
        "issues": [],
        "summary": {},
        "current_step": 0,
        "total_steps": len(STEPS),
    }


def _get_ga4_config() -> dict[str, str]:
    """Get GA4 config from ConfigService."""
    try:
        from services.config_service import ConfigService
        config = ConfigService()
        return config.get_ga4_values()
    except Exception:
        return {}


def _step_1_theme_access() -> dict[str, Any]:
    """Step 1: Access theme files."""
    step = {
        "id": "theme_access",
        "name": "Accès Thème",
        "description": "Récupération des fichiers",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    try:
        from services.theme_analyzer import ThemeAnalyzerService
        analyzer = ThemeAnalyzerService()
        analysis = analyzer.analyze_theme(force_refresh=True)

        if not analysis.files_analyzed:
            step["status"] = "error"
            step["error_message"] = "Impossible d'accéder aux fichiers du thème"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {"step": step, "success": False, "analysis": None}

        step["status"] = "success"
        step["result"] = {"files_count": len(analysis.files_analyzed)}
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

        # Convert analysis to dict for serialization
        analysis_dict = {
            "ga4_configured": analysis.ga4_configured,
            "ga4_via_shopify_native": analysis.ga4_via_shopify_native,
            "ga4_measurement_id": analysis.ga4_measurement_id,
            "ga4_events_found": analysis.ga4_events_found,
            "meta_pixel_configured": analysis.meta_pixel_configured,
            "meta_pixel_id": analysis.meta_pixel_id,
            "meta_events_found": analysis.meta_events_found,
            "gtm_configured": analysis.gtm_configured,
            "gtm_container_id": analysis.gtm_container_id,
            "files_analyzed": analysis.files_analyzed,
            "consent_mode_detected": analysis.consent_mode_detected,
            "critical_issues": analysis.critical_issues,
        }

        return {"step": step, "success": True, "analysis": analysis_dict}
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False, "analysis": None}


def _step_2_ga4_code(analysis: dict[str, Any], ga4_measurement_id: str) -> dict[str, Any]:
    """Step 2: Analyze GA4 code."""
    step = {
        "id": "ga4_code",
        "name": "Code GA4",
        "description": "Analyse du code GA4",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    ga4_configured = analysis.get("ga4_configured", False)
    ga4_via_shopify = analysis.get("ga4_via_shopify_native", False)
    ga4_events = analysis.get("ga4_events_found", [])

    if ga4_configured:
        step["status"] = "success"
        step["result"] = {
            "configured": True,
            "via_shopify_native": ga4_via_shopify,
            "measurement_id": analysis.get("ga4_measurement_id"),
            "events_found": ga4_events,
        }

        if ga4_via_shopify and not ga4_events:
            issues.append({
                "id": "ga4_native_no_events",
                "audit_type": "theme_code",
                "severity": "info",
                "title": "GA4 via Shopify natif - événements gérés par Shopify",
                "description": "GA4 est configuré via les préférences Shopify. Les événements sont automatiques.",
                "action_available": False,
            })
    else:
        # Check if GA4 is receiving data anyway
        ga4_receiving_data = False
        try:
            from services.ga4_analytics import GA4AnalyticsService
            from services.config_service import ConfigService
            ga4_service = GA4AnalyticsService(ConfigService())
            if ga4_service.is_available():
                metrics = ga4_service.get_funnel_metrics(days=7, force_refresh=True)
                ga4_receiving_data = (metrics.get("visitors") or 0) > 0
        except Exception:
            pass

        if ga4_receiving_data:
            step["status"] = "success"
            step["result"] = {"configured": True, "via_custom_pixels": True}
            issues.append({
                "id": "ga4_via_custom_pixels",
                "audit_type": "theme_code",
                "severity": "info",
                "title": "GA4 actif via Custom Pixels ou GTM",
                "description": "GA4 n'est pas dans le thème mais reçoit des données",
                "action_available": False,
            })
        else:
            step["status"] = "warning"
            step["result"] = {"configured": False}
            issues.append({
                "id": "ga4_not_in_theme",
                "audit_type": "theme_code",
                "severity": "critical",
                "title": "GA4 non configuré",
                "description": "Aucun code GA4 détecté et aucune donnée reçue",
                "action_available": bool(ga4_measurement_id),
                "action_id": "add_ga4_base" if ga4_measurement_id else None,
                "action_label": "Ajouter via snippet" if ga4_measurement_id else None,
                "action_status": "available" if ga4_measurement_id else "not_available",
            })

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def _step_3_meta_code(analysis: dict[str, Any]) -> dict[str, Any]:
    """Step 3: Analyze Meta Pixel code."""
    step = {
        "id": "meta_code",
        "name": "Code Meta Pixel",
        "description": "Analyse Meta Pixel",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    meta_configured = analysis.get("meta_pixel_configured", False)
    meta_pixel_id = analysis.get("meta_pixel_id")
    meta_events = analysis.get("meta_events_found", [])

    if meta_configured:
        step["status"] = "success"
        step["result"] = {
            "configured": True,
            "pixel_id": meta_pixel_id,
            "events_found": meta_events,
        }
    else:
        step["status"] = "warning"
        step["result"] = {"configured": False}
        issues.append({
            "id": "meta_not_in_theme",
            "audit_type": "theme_code",
            "severity": "medium",
            "title": "Meta Pixel non détecté",
            "description": "Aucun Meta Pixel détecté dans le thème",
            "action_available": False,
        })

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def _step_4_gtm_code(analysis: dict[str, Any]) -> dict[str, Any]:
    """Step 4: Analyze GTM code."""
    step = {
        "id": "gtm_code",
        "name": "Google Tag Manager",
        "description": "Détection GTM",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    gtm_configured = analysis.get("gtm_configured", False)
    gtm_container_id = analysis.get("gtm_container_id")

    step["status"] = "success" if gtm_configured else "warning"
    step["result"] = {
        "configured": gtm_configured,
        "container_id": gtm_container_id,
    }

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": []}


def _step_5_issues_detection(analysis: dict[str, Any]) -> dict[str, Any]:
    """Step 5: Detect issues."""
    step = {
        "id": "issues_detection",
        "name": "Détection Erreurs",
        "description": "Identification des problèmes",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    critical_issues = analysis.get("critical_issues", [])
    consent_mode = analysis.get("consent_mode_detected", False)

    if critical_issues:
        step["status"] = "warning"
        for issue in critical_issues:
            issues.append({
                "id": f"theme_issue_{issue.get('type', 'unknown')}",
                "audit_type": "theme_code",
                "severity": issue.get("severity", "medium"),
                "title": issue.get("title", "Problème détecté"),
                "description": issue.get("description", ""),
                "action_available": False,
            })
    else:
        step["status"] = "success"

    step["result"] = {
        "critical_issues_count": len(critical_issues),
        "consent_mode_detected": consent_mode,
    }

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def create_theme_audit_function() -> inngest.Function | None:
    """Create the Theme Code audit Inngest function."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="theme-audit",
        trigger=inngest.TriggerEvent(event="audit/theme.requested"),
        retries=1,
    )
    async def theme_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run Theme Code audit with step-by-step progress."""
        run_id = ctx.event.data.get("run_id", str(uuid4())[:8])
        result = _init_result(run_id)
        _save_progress(result)

        # Get GA4 config
        ga4_config = _get_ga4_config()
        ga4_measurement_id = ga4_config.get("measurement_id", "")

        if not ga4_measurement_id:
            result["steps"].append({
                "id": "theme_access", "name": "Accès Thème", "description": "Récupération des fichiers",
                "status": "error", "started_at": datetime.now(tz=UTC).isoformat(),
                "completed_at": datetime.now(tz=UTC).isoformat(),
                "duration_ms": 0, "result": None,
                "error_message": "GA4 non configuré. Allez dans Settings > GA4.",
            })
            for step_def in STEPS[1:]:
                result["steps"].append({
                    "id": step_def["id"], "name": step_def["name"], "description": step_def["description"],
                    "status": "skipped", "started_at": None, "completed_at": None,
                    "duration_ms": None, "result": None, "error_message": None,
                })
            result["status"] = "error"
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            _save_progress(result)
            return result

        # Step 1: Theme access
        result["current_step"] = 1
        _save_progress(result)
        step1_result = await ctx.step.run("access-theme", _step_1_theme_access)
        result["steps"].append(step1_result["step"])
        _save_progress(result)

        if not step1_result["success"]:
            for step_def in STEPS[1:]:
                result["steps"].append({
                    "id": step_def["id"], "name": step_def["name"], "description": step_def["description"],
                    "status": "skipped", "started_at": None, "completed_at": None,
                    "duration_ms": None, "result": None, "error_message": None,
                })
            result["status"] = "error"
            result["issues"].append({
                "id": "theme_access_error",
                "audit_type": "theme_code",
                "severity": "critical",
                "title": "Accès thème impossible",
                "description": "Impossible d'accéder aux fichiers du thème Shopify",
                "action_available": False,
            })
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            _save_progress(result)
            return result

        analysis = step1_result["analysis"]

        # Step 2: GA4 code
        result["current_step"] = 2
        _save_progress(result)
        step2_result = await ctx.step.run(
            "analyze-ga4-code",
            lambda: _step_2_ga4_code(analysis, ga4_measurement_id),
        )
        result["steps"].append(step2_result["step"])
        result["issues"].extend(step2_result["issues"])
        _save_progress(result)

        # Step 3: Meta code
        result["current_step"] = 3
        _save_progress(result)
        step3_result = await ctx.step.run("analyze-meta-code", lambda: _step_3_meta_code(analysis))
        result["steps"].append(step3_result["step"])
        result["issues"].extend(step3_result["issues"])
        _save_progress(result)

        # Step 4: GTM code
        result["current_step"] = 4
        _save_progress(result)
        step4_result = await ctx.step.run("analyze-gtm-code", lambda: _step_4_gtm_code(analysis))
        result["steps"].append(step4_result["step"])
        _save_progress(result)

        # Step 5: Issues detection
        result["current_step"] = 5
        _save_progress(result)
        step5_result = await ctx.step.run("detect-issues", lambda: _step_5_issues_detection(analysis))
        result["steps"].append(step5_result["step"])
        result["issues"].extend(step5_result["issues"])
        _save_progress(result)

        # Finalize
        has_errors = any(s.get("status") == "error" for s in result["steps"])
        has_warnings = any(s.get("status") == "warning" for s in result["steps"])
        result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        result["summary"] = {
            "files_analyzed": len(analysis.get("files_analyzed", [])),
            "ga4_configured": analysis.get("ga4_configured", False),
            "meta_configured": analysis.get("meta_pixel_configured", False),
            "gtm_configured": analysis.get("gtm_configured", False),
            "issues_count": len(result["issues"]),
        }

        _save_progress(result)
        return result

    return theme_audit


theme_audit_function = create_theme_audit_function()
