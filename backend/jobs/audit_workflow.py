"""
Audit Workflow - Inngest Job
============================
Durable workflow for GA4 vs Shopify audit.

This job can be triggered:
- Manually via API
- On schedule (daily/weekly)
- On demand from the UI
"""

from __future__ import annotations

import os
from typing import Any

import inngest


# Dev mode by default (no keys required for local dev server)
IS_DEV = os.getenv("INNGEST_DEV", "true").lower() in ("true", "1")
INNGEST_EVENT_KEY = os.getenv("INNGEST_EVENT_KEY", "")
INNGEST_API_BASE_URL = os.getenv("INNGEST_API_BASE_URL", "")
INNGEST_ENABLED = IS_DEV or bool(INNGEST_EVENT_KEY)

inngest_client: inngest.Inngest | None = None

if INNGEST_ENABLED:
    # In dev mode, no event_key needed (uses local dev server)
    client_kwargs: dict[str, Any] = {"app_id": "isciacus-monitoring"}
    if INNGEST_EVENT_KEY:
        client_kwargs["event_key"] = INNGEST_EVENT_KEY
    # In dev mode with Docker, we need to specify both API URLs
    if IS_DEV and INNGEST_API_BASE_URL:
        client_kwargs["api_base_url"] = INNGEST_API_BASE_URL
        client_kwargs["event_api_base_url"] = INNGEST_API_BASE_URL

    inngest_client = inngest.Inngest(**client_kwargs)


def create_audit_function() -> inngest.Function | None:
    """Create the audit function if Inngest is enabled."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="tracking-audit",
        trigger=inngest.TriggerEvent(event="audit/tracking.requested"),
        retries=2,
    )
    async def tracking_audit(
        ctx: inngest.Context,
        step: inngest.Step,
    ) -> dict[str, Any]:
        """
        Run comprehensive tracking audit comparing GA4 vs Shopify.

        Steps:
        1. Fetch Shopify collections
        2. Fetch GA4 tracked collections
        3. Compare and identify gaps
        4. Fetch transaction counts
        5. Generate report
        """
        period = ctx.event.data.get("period", 30)

        # Step 1: Get Shopify collections
        shopify_collections = await step.run(
            "fetch-shopify-collections",
            lambda: _fetch_shopify_collections(),
        )

        # Step 2: Get GA4 tracked collections
        ga4_collections = await step.run(
            "fetch-ga4-collections",
            lambda: _fetch_ga4_collections(period),
        )

        # Step 3: Compare collections
        comparison = await step.run(
            "compare-collections",
            lambda: _compare_collections(shopify_collections, ga4_collections),
        )

        # Step 4: Get transaction counts
        transactions = await step.run(
            "fetch-transaction-counts",
            lambda: _fetch_transaction_counts(period),
        )

        # Step 5: Generate final report
        return await step.run(
            "generate-report",
            lambda: _generate_audit_report(comparison, transactions, period),
        )

    return tracking_audit


def _fetch_shopify_collections() -> list[str]:
    """Fetch all collection handles from Shopify."""
    # Import here to avoid circular imports
    from services.shopify_analytics import ShopifyAnalyticsService

    service = ShopifyAnalyticsService()
    try:
        collections = service.fetch_collections()
        return [c.get("handle", "") for c in collections if c.get("handle")]
    except Exception:
        return []


def _fetch_ga4_collections(period: int) -> list[str]:
    """Fetch collections tracked in GA4."""
    from services.ga4_analytics import GA4AnalyticsService

    service = GA4AnalyticsService()
    try:
        data = service.fetch_collection_pageviews(period)
        return list(data.keys())
    except Exception:
        return []


def _compare_collections(
    shopify: list[str],
    ga4: list[str],
) -> dict[str, Any]:
    """Compare Shopify vs GA4 collections."""
    shopify_set = {s.lower() for s in shopify}
    ga4_set = {g.lower() for g in ga4}

    missing = [s for s in shopify if s.lower() not in ga4_set]
    tracked = [s for s in shopify if s.lower() in ga4_set]

    coverage_rate = len(tracked) / len(shopify) * 100 if shopify else 0

    return {
        "shopify_total": len(shopify),
        "ga4_tracked": len(tracked),
        "missing": missing,
        "coverage_rate": round(coverage_rate, 1),
    }


def _fetch_transaction_counts(period: int) -> dict[str, int]:
    """Fetch transaction counts from both sources."""
    from services.ga4_analytics import GA4AnalyticsService
    from services.shopify_analytics import ShopifyAnalyticsService

    shopify_service = ShopifyAnalyticsService()
    ga4_service = GA4AnalyticsService()

    shopify_orders = 0
    ga4_transactions = 0

    try:
        funnel = shopify_service.fetch_conversion_funnel(period, force_refresh=True)
        shopify_orders = funnel.purchases
    except Exception:
        pass

    try:
        ga4_funnel = ga4_service.fetch_ecommerce_funnel(period)
        ga4_transactions = ga4_funnel.get("purchases", 0) if ga4_funnel else 0
    except Exception:
        pass

    return {
        "shopify_orders": shopify_orders,
        "ga4_transactions": ga4_transactions,
    }


def _generate_audit_report(
    comparison: dict[str, Any],
    transactions: dict[str, int],
    period: int,
) -> dict[str, Any]:
    """Generate the final audit report."""
    shopify_orders = transactions.get("shopify_orders", 0)
    ga4_transactions = transactions.get("ga4_transactions", 0)

    match_rate = ga4_transactions / shopify_orders if shopify_orders > 0 else 0
    coverage_rate = comparison.get("coverage_rate", 0)

    # Determine overall status
    issues = []
    if coverage_rate < 70:
        issues.append("low_collection_coverage")
    if match_rate < 0.7:
        issues.append("low_transaction_match")

    return {
        "period": period,
        "collections_coverage": comparison,
        "transactions_match": {
            "shopify_orders": shopify_orders,
            "ga4_transactions": ga4_transactions,
            "match_rate": round(match_rate * 100, 1),
        },
        "has_issues": len(issues) > 0,
        "issues": issues,
        "status": "error" if len(issues) > 1 else "warning" if len(issues) == 1 else "ok",
    }


# Create the function if enabled
audit_function = create_audit_function()
