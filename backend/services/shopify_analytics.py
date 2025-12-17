"""Shopify Analytics service for customer and conversion metrics."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import requests

from models.analytics import (
    AvailableFilters,
    CollectionCVR,
    ConversionFunnel,
    CustomerStats,
    CVRByEntry,
    CVRStats,
    FilteredSalesAnalysis,
    FunnelStage,
    ProductSales,
)


# Benchmark threshold for collection CVR
CVR_THRESHOLD_OK = 0.5

# Module-level cache for config (lazy loaded)
_config_cache: dict[str, str] | None = None


def _get_shopify_config() -> dict[str, str]:
    """Get Shopify configuration from ConfigService (cached)."""
    global _config_cache
    if _config_cache is None:
        from services.config_service import ConfigService
        config_service = ConfigService()
        _config_cache = config_service.get_shopify_values()
    return _config_cache


def _get_store_url() -> str:
    """Get Shopify store URL from config."""
    return _get_shopify_config().get("store_url", "")


def _get_access_token() -> str:
    """Get Shopify access token from config."""
    return _get_shopify_config().get("access_token", "")


def _get_graphql_url() -> str:
    """Get Shopify GraphQL URL."""
    return f"{_get_store_url()}/admin/api/2024-01/graphql.json"


def _get_headers() -> dict[str, str]:
    """Get headers for Shopify API requests."""
    return {"X-Shopify-Access-Token": _get_access_token(), "Content-Type": "application/json"}


# GraphQL query for customer analytics
CUSTOMERS_QUERY = """
query getCustomers($cursor: String) {
    customers(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
            id
            email
            phone
            emailMarketingConsent {
                marketingState
                consentUpdatedAt
            }
            smsMarketingConsent {
                marketingState
                consentUpdatedAt
            }
        }
    }
}
"""

# GraphQL query for orders (conversion data) - includes channel, tags, collections
ORDERS_QUERY = """
query getOrders($cursor: String, $query: String) {
    orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
            id
            createdAt
            totalPriceSet { shopMoney { amount } }
            landingPageUrl
            channelInformation { channelDefinition { handle } }
            lineItems(first: 50) {
                nodes {
                    quantity
                    product {
                        id
                        title
                        handle
                        tags
                        collections(first: 10) {
                            nodes { id title handle }
                        }
                    }
                }
            }
        }
    }
}
"""

# GraphQL query for abandoned checkouts
ABANDONED_CHECKOUTS_QUERY = """
query getAbandonedCheckouts($cursor: String, $query: String) {
    abandonedCheckouts(first: 250, after: $cursor, query: $query) {
        pageInfo { hasNextPage endCursor }
        nodes {
            id
            createdAt
            abandonedCheckoutUrl
        }
    }
}
"""

# GraphQL query for all products (to get all tags from catalog)
# Only fetches ACTIVE products (status filter)
ALL_PRODUCTS_QUERY = """
query getProducts($cursor: String) {
    products(first: 250, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        nodes {
            id
            handle
            title
            status
            tags
            publishedAt
            collections(first: 10) {
                nodes { id title handle }
            }
        }
    }
}
"""

# GraphQL query to get all collections with their publication status
ALL_COLLECTIONS_QUERY = """
query getCollections($cursor: String) {
    collections(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
            id
            handle
            title
            productsCount {
                count
            }
        }
    }
}
"""


class ShopifyAnalyticsService:
    """Service for fetching analytics data from Shopify."""

    def __init__(self) -> None:
        """Initialize the analytics service."""
        self._customer_cache: CustomerStats | None = None
        # Funnel cache per period (days -> ConversionFunnel)
        self._funnel_cache: dict[int, ConversionFunnel] = {}
        self._funnel_cache_timestamps: dict[int, datetime] = {}
        self._customer_cache_timestamp: datetime | None = None
        self._cache_ttl_seconds = 300  # 5 minutes cache

    def _is_customer_cache_valid(self) -> bool:
        """Check if customer cache is still valid."""
        if self._customer_cache_timestamp is None:
            return False
        elapsed = (datetime.now(tz=UTC) - self._customer_cache_timestamp).total_seconds()
        return elapsed < self._cache_ttl_seconds

    def _is_funnel_cache_valid(self, days: int) -> bool:
        """Check if funnel cache for specific period is still valid."""
        if days not in self._funnel_cache_timestamps:
            return False
        elapsed = (datetime.now(tz=UTC) - self._funnel_cache_timestamps[days]).total_seconds()
        return elapsed < self._cache_ttl_seconds

    def _execute_graphql(
        self, query: str, variables: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Execute a GraphQL query against Shopify."""
        if variables is None:
            variables = {}

        resp = requests.post(
            _get_graphql_url(),
            headers=_get_headers(),
            json={"query": query, "variables": variables},
            timeout=30,
        )
        return resp.json()

    def fetch_customer_stats(self, *, force_refresh: bool = False) -> CustomerStats:
        """Fetch customer statistics from Shopify."""
        if not force_refresh and self._customer_cache and self._is_customer_cache_valid():
            return self._customer_cache

        all_customers: list[dict[str, Any]] = []
        cursor = None

        while True:
            data = self._execute_graphql(CUSTOMERS_QUERY, {"cursor": cursor})

            if "errors" in data:
                break

            customers_data = data.get("data", {}).get("customers", {})
            all_customers.extend(customers_data.get("nodes", []))

            page_info = customers_data.get("pageInfo", {})
            if page_info.get("hasNextPage"):
                cursor = page_info.get("endCursor")
            else:
                break

        # Calculate statistics
        total = len(all_customers)

        def get_marketing_state(customer: dict[str, Any], field: str) -> str | None:
            """Safely get marketing state from customer data."""
            consent = customer.get(field)
            if consent is None:
                return None
            return consent.get("marketingState")

        # Count customers with email address available
        email_available = sum(1 for c in all_customers if c.get("email"))
        email_subscribers = sum(
            1
            for c in all_customers
            if get_marketing_state(c, "emailMarketingConsent") == "SUBSCRIBED"
        )
        phone_count = sum(1 for c in all_customers if c.get("phone"))
        sms_optin = sum(
            1
            for c in all_customers
            if get_marketing_state(c, "smsMarketingConsent") == "SUBSCRIBED"
        )

        stats = CustomerStats(
            total_customers=total,
            # Email: available vs opt-in
            email_available=email_available,
            email_available_rate=round((email_available / total * 100) if total > 0 else 0, 1),
            email_subscribers=email_subscribers,
            email_optin_rate=round(
                (email_subscribers / email_available * 100) if email_available > 0 else 0, 1
            ),
            # Phone
            phone_count=phone_count,
            phone_rate=round((phone_count / total * 100) if total > 0 else 0, 1),
            # SMS: opt-in vs phone available
            sms_optin=sms_optin,
            sms_optin_rate=round((sms_optin / phone_count * 100) if phone_count > 0 else 0, 1),
            last_updated=datetime.now(tz=UTC).isoformat(),
        )

        self._customer_cache = stats
        self._customer_cache_timestamp = datetime.now(tz=UTC)
        return stats

    def _get_order_channel(self, order: dict[str, Any]) -> str:
        """Get the channel handle for an order."""
        channel_info = order.get("channelInformation")
        if channel_info:
            channel_def = channel_info.get("channelDefinition")
            if channel_def:
                return channel_def.get("handle", "unknown")
        return "unknown"

    def _fetch_orders(
        self, days: int = 30, *, ecommerce_only: bool = True
    ) -> list[dict[str, Any]]:
        """Fetch orders for the given period.

        Args:
            days: Number of days to look back
            ecommerce_only: If True, only return web/online orders (not POS)
        """
        from_date = datetime.now(tz=UTC) - timedelta(days=days)
        from_date = from_date.replace(hour=0, minute=0, second=0, microsecond=0)
        query_str = f"created_at:>={from_date.strftime('%Y-%m-%d')}"

        all_orders: list[dict[str, Any]] = []
        cursor = None

        while True:
            data = self._execute_graphql(ORDERS_QUERY, {"cursor": cursor, "query": query_str})

            if "errors" in data:
                break

            orders_data = data.get("data", {}).get("orders", {})
            all_orders.extend(orders_data.get("nodes", []))

            page_info = orders_data.get("pageInfo", {})
            if page_info.get("hasNextPage"):
                cursor = page_info.get("endCursor")
            else:
                break

        # Filter to e-commerce only (web channel, not pos)
        if ecommerce_only:
            all_orders = [
                o for o in all_orders if self._get_order_channel(o) == "web"
            ]

        return all_orders

    def _fetch_abandoned_checkouts(self, days: int = 30) -> list[dict[str, Any]]:
        """Fetch abandoned checkouts for the given period."""
        from_date = datetime.now(tz=UTC) - timedelta(days=days)
        from_date = from_date.replace(hour=0, minute=0, second=0, microsecond=0)
        query_str = f"created_at:>={from_date.strftime('%Y-%m-%d')}"

        all_checkouts: list[dict[str, Any]] = []
        cursor = None

        while True:
            data = self._execute_graphql(
                ABANDONED_CHECKOUTS_QUERY, {"cursor": cursor, "query": query_str}
            )

            if "errors" in data:
                break

            checkouts_data = data.get("data", {}).get("abandonedCheckouts", {})
            all_checkouts.extend(checkouts_data.get("nodes", []))

            page_info = checkouts_data.get("pageInfo", {})
            if page_info.get("hasNextPage"):
                cursor = page_info.get("endCursor")
            else:
                break

        return all_checkouts

    def _categorize_entry_point(self, url: str | None) -> str:
        """Categorize landing page URL into entry point type."""
        if not url:
            return "direct"

        url_lower = url.lower()
        if "/collections/" in url_lower:
            return "collection"
        if "/products/" in url_lower:
            return "product"
        if url_lower.endswith("/") or "/pages/" not in url_lower:
            return "homepage"
        return "other"

    def fetch_conversion_funnel(
        self, days: int = 30, *, force_refresh: bool = False
    ) -> ConversionFunnel:
        """Fetch conversion funnel data.

        IMPORTANT: Only returns REAL data from Shopify.
        - Checkouts and Purchases are real Shopify data
        - Visitors, Product Views, Add to Cart require GA4 integration (marked as None/0)
        """
        # Check cache for this specific period
        if not force_refresh and days in self._funnel_cache and self._is_funnel_cache_valid(days):
            return self._funnel_cache[days]

        orders = self._fetch_orders(days)
        abandoned = self._fetch_abandoned_checkouts(days)

        # REAL DATA from Shopify only
        purchases = len(orders)
        checkouts = purchases + len(abandoned)

        # These metrics require GA4 - NOT available from Shopify
        # Values will be provided by GA4 service in monitoring_app.py

        # Calculate stage rates - only for real data
        def safe_rate(numerator: int | None, denominator: int | None) -> float | None:
            if numerator is None or denominator is None:
                return None
            return round((numerator / denominator * 100) if denominator > 0 else 0, 2)

        # Checkout to Purchase rate - this is real data
        checkout_to_purchase_rate = safe_rate(purchases, checkouts) if checkouts > 0 else 0.0

        stages = [
            FunnelStage(
                name="Visiteurs",
                value=0,
                rate=0.0,
                benchmark_status="requires_ga4",
            ),
            FunnelStage(
                name="Vues Produit",
                value=0,
                rate=0.0,
                benchmark_status="requires_ga4",
            ),
            FunnelStage(
                name="Ajout Panier",
                value=0,
                rate=0.0,
                benchmark_status="requires_ga4",
            ),
            FunnelStage(
                name="Checkout",
                value=checkouts,
                rate=100.0,  # Base rate for Shopify data
                benchmark_status="ok",
            ),
            FunnelStage(
                name="Achat",
                value=purchases,
                rate=checkout_to_purchase_rate or 0.0,
                benchmark_status="ok",
            ),
        ]

        # CVR by entry point - based on landing page (real Shopify data)
        entry_points: dict[str, dict[str, int]] = {}
        for order in orders:
            entry = self._categorize_entry_point(order.get("landingPageUrl"))
            if entry not in entry_points:
                entry_points[entry] = {"orders": 0}
            entry_points[entry]["orders"] += 1

        # Entry point distribution (real data - shows where purchases came from)
        cvr_by_entry: list[CVRByEntry] = []
        entry_labels = {
            "homepage": "Homepage",
            "collection": "Collection",
            "product": "Page Produit",
            "direct": "Direct/Inconnu",
            "other": "Autre",
        }

        total_orders = len(orders)
        for entry, data in entry_points.items():
            # Distribution percentage (real data)
            pct = round((data["orders"] / total_orders * 100) if total_orders > 0 else 0, 2)

            cvr_by_entry.append(
                CVRByEntry(
                    entry_point=entry_labels.get(entry, entry),
                    cvr=pct,  # This is distribution %, not CVR (requires GA4 for real CVR)
                    min_cvr=pct,
                    max_cvr=pct,
                    mean_cvr=pct,
                    benchmark_status="ok",
                )
            )

        # Sort by percentage descending
        cvr_by_entry.sort(key=lambda x: x.cvr, reverse=True)

        # Stats based on entry distribution
        all_pcts = [e.cvr for e in cvr_by_entry if e.cvr > 0]
        cvr_stats = CVRStats(
            mean=round(sum(all_pcts) / len(all_pcts), 2) if all_pcts else 0,
            min=round(min(all_pcts), 2) if all_pcts else 0,
            max=round(max(all_pcts), 2) if all_pcts else 0,
            median=round(sorted(all_pcts)[len(all_pcts) // 2], 2) if all_pcts else 0,
            count=len(all_pcts),
        )

        funnel = ConversionFunnel(
            period=f"{days}d",
            visitors=0,  # Requires GA4
            product_views=0,  # Requires GA4
            add_to_cart=0,  # Requires GA4
            checkout=checkouts,  # REAL Shopify data
            purchases=purchases,  # REAL Shopify data
            stages=stages,
            cvr_by_entry=cvr_by_entry,
            cvr_stats=cvr_stats,
            global_cvr=0,  # Requires GA4 for visitors data
            last_updated=datetime.now(tz=UTC).isoformat(),
        )

        # Cache per period
        self._funnel_cache[days] = funnel
        self._funnel_cache_timestamps[days] = datetime.now(tz=UTC)
        return funnel

    def get_cvr_by_collection(self, days: int = 30) -> list[CollectionCVR]:
        """Get CVR breakdown by collection.

        IMPORTANT: Only returns REAL data from Shopify.
        - Purchases per collection are real Shopify data
        - Visitors per collection require GA4 integration (set to 0)
        - CVR cannot be calculated without GA4 visitors data
        """
        orders = self._fetch_orders(days)

        # Group orders by collection - REAL DATA
        collection_data: dict[str, dict[str, Any]] = {}

        for order in orders:
            line_items = order.get("lineItems", {}).get("nodes", [])
            for item in line_items:
                product = item.get("product")
                if not product:
                    continue

                collections = product.get("collections", {}).get("nodes", [])
                for coll in collections:
                    coll_id = coll.get("id", "")
                    coll_title = coll.get("title", "Sans collection")

                    if coll_id not in collection_data:
                        collection_data[coll_id] = {
                            "name": coll_title,
                            "orders": 0,
                        }
                    collection_data[coll_id]["orders"] += 1

        # Only return REAL data - no estimated visitors or CVR
        result: list[CollectionCVR] = []
        for coll_id, data in collection_data.items():
            result.append(
                CollectionCVR(
                    collection_id=coll_id.split("/")[-1] if "/" in coll_id else coll_id,
                    collection_name=data["name"],
                    visitors=0,  # Requires GA4 - NOT estimated
                    purchases=data["orders"],  # REAL Shopify data
                    cvr=0,  # Cannot calculate without GA4 visitors
                    benchmark_status="requires_ga4",
                )
            )

        # Sort by purchases descending (real data)
        result.sort(key=lambda x: x.purchases, reverse=True)
        return result

    def _fetch_all_products(self, *, only_published: bool = True) -> list[dict[str, Any]]:
        """Fetch all products from catalog (for tags/collections).

        Args:
            only_published: If True, only return products that are published
                           (have publishedAt set). Query already filters by status:active.
        """
        all_products: list[dict[str, Any]] = []
        cursor = None

        while True:
            data = self._execute_graphql(ALL_PRODUCTS_QUERY, {"cursor": cursor})

            if "errors" in data:
                break

            products_data = data.get("data", {}).get("products", {})
            all_products.extend(products_data.get("nodes", []))

            page_info = products_data.get("pageInfo", {})
            if page_info.get("hasNextPage"):
                cursor = page_info.get("endCursor")
            else:
                break

        # Filter to only published products if requested
        if only_published:
            all_products = [
                p for p in all_products
                if p.get("publishedAt") is not None
            ]

        return all_products

    def _fetch_all_collections(self, *, only_with_products: bool = True) -> list[dict[str, Any]]:
        """Fetch all collections from Shopify.

        Args:
            only_with_products: If True, only return collections that have at least 1 product.
        """
        all_collections: list[dict[str, Any]] = []
        cursor = None

        while True:
            data = self._execute_graphql(ALL_COLLECTIONS_QUERY, {"cursor": cursor})

            if "errors" in data:
                break

            collections_data = data.get("data", {}).get("collections", {})
            all_collections.extend(collections_data.get("nodes", []))

            page_info = collections_data.get("pageInfo", {})
            if page_info.get("hasNextPage"):
                cursor = page_info.get("endCursor")
            else:
                break

        # Filter to only collections with products if requested
        if only_with_products:
            all_collections = [
                c for c in all_collections
                if c.get("productsCount", {}).get("count", 0) > 0
            ]

        return all_collections

    def get_all_catalog_filters(self) -> AvailableFilters:
        """Get ALL tags and collections from the entire catalog.

        REAL DATA from Shopify - lists all tags and collections
        from the entire product catalog (not just sold products).
        """
        products = self._fetch_all_products()

        all_tags: set[str] = set()
        all_collections: dict[str, dict[str, str]] = {}

        for product in products:
            # Collect tags
            tags = product.get("tags", [])
            if tags:
                all_tags.update(tags)

            # Collect collections
            collections = product.get("collections", {}).get("nodes", [])
            for coll in collections:
                coll_id = coll.get("id", "")
                if coll_id and coll_id not in all_collections:
                    all_collections[coll_id] = {
                        "id": coll_id.split("/")[-1] if "/" in coll_id else coll_id,
                        "name": coll.get("title", "Sans nom"),
                        "handle": coll.get("handle", ""),
                    }

        return AvailableFilters(
            tags=sorted(all_tags),
            collections=sorted(all_collections.values(), key=lambda x: x["name"]),
        )

    def get_available_filters(
        self, days: int = 30, *, include_all_catalog: bool = False
    ) -> AvailableFilters:
        """Get all available tags and collections.

        Args:
            days: Period for sold products filters
            include_all_catalog: If True, include ALL tags from catalog,
                               not just from sold products

        REAL DATA from Shopify.
        """
        if include_all_catalog:
            return self.get_all_catalog_filters()

        orders = self._fetch_orders(days)

        all_tags: set[str] = set()
        all_collections: dict[str, dict[str, str]] = {}

        for order in orders:
            line_items = order.get("lineItems", {}).get("nodes", [])
            for item in line_items:
                product = item.get("product")
                if not product:
                    continue

                # Collect tags
                tags = product.get("tags", [])
                if tags:
                    all_tags.update(tags)

                # Collect collections
                collections = product.get("collections", {}).get("nodes", [])
                for coll in collections:
                    coll_id = coll.get("id", "")
                    if coll_id and coll_id not in all_collections:
                        all_collections[coll_id] = {
                            "id": coll_id.split("/")[-1] if "/" in coll_id else coll_id,
                            "name": coll.get("title", "Sans nom"),
                            "handle": coll.get("handle", ""),
                        }

        return AvailableFilters(
            tags=sorted(all_tags),
            collections=sorted(all_collections.values(), key=lambda x: x["name"]),
        )

    def get_sales_by_tag(
        self, tag: str, days: int = 30
    ) -> FilteredSalesAnalysis:
        """Get sales analysis for a specific tag.

        REAL DATA from Shopify - only products with the specified tag.
        """
        orders = self._fetch_orders(days)

        # Track products and orders with this tag
        products_data: dict[str, dict[str, Any]] = {}
        order_ids_with_tag: set[str] = set()
        total_quantity = 0

        for order in orders:
            order_id = order.get("id", "")
            line_items = order.get("lineItems", {}).get("nodes", [])

            for item in line_items:
                product = item.get("product")
                if not product:
                    continue

                tags = product.get("tags", [])
                if tag not in tags:
                    continue

                # Product has this tag
                product_id = product.get("id", "")
                quantity = item.get("quantity", 1)
                total_quantity += quantity
                order_ids_with_tag.add(order_id)

                if product_id not in products_data:
                    products_data[product_id] = {
                        "title": product.get("title", "Sans titre"),
                        "handle": product.get("handle", ""),
                        "quantity": 0,
                        "orders": set(),
                    }

                products_data[product_id]["quantity"] += quantity
                products_data[product_id]["orders"].add(order_id)

        # Build product list
        products = [
            ProductSales(
                product_id=pid.split("/")[-1] if "/" in pid else pid,
                product_title=data["title"],
                product_handle=data["handle"],
                quantity_sold=data["quantity"],
                order_count=len(data["orders"]),
            )
            for pid, data in products_data.items()
        ]

        # Sort by quantity descending
        products.sort(key=lambda x: x.quantity_sold, reverse=True)

        return FilteredSalesAnalysis(
            filter_type="tag",
            filter_value=tag,
            period=f"{days}d",
            total_quantity=total_quantity,
            order_count=sum(p.order_count for p in products),
            unique_orders=len(order_ids_with_tag),
            products=products,
            last_updated=datetime.now(tz=UTC).isoformat(),
        )

    def get_sales_by_collection(
        self, collection_id: str, days: int = 30
    ) -> FilteredSalesAnalysis:
        """Get sales analysis for a specific collection.

        REAL DATA from Shopify - only products in the specified collection.
        collection_id can be the full GID or just the numeric ID.
        """
        orders = self._fetch_orders(days)

        # Track products and orders in this collection
        products_data: dict[str, dict[str, Any]] = {}
        order_ids_in_collection: set[str] = set()
        total_quantity = 0
        collection_name = ""

        for order in orders:
            order_id = order.get("id", "")
            line_items = order.get("lineItems", {}).get("nodes", [])

            for item in line_items:
                product = item.get("product")
                if not product:
                    continue

                collections = product.get("collections", {}).get("nodes", [])
                matching_collection = None

                for coll in collections:
                    coll_gid = coll.get("id", "")
                    coll_short_id = coll_gid.split("/")[-1] if "/" in coll_gid else coll_gid

                    if collection_id in (coll_gid, coll_short_id):
                        matching_collection = coll
                        break

                if not matching_collection:
                    continue

                # Product is in this collection
                if not collection_name:
                    collection_name = matching_collection.get("title", collection_id)

                product_id = product.get("id", "")
                quantity = item.get("quantity", 1)
                total_quantity += quantity
                order_ids_in_collection.add(order_id)

                if product_id not in products_data:
                    products_data[product_id] = {
                        "title": product.get("title", "Sans titre"),
                        "handle": product.get("handle", ""),
                        "quantity": 0,
                        "orders": set(),
                    }

                products_data[product_id]["quantity"] += quantity
                products_data[product_id]["orders"].add(order_id)

        # Build product list
        products = [
            ProductSales(
                product_id=pid.split("/")[-1] if "/" in pid else pid,
                product_title=data["title"],
                product_handle=data["handle"],
                quantity_sold=data["quantity"],
                order_count=len(data["orders"]),
            )
            for pid, data in products_data.items()
        ]

        # Sort by quantity descending
        products.sort(key=lambda x: x.quantity_sold, reverse=True)

        return FilteredSalesAnalysis(
            filter_type="collection",
            filter_value=collection_name or collection_id,
            period=f"{days}d",
            total_quantity=total_quantity,
            order_count=sum(p.order_count for p in products),
            unique_orders=len(order_ids_in_collection),
            products=products,
            last_updated=datetime.now(tz=UTC).isoformat(),
        )


# Global instance
shopify_analytics = ShopifyAnalyticsService()
