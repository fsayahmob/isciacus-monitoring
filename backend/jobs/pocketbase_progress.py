"""PocketBase progress tracking for Inngest workflows.

This module provides helpers to update audit status in PocketBase
for realtime UI updates via WebSocket subscriptions.

Firebase-like pattern:
1. Frontend creates record in PocketBase (status: pending)
2. Frontend calls backend to trigger Inngest with record ID
3. Inngest workflow uses update_audit_by_record_id to update status

Centralized utilities (Epic 3.1):
- init_audit_result(): Initialize audit result dict
- save_audit_progress(): Save progress to PocketBase only (no JSON)
"""

import logging
import os
from datetime import UTC, datetime
from typing import Any


logger = logging.getLogger(__name__)

POCKETBASE_ENABLED = os.getenv("POCKETBASE_URL", "") != ""

# PocketBase only accepts these status values
POCKETBASE_STATUS_VALUES = {"pending", "running", "completed", "failed"}


def _map_status_to_pocketbase(status: str) -> str:
    """Map workflow status to PocketBase-compatible status.

    Workflow statuses: pending, running, success, warning, error
    PocketBase statuses: pending, running, completed, failed
    """
    if status in POCKETBASE_STATUS_VALUES:
        return status
    if status in ("success", "warning"):
        return "completed"
    if status == "error":
        return "failed"
    return status


def update_audit_by_record_id(
    record_id: str,
    status: str,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    run_id: str | None = None,
) -> bool:
    """Update audit status by PocketBase record ID.

    This is the preferred method when the record was created by the frontend
    (Firebase-like pattern).

    Args:
        record_id: The PocketBase record ID (created by frontend)
        status: Current status (running, completed, failed)
        result: Full audit result when completed
        error: Error message if failed
        run_id: Inngest run ID for correlation

    Returns:
        True if update succeeded, False otherwise
    """
    if not POCKETBASE_ENABLED:
        logger.debug("PocketBase disabled, skipping progress update")
        return False

    if record_id is None or record_id == "":
        logger.debug("No record_id provided, skipping update")
        return False

    try:
        from services.pocketbase_service import PocketBaseError, get_pocketbase_service

        pb = get_pocketbase_service()
        pb_status = _map_status_to_pocketbase(status)
        pb.update_status(
            record_id=record_id,
            status=pb_status,
            result=result,
            error=error,
            run_id=run_id,
        )
        logger.info("Updated audit record %s to %s", record_id, status)
        return True

    except PocketBaseError:
        logger.exception("PocketBase error updating audit by record_id")
        return False
    except Exception:
        logger.exception("Unexpected error updating audit by record_id")
        return False


def update_audit_progress(
    session_id: str,
    audit_type: str,
    status: str,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    run_id: str | None = None,
    pocketbase_record_id: str | None = None,
) -> str | None:
    """Update or create audit progress in PocketBase.

    If pocketbase_record_id is provided (Firebase-like pattern), uses that
    directly. Otherwise falls back to lookup by session_id/audit_type.

    Args:
        session_id: The audit session ID (groups related audits)
        audit_type: Type of audit (ga4_tracking, meta_pixel, etc.)
        status: Current status (running, completed, failed)
        result: Full audit result when completed
        error: Error message if failed
        run_id: Inngest run ID for correlation
        pocketbase_record_id: Direct record ID if created by frontend

    Returns:
        PocketBase record ID if successful, None otherwise
    """
    if not POCKETBASE_ENABLED:
        logger.debug("PocketBase disabled, skipping progress update")
        return None

    # If we have a record ID from frontend, use it directly
    if pocketbase_record_id is not None and pocketbase_record_id != "":
        success = update_audit_by_record_id(
            record_id=pocketbase_record_id,
            status=status,
            result=result,
            error=error,
            run_id=run_id,
        )
        return pocketbase_record_id if success else None

    # Fallback: lookup or create by session_id/audit_type
    try:
        from services.pocketbase_service import PocketBaseError, get_pocketbase_service

        pb = get_pocketbase_service()
        pb_status = _map_status_to_pocketbase(status)

        # Check for existing record
        existing = pb.get_audit_by_type(session_id, audit_type)

        if existing is not None:
            # If starting a new run (status=running), reset started_at for realtime updates
            reset_started = pb_status == "running"
            record = pb.update_status(
                record_id=existing["id"],
                status=pb_status,
                result=result,
                error=error,
                reset_started=reset_started,
            )
            logger.info("Updated audit %s/%s to %s", session_id, audit_type, pb_status)
            return record["id"]  # type: ignore[no-any-return]

        # Create new record
        record = pb.create_audit_run(
            session_id=session_id,
            audit_type=audit_type,
            run_id=run_id,
        )
        logger.info("Created audit run %s/%s", session_id, audit_type)

        # If status is not "running", update it
        if pb_status != "running":
            record = pb.update_status(
                record_id=record["id"],
                status=pb_status,
                result=result,
                error=error,
            )

        return record["id"]  # type: ignore[no-any-return]

    except PocketBaseError:
        logger.exception("PocketBase error updating audit progress")
        return None
    except Exception:
        logger.exception("Unexpected error updating audit progress")
        return None


def start_audit_run(
    session_id: str,
    audit_type: str,
    run_id: str | None = None,
) -> str | None:
    """Start a new audit run in PocketBase.

    Shortcut for update_audit_progress with status="running".
    """
    return update_audit_progress(
        session_id=session_id,
        audit_type=audit_type,
        status="running",
        run_id=run_id,
    )


def complete_audit_run(
    session_id: str,
    audit_type: str,
    result: dict[str, Any],
) -> str | None:
    """Mark an audit run as completed in PocketBase.

    Shortcut for update_audit_progress with status="completed".
    """
    return update_audit_progress(
        session_id=session_id,
        audit_type=audit_type,
        status="completed",
        result=result,
    )


def fail_audit_run(
    session_id: str,
    audit_type: str,
    error: str,
) -> str | None:
    """Mark an audit run as failed in PocketBase.

    Shortcut for update_audit_progress with status="failed".
    """
    return update_audit_progress(
        session_id=session_id,
        audit_type=audit_type,
        status="failed",
        error=error,
    )


def is_audit_cancelled(pocketbase_record_id: str | None) -> bool:
    """Check if an audit has been cancelled by the user.

    Workflows should call this before each step to support early termination.

    Args:
        pocketbase_record_id: The PocketBase record ID (can be None)

    Returns:
        True if audit was cancelled, False otherwise (also False if no record ID)
    """
    if not POCKETBASE_ENABLED:
        return False

    if pocketbase_record_id is None or pocketbase_record_id == "":
        return False

    try:
        from services.pocketbase_service import get_pocketbase_service

        pb = get_pocketbase_service()
        return pb.is_audit_cancelled(pocketbase_record_id)
    except Exception:
        logger.exception("Error checking audit cancellation status")
        return False


# =============================================================================
# Centralized Utilities (Epic 3.1) - Replace duplicated code in 11 workflows
# =============================================================================


def init_audit_result(
    run_id: str,
    audit_type: str,
    audit_category: str = "config",
) -> dict[str, Any]:
    """Initialize audit result dictionary.

    Replaces the duplicated _init_result() function in each workflow.

    Args:
        run_id: Unique run identifier
        audit_type: Type of audit (ga4_tracking, meta_pixel, etc.)
        audit_category: Category of audit (default: config)

    Returns:
        Initialized result dictionary with standard fields
    """
    return {
        "id": run_id,
        "audit_type": audit_type,
        "audit_category": audit_category,
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "steps": [],
        "issues": [],
        "summary": {},
    }


def save_audit_progress(
    result: dict[str, Any],
    audit_type: str,
    session_id: str | None = None,
    pocketbase_record_id: str | None = None,
) -> None:
    """Save audit progress to PocketBase.

    Replaces the duplicated _save_progress() function in each workflow.
    Only updates PocketBase - no JSON file storage (Epic 3.3).

    Args:
        result: The audit result dictionary
        audit_type: Type of audit (ga4_tracking, meta_pixel, etc.)
        session_id: Session ID for grouping audits
        pocketbase_record_id: Direct PocketBase record ID if available
    """
    pb_session_id = session_id or result.get("id", "")
    status = result.get("status", "running")
    is_final = status in ("success", "warning", "error")

    update_audit_progress(
        session_id=pb_session_id,
        audit_type=audit_type,
        status=status,
        result=result if is_final else None,
        error=result.get("error_message"),
        pocketbase_record_id=pocketbase_record_id,
    )


def get_audit_result(session_id: str, audit_type: str) -> dict[str, Any] | None:
    """Get audit result from PocketBase.

    Used by ads_readiness_audit to aggregate results from other audits.
    Replaces JSON file reading (Epic 3.3).

    Args:
        session_id: Session ID to look up
        audit_type: Type of audit (ga4_tracking, meta_pixel, capi)

    Returns:
        Audit result dict or None if not found/not completed
    """
    if not POCKETBASE_ENABLED:
        logger.debug("PocketBase disabled, cannot get audit result")
        return None

    try:
        from services.pocketbase_service import PocketBaseError, get_pocketbase_service

        pb = get_pocketbase_service()
        record = pb.get_audit_by_type(session_id, audit_type)

        if record is None:
            return None

        # Only return completed audits with results
        if record.get("status") != "completed":
            return None

        return record.get("result")  # type: ignore[no-any-return]

    except PocketBaseError:
        logger.exception("PocketBase error getting audit result")
        return None
    except Exception:
        logger.exception("Unexpected error getting audit result")
        return None
