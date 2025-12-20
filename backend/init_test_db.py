"""Initialize test database with credentials from environment variables."""

import os
import sys

from services.config_service import ConfigService


def main() -> None:
    """Initialize database with test credentials."""
    cs = ConfigService()

    # Collect all configuration values
    updates = {}

    # Configure Shopify (ISCIACUS store)
    shopify_url = os.getenv("SHOPIFY_STORE_URL", "")
    shopify_token = os.getenv("SHOPIFY_ACCESS_TOKEN", "")

    if shopify_url and shopify_token:
        updates["SHOPIFY_STORE_URL"] = shopify_url
        updates["SHOPIFY_ACCESS_TOKEN"] = shopify_token
        sys.stdout.write("✅ Shopify credentials found\n")
    else:
        sys.stdout.write("⚠️  No Shopify credentials provided\n")

    # Configure GA4
    ga4_property = os.getenv("GA4_PROPERTY_ID", "")
    ga4_measurement = os.getenv("GA4_MEASUREMENT_ID", "")

    if ga4_property and ga4_measurement:
        updates["GA4_PROPERTY_ID"] = ga4_property
        updates["GA4_MEASUREMENT_ID"] = ga4_measurement
        sys.stdout.write("✅ GA4 credentials found\n")
    else:
        sys.stdout.write("⚠️  No GA4 credentials provided\n")

    # Update configuration in SQLite
    if updates:
        result = cs.update_config(updates)
        if result.get("success"):
            sys.stdout.write("✅ Database initialized successfully\n")
        else:
            sys.stdout.write(f"❌ Failed to update config: {result.get('message')}\n")
            sys.exit(1)
    else:
        sys.stdout.write("⚠️  No credentials to configure\n")


if __name__ == "__main__":
    main()
