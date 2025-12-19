"""
Meta Pixel Audit Workflow - Inngest Job
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
import requests

from jobs.audit_workflow import inngest_client


STEPS = [
    {"id": "meta_connection", "name": "Détection Pixel", "description": "Scan du thème Shopify"},
    {"id": "pixel_config", "name": "Configuration", "description": "Vérification installation"},
    {"id": "events_check", "name": "Événements", "description": "Vérification des événements"},
    {"id": "pixel_status", "name": "Statut Meta", "description": "Activité sur Meta"},
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

    session["audits"]["meta_pixel"] = result
    session["updated_at"] = datetime.now(tz=UTC).isoformat()

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result."""
    return {
        "id": run_id,
        "audit_type": "meta_pixel",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "steps": [],
        "issues": [],
        "summary": {},
    }


def _get_meta_config() -> dict[str, str]:
    """Get Meta config from ConfigService."""
    try:
        from services.config_service import ConfigService
        config = ConfigService()
        return config.get_meta_values()
    except Exception:
        return {}


def _step_1_detect_pixel(configured_pixel_id: str) -> dict[str, Any]:
    """Step 1: Detect Meta Pixel in theme."""
    step = {
        "id": "meta_connection",
        "name": "Détection Pixel",
        "description": "Scan du thème Shopify",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    theme_pixel_id = None
    pixel_in_theme = False
    meta_events_found = []

    try:
        from services.theme_analyzer import ThemeAnalyzerService
        analyzer = ThemeAnalyzerService()
        # Force refresh to get latest detection (including storefront HTML check)
        analyzer.clear_cache()
        analysis = analyzer.analyze_theme(force_refresh=True)
        pixel_in_theme = analysis.meta_pixel_configured
        theme_pixel_id = analysis.meta_pixel_id
        meta_events_found = analysis.meta_events_found
    except Exception:
        pass

    if pixel_in_theme and theme_pixel_id:
        step["status"] = "success"
        step["result"] = {
            "pixel_in_theme": True,
            "theme_pixel_id": theme_pixel_id,
            "configured_pixel_id": configured_pixel_id or None,
        }
        effective_pixel_id = theme_pixel_id
    elif configured_pixel_id:
        step["status"] = "warning"
        step["result"] = {"pixel_in_theme": False, "configured_pixel_id": configured_pixel_id}
        step["error_message"] = "Pixel configuré mais non détecté dans le thème"
        effective_pixel_id = configured_pixel_id
    else:
        step["status"] = "error"
        step["error_message"] = "Aucun Meta Pixel détecté dans le thème ni configuré"
        effective_pixel_id = None

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {
        "step": step,
        "success": effective_pixel_id is not None,
        "effective_pixel_id": effective_pixel_id,
        "theme_pixel_id": theme_pixel_id,
        "pixel_in_theme": pixel_in_theme,
        "meta_events_found": meta_events_found,
    }


def _step_2_check_config(
    pixel_in_theme: bool,  # noqa: FBT001
    theme_pixel_id: str | None,
    configured_pixel_id: str,
) -> dict[str, Any]:
    """Step 2: Check pixel configuration."""
    step = {
        "id": "pixel_config",
        "name": "Configuration",
        "description": "Vérification installation",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    if pixel_in_theme:
        if configured_pixel_id and theme_pixel_id != configured_pixel_id:
            step["status"] = "warning"
            step["result"] = {
                "theme_pixel_id": theme_pixel_id,
                "configured_pixel_id": configured_pixel_id,
                "match": False,
            }
            issues.append({
                "id": "meta_pixel_mismatch",
                "audit_type": "meta_pixel",
                "severity": "info",
                "title": "Pixel ID différent de la config",
                "description": f"Thème: {theme_pixel_id}, Config: {configured_pixel_id}",
                "action_available": False,
            })
        else:
            step["status"] = "success"
            step["result"] = {"theme_pixel_id": theme_pixel_id, "status": "installed"}
    else:
        step["status"] = "warning"
        step["result"] = {"pixel_in_theme": False}
        issues.append({
            "id": "meta_pixel_not_in_theme",
            "audit_type": "meta_pixel",
            "severity": "high",
            "title": "Meta Pixel non installé dans le thème",
            "description": (
                f"Le Pixel {configured_pixel_id} est configuré "
                "mais non détecté dans le thème"
            ),
            "action_available": True,
            "action_label": "Guide d'installation",
            "action_url": "https://www.facebook.com/business/help/952192354843755",
            "action_status": "available",
        })

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def _step_3_check_events(meta_events_found: list[str]) -> dict[str, Any]:
    """Step 3: Check Meta events."""
    step = {
        "id": "events_check",
        "name": "Événements",
        "description": "Vérification des événements",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    required_events = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]
    missing_events = [e for e in required_events if e not in meta_events_found]

    if not missing_events:
        step["status"] = "success"
        step["result"] = {"found": meta_events_found, "missing": []}
    elif len(missing_events) <= 2:
        step["status"] = "warning"
        step["result"] = {"found": meta_events_found, "missing": missing_events}
    else:
        step["status"] = "error"
        step["result"] = {"found": meta_events_found, "missing": missing_events}

    issues.extend(
        {
            "id": f"meta_missing_event_{event}",
            "audit_type": "meta_pixel",
            "severity": "high" if event in ["Purchase", "AddToCart"] else "medium",
            "title": f"Événement '{event}' manquant",
            "description": f"L'événement Meta Pixel {event} n'est pas détecté dans le thème",
            "action_available": True,
            "action_label": f"Ajouter {event} au thème",
            "action_id": f"fix_meta_event_{event}",
            "action_status": "available",
        }
        for event in missing_events
    )

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def _step_4_check_status(pixel_id: str, access_token: str) -> dict[str, Any]:
    """Step 4: Check pixel status on Meta."""
    step = {
        "id": "pixel_status",
        "name": "Statut Meta",
        "description": "Activité sur Meta",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    if not access_token:
        step["status"] = "skipped"
        step["error_message"] = "Pas de token Meta - impossible de vérifier le statut"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "issues": issues}

    try:
        resp = requests.get(
            f"https://graph.facebook.com/v19.0/{pixel_id}",
            params={
                "access_token": access_token,
                "fields": "id,name,last_fired_time,is_unavailable",
            },
            timeout=10,
        )

        if resp.status_code == 200:
            data = resp.json()
            pixel_name = data.get("name", "")
            last_fired = data.get("last_fired_time")
            is_unavailable = data.get("is_unavailable", False)

            if is_unavailable:
                step["status"] = "error"
                step["error_message"] = "Le Pixel est indisponible sur Meta"
                issues.append({
                    "id": "meta_pixel_unavailable",
                    "audit_type": "meta_pixel",
                    "severity": "critical",
                    "title": "Meta Pixel indisponible",
                    "description": "Le Pixel n'est plus actif ou a été supprimé sur Meta Business",
                    "action_available": True,
                    "action_label": "Vérifier sur Meta",
                    "action_url": "https://business.facebook.com/events_manager",
                    "action_status": "available",
                })
            elif last_fired:
                step["status"] = "success"
                step["result"] = {"name": pixel_name, "last_fired": last_fired, "active": True}
            else:
                step["status"] = "warning"
                step["result"] = {"name": pixel_name, "last_fired": None, "active": False}
                issues.append({
                    "id": "meta_pixel_no_activity",
                    "audit_type": "meta_pixel",
                    "severity": "high",
                    "title": "Aucune activité récente",
                    "description": "Le Pixel n'a pas reçu d'événement récemment",
                    "action_available": False,
                })
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur API Meta: {resp.status_code}"
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def create_meta_audit_function() -> inngest.Function | None:
    """Create the Meta Pixel audit Inngest function."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="meta-audit",
        trigger=inngest.TriggerEvent(event="audit/meta.requested"),
        retries=1,
    )
    async def meta_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run Meta Pixel audit with step-by-step progress."""
        run_id = ctx.event.data.get("run_id", str(uuid4())[:8])
        result = _init_result(run_id)
        _save_progress(result)

        # Get config
        meta_config = _get_meta_config()
        configured_pixel_id = meta_config.get("pixel_id", "")
        access_token = meta_config.get("access_token", "")

        # Step 1: Detect pixel
        _save_progress(result)
        step1_result = await ctx.step.run(
            "detect-meta-pixel",
            lambda: _step_1_detect_pixel(configured_pixel_id),
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
            result["issues"].append({
                "id": "meta_no_pixel",
                "audit_type": "meta_pixel",
                "severity": "critical",
                "title": "Aucun Meta Pixel",
                "description": "Aucun Meta Pixel n'est installé dans le thème Shopify",
                "action_available": True,
                "action_label": "Configurer Meta",
                "action_url": "https://business.facebook.com/events_manager",
                "action_status": "available",
            })
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            _save_progress(result)
            return result

        effective_pixel_id = step1_result["effective_pixel_id"]
        theme_pixel_id = step1_result["theme_pixel_id"]
        pixel_in_theme = step1_result["pixel_in_theme"]
        meta_events_found = step1_result["meta_events_found"]

        # Step 2: Check config
        _save_progress(result)
        step2_result = await ctx.step.run(
            "check-pixel-config",
            lambda: _step_2_check_config(
                pixel_in_theme, theme_pixel_id, configured_pixel_id
            ),
        )
        result["steps"].append(step2_result["step"])
        result["issues"].extend(step2_result["issues"])
        _save_progress(result)

        # Step 3: Check events
        _save_progress(result)
        step3_result = await ctx.step.run(
            "check-meta-events",
            lambda: _step_3_check_events(meta_events_found),
        )
        result["steps"].append(step3_result["step"])
        result["issues"].extend(step3_result["issues"])
        _save_progress(result)

        # Step 4: Check status
        _save_progress(result)
        step4_result = await ctx.step.run(
            "check-pixel-status",
            lambda: _step_4_check_status(effective_pixel_id, access_token),
        )
        result["steps"].append(step4_result["step"])
        result["issues"].extend(step4_result["issues"])
        _save_progress(result)

        # Finalize
        has_errors = any(s.get("status") == "error" for s in result["steps"])
        has_warnings = any(s.get("status") == "warning" for s in result["steps"])
        result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        result["summary"] = {
            "pixel_id": effective_pixel_id,
            "pixel_in_theme": pixel_in_theme,
            "events_found": len(meta_events_found),
            "issues_count": len(result["issues"]),
        }

        _save_progress(result)
        return result

    return meta_audit


meta_audit_function = create_meta_audit_function()
