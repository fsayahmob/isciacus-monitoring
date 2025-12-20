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
        sys.stdout.write("✅ Shopify credentials configured\n")
    else:
        sys.stdout.write("⚠️  No Shopify credentials provided\n")

    # Configure GA4
    ga4_property = os.getenv("GA4_PROPERTY_ID", "")
    ga4_measurement = os.getenv("GA4_MEASUREMENT_ID", "")

    if ga4_property and ga4_measurement:
        cs.set_value("ga4", "property_id", ga4_property)
        cs.set_value("ga4", "measurement_id", ga4_measurement)
        sys.stdout.write("✅ GA4 credentials configured\n")
    else:
        sys.stdout.write("⚠️  No GA4 credentials provided\n")

    sys.stdout.write("✅ Database initialized successfully\n")


if __name__ == "__main__":
    main()
