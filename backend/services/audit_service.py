"""
Audit Service - GA4 vs Shopify Data Cross-Check
================================================
Compares tracking data to identify gaps and issues.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any


if TYPE_CHECKING:
    from services.ga4_analytics import GA4AnalyticsService
    from services.shopify_analytics import ShopifyAnalyticsService


class AuditService:
    """Service to audit GA4 tracking against Shopify data."""

    def __init__(
        self,
        shopify_service: ShopifyAnalyticsService,
        ga4_service: GA4AnalyticsService,
    ) -> None:
        from services.paths import get_data_dir

        self.shopify = shopify_service
        self.ga4 = ga4_service
        self._cache_file = get_data_dir() / "audit_cache.json"
        self._last_audit: dict[str, Any] | None = None

    def clear_cache(self) -> None:
        """Clear all caches to ensure fresh data on next audit."""
        self._last_audit = None
        # Also clear underlying service caches
        if hasattr(self.shopify, "clear_all_caches"):
            self.shopify.clear_all_caches()
        if hasattr(self.ga4, "clear_cache"):
            self.ga4.clear_cache()

    def _load_cache(self) -> dict[str, Any] | None:
        """Load cached audit results."""
        if self._cache_file.exists():
            try:
                with self._cache_file.open() as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError):
                return None
        return None

    def _save_cache(self, data: dict[str, Any]) -> None:
        """Save audit results to cache."""
        self._cache_file.parent.mkdir(parents=True, exist_ok=True)
        with self._cache_file.open("w") as f:
            json.dump(data, f, indent=2, default=str)

    def get_status(self) -> dict[str, Any]:
        """Get quick audit status without running full audit."""
        cached = self._load_cache()
        if cached:
            return {
                "has_issues": cached.get("summary", {}).get("errors", 0) > 0
                or cached.get("summary", {}).get("warnings", 0) > 0,
                "last_audit": cached.get("last_audit"),
            }
        return {"has_issues": True, "last_audit": None}

    def run_full_audit(self, period: int = 30) -> dict[str, Any]:
        """Run comprehensive tracking audit."""
        checks: list[dict[str, Any]] = []

        # Check 1: GA4 Connection
        ga4_available = self.ga4.is_available()
        checks.append(
            {
                "name": "Connexion GA4",
                "status": "ok" if ga4_available else "error",
                "message": "GA4 API connectee" if ga4_available else "GA4 non configure",
                "recommendation": (
                    None if ga4_available else "Configurer GA4_PROPERTY_ID et les credentials"
                ),
            }
        )

        # Get all tracking coverage data
        tracking_coverage = self._get_full_tracking_coverage(period, ga4_available)

        # Check 2: Collections Coverage
        coll = tracking_coverage["collections"]
        checks.append(
            {
                "name": "Couverture Collections",
                "status": coll["status"],
                "message": f"{coll['tracked']}/{coll['total']} collections trackees ({coll['rate']:.0f}%)",
                "details": coll["missing"][:10] if coll["missing"] else None,
                "recommendation": (
                    "Ajouter le tracking GA4 sur les pages de collection manquantes"
                    if coll["missing"]
                    else None
                ),
            }
        )

        # Check 3: Products Coverage
        prod = tracking_coverage["products"]
        checks.append(
            {
                "name": "Couverture Produits",
                "status": prod["status"],
                "message": f"{prod['tracked']}/{prod['total']} produits tracks ({prod['rate']:.0f}%)",
                "details": prod["missing"][:10] if prod["missing"] else None,
                "recommendation": (
                    "Verifier le tracking des fiches produit" if prod["missing"] else None
                ),
            }
        )

        # Check 4: Transaction Match Rate
        shopify_orders = self._get_shopify_order_count(period)
        ga4_transactions = self._get_ga4_transaction_count(period) if ga4_available else 0
        match_rate = ga4_transactions / shopify_orders if shopify_orders > 0 else 0

        checks.append(
            {
                "name": "Transactions GA4 vs Shopify",
                "status": (
                    "ok" if match_rate >= 0.9 else "warning" if match_rate >= 0.7 else "error"
                ),
                "message": f"{ga4_transactions} transactions GA4 / {shopify_orders} commandes Shopify ({match_rate * 100:.0f}%)",
                "recommendation": (
                    "Verifier que le tracking purchase est bien configure"
                    if match_rate < 0.9
                    else None
                ),
            }
        )

        # Check 5: E-commerce Events Coverage
        events = tracking_coverage["events"]
        checks.append(
            {
                "name": "Evenements E-commerce",
                "status": events["status"],
                "message": f"{events['tracked']}/{events['total']} evenements configures",
                "details": events["missing"] if events["missing"] else None,
                "recommendation": (
                    "Configurer les evenements GA4 manquants" if events["missing"] else None
                ),
            }
        )

        # Check 6: Ad Blockers Impact Estimate
        estimated_blocked = 1 - match_rate if match_rate < 1 else 0
        checks.append(
            {
                "name": "Impact Ad Blockers estime",
                "status": (
                    "ok"
                    if estimated_blocked < 0.2
                    else "warning" if estimated_blocked < 0.35 else "error"
                ),
                "message": f"~{estimated_blocked * 100:.0f}% des visites potentiellement bloquees",
                "recommendation": (
                    "Considerer le server-side tracking pour contourner les ad blockers"
                    if estimated_blocked >= 0.2
                    else None
                ),
            }
        )

        # Build summary
        summary = {
            "total_checks": len(checks),
            "passed": sum(1 for c in checks if c["status"] == "ok"),
            "warnings": sum(1 for c in checks if c["status"] == "warning"),
            "errors": sum(1 for c in checks if c["status"] == "error"),
        }

        result = {
            "ga4_connected": ga4_available,
            "checks": checks,
            "summary": summary,
            "tracking_coverage": tracking_coverage,
            "collections_coverage": {
                "shopify_total": tracking_coverage["collections"]["total"],
                "ga4_tracked": tracking_coverage["collections"]["tracked"],
                "missing": tracking_coverage["collections"]["missing"],
            },
            "transactions_match": {
                "shopify_orders": shopify_orders,
                "ga4_transactions": ga4_transactions,
                "match_rate": match_rate,
            },
            "last_audit": datetime.now(tz=UTC).isoformat(),
        }

        # Cache results
        self._save_cache(result)
        self._last_audit = result

        return result

    def _get_full_tracking_coverage(self, period: int, ga4_available: bool) -> dict[str, Any]:
        """Get comprehensive tracking coverage for all page types."""
        # Get Shopify data
        shopify_collections = self._get_shopify_collections()
        shopify_products = self._get_shopify_products()

        # Get GA4 data
        ga4_collections: set[str] = set()
        ga4_products: set[str] = set()
        ga4_events: dict[str, bool] = {}

        if ga4_available:
            ga4_collections = self._get_ga4_tracked_collections(period)
            ga4_products = self._get_ga4_tracked_products(period)
            ga4_events = self._get_ga4_events_status(period)

        # Calculate collections coverage
        missing_collections = [c for c in shopify_collections if c.lower() not in ga4_collections]
        coll_rate = (
            len(ga4_collections) / len(shopify_collections) * 100 if shopify_collections else 0
        )

        # Calculate products coverage
        missing_products = [p for p in shopify_products if p.lower() not in ga4_products]
        prod_rate = len(ga4_products) / len(shopify_products) * 100 if shopify_products else 0

        # Calculate events coverage
        required_events = ["page_view", "view_item", "add_to_cart", "begin_checkout", "purchase"]
        tracked_events = [e for e in required_events if ga4_events.get(e, False)]
        missing_events = [e for e in required_events if not ga4_events.get(e, False)]
        events_rate = len(tracked_events) / len(required_events) * 100 if required_events else 0

        def get_status(rate: float) -> str:
            if rate >= 90:
                return "ok"
            if rate >= 70:
                return "warning"
            return "error"

        return {
            "collections": {
                "total": len(shopify_collections),
                "tracked": len(ga4_collections),
                "missing": missing_collections,
                "rate": coll_rate,
                "status": get_status(coll_rate),
                "items": [
                    {
                        "name": c,
                        "tracked": c.lower() in ga4_collections,
                        "type": "collection",
                    }
                    for c in shopify_collections
                ],
            },
            "products": {
                "total": len(shopify_products),
                "tracked": len(ga4_products),
                "missing": missing_products[:20],  # Limit for display
                "rate": prod_rate,
                "status": get_status(prod_rate),
                "sample": [
                    {
                        "name": p,
                        "tracked": p.lower() in ga4_products,
                        "type": "product",
                    }
                    for p in shopify_products[:20]  # Sample for display
                ],
            },
            "events": {
                "total": len(required_events),
                "tracked": len(tracked_events),
                "missing": missing_events,
                "rate": events_rate,
                "status": get_status(events_rate),
                "items": [
                    {
                        "name": e,
                        "tracked": ga4_events.get(e, False),
                        "type": "event",
                        "description": self._get_event_description(e),
                    }
                    for e in required_events
                ],
            },
        }

    def _get_event_description(self, event: str) -> str:
        """Get human-readable description for GA4 events."""
        descriptions = {
            "page_view": "Vue de page",
            "view_item": "Vue fiche produit",
            "add_to_cart": "Ajout au panier",
            "begin_checkout": "Debut checkout",
            "purchase": "Achat confirme",
            "view_item_list": "Vue liste produits",
            "select_item": "Selection produit",
            "remove_from_cart": "Retrait du panier",
        }
        return descriptions.get(event, event)

    def _get_shopify_collections(self) -> list[str]:
        """Get all ACTIVE collection handles from Shopify.

        Only returns collections that have at least 1 product.
        """
        try:
            collections = self.shopify._fetch_all_collections(only_with_products=True)
            return [c.get("handle", "") for c in collections if c.get("handle")]
        except Exception:
            return []

    def _get_shopify_products(self) -> list[str]:
        """Get all PUBLISHED product handles from Shopify.

        Only returns products that are:
        - status: active (filtered in GraphQL query)
        - publishedAt is not None (published to online store)
        """
        try:
            products = self.shopify._fetch_all_products(only_published=True)
            return [p.get("handle", "") for p in products if p.get("handle")]
        except Exception:
            return []

    def _get_ga4_tracked_collections(self, period: int) -> set[str]:
        """Get collections that have GA4 tracking data."""
        try:
            data = self.ga4.get_visitors_by_collection(period)
            return {handle.lower() for handle in data.keys()}
        except Exception:
            return set()

    def _get_ga4_tracked_products(self, period: int) -> set[str]:
        """Get products that have GA4 tracking data."""
        try:
            data = self.ga4.get_visitors_by_product(period)
            return {handle.lower() for handle in data.keys()}
        except Exception:
            return set()

    def _get_ga4_events_status(self, period: int) -> dict[str, bool]:
        """Check which e-commerce events are being tracked in GA4."""
        try:
            funnel = self.ga4.get_funnel_metrics(period)
            if not funnel:
                return {}

            return {
                "page_view": funnel.get("visitors", 0) > 0,
                "view_item": funnel.get("product_views", 0) > 0,
                "add_to_cart": funnel.get("add_to_cart", 0) > 0,
                "begin_checkout": funnel.get("begin_checkout", 0) > 0,
                "purchase": funnel.get("purchase", 0) > 0,
            }
        except Exception:
            return {}

    def _get_shopify_order_count(self, period: int) -> int:
        """Get order count from Shopify for the period."""
        try:
            funnel = self.shopify.fetch_conversion_funnel(period, force_refresh=True)
            return funnel.purchases
        except Exception:
            return 0

    def _get_ga4_transaction_count(self, period: int) -> int:
        """Get transaction count from GA4 for the period."""
        try:
            funnel = self.ga4.get_funnel_metrics(period)
            return funnel.get("purchase", 0) if funnel else 0
        except Exception:
            return 0
