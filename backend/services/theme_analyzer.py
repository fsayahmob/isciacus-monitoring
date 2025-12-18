"""
Theme Analyzer Service - Analyze and fix Shopify theme tracking code
====================================================================
Reads Shopify theme files to analyze GA4/Meta Pixel tracking implementation
and can apply automatic corrections.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any

import requests


logger = logging.getLogger(__name__)


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


def clear_theme_cache() -> None:
    """Clear the module-level config cache."""
    global _config_cache
    _config_cache = None


def _get_store_url() -> str:
    """Get Shopify store URL from config."""
    return _get_shopify_config().get("store_url", "")


def _get_access_token() -> str:
    """Get Shopify access token from config."""
    return _get_shopify_config().get("access_token", "")


class TrackingType(Enum):
    """Types of tracking code."""

    GA4 = "ga4"
    META_PIXEL = "meta_pixel"
    GTM = "gtm"


class EventType(Enum):
    """Standard e-commerce events."""

    # GA4 events
    PAGE_VIEW = "page_view"
    VIEW_ITEM = "view_item"
    VIEW_ITEM_LIST = "view_item_list"
    ADD_TO_CART = "add_to_cart"
    REMOVE_FROM_CART = "remove_from_cart"
    BEGIN_CHECKOUT = "begin_checkout"
    PURCHASE = "purchase"

    # Meta events (mapped to GA4 equivalents)
    META_PAGE_VIEW = "PageView"
    META_VIEW_CONTENT = "ViewContent"
    META_ADD_TO_CART = "AddToCart"
    META_INITIATE_CHECKOUT = "InitiateCheckout"
    META_PURCHASE = "Purchase"


@dataclass
class TrackingIssue:
    """Represents a tracking issue found in the theme."""

    issue_type: str  # missing_event, wrong_params, syntax_error
    tracking_type: TrackingType
    event: str
    file_path: str
    line_number: int | None
    description: str
    severity: str  # error, warning, info
    fix_available: bool
    fix_code: str | None = None


@dataclass
class TrackingAnalysis:
    """Result of theme tracking analysis."""

    ga4_configured: bool = False
    ga4_measurement_id: str | None = None
    ga4_via_shopify_native: bool = False  # GA4 configured via Shopify Online Store > Preferences
    meta_pixel_configured: bool = False
    meta_pixel_id: str | None = None
    gtm_configured: bool = False
    gtm_container_id: str | None = None

    ga4_events_found: list[str] = field(default_factory=list)
    meta_events_found: list[str] = field(default_factory=list)

    issues: list[TrackingIssue] = field(default_factory=list)
    files_analyzed: list[str] = field(default_factory=list)

    analyzed_at: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())


class ThemeAnalyzerService:
    """Service to analyze and fix Shopify theme tracking code."""

    # Files to analyze for tracking code
    TRACKING_FILES = [
        "layout/theme.liquid",
        "snippets/head-tag.liquid",
        "snippets/google-tag.liquid",
        "snippets/gtag.liquid",
        "snippets/meta-pixel.liquid",
        "snippets/facebook-pixel.liquid",
        "templates/collection.liquid",
        "templates/product.liquid",
        "templates/cart.liquid",
        "templates/checkout.liquid",
        "sections/main-product.liquid",
        "sections/main-collection.liquid",
        "sections/cart-template.liquid",
        "assets/theme.js",
        "assets/global.js",
    ]

    # GA4 patterns
    GA4_CONFIG_PATTERN = re.compile(r"gtag\s*\(\s*['\"]config['\"]\s*,\s*['\"]([^'\"]+)['\"]")
    GA4_EVENT_PATTERN = re.compile(r"gtag\s*\(\s*['\"]event['\"]\s*,\s*['\"]([^'\"]+)['\"]")
    # Direct GA4 Measurement ID pattern (G-XXXXXXXXX format)
    GA4_MEASUREMENT_ID_PATTERN = re.compile(r"['\"]?(G-[A-Z0-9]{8,12})['\"]?")

    # Meta Pixel patterns
    META_INIT_PATTERN = re.compile(r"fbq\s*\(\s*['\"]init['\"]\s*,\s*['\"](\d+)['\"]")
    META_TRACK_PATTERN = re.compile(r"fbq\s*\(\s*['\"]track['\"]\s*,\s*['\"]([^'\"]+)['\"]")

    # GTM patterns
    GTM_PATTERN = re.compile(r"GTM-([A-Z0-9]+)")
    DATALAYER_PUSH_PATTERN = re.compile(
        r"dataLayer\.push\s*\(\s*\{[^}]*['\"]event['\"]\s*:\s*['\"]([^'\"]+)['\"]"
    )

    # Required events for complete e-commerce tracking
    REQUIRED_GA4_EVENTS = [
        "page_view",
        "view_item",
        "view_item_list",
        "add_to_cart",
        "begin_checkout",
        "purchase",
    ]

    REQUIRED_META_EVENTS = [
        "PageView",
        "ViewContent",
        "AddToCart",
        "InitiateCheckout",
        "Purchase",
    ]

    def __init__(self) -> None:
        """Initialize the theme analyzer."""
        self._cache_file = Path(__file__).parent.parent / "data" / "theme_analysis_cache.json"
        self._themes_cache: dict[str, Any] = {}
        self._graphql_url = f"{_get_store_url()}/admin/api/2024-01/graphql.json"

    def clear_cache(self) -> None:
        """Clear all caches to ensure fresh data on next audit."""
        clear_theme_cache()  # Module-level config cache
        self._themes_cache.clear()
        # Re-initialize graphql_url in case config changed
        self._graphql_url = f"{_get_store_url()}/admin/api/2024-01/graphql.json"

    def _get_rest_headers(self) -> dict[str, str]:
        """Get headers for REST API calls."""
        return {
            "X-Shopify-Access-Token": _get_access_token(),
            "Content-Type": "application/json",
        }

    def _check_shopify_native_ga4(self) -> tuple[bool, str | None]:
        """Check if GA4 is configured via Shopify's native integration.

        Shopify allows configuring GA4 via:
        - Online Store > Preferences > Google Analytics
        - Google & YouTube Sales Channel app

        This checks via WebPixel and shop settings.

        Returns:
            Tuple of (is_configured, measurement_id)
        """
        # Try to get shop settings via GraphQL (includes some analytics settings)
        query = """
        query {
            shop {
                id
                name
                primaryDomain {
                    url
                }
            }
            webPixels(first: 10) {
                edges {
                    node {
                        id
                        settings
                    }
                }
            }
        }
        """
        try:
            resp = requests.post(
                self._graphql_url,
                headers=self._get_rest_headers(),
                json={"query": query},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()

            # Check web pixels for GA4 configuration
            web_pixels = data.get("data", {}).get("webPixels", {}).get("edges", [])
            for edge in web_pixels:
                settings = edge.get("node", {}).get("settings", "")
                if settings and "G-" in settings:
                    # Extract measurement ID from settings
                    import json as json_module

                    try:
                        settings_data = json_module.loads(settings)
                        measurement_id = settings_data.get("measurementId") or settings_data.get(
                            "ga4_id"
                        )
                        if measurement_id and measurement_id.startswith("G-"):
                            return True, measurement_id
                    except (json.JSONDecodeError, TypeError):
                        # Try regex extraction
                        ga4_match = re.search(r"G-[A-Z0-9]+", settings)
                        if ga4_match:
                            return True, ga4_match.group(0)

            return False, None
        except Exception as e:
            logger.warning("Error checking Shopify native GA4: %s", e)
            return False, None

    def _check_content_for_header_ga4(self, theme_id: str) -> tuple[bool, str | None]:
        """Check if theme.liquid uses content_for_header which includes native GA4.

        When GA4 is configured in Shopify's Online Store > Preferences,
        the tracking code is automatically injected via {{ content_for_header }}.

        Returns:
            Tuple of (has_content_for_header, None)
        """
        content = self._get_theme_asset(theme_id, "layout/theme.liquid")
        if content and "{{ content_for_header }}" in content:
            return True, None
        return False, None

    def _get_active_theme_id(self) -> str | None:
        """Get the ID of the currently active theme."""
        try:
            url = f"{_get_store_url()}/admin/api/2024-01/themes.json"
            resp = requests.get(url, headers=self._get_rest_headers(), timeout=30)
            resp.raise_for_status()
            themes = resp.json().get("themes", [])

            for theme in themes:
                if theme.get("role") == "main":
                    return str(theme.get("id"))
            return None
        except Exception as e:
            logger.warning("Error getting active theme: %s", e)
            return None

    def _get_theme_asset(self, theme_id: str, asset_key: str) -> str | None:
        """Get content of a specific theme asset."""
        try:
            url = f"{_get_store_url()}/admin/api/2024-01/themes/{theme_id}/assets.json"
            params = {"asset[key]": asset_key}
            resp = requests.get(url, headers=self._get_rest_headers(), params=params, timeout=30)

            if resp.status_code == 404:
                return None

            resp.raise_for_status()
            asset = resp.json().get("asset", {})
            return asset.get("value")
        except Exception:
            return None

    def _update_theme_asset(self, theme_id: str, asset_key: str, content: str) -> bool:
        """Update a theme asset with new content."""
        try:
            url = f"{_get_store_url()}/admin/api/2024-01/themes/{theme_id}/assets.json"
            data = {
                "asset": {
                    "key": asset_key,
                    "value": content,
                }
            }
            resp = requests.put(url, headers=self._get_rest_headers(), json=data, timeout=30)
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.warning("Error updating theme asset: %s", e)
            return False

    def _list_theme_assets(self, theme_id: str) -> list[str]:
        """List all assets in a theme."""
        try:
            url = f"{_get_store_url()}/admin/api/2024-01/themes/{theme_id}/assets.json"
            resp = requests.get(url, headers=self._get_rest_headers(), timeout=30)
            resp.raise_for_status()
            assets = resp.json().get("assets", [])
            return [asset.get("key", "") for asset in assets]
        except Exception:
            return []

    def analyze_theme(self, *, force_refresh: bool = False) -> TrackingAnalysis:
        """Analyze the active theme for tracking code issues."""
        # Check cache
        if not force_refresh and self._cache_file.exists():
            try:
                with self._cache_file.open() as f:
                    cached = json.load(f)
                    # Return cached if less than 1 hour old
                    cached_time = datetime.fromisoformat(cached.get("analyzed_at", "2000-01-01"))
                    if (datetime.now(tz=UTC) - cached_time).total_seconds() < 3600:
                        return self._dict_to_analysis(cached)
            except (json.JSONDecodeError, OSError, ValueError):
                pass

        analysis = TrackingAnalysis()

        # First, check for Shopify native GA4 configuration (via Online Store > Preferences)
        native_ga4, native_ga4_id = self._check_shopify_native_ga4()
        if native_ga4:
            analysis.ga4_configured = True
            analysis.ga4_via_shopify_native = True
            if native_ga4_id:
                analysis.ga4_measurement_id = native_ga4_id

        theme_id = self._get_active_theme_id()
        if not theme_id:
            analysis.issues.append(
                TrackingIssue(
                    issue_type="error",
                    tracking_type=TrackingType.GA4,
                    event="",
                    file_path="",
                    line_number=None,
                    description="Impossible d'accéder au thème Shopify actif",
                    severity="error",
                    fix_available=False,
                )
            )
            return analysis

        # Check if theme has content_for_header (required for native GA4 to work)
        has_content_for_header, _ = self._check_content_for_header_ga4(theme_id)

        # Get list of all assets to find tracking-related files
        all_assets = self._list_theme_assets(theme_id)

        # Scan ALL liquid and JS files in the theme to find tracking code
        # This ensures we detect GA4/Meta regardless of where it was added
        files_to_check = [
            asset for asset in all_assets if asset.endswith((".liquid", ".js"))
        ]

        for file_path in files_to_check:
            content = self._get_theme_asset(theme_id, file_path)
            if content:
                analysis.files_analyzed.append(file_path)
                self._analyze_file_content(content, file_path, analysis)

        # Check for missing required events
        self._check_missing_events(analysis)

        # Save to cache
        self._save_analysis_cache(analysis)

        return analysis

    def _analyze_file_content(
        self, content: str, file_path: str, analysis: TrackingAnalysis
    ) -> None:
        """Analyze a file's content for tracking code."""
        lines = content.split("\n")

        # Check for GA4 configuration via gtag('config', 'G-...')
        ga4_configs = self.GA4_CONFIG_PATTERN.findall(content)
        for config in ga4_configs:
            if config.startswith("G-"):
                analysis.ga4_configured = True
                analysis.ga4_measurement_id = config

        # Also check for GA4 Measurement ID directly (G-XXXXXXXXX pattern)
        # This catches cases where the ID is in a variable, include, or non-standard format
        if not analysis.ga4_configured:
            ga4_ids = self.GA4_MEASUREMENT_ID_PATTERN.findall(content)
            for ga4_id in ga4_ids:
                if ga4_id.startswith("G-"):
                    analysis.ga4_configured = True
                    analysis.ga4_measurement_id = ga4_id
                    break

        # Check for GA4 events
        ga4_events = self.GA4_EVENT_PATTERN.findall(content)
        for event in ga4_events:
            if event not in analysis.ga4_events_found:
                analysis.ga4_events_found.append(event)

        # Check for Meta Pixel
        meta_inits = self.META_INIT_PATTERN.findall(content)
        for pixel_id in meta_inits:
            analysis.meta_pixel_configured = True
            analysis.meta_pixel_id = pixel_id

        # Check for Meta events
        meta_events = self.META_TRACK_PATTERN.findall(content)
        for event in meta_events:
            if event not in analysis.meta_events_found:
                analysis.meta_events_found.append(event)

        # Check for GTM
        gtm_ids = self.GTM_PATTERN.findall(content)
        for gtm_id in gtm_ids:
            analysis.gtm_configured = True
            analysis.gtm_container_id = f"GTM-{gtm_id}"

        # Check for dataLayer events (GTM)
        datalayer_events = self.DATALAYER_PUSH_PATTERN.findall(content)
        for event in datalayer_events:
            # Map dataLayer events to GA4 events
            if event not in analysis.ga4_events_found:
                analysis.ga4_events_found.append(event)

        # Look for common issues
        self._check_file_issues(content, file_path, lines, analysis)

    def _check_file_issues(
        self, content: str, file_path: str, lines: list[str], analysis: TrackingAnalysis
    ) -> None:
        """Check for common tracking issues in a file."""
        # Check for hardcoded measurement IDs that should be in settings
        if "G-" in content and "{{ settings." not in content and file_path.endswith(".liquid"):
            # Find line number
            for i, line in enumerate(lines):
                if "G-" in line and "settings." not in line:
                    analysis.issues.append(
                        TrackingIssue(
                            issue_type="hardcoded_id",
                            tracking_type=TrackingType.GA4,
                            event="",
                            file_path=file_path,
                            line_number=i + 1,
                            description="ID GA4 en dur dans le code au lieu d'utiliser les settings du thème",
                            severity="warning",
                            fix_available=False,
                        )
                    )
                    break

        # Check for purchase event without required parameters
        purchase_pattern = re.compile(
            r"gtag\s*\(\s*['\"]event['\"]\s*,\s*['\"]purchase['\"]([^)]+)\)", re.DOTALL
        )
        purchase_matches = purchase_pattern.findall(content)
        for match in purchase_matches:
            if "transaction_id" not in match:
                analysis.issues.append(
                    TrackingIssue(
                        issue_type="missing_params",
                        tracking_type=TrackingType.GA4,
                        event="purchase",
                        file_path=file_path,
                        line_number=None,
                        description="L'événement purchase manque le paramètre transaction_id obligatoire",
                        severity="error",
                        fix_available=True,
                        fix_code=self._generate_purchase_fix(),
                    )
                )

        # Check for view_item without item details
        view_item_pattern = re.compile(
            r"gtag\s*\(\s*['\"]event['\"]\s*,\s*['\"]view_item['\"]([^)]+)\)", re.DOTALL
        )
        view_item_matches = view_item_pattern.findall(content)
        for match in view_item_matches:
            if "items" not in match:
                analysis.issues.append(
                    TrackingIssue(
                        issue_type="missing_params",
                        tracking_type=TrackingType.GA4,
                        event="view_item",
                        file_path=file_path,
                        line_number=None,
                        description="L'événement view_item manque le paramètre items obligatoire",
                        severity="error",
                        fix_available=True,
                        fix_code=self._generate_view_item_fix(),
                    )
                )

    def _check_missing_events(self, analysis: TrackingAnalysis) -> None:
        """Check for missing required events."""
        # GA4 missing events - only report if GA4 is NOT configured via Shopify native
        # When GA4 is configured via Shopify native (Online Store > Preferences),
        # basic events are handled automatically via Web Pixels
        for event in self.REQUIRED_GA4_EVENTS:
            if event not in analysis.ga4_events_found:
                # If GA4 is configured via Shopify native, reduce severity
                # Shopify's native integration handles page_view and purchase automatically
                if analysis.ga4_via_shopify_native:
                    # Native Shopify handles page_view and basic checkout events
                    if event in ["page_view", "purchase", "begin_checkout"]:
                        # Don't report these as missing - Shopify handles them
                        continue
                    # For other events, report as info/warning since basic tracking works
                    severity = "info"
                    description = (
                        f"Événement GA4 '{event}' non trouvé dans le thème "
                        f"(GA4 configuré via Shopify, tracking de base actif)"
                    )
                else:
                    severity = "error" if event in ["purchase", "add_to_cart"] else "warning"
                    description = f"Événement GA4 '{event}' non trouvé dans le thème"

                analysis.issues.append(
                    TrackingIssue(
                        issue_type="missing_event",
                        tracking_type=TrackingType.GA4,
                        event=event,
                        file_path="",
                        line_number=None,
                        description=description,
                        severity=severity,
                        fix_available=True,
                        fix_code=self._generate_event_code(event, TrackingType.GA4),
                    )
                )

        # Meta missing events (only if Meta Pixel is configured)
        if analysis.meta_pixel_configured:
            for event in self.REQUIRED_META_EVENTS:
                if event not in analysis.meta_events_found:
                    analysis.issues.append(
                        TrackingIssue(
                            issue_type="missing_event",
                            tracking_type=TrackingType.META_PIXEL,
                            event=event,
                            file_path="",
                            line_number=None,
                            description=f"Événement Meta Pixel '{event}' non trouvé dans le thème",
                            severity="error" if event == "Purchase" else "warning",
                            fix_available=True,
                            fix_code=self._generate_event_code(event, TrackingType.META_PIXEL),
                        )
                    )

    def _generate_event_code(self, event: str, tracking_type: TrackingType) -> str:
        """Generate the code to add a missing event."""
        if tracking_type == TrackingType.GA4:
            return self._generate_ga4_event_code(event)
        if tracking_type == TrackingType.META_PIXEL:
            return self._generate_meta_event_code(event)
        return ""

    def _generate_ga4_event_code(self, event: str) -> str:
        """Generate GA4 event code."""
        templates = {
            "page_view": """gtag('event', 'page_view', {
  page_title: document.title,
  page_location: window.location.href
});""",
            "view_item": """gtag('event', 'view_item', {
  currency: '{{ shop.currency }}',
  value: {{ product.price | money_without_currency | remove: ',' }},
  items: [{
    item_id: '{{ product.id }}',
    item_name: '{{ product.title | escape }}',
    price: {{ product.price | money_without_currency | remove: ',' }},
    quantity: 1
  }]
});""",
            "view_item_list": """gtag('event', 'view_item_list', {
  item_list_id: '{{ collection.handle }}',
  item_list_name: '{{ collection.title | escape }}',
  items: [
    {% for product in collection.products limit: 20 %}
    {
      item_id: '{{ product.id }}',
      item_name: '{{ product.title | escape }}',
      price: {{ product.price | money_without_currency | remove: ',' }},
      index: {{ forloop.index }}
    }{% unless forloop.last %},{% endunless %}
    {% endfor %}
  ]
});""",
            "add_to_cart": """gtag('event', 'add_to_cart', {
  currency: '{{ shop.currency }}',
  value: productPrice,
  items: [{
    item_id: productId,
    item_name: productTitle,
    price: productPrice,
    quantity: quantity
  }]
});""",
            "begin_checkout": """gtag('event', 'begin_checkout', {
  currency: '{{ cart.currency.iso_code }}',
  value: {{ cart.total_price | money_without_currency | remove: ',' }},
  items: [
    {% for item in cart.items %}
    {
      item_id: '{{ item.product_id }}',
      item_name: '{{ item.product.title | escape }}',
      price: {{ item.price | money_without_currency | remove: ',' }},
      quantity: {{ item.quantity }}
    }{% unless forloop.last %},{% endunless %}
    {% endfor %}
  ]
});""",
            "purchase": """gtag('event', 'purchase', {
  transaction_id: '{{ order.order_number }}',
  currency: '{{ order.currency }}',
  value: {{ order.total_price | money_without_currency | remove: ',' }},
  tax: {{ order.tax_price | money_without_currency | remove: ',' }},
  shipping: {{ order.shipping_price | money_without_currency | remove: ',' }},
  items: [
    {% for line_item in order.line_items %}
    {
      item_id: '{{ line_item.product_id }}',
      item_name: '{{ line_item.title | escape }}',
      price: {{ line_item.price | money_without_currency | remove: ',' }},
      quantity: {{ line_item.quantity }}
    }{% unless forloop.last %},{% endunless %}
    {% endfor %}
  ]
});""",
        }
        return templates.get(event, f"// TODO: Implement {event} event")

    def _generate_meta_event_code(self, event: str) -> str:
        """Generate Meta Pixel event code."""
        templates = {
            "PageView": "fbq('track', 'PageView');",
            "ViewContent": """fbq('track', 'ViewContent', {
  content_ids: ['{{ product.id }}'],
  content_name: '{{ product.title | escape }}',
  content_type: 'product',
  value: {{ product.price | money_without_currency | remove: ',' }},
  currency: '{{ shop.currency }}'
});""",
            "AddToCart": """fbq('track', 'AddToCart', {
  content_ids: [productId],
  content_name: productTitle,
  content_type: 'product',
  value: productPrice,
  currency: '{{ shop.currency }}'
});""",
            "InitiateCheckout": """fbq('track', 'InitiateCheckout', {
  content_ids: [{% for item in cart.items %}'{{ item.product_id }}'{% unless forloop.last %},{% endunless %}{% endfor %}],
  content_type: 'product',
  num_items: {{ cart.item_count }},
  value: {{ cart.total_price | money_without_currency | remove: ',' }},
  currency: '{{ cart.currency.iso_code }}'
});""",
            "Purchase": """fbq('track', 'Purchase', {
  content_ids: [{% for line_item in order.line_items %}'{{ line_item.product_id }}'{% unless forloop.last %},{% endunless %}{% endfor %}],
  content_type: 'product',
  value: {{ order.total_price | money_without_currency | remove: ',' }},
  currency: '{{ order.currency }}'
});""",
        }
        return templates.get(event, f"// TODO: Implement {event} event")

    def _generate_purchase_fix(self) -> str:
        """Generate fix for purchase event missing transaction_id."""
        return self._generate_ga4_event_code("purchase")

    def _generate_view_item_fix(self) -> str:
        """Generate fix for view_item event missing items."""
        return self._generate_ga4_event_code("view_item")

    def apply_fix(self, issue: TrackingIssue) -> bool:
        """Apply a fix for a specific tracking issue.

        Note: This is a complex operation that modifies theme files.
        Currently supports adding missing events to theme.liquid.
        """
        if not issue.fix_available or not issue.fix_code:
            return False

        theme_id = self._get_active_theme_id()
        if not theme_id:
            return False

        # Determine target file based on event type
        target_file = self._get_target_file_for_event(issue.event)

        content = self._get_theme_asset(theme_id, target_file)
        if not content:
            return False

        # Insert the fix code at appropriate location
        new_content = self._insert_tracking_code(content, issue.fix_code, target_file)

        if new_content == content:
            return False  # No change made

        return self._update_theme_asset(theme_id, target_file, new_content)

    def _get_target_file_for_event(self, event: str) -> str:
        """Get the appropriate file to insert tracking code for an event."""
        event_file_map = {
            "page_view": "layout/theme.liquid",
            "view_item": "sections/main-product.liquid",
            "view_item_list": "sections/main-collection.liquid",
            "add_to_cart": "assets/theme.js",
            "begin_checkout": "templates/cart.liquid",
            "purchase": "layout/checkout.liquid",
            "PageView": "layout/theme.liquid",
            "ViewContent": "sections/main-product.liquid",
            "AddToCart": "assets/theme.js",
            "InitiateCheckout": "templates/cart.liquid",
            "Purchase": "layout/checkout.liquid",
        }
        return event_file_map.get(event, "layout/theme.liquid")

    def _insert_tracking_code(self, content: str, code: str, file_path: str) -> str:
        """Insert tracking code at the appropriate location in the file."""
        # For liquid files, insert before </head> or at end of file
        if file_path.endswith(".liquid"):
            if "</head>" in content:
                script_block = f"<script>\n{code}\n</script>\n"
                return content.replace("</head>", f"{script_block}</head>")
            if "</body>" in content:
                script_block = f"<script>\n{code}\n</script>\n"
                return content.replace("</body>", f"{script_block}</body>")

        # For JS files, append at end
        if file_path.endswith(".js"):
            return f"{content}\n\n// Auto-added tracking code\n{code}\n"

        return content

    def _save_analysis_cache(self, analysis: TrackingAnalysis) -> None:
        """Save analysis to cache."""
        self._cache_file.parent.mkdir(parents=True, exist_ok=True)
        with self._cache_file.open("w") as f:
            json.dump(self._analysis_to_dict(analysis), f, indent=2)

    def _analysis_to_dict(self, analysis: TrackingAnalysis) -> dict[str, Any]:
        """Convert analysis to dict for JSON serialization."""
        return {
            "ga4_configured": analysis.ga4_configured,
            "ga4_measurement_id": analysis.ga4_measurement_id,
            "ga4_via_shopify_native": analysis.ga4_via_shopify_native,
            "meta_pixel_configured": analysis.meta_pixel_configured,
            "meta_pixel_id": analysis.meta_pixel_id,
            "gtm_configured": analysis.gtm_configured,
            "gtm_container_id": analysis.gtm_container_id,
            "ga4_events_found": analysis.ga4_events_found,
            "meta_events_found": analysis.meta_events_found,
            "issues": [
                {
                    "issue_type": i.issue_type,
                    "tracking_type": i.tracking_type.value,
                    "event": i.event,
                    "file_path": i.file_path,
                    "line_number": i.line_number,
                    "description": i.description,
                    "severity": i.severity,
                    "fix_available": i.fix_available,
                    "fix_code": i.fix_code,
                }
                for i in analysis.issues
            ],
            "files_analyzed": analysis.files_analyzed,
            "analyzed_at": analysis.analyzed_at,
        }

    def _dict_to_analysis(self, data: dict[str, Any]) -> TrackingAnalysis:
        """Convert dict back to TrackingAnalysis."""
        analysis = TrackingAnalysis(
            ga4_configured=data.get("ga4_configured", False),
            ga4_measurement_id=data.get("ga4_measurement_id"),
            ga4_via_shopify_native=data.get("ga4_via_shopify_native", False),
            meta_pixel_configured=data.get("meta_pixel_configured", False),
            meta_pixel_id=data.get("meta_pixel_id"),
            gtm_configured=data.get("gtm_configured", False),
            gtm_container_id=data.get("gtm_container_id"),
            ga4_events_found=data.get("ga4_events_found", []),
            meta_events_found=data.get("meta_events_found", []),
            files_analyzed=data.get("files_analyzed", []),
            analyzed_at=data.get("analyzed_at", ""),
        )

        for issue_data in data.get("issues", []):
            analysis.issues.append(
                TrackingIssue(
                    issue_type=issue_data.get("issue_type", ""),
                    tracking_type=TrackingType(issue_data.get("tracking_type", "ga4")),
                    event=issue_data.get("event", ""),
                    file_path=issue_data.get("file_path", ""),
                    line_number=issue_data.get("line_number"),
                    description=issue_data.get("description", ""),
                    severity=issue_data.get("severity", "warning"),
                    fix_available=issue_data.get("fix_available", False),
                    fix_code=issue_data.get("fix_code"),
                )
            )

        return analysis

    def get_analysis_summary(self) -> dict[str, Any]:
        """Get a summary of the current theme analysis."""
        analysis = self.analyze_theme()

        return {
            "tracking_configured": {
                "ga4": analysis.ga4_configured,
                "ga4_id": analysis.ga4_measurement_id,
                "ga4_via_shopify_native": analysis.ga4_via_shopify_native,
                "meta_pixel": analysis.meta_pixel_configured,
                "meta_pixel_id": analysis.meta_pixel_id,
                "gtm": analysis.gtm_configured,
                "gtm_id": analysis.gtm_container_id,
            },
            "events_coverage": {
                "ga4": {
                    "found": analysis.ga4_events_found,
                    "required": self.REQUIRED_GA4_EVENTS,
                    "missing": [
                        e for e in self.REQUIRED_GA4_EVENTS if e not in analysis.ga4_events_found
                    ],
                },
                "meta": {
                    "found": analysis.meta_events_found,
                    "required": self.REQUIRED_META_EVENTS if analysis.meta_pixel_configured else [],
                    "missing": (
                        [
                            e
                            for e in self.REQUIRED_META_EVENTS
                            if e not in analysis.meta_events_found
                        ]
                        if analysis.meta_pixel_configured
                        else []
                    ),
                },
            },
            "issues": {
                "total": len(analysis.issues),
                "errors": len([i for i in analysis.issues if i.severity == "error"]),
                "warnings": len([i for i in analysis.issues if i.severity == "warning"]),
                "fixable": len([i for i in analysis.issues if i.fix_available]),
            },
            "files_analyzed": analysis.files_analyzed,
            "analyzed_at": analysis.analyzed_at,
        }
