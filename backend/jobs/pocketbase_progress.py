"""PocketBase progress tracking for Inngest workflows.

This module provides helpers to update audit status in PocketBase
for realtime UI updates via WebSocket subscriptions.
"""

import logging
import os
from typing import Any


logger = logging.getLogger(__name__)

POCKETBASE_ENABLED = os.getenv("POCKETBASE_URL", "") != ""


def update_audit_progress(
    session_id: str,
    audit_type: str,
    status: str,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    run_id: str | None = None,
) -> str | None:
    """Update or create audit progress in PocketBase.

    Args:
        session_id: The audit session ID (groups related audits)
        audit_type: Type of audit (ga4_tracking, meta_pixel, etc.)
        status: Current status (running, completed, failed)
        result: Full audit result when completed
        error: Error message if failed
        run_id: Inngest run ID for correlation

    Returns:
        PocketBase record ID if successful, None otherwise
    """
    if not POCKETBASE_ENABLED:
        logger.debug("PocketBase disabled, skipping progress update")
        return None

    try:
        from services.pocketbase_service import PocketBaseError, get_pocketbase_service

        pb = get_pocketbase_service()

        # Check for existing record
        existing = pb.get_audit_by_type(session_id, audit_type)

        if existing is not None:
            # Update existing record
            record = pb.update_status(
                record_id=existing["id"],
                status=status,
                result=result,
                error=error,
            )
            logger.info("Updated audit %s/%s to %s", session_id, audit_type, status)
            return record["id"]  # type: ignore[no-any-return]

        # Create new record
        record = pb.create_audit_run(
            session_id=session_id,
            audit_type=audit_type,
            run_id=run_id,
        )
        logger.info("Created audit run %s/%s", session_id, audit_type)

        # If status is not "running", update it
        if status != "running":
            record = pb.update_status(
                record_id=record["id"],
                status=status,
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
