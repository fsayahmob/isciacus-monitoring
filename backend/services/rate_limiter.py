"""
Rate Limiter Service - SlowAPI configuration for API protection.

Prevents excessive API calls:
- 1 request per minute for heavy analytics endpoints
- 10 requests per minute for light endpoints
"""

from typing import TYPE_CHECKING

from slowapi import Limiter
from slowapi.util import get_remote_address


if TYPE_CHECKING:
    from fastapi import Request


def get_client_ip(request: "Request") -> str:
    """Get client IP address for rate limiting."""
    return get_remote_address(request)


# Rate limiter instance
limiter = Limiter(key_func=get_client_ip)

# Rate limit constants (requests per minute)
# Increased for development - reduce in production if needed
RATE_HEAVY = "30/minute"  # Heavy analytics (Shopify + GA4 fetch)
RATE_MEDIUM = "60/minute"  # Medium endpoints
RATE_LIGHT = "120/minute"  # Light endpoints (filters, status)
