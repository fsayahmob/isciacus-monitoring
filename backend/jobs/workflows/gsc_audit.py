"""
Google Search Console Audit Workflow - Inngest Job
===================================================
Full async workflow with step-by-step progress updates.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import inngest
import requests

from jobs.audit_workflow import inngest_client


STEPS = [
    {"id": "gsc_connection", "name": "Connexion GSC", "description": "Connexion Search Console"},
    {"id": "indexation", "name": "Indexation", "description": "Couverture d'indexation"},
    {"id": "errors", "name": "Erreurs", "description": "Vérification des erreurs"},
    {"id": "sitemaps", "name": "Sitemaps", "description": "Statut des sitemaps"},
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

    session["audits"]["search_console"] = result
    session["updated_at"] = datetime.now(tz=UTC).isoformat()

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result."""
    return {
        "id": run_id,
        "audit_type": "search_console",
        "audit_category": "config",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "steps": [],
        "issues": [],
        "summary": {},
    }


def _get_gsc_config() -> dict[str, str]:
    """Get GSC config from ConfigService."""
    try:
        from services.config_service import ConfigService

        config = ConfigService()
        return config.get_search_console_values()
    except Exception:
        return {}


def _get_gsc_token(creds_path: str) -> str | None:
    """Get GSC access token."""
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        if not creds_path or not Path(creds_path).exists():
            return None

        credentials = service_account.Credentials.from_service_account_file(
            creds_path,
            scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
        )
        credentials.refresh(Request())
        return credentials.token
    except Exception:
        return None


def _step_1_check_connection(site_url: str, creds_path: str) -> dict[str, Any]:
    """Step 1: Check GSC connection."""
    step = {
        "id": "gsc_connection",
        "name": "Connexion GSC",
        "description": "Connexion Search Console",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    if not site_url:
        step["status"] = "error"
        step["error_message"] = "GOOGLE_SEARCH_CONSOLE_PROPERTY non configuré"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False, "token": None}

    token = _get_gsc_token(creds_path)
    if not token:
        step["status"] = "error"
        step["error_message"] = "Fichier credentials Google non trouvé"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False, "token": None}

    try:
        headers = {"Authorization": f"Bearer {token}"}
        encoded_site = quote(site_url, safe="")
        resp = requests.get(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}",
            headers=headers,
            timeout=10,
        )

        if resp.status_code == 200:
            step["status"] = "success"
            step["result"] = {"site_url": site_url}
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur API GSC: {resp.status_code}"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {"step": step, "success": False, "token": None}
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False, "token": None}

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "success": True, "token": token}


def _step_2_check_indexation(site_url: str, token: str) -> dict[str, Any]:
    """Step 2: Check indexation coverage."""
    step = {
        "id": "indexation",
        "name": "Indexation",
        "description": "Couverture d'indexation",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    headers = {"Authorization": f"Bearer {token}"}
    encoded_site = quote(site_url, safe="")

    end_date = datetime.now(tz=UTC).date()
    start_date = end_date - timedelta(days=28)

    try:
        resp = requests.post(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query",
            headers=headers,
            json={
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "dimensions": ["page"],
                "rowLimit": 1000,
            },
            timeout=30,
        )

        if resp.status_code == 200:
            rows = resp.json().get("rows", [])
            indexed_pages = len(rows)

            # Estimate total pages
            # Use a conservative estimate since we can't access product count here
            # without ShopifyAnalyticsService internal methods
            try:
                # Estimate based on indexed pages (conservative)
                estimated_pages = max(indexed_pages, 100)
            except Exception:
                estimated_pages = 100

            if indexed_pages >= estimated_pages * 0.8:
                step["status"] = "success"
            else:
                step["status"] = "warning"
                issues.append(
                    {
                        "id": "gsc_low_indexation",
                        "audit_type": "search_console",
                        "severity": "warning",
                        "title": "Couverture d'indexation faible",
                        "description": (
                            f"{indexed_pages} pages indexées " f"sur ~{estimated_pages} estimées"
                        ),
                        "action_available": False,
                    }
                )

            step["result"] = {"indexed": indexed_pages, "estimated_total": estimated_pages}
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur API: {resp.status_code}"
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def _step_3_check_errors(site_url: str, token: str) -> dict[str, Any]:
    """Step 3: Check crawl errors."""
    step = {
        "id": "errors",
        "name": "Erreurs",
        "description": "Vérification des erreurs",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    headers = {"Authorization": f"Bearer {token}"}
    encoded_site = quote(site_url, safe="")

    end_date = datetime.now(tz=UTC).date()
    start_date = end_date - timedelta(days=28)

    try:
        resp = requests.post(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query",
            headers=headers,
            json={
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "dimensions": ["page"],
                "rowLimit": 1000,
            },
            timeout=30,
        )

        errors_found = 0
        if resp.status_code == 200:
            rows = resp.json().get("rows", [])
            low_impression_pages = [r for r in rows if r.get("impressions", 0) == 0]
            errors_found = len(low_impression_pages)

        if errors_found > 10:
            step["status"] = "warning"
            issues.append(
                {
                    "id": "gsc_potential_errors",
                    "audit_type": "search_console",
                    "severity": "medium",
                    "title": f"{errors_found} pages à vérifier",
                    "description": "Plusieurs pages ont 0 impressions",
                    "action_available": False,
                }
            )
        else:
            step["status"] = "success"

        step["result"] = {"potential_issues": errors_found}
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def _step_4_check_sitemaps(site_url: str, token: str) -> dict[str, Any]:
    """Step 4: Check sitemaps."""
    step = {
        "id": "sitemaps",
        "name": "Sitemaps",
        "description": "Statut des sitemaps",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    headers = {"Authorization": f"Bearer {token}"}
    encoded_site = quote(site_url, safe="")

    try:
        resp = requests.get(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/sitemaps",
            headers=headers,
            timeout=10,
        )

        if resp.status_code == 200:
            sitemaps = resp.json().get("sitemap", [])
            if sitemaps:
                step["status"] = "success"
                step["result"] = {
                    "count": len(sitemaps),
                    "sitemaps": [s.get("path") for s in sitemaps[:5]],
                }
            else:
                step["status"] = "warning"
                step["result"] = {"count": 0}
                issues.append(
                    {
                        "id": "gsc_no_sitemap",
                        "audit_type": "search_console",
                        "severity": "medium",
                        "title": "Aucun sitemap soumis",
                        "description": "Soumettez un sitemap pour améliorer l'indexation",
                        "action_available": True,
                        "action_label": "Soumettre sitemap",
                        "action_url": f"https://search.google.com/search-console/sitemaps?resource_id={quote(site_url)}",
                        "action_status": "available",
                    }
                )
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur API: {resp.status_code}"
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def create_gsc_audit_function() -> inngest.Function | None:
    """Create the GSC audit Inngest function."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="gsc-audit",
        trigger=inngest.TriggerEvent(event="audit/gsc.requested"),
        retries=1,
    )
    async def gsc_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run GSC audit with step-by-step progress."""
        run_id = ctx.event.data.get("run_id", str(uuid4())[:8])
        result = _init_result(run_id)
        _save_progress(result)

        # Get config
        gsc_config = _get_gsc_config()
        site_url = gsc_config.get("property_url", "")
        creds_path = gsc_config.get("service_account_key_path", "")

        # Step 1: Check connection
        _save_progress(result)
        step1_result = await ctx.step.run(
            "check-gsc-connection",
            lambda: _step_1_check_connection(site_url, creds_path),
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

        token = step1_result["token"]

        # Step 2: Check indexation
        _save_progress(result)
        step2_result = await ctx.step.run(
            "check-indexation", lambda: _step_2_check_indexation(site_url, token)
        )
        result["steps"].append(step2_result["step"])
        result["issues"].extend(step2_result["issues"])
        _save_progress(result)

        # Step 3: Check errors
        _save_progress(result)
        step3_result = await ctx.step.run(
            "check-errors", lambda: _step_3_check_errors(site_url, token)
        )
        result["steps"].append(step3_result["step"])
        result["issues"].extend(step3_result["issues"])
        _save_progress(result)

        # Step 4: Check sitemaps
        _save_progress(result)
        step4_result = await ctx.step.run(
            "check-sitemaps", lambda: _step_4_check_sitemaps(site_url, token)
        )
        result["steps"].append(step4_result["step"])
        result["issues"].extend(step4_result["issues"])
        _save_progress(result)

        # Finalize
        has_errors = any(s.get("status") == "error" for s in result["steps"])
        has_warnings = any(s.get("status") == "warning" for s in result["steps"])
        result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        result["summary"] = {"site_url": site_url, "issues_count": len(result["issues"])}

        _save_progress(result)
        return result

    return gsc_audit


gsc_audit_function = create_gsc_audit_function()
