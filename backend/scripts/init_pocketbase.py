#!/usr/bin/env python3
"""Initialize PocketBase collections for audit runs.

Compatible with PocketBase 0.23+.
Run this script after starting PocketBase to create the required collections.
Usage: python scripts/init_pocketbase.py
"""

import os
import sys
import time
from typing import Any

import requests


POCKETBASE_URL = os.getenv("POCKETBASE_URL", "http://localhost:8090")
ADMIN_EMAIL = os.getenv("PB_ADMIN_EMAIL", "admin@local.dev")
ADMIN_PASSWORD = os.getenv("PB_ADMIN_PASSWORD", "localdevpass123")
REQUEST_TIMEOUT = 10
HTTP_OK = 200

# Collection schema for audit_runs (PocketBase 0.23+ format)
AUDIT_RUNS_SCHEMA = {
    "name": "audit_runs",
    "type": "base",
    "fields": [
        {"name": "session_id", "type": "text", "required": True},
        {"name": "audit_type", "type": "text", "required": True},
        {
            "name": "status",
            "type": "select",
            "required": True,
            "values": ["pending", "running", "completed", "failed"],
        },
        {"name": "started_at", "type": "date", "required": True},
        {"name": "completed_at", "type": "date", "required": False},
        {"name": "result", "type": "json", "required": False},
        {"name": "error", "type": "text", "required": False},
        {"name": "run_id", "type": "text", "required": False},
    ],
    "indexes": [
        "CREATE INDEX idx_session_id ON audit_runs (session_id)",
        "CREATE INDEX idx_status ON audit_runs (status)",
        "CREATE INDEX idx_audit_type ON audit_runs (audit_type)",
    ],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
}


def wait_for_pocketbase(max_attempts: int = 30) -> bool:
    """Wait for PocketBase to be ready."""
    for i in range(max_attempts):
        try:
            resp = requests.get(f"{POCKETBASE_URL}/api/health", timeout=2)
            if resp.status_code == HTTP_OK:
                print(f"PocketBase is ready at {POCKETBASE_URL}")
                return True
        except requests.exceptions.ConnectionError:
            pass
        print(f"Waiting for PocketBase... ({i + 1}/{max_attempts})")
        time.sleep(1)
    return False


def authenticate() -> str | None:
    """Authenticate as superuser (PocketBase 0.23+ API)."""
    # Use _superusers collection for auth in PocketBase 0.23+
    resp = requests.post(
        f"{POCKETBASE_URL}/api/collections/_superusers/auth-with-password",
        json={"identity": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code == HTTP_OK:
        token: str | None = resp.json().get("token")
        print("Authenticated as superuser")
        return token
    print(f"Failed to authenticate: {resp.text}")
    return None


def collection_exists(token: str, name: str) -> bool:
    """Check if a collection exists."""
    resp = requests.get(
        f"{POCKETBASE_URL}/api/collections/{name}",
        headers={"Authorization": token},
        timeout=REQUEST_TIMEOUT,
    )
    return resp.status_code == HTTP_OK


def create_collection(token: str, schema: dict[str, Any]) -> bool:
    """Create a collection."""
    resp = requests.post(
        f"{POCKETBASE_URL}/api/collections",
        headers={"Authorization": token},
        json=schema,
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code == HTTP_OK:
        print(f"Collection '{schema['name']}' created successfully")
        return True
    print(f"Failed to create collection: {resp.text}")
    return False


def main() -> int:
    """Main entry point."""
    print("=" * 50)
    print("PocketBase Initialization Script (v0.23+)")
    print("=" * 50)

    # Wait for PocketBase
    if not wait_for_pocketbase():
        print("ERROR: PocketBase is not available")
        return 1

    # Authenticate
    token = authenticate()
    if token is None:
        print("ERROR: Failed to authenticate")
        print("Make sure superuser was created via entrypoint.sh")
        return 1

    # Create collections
    if collection_exists(token, "audit_runs"):
        print("Collection 'audit_runs' already exists")
    elif not create_collection(token, AUDIT_RUNS_SCHEMA):
        return 1

    print("=" * 50)
    print("PocketBase initialization complete!")
    print(f"Admin UI: {POCKETBASE_URL}/_/")
    print("=" * 50)
    return 0


if __name__ == "__main__":
    sys.exit(main())
