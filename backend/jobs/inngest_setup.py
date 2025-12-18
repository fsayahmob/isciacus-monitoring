"""
Inngest Setup - Local Dev Mode (No Cloud Keys Required)
=======================================================
Uses Inngest Dev Server locally - no API keys needed.

To run the dev server:
  npx inngest-cli@latest dev

Dashboard available at: http://localhost:8288
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING
from uuid import uuid4

import inngest
from inngest.fast_api import serve

logger = logging.getLogger(__name__)


if TYPE_CHECKING:
    from fastapi import FastAPI


# Dev mode by default (no keys required)
# Set INNGEST_DEV=false in production with proper keys
IS_DEV = os.getenv("INNGEST_DEV", "true").lower() in ("true", "1")
INNGEST_SIGNING_KEY = os.getenv("INNGEST_SIGNING_KEY", "")

# Always enabled in dev mode, or when signing key is set in production
INNGEST_ENABLED = IS_DEV or bool(INNGEST_SIGNING_KEY)


def setup_inngest(app: FastAPI) -> bool:
    """
    Setup Inngest routes if configured.

    Returns True if Inngest was set up, False otherwise.
    """
    if not INNGEST_ENABLED:
        return False

    from .audit_workflow import audit_function, inngest_client
    from .workflows.onboarding import onboarding_audit_function

    if inngest_client is None:
        return False

    # Collect all available functions
    functions = []
    if audit_function is not None:
        functions.append(audit_function)
    if onboarding_audit_function is not None:
        functions.append(onboarding_audit_function)

    if not functions:
        return False

    # Only add signing key if provided (required in production)
    serve_kwargs: dict[str, str] = {}
    if INNGEST_SIGNING_KEY:
        serve_kwargs["signing_key"] = INNGEST_SIGNING_KEY

    try:
        serve(
            app,
            inngest_client,
            functions,
            serve_path="/api/inngest",
            **serve_kwargs,
        )
        return True
    except Exception:
        # Inngest setup failed (e.g., missing signing key in CI)
        logger.warning("Inngest setup skipped - missing configuration")
        return False


async def trigger_audit_job(period: int = 30) -> dict[str, str]:
    """
    Trigger the GA4 tracking audit workflow.

    Returns job info or error message.
    """
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/tracking.requested",
                data={"period": period},
            )
        )
        return {"status": "triggered", "message": "Audit job started"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_onboarding_audit() -> dict[str, str]:
    """
    Trigger the onboarding audit workflow via Inngest.

    Returns run_id for polling status.
    """
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .workflows.onboarding import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/onboarding.requested",
                data={"run_id": run_id},
            )
        )
        return {"status": "triggered", "run_id": run_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}
