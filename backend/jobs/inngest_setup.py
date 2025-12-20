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

    from .audit_workflow import inngest_client

    # Import dedicated audit workflows
    from .workflows.ads_readiness_audit import ads_readiness_audit_function
    from .workflows.capi_audit import create_capi_audit_function
    from .workflows.customer_data_audit import create_customer_data_audit_workflow
    from .workflows.ga4_audit import ga4_audit_function
    from .workflows.gmc_audit import gmc_audit_function
    from .workflows.gsc_audit import gsc_audit_function
    from .workflows.meta_audit import meta_audit_function
    from .workflows.onboarding import onboarding_audit_function
    from .workflows.theme_audit import theme_audit_function

    if inngest_client is None:
        return False

    # Collect all available functions - dedicated workflows only
    functions = []
    if onboarding_audit_function is not None:
        functions.append(onboarding_audit_function)
    if ga4_audit_function is not None:
        functions.append(ga4_audit_function)
    if gmc_audit_function is not None:
        functions.append(gmc_audit_function)
    if gsc_audit_function is not None:
        functions.append(gsc_audit_function)
    if meta_audit_function is not None:
        functions.append(meta_audit_function)
    if theme_audit_function is not None:
        functions.append(theme_audit_function)
    if ads_readiness_audit_function is not None:
        functions.append(ads_readiness_audit_function)
    if fn := create_capi_audit_function():
        functions.append(fn)
    if fn := create_customer_data_audit_workflow(inngest_client):
        functions.append(fn)

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
        logger.info("Inngest setup complete with %d functions", len(functions))
        return True
    except Exception:
        # Inngest setup failed (e.g., missing signing key in CI)
        logger.warning("Inngest setup skipped - missing configuration")
        return False


async def trigger_onboarding_audit() -> dict[str, str]:
    """
    Trigger the onboarding audit workflow via Inngest.

    Returns run_id for polling status.
    """
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

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


async def trigger_ga4_audit(period: int = 30) -> dict[str, str]:
    """Trigger GA4 tracking audit workflow."""
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/ga4.requested",
                data={"run_id": run_id, "period": period},
            )
        )
        return {"status": "triggered", "run_id": run_id, "audit_type": "ga4_tracking"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_gmc_audit() -> dict[str, str]:
    """Trigger Google Merchant Center audit workflow."""
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/gmc.requested",
                data={"run_id": run_id},
            )
        )
        return {"status": "triggered", "run_id": run_id, "audit_type": "merchant_center"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_gsc_audit() -> dict[str, str]:
    """Trigger Google Search Console audit workflow."""
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/gsc.requested",
                data={"run_id": run_id},
            )
        )
        return {"status": "triggered", "run_id": run_id, "audit_type": "search_console"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_meta_audit() -> dict[str, str]:
    """Trigger Meta Pixel audit workflow."""
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/meta.requested",
                data={"run_id": run_id},
            )
        )
        return {"status": "triggered", "run_id": run_id, "audit_type": "meta_pixel"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_theme_audit() -> dict[str, str]:
    """Trigger Theme Code audit workflow."""
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/theme.requested",
                data={"run_id": run_id},
            )
        )
        return {"status": "triggered", "run_id": run_id, "audit_type": "theme_code"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_ads_readiness_audit() -> dict[str, str]:
    """Trigger Ads Readiness audit workflow."""
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/ads_readiness.requested",
                data={"run_id": run_id},
            )
        )
        return {"status": "triggered", "run_id": run_id, "audit_type": "ads_readiness"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_capi_audit() -> dict[str, str]:
    """Trigger CAPI audit workflow."""
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/capi.requested",
                data={"run_id": run_id},
            )
        )
        return {"status": "triggered", "run_id": run_id, "audit_type": "capi"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_customer_data_audit() -> dict[str, str]:
    """Trigger Customer Data Readiness audit workflow."""
    if not INNGEST_ENABLED:
        return {"status": "error", "message": "Inngest not configured"}

    from .audit_workflow import inngest_client

    if inngest_client is None:
        return {"status": "error", "message": "Inngest client not initialized"}

    run_id = str(uuid4())[:8]

    try:
        await inngest_client.send(
            inngest.Event(
                name="audit/customer-data.trigger",
                data={"run_id": run_id},
            )
        )
        return {"status": "triggered", "run_id": run_id, "audit_type": "customer_data"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def trigger_audit(audit_type: str, period: int = 30) -> dict[str, str]:
    """
    Trigger any audit type via its dedicated Inngest workflow.

    Supported types: ga4_tracking, theme_code, meta_pixel, merchant_center,
    search_console, ads_readiness, capi, customer_data
    """
    trigger_map = {
        "ga4_tracking": lambda: trigger_ga4_audit(period),
        "theme_code": trigger_theme_audit,
        "meta_pixel": trigger_meta_audit,
        "merchant_center": trigger_gmc_audit,
        "search_console": trigger_gsc_audit,
        "ads_readiness": trigger_ads_readiness_audit,
        "capi": trigger_capi_audit,
        "customer_data": trigger_customer_data_audit,
    }

    trigger_func = trigger_map.get(audit_type)
    if trigger_func is None:
        return {"status": "error", "message": f"Unknown audit type: {audit_type}"}

    return await trigger_func()
