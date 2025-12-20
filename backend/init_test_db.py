"""Initialize test database with credentials from environment variables."""

import os
import sys

from services.config_service import ConfigService


def main() -> None:
    """Initialize database with test credentials."""
    cs = ConfigService()

    # Configure Shopify (ISCIACUS store)
    shopify_url = os.getenv("SHOPIFY_STORE_URL", "")
    shopify_token = os.getenv("SHOPIFY_ACCESS_TOKEN", "")

    if shopify_url and shopify_token:
        cs.set_value("shopify", "store_url", shopify_url)
        cs.set_value("shopify", "access_token", shopify_token)
        print("✅ Shopify credentials configured")
    else:
        print("⚠️  No Shopify credentials provided")

    # Configure GA4
    ga4_property = os.getenv("GA4_PROPERTY_ID", "")
    ga4_measurement = os.getenv("GA4_MEASUREMENT_ID", "")

    if ga4_property and ga4_measurement:
        cs.set_value("ga4", "property_id", ga4_property)
        cs.set_value("ga4", "measurement_id", ga4_measurement)
        print("✅ GA4 credentials configured")
    else:
        print("⚠️  No GA4 credentials provided")

    print("✅ Database initialized successfully")


if __name__ == "__main__":
    main()
