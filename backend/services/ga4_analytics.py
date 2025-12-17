"""Google Analytics 4 service for funnel metrics."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Any

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest
from google.oauth2 import service_account


if TYPE_CHECKING:
    from services.config_service import ConfigService

logger = logging.getLogger(__name__)

# Default path for service account in Docker container
DEFAULT_SERVICE_ACCOUNT_PATH = "/app/credentials/google-service-account.json"


class GA4AnalyticsService:
    """Service for fetching analytics data from Google Analytics 4."""

    def __init__(self, config_service: ConfigService | None = None) -> None:
        """Initialize the GA4 analytics service."""
        self._client: BetaAnalyticsDataClient | None = None
        self._config_service = config_service
        self._property_id: str | None = None
        self._credentials_path: str | None = None
        self._cache: dict[str, Any] = {}
        self._cache_timestamps: dict[str, datetime] = {}
        self._cache_ttl_seconds = 300  # 5 minutes cache

    def clear_cache(self) -> None:
        """Clear all caches to ensure fresh data on next audit."""
        self._cache.clear()
        self._cache_timestamps.clear()
        # Force reload of config on next call
        self._property_id = None
        self._credentials_path = None
        self._client = None

    def _load_config(self) -> None:
        """Load configuration from ConfigService (SQLite)."""
        if self._config_service is None:
            # Lazy import to avoid circular imports
            from services.config_service import ConfigService

            self._config_service = ConfigService()

        # Get GA4 config from SQLite
        ga4_config = self._config_service.get_ga4_values()
        self._property_id = ga4_config.get("property_id", "")
        self._credentials_path = ga4_config.get("credentials_path") or DEFAULT_SERVICE_ACCOUNT_PATH

    def _get_client(self) -> BetaAnalyticsDataClient | None:
        """Get or create the GA4 client."""
        if self._client is not None:
            return self._client

        # Load config from SQLite if not already loaded
        if self._property_id is None:
            self._load_config()

        # Try to load service account credentials
        key_path = self._credentials_path or DEFAULT_SERVICE_ACCOUNT_PATH

        if not Path(key_path).exists():
            logger.warning("GA4: Service account key not found at %s", key_path)
            return None

        if not self._property_id:
            logger.warning("GA4: Property ID not configured in settings")
            return None

        try:
            credentials = service_account.Credentials.from_service_account_file(
                key_path,
                scopes=["https://www.googleapis.com/auth/analytics.readonly"],
            )
            self._client = BetaAnalyticsDataClient(credentials=credentials)
            logger.info("GA4: Client initialized for property %s", self._property_id)
            return self._client
        except Exception as e:
            logger.exception("GA4: Failed to initialize client: %s", e)
            return None

    def _is_cache_valid(self, key: str) -> bool:
        """Check if cache for specific key is still valid."""
        if key not in self._cache_timestamps:
            return False
        elapsed = (datetime.now(tz=UTC) - self._cache_timestamps[key]).total_seconds()
        return elapsed < self._cache_ttl_seconds

    def is_available(self) -> bool:
        """Check if GA4 integration is available."""
        return self._get_client() is not None

    def get_funnel_metrics(
        self, days: int = 30, *, force_refresh: bool = False
    ) -> dict[str, int | None]:
        """Fetch complete funnel metrics from GA4.

        Returns:
            Dictionary with:
            - visitors: Total unique users (sessions)
            - product_views: view_item events count
            - add_to_cart: add_to_cart events count
            - begin_checkout: begin_checkout events count
            - purchase: purchase events count (GA4 tracked only)

        Note: All metrics come from GA4 for funnel consistency.
        Shopify data should be used separately for business metrics (CA, orders).
        """
        cache_key = f"funnel_{days}"
        if not force_refresh and self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        client = self._get_client()
        if client is None:
            return {
                "visitors": None,
                "product_views": None,
                "add_to_cart": None,
                "begin_checkout": None,
                "purchase": None,
                "error": "GA4 not available",
            }

        end_date = datetime.now(tz=UTC).date()
        start_date = end_date - timedelta(days=days)

        try:
            # Get total sessions (visitors)
            visitors_request = RunReportRequest(
                property=f"properties/{self._property_id}",
                date_ranges=[
                    DateRange(
                        start_date=start_date.strftime("%Y-%m-%d"),
                        end_date=end_date.strftime("%Y-%m-%d"),
                    )
                ],
                metrics=[Metric(name="sessions")],
            )
            visitors_response = client.run_report(visitors_request)
            visitors = 0
            if visitors_response.rows:
                visitors = int(visitors_response.rows[0].metric_values[0].value)

            # Get all e-commerce events
            events_request = RunReportRequest(
                property=f"properties/{self._property_id}",
                date_ranges=[
                    DateRange(
                        start_date=start_date.strftime("%Y-%m-%d"),
                        end_date=end_date.strftime("%Y-%m-%d"),
                    )
                ],
                dimensions=[Dimension(name="eventName")],
                metrics=[Metric(name="eventCount")],
            )
            events_response = client.run_report(events_request)

            product_views = 0
            add_to_cart = 0
            begin_checkout = 0
            purchase = 0

            for row in events_response.rows:
                event_name = row.dimension_values[0].value
                event_count = int(row.metric_values[0].value)

                if event_name == "view_item":
                    product_views = event_count
                elif event_name == "add_to_cart":
                    add_to_cart = event_count
                elif event_name == "begin_checkout":
                    begin_checkout = event_count
                elif event_name == "purchase":
                    purchase = event_count

            result = {
                "visitors": visitors,
                "product_views": product_views,
                "add_to_cart": add_to_cart,
                "begin_checkout": begin_checkout,
                "purchase": purchase,
                "error": None,
            }

            # Cache result
            self._cache[cache_key] = result
            self._cache_timestamps[cache_key] = datetime.now(tz=UTC)

            return result

        except Exception as e:
            logger.exception("GA4: Error fetching funnel metrics: %s", e)
            return {
                "visitors": None,
                "product_views": None,
                "add_to_cart": None,
                "error": str(e),
            }

    def get_visitors_by_collection(
        self, days: int = 30, *, force_refresh: bool = False
    ) -> dict[str, int]:
        """Get visitor count by collection page.

        Returns a mapping of collection handle to visitor count.
        """
        cache_key = f"visitors_collection_{days}"
        if not force_refresh and self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        client = self._get_client()
        if client is None:
            return {}

        end_date = datetime.now(tz=UTC).date()
        start_date = end_date - timedelta(days=days)

        try:
            # Get page views by path, filtering for collection pages
            request = RunReportRequest(
                property=f"properties/{self._property_id}",
                date_ranges=[
                    DateRange(
                        start_date=start_date.strftime("%Y-%m-%d"),
                        end_date=end_date.strftime("%Y-%m-%d"),
                    )
                ],
                dimensions=[Dimension(name="pagePath")],
                metrics=[Metric(name="sessions")],
            )
            response = client.run_report(request)

            collection_visitors: dict[str, int] = {}

            for row in response.rows:
                page_path = row.dimension_values[0].value
                sessions = int(row.metric_values[0].value)

                # Extract collection from path like /collections/handle
                if "/collections/" in page_path:
                    parts = page_path.split("/collections/")
                    if len(parts) > 1:
                        handle = parts[1].split("/")[0].split("?")[0]
                        if handle:
                            collection_visitors[handle] = (
                                collection_visitors.get(handle, 0) + sessions
                            )

            # Cache result
            self._cache[cache_key] = collection_visitors
            self._cache_timestamps[cache_key] = datetime.now(tz=UTC)

            return collection_visitors

        except Exception as e:
            logger.exception("GA4: Error fetching collection visitors: %s", e)
            return {}

    def get_visitors_by_product(
        self, days: int = 30, *, force_refresh: bool = False
    ) -> dict[str, int]:
        """Get visitor count by product page.

        Returns a mapping of product handle to visitor count.
        """
        cache_key = f"visitors_product_{days}"
        if not force_refresh and self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        client = self._get_client()
        if client is None:
            return {}

        end_date = datetime.now(tz=UTC).date()
        start_date = end_date - timedelta(days=days)

        try:
            request = RunReportRequest(
                property=f"properties/{self._property_id}",
                date_ranges=[
                    DateRange(
                        start_date=start_date.strftime("%Y-%m-%d"),
                        end_date=end_date.strftime("%Y-%m-%d"),
                    )
                ],
                dimensions=[Dimension(name="pagePath")],
                metrics=[Metric(name="sessions")],
            )
            response = client.run_report(request)

            product_visitors: dict[str, int] = {}

            for row in response.rows:
                page_path = row.dimension_values[0].value
                sessions = int(row.metric_values[0].value)

                # Extract product from path like /products/handle
                if "/products/" in page_path:
                    parts = page_path.split("/products/")
                    if len(parts) > 1:
                        handle = parts[1].split("/")[0].split("?")[0]
                        if handle:
                            product_visitors[handle] = product_visitors.get(handle, 0) + sessions

            # Cache result
            self._cache[cache_key] = product_visitors
            self._cache_timestamps[cache_key] = datetime.now(tz=UTC)

            return product_visitors

        except Exception as e:
            logger.exception("GA4: Error fetching product visitors: %s", e)
            return {}


# Global instance
ga4_analytics = GA4AnalyticsService()
