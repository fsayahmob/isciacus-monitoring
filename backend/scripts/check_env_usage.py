#!/usr/bin/env python3
"""
Check for forbidden os.getenv usage in service files.

External service configurations (Shopify, GA4, Meta, etc.) should ONLY be
accessed via ConfigService which reads from SQLite. Direct os.getenv calls
for these variables are forbidden.

Allowed exceptions:
- config_service.py: This is the source of truth, it CAN use os.getenv as fallback
- monitoring_app.py: TVA_RATE only (not a service config)
- jobs/: Inngest config only
- secure_store.py: Runtime environment injection
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


# Forbidden patterns - service variables that should use ConfigService
FORBIDDEN_ENV_VARS = [
    # Shopify
    r"SHOPIFY_STORE_URL",
    r"SHOPIFY_ACCESS_TOKEN",
    r"SHOPIFY_API_KEY",
    r"SHOPIFY_API_SECRET",
    # GA4
    r"GA4_PROPERTY_ID",
    r"GA4_MEASUREMENT_ID",
    r"GA4_CREDENTIALS",
    r"GOOGLE_APPLICATION_CREDENTIALS",
    # Meta
    r"META_PIXEL_ID",
    r"META_ACCESS_TOKEN",
    r"META_AD_ACCOUNT_ID",
    r"META_BUSINESS_ID",
    # Search Console
    r"GOOGLE_SEARCH_CONSOLE",
    r"SEARCH_CONSOLE_SITE_URL",
    # Merchant Center
    r"GOOGLE_MERCHANT_ID",
    r"MERCHANT_CENTER_ID",
    # Google Ads
    r"GOOGLE_ADS_CUSTOMER_ID",
    r"GOOGLE_ADS_DEVELOPER_TOKEN",
    # Twilio
    r"TWILIO_ACCOUNT_SID",
    r"TWILIO_AUTH_TOKEN",
    r"TWILIO_PHONE_NUMBER",
    # Anthropic
    r"ANTHROPIC_API_KEY",
    # SerpAPI
    r"SERPAPI_KEY",
]

# Files allowed to use os.getenv for these vars (with specific allowances)
ALLOWED_FILES = {
    "config_service.py": None,  # None = all vars allowed (source of truth)
    "secure_store.py": None,  # Runtime injection
}

# Build regex pattern
FORBIDDEN_PATTERN = re.compile(
    r'os\.getenv\s*\(\s*["\'](' + "|".join(FORBIDDEN_ENV_VARS) + r')["\']',
    re.IGNORECASE,
)


def check_file(file_path: Path) -> list[tuple[int, str, str]]:
    """Check a file for forbidden os.getenv usage.

    Returns list of (line_number, line_content, matched_var).
    """
    violations = []

    # Skip allowed files
    if file_path.name in ALLOWED_FILES:
        return violations

    try:
        content = file_path.read_text()
        lines = content.split("\n")

        for i, line in enumerate(lines, 1):
            # Skip comments
            stripped = line.strip()
            if stripped.startswith("#"):
                continue

            match = FORBIDDEN_PATTERN.search(line)
            if match:
                violations.append((i, line.strip(), match.group(1)))

    except Exception as e:
        print(f"Error reading {file_path}: {e}", file=sys.stderr)

    return violations


def main() -> int:
    """Main entry point."""
    backend_dir = Path(__file__).parent.parent
    services_dir = backend_dir / "services"

    all_violations: list[tuple[Path, int, str, str]] = []

    # Check all Python files in services/
    for py_file in services_dir.glob("**/*.py"):
        violations = check_file(py_file)
        for line_num, line_content, var_name in violations:
            all_violations.append((py_file, line_num, line_content, var_name))

    # Also check monitoring_app.py (but skip TVA_RATE)
    monitoring_app = backend_dir / "monitoring_app.py"
    if monitoring_app.exists():
        violations = check_file(monitoring_app)
        # Filter out TVA_RATE which is allowed
        for line_num, line_content, var_name in violations:
            if "TVA_RATE" not in line_content:
                all_violations.append((monitoring_app, line_num, line_content, var_name))

    if all_violations:
        print("=" * 70)
        print("FORBIDDEN os.getenv USAGE DETECTED")
        print("=" * 70)
        print()
        print("Service configurations must be accessed via ConfigService,")
        print("not directly via os.getenv(). This ensures config is read from")
        print("SQLite (set via Settings page) with .env as fallback only.")
        print()
        print("Violations found:")
        print("-" * 70)

        for file_path, line_num, line_content, var_name in all_violations:
            rel_path = file_path.relative_to(backend_dir)
            print(f"  {rel_path}:{line_num}")
            print(f"    Variable: {var_name}")
            print(f"    Line: {line_content[:60]}...")
            print()

        print("-" * 70)
        print(f"Total: {len(all_violations)} violation(s)")
        print()
        print("FIX: Use ConfigService methods instead:")
        print("  - config_service.get_shopify_values()")
        print("  - config_service.get_ga4_values()")
        print("  - config_service.get_meta_values()")
        print("  - config_service.get_search_console_values()")
        print("  - config_service.get_merchant_center_values()")
        print()
        return 1

    print("No forbidden os.getenv usage found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
