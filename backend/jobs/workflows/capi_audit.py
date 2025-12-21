"""
CAPI Audit Workflow.

Audit de la configuration Meta Conversion API.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import inngest

from jobs.audit_workflow import INNGEST_ENABLED, inngest_client
from services.meta_capi import MetaCAPIClient


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result structure."""
    return {
        "id": run_id,
        "audit_type": "capi",
        "audit_category": "config",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "steps": [],
        "issues": [],
        "summary": {},
    }


def _save_progress(result: dict[str, Any]) -> None:
    """Save progress to audit session."""
    storage_dir = Path(__file__).parent.parent.parent / "data" / "audits"
    storage_dir.mkdir(parents=True, exist_ok=True)
    latest_file = storage_dir / "latest_session.json"

    # Load existing session
    if latest_file.exists():
        with latest_file.open() as f:
            session = json.load(f)
    else:
        session = {
            "id": f"session_{result['id'][:8]}",
            "created_at": datetime.now(tz=UTC).isoformat(),
            "audits": {},
        }

    # Update this audit's result
    session["audits"]["capi"] = result
    session["updated_at"] = datetime.now(tz=UTC).isoformat()

    # Save
    with latest_file.open("w") as f:
        json.dump(session, f, indent=2, default=str)


def _check_credentials() -> dict[str, Any]:
    """Step 1: Check credentials."""
    start_time = datetime.now(tz=UTC)
    client = MetaCAPIClient()

    if not client.is_configured():
        return {
            "id": "check_credentials",
            "name": "Vérification credentials",
            "description": "Vérification META_PIXEL_ID et META_ACCESS_TOKEN",
            "status": "error",
            "started_at": start_time.isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": 0,
            "result": {
                "configured": False,
                "pixel_id": None,
                "access_token": None,
            },
            "error_message": "META_PIXEL_ID ou META_ACCESS_TOKEN manquant",
        }

    return {
        "id": "check_credentials",
        "name": "Vérification credentials",
        "description": "Vérification META_PIXEL_ID et META_ACCESS_TOKEN",
        "status": "success",
        "started_at": start_time.isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": 10,
        "result": {
            "configured": True,
            "pixel_id": client.pixel_id,
            "access_token": "***" + client.access_token[-4:] if client.access_token else None,
        },
        "error_message": None,
    }


def _test_connection() -> dict[str, Any]:
    """Step 2: Test CAPI connection."""
    start_time = datetime.now(tz=UTC)
    client = MetaCAPIClient()

    # Test avec événement PageView
    result = client.send_event(
        event_name="PageView",
        event_id=f"test_{int(time.time())}",
        event_source_url="https://isciacusstore.com",
        user_data={"client_ip_address": "127.0.0.1"},
        test_event_code="TEST_EVENT_CODE",
    )

    status = "success" if result.get("success") else "error"
    duration_ms = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {
        "id": "test_connection",
        "name": "Test connexion CAPI",
        "description": "Envoi d'un événement test à Meta",
        "status": status,
        "started_at": start_time.isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": duration_ms,
        "result": result,
        "error_message": result.get("error") if not result.get("success") else None,
    }


def _get_pixel_info() -> dict[str, Any]:
    """Step 3: Get pixel info."""
    start_time = datetime.now(tz=UTC)
    client = MetaCAPIClient()
    result = client.get_pixel_info()

    status = "success" if result.get("success") else "warning"
    duration_ms = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {
        "id": "pixel_info",
        "name": "Informations Pixel",
        "description": "Récupération des infos du pixel Meta",
        "status": status,
        "started_at": start_time.isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": duration_ms,
        "result": result.get("data") if result.get("success") else {},
        "error_message": result.get("error") if not result.get("success") else None,
    }


def _check_emq_score() -> dict[str, Any]:
    """
    Step 4: Check Event Match Quality (EMQ) info.

    NOTE: L'EMQ n'est PAS accessible via l'API Meta.
    Le score est uniquement visible dans Events Manager.
    On vérifie plutôt si le pixel reçoit des événements et on affiche
    des conseils pour améliorer le score.
    """
    start_time = datetime.now(tz=UTC)
    client = MetaCAPIClient()
    result = client.get_emq_info()

    duration_ms = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    if result.get("success"):
        has_events = result.get("has_server_events", False)
        last_fired = result.get("last_fired")
        message = result.get("message", "")

        return {
            "id": "emq_score",
            "name": "Event Match Quality",
            "description": "Qualité des données de matching",
            "status": "success" if has_events else "warning",
            "started_at": start_time.isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": duration_ms,
            "result": {
                "has_activity": has_events,
                "last_fired": last_fired,
                "message": message,
                "note": "Consultez Meta Events Manager pour le score EMQ exact",
            },
            "error_message": None,
        }

    return {
        "id": "emq_score",
        "name": "Event Match Quality",
        "description": "Qualité des données de matching",
        "status": "warning",
        "started_at": start_time.isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": duration_ms,
        "result": {
            "has_activity": False,
            "message": (
                "Impossible de vérifier l'activité. "
                "Consultez Meta Events Manager pour le score EMQ."
            ),
        },
        "error_message": result.get("error"),
    }


def create_capi_audit_function() -> inngest.Function | None:
    """Create CAPI audit workflow."""
    if not INNGEST_ENABLED:
        return None

    @inngest_client.create_function(
        fn_id="capi-audit",
        trigger=inngest.TriggerEvent(event="audit/capi.requested"),
        retries=2,
    )
    async def capi_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Audit de la configuration CAPI."""
        result = _init_result(ctx.run_id)

        # Step 1: Check credentials
        step1 = await ctx.step.run("check_credentials", _check_credentials)
        result["steps"].append(step1)
        _save_progress(result)

        if step1["status"] == "error":
            result["status"] = "error"
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            _save_progress(result)
            return result

        # Step 2: Test connection
        step2 = await ctx.step.run("test_connection", _test_connection)
        result["steps"].append(step2)
        _save_progress(result)

        # Step 3: Get pixel info
        step3 = await ctx.step.run("pixel_info", _get_pixel_info)
        result["steps"].append(step3)
        _save_progress(result)

        # Step 4: Check EMQ score
        step4 = await ctx.step.run("emq_score", _check_emq_score)
        result["steps"].append(step4)
        _save_progress(result)

        # Summary
        result["status"] = (
            "success" if all(s["status"] == "success" for s in result["steps"]) else "warning"
        )
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        result["summary"] = {
            "configured": step1["result"].get("configured", False),
            "connection_ok": step2["status"] == "success",
            "pixel_name": step3["result"].get("name") if step3["status"] == "success" else None,
            "has_activity": step4["result"].get("has_activity", False),
            "last_fired": step4["result"].get("last_fired"),
        }

        _save_progress(result)
        return result

    return capi_audit
