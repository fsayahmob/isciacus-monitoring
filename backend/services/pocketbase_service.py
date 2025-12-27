"""PocketBase service for realtime audit state management."""

import logging
import os
from datetime import UTC, datetime
from typing import Any

import requests


logger = logging.getLogger(__name__)

POCKETBASE_URL = os.getenv("POCKETBASE_URL", "http://localhost:8090")
COLLECTION_NAME = "audit_runs"
REQUEST_TIMEOUT = 10


class PocketBaseError(Exception):
    """Error from PocketBase API."""


class PocketBaseService:
    """Service for interacting with PocketBase API."""

    def __init__(self, base_url: str | None = None) -> None:
        """Initialize PocketBase service."""
        self.base_url = base_url or POCKETBASE_URL

    def _handle_response(self, response: requests.Response) -> dict[str, Any]:
        """Handle PocketBase API response."""
        if response.status_code >= 400:
            logger.error("PocketBase error: %s - %s", response.status_code, response.text)
            raise PocketBaseError(f"PocketBase error: {response.status_code}")
        return response.json()  # type: ignore[no-any-return]

    def _get_url(self, path: str) -> str:
        """Build full URL for API path."""
        return f"{self.base_url}{path}"

    def create_audit_run(
        self,
        session_id: str,
        audit_type: str,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a new audit run record with status=running."""
        data = {
            "session_id": session_id,
            "audit_type": audit_type,
            "status": "running",
            "started_at": datetime.now(tz=UTC).isoformat(),
            "run_id": run_id or "",
        }
        response = requests.post(
            self._get_url(f"/api/collections/{COLLECTION_NAME}/records"),
            json=data,
            timeout=REQUEST_TIMEOUT,
        )
        return self._handle_response(response)

    def update_status(
        self,
        record_id: str,
        status: str,
        result: dict[str, Any] | None = None,
        error: str | None = None,
        run_id: str | None = None,
        reset_started: bool = False,
    ) -> dict[str, Any]:
        """Update audit run status.

        Args:
            record_id: The PocketBase record ID
            status: New status (running, completed, failed)
            result: Audit result data (for completed status)
            error: Error message (for failed status)
            run_id: Inngest run ID for correlation
            reset_started: If True, reset started_at to now and clear completed_at/result/error.
                          Used when re-running an audit.
        """
        data: dict[str, Any] = {"status": status}
        if reset_started:
            # Re-running audit: reset timestamps and clear previous results
            data["started_at"] = datetime.now(tz=UTC).isoformat()
            data["completed_at"] = None
            data["result"] = None
            data["error"] = None
        elif status in ("completed", "failed"):
            data["completed_at"] = datetime.now(tz=UTC).isoformat()
        if result is not None:
            data["result"] = result
        if error is not None:
            data["error"] = error
        if run_id is not None:
            data["run_id"] = run_id

        response = requests.patch(
            self._get_url(f"/api/collections/{COLLECTION_NAME}/records/{record_id}"),
            json=data,
            timeout=REQUEST_TIMEOUT,
        )
        return self._handle_response(response)

    def update_audit_run(
        self,
        record_id: str,
        status: str | None = None,
        result: dict[str, Any] | None = None,
        error: str | None = None,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """Update audit run record by ID.

        More flexible than update_status - allows updating any combination
        of fields without requiring status.
        """
        data: dict[str, Any] = {}
        if status is not None:
            data["status"] = status
            if status in ("completed", "failed"):
                data["completed_at"] = datetime.now(tz=UTC).isoformat()
        if result is not None:
            data["result"] = result
        if error is not None:
            data["error"] = error
        if run_id is not None:
            data["run_id"] = run_id

        if not data:
            return {}

        response = requests.patch(
            self._get_url(f"/api/collections/{COLLECTION_NAME}/records/{record_id}"),
            json=data,
            timeout=REQUEST_TIMEOUT,
        )
        return self._handle_response(response)

    def get_session_audits(self, session_id: str) -> list[dict[str, Any]]:
        """Get all audit runs for a session."""
        from urllib.parse import quote

        filter_str = f'session_id="{session_id}"'
        encoded_filter = quote(filter_str, safe="")
        url = self._get_url(
            f"/api/collections/{COLLECTION_NAME}/records"
            f"?filter={encoded_filter}&sort=-started_at"
        )
        response = requests.get(url, timeout=REQUEST_TIMEOUT)
        data = self._handle_response(response)
        return data.get("items", [])  # type: ignore[no-any-return]

    def get_audit_by_type(
        self,
        session_id: str,
        audit_type: str,
    ) -> dict[str, Any] | None:
        """Get a specific audit run by session and type."""
        # Use urllib to properly encode the filter (requests has encoding issues with &&)
        from urllib.parse import quote

        filter_str = f'session_id="{session_id}"&&audit_type="{audit_type}"'
        encoded_filter = quote(filter_str, safe="")
        url = self._get_url(
            f"/api/collections/{COLLECTION_NAME}/records"
            f"?filter={encoded_filter}&sort=-started_at&perPage=1"
        )
        response = requests.get(url, timeout=REQUEST_TIMEOUT)
        data = self._handle_response(response)
        items = data.get("items", [])
        return items[0] if items else None

    def find_or_create_audit_run(
        self,
        session_id: str,
        audit_type: str,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """Find existing running audit or create a new one."""
        existing = self.get_audit_by_type(session_id, audit_type)
        if existing and existing.get("status") == "running":
            return existing
        return self.create_audit_run(session_id, audit_type, run_id)

    def get_audit_status(self, record_id: str) -> str | None:
        """Get the current status of an audit run.

        Used by workflows to check if audit was cancelled before each step.

        Args:
            record_id: The PocketBase record ID

        Returns:
            Status string ('pending', 'running', 'completed', 'failed') or None if not found
        """
        try:
            response = requests.get(
                self._get_url(f"/api/collections/{COLLECTION_NAME}/records/{record_id}"),
                timeout=REQUEST_TIMEOUT,
            )
            if response.status_code == 404:
                return None
            data = self._handle_response(response)
            return data.get("status")  # type: ignore[no-any-return]
        except PocketBaseError:
            return None

    def is_audit_cancelled(self, record_id: str) -> bool:
        """Check if an audit has been cancelled (status = failed).

        Workflows call this before each step to support early termination.

        Args:
            record_id: The PocketBase record ID

        Returns:
            True if audit was cancelled, False otherwise
        """
        status = self.get_audit_status(record_id)
        return status == "failed"

    def cleanup_stale_running_audits(self) -> int:
        """Mark all 'running' audits as 'failed' (called on startup).

        This handles the case where Docker restarts and audits were left
        in 'running' state but are no longer actually running.

        Returns:
            Number of audits marked as failed.
        """
        from urllib.parse import quote

        # Get all running audits
        filter_str = 'status="running"'
        encoded_filter = quote(filter_str, safe="")
        url = self._get_url(
            f"/api/collections/{COLLECTION_NAME}/records" f"?filter={encoded_filter}&perPage=500"
        )
        try:
            response = requests.get(url, timeout=REQUEST_TIMEOUT)
            data = self._handle_response(response)
            running_audits = data.get("items", [])
        except PocketBaseError:
            logger.warning("Failed to fetch running audits for cleanup")
            return 0

        # Mark each as failed
        count = 0
        for audit in running_audits:
            try:
                self.update_status(
                    record_id=audit["id"],
                    status="failed",
                    error="Audit interrupted by server restart",
                )
                count += 1
                logger.info(
                    "Cleaned up stale audit: %s/%s",
                    audit.get("session_id"),
                    audit.get("audit_type"),
                )
            except PocketBaseError:
                logger.warning("Failed to cleanup audit %s", audit["id"])

        if count > 0:
            logger.info("Cleaned up %d stale running audits", count)
        return count

    def delete_all_audit_runs(self) -> int:
        """Delete all audit_runs records from PocketBase.

        Used when clearing the cache to reset all audit states.

        Returns:
            Number of records deleted.
        """
        # Get all audit runs (paginate to handle large datasets)
        url = self._get_url(
            f"/api/collections/{COLLECTION_NAME}/records?perPage=500"
        )
        try:
            response = requests.get(url, timeout=REQUEST_TIMEOUT)
            data = self._handle_response(response)
            all_audits = data.get("items", [])
        except PocketBaseError:
            logger.warning("Failed to fetch audit runs for deletion")
            return 0

        # Delete each record
        count = 0
        for audit in all_audits:
            try:
                delete_url = self._get_url(
                    f"/api/collections/{COLLECTION_NAME}/records/{audit['id']}"
                )
                response = requests.delete(delete_url, timeout=REQUEST_TIMEOUT)
                if response.status_code < 400:
                    count += 1
            except Exception:
                logger.warning("Failed to delete audit %s", audit["id"])

        if count > 0:
            logger.info("Deleted %d audit_runs records from PocketBase", count)
        return count


# Singleton instance
_pocketbase_service: PocketBaseService | None = None


def get_pocketbase_service() -> PocketBaseService:
    """Get or create PocketBase service singleton."""
    global _pocketbase_service
    if _pocketbase_service is None:
        _pocketbase_service = PocketBaseService()
    return _pocketbase_service
