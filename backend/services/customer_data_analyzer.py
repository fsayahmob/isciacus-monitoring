"""
Customer Data Analysis Service.

Analyzes Shopify customer data to determine Ads readiness:
- Minimum customer count (1000+ for Meta Lookalikes)
- Data history length (90+ days for meaningful patterns)
- Data quality (emails, order values)
"""

from datetime import datetime
from typing import Any

import requests

from services.benchmarks import benchmarks_service
from services.config_service import ConfigService


class CustomerDataAnalyzer:
    """Analyzes customer data for Ads campaign readiness."""

    def __init__(self) -> None:
        """Initialize with Shopify credentials from ConfigService."""
        config = ConfigService()
        shopify_config = config.get_shopify_values()
        store_url = shopify_config.get("store_url") or ""
        # Remove https:// or http:// prefix if present (URL is built with prefix in methods)
        self.shop_url = store_url.replace("https://", "").replace("http://", "").rstrip("/")
        self.access_token = shopify_config.get("access_token")

    def is_configured(self) -> bool:
        """Check if Shopify credentials are configured."""
        return bool(self.shop_url and self.access_token)

    def get_customer_count(self) -> dict[str, Any]:
        """
        Get total customer count from Shopify.

        Returns:
            Dict with count and status (sufficient for Ads or not)
        """
        if not self.is_configured():
            return {
                "count": 0,
                "sufficient": False,
                "error": "Shopify credentials not configured",
            }

        try:
            url = f"https://{self.shop_url}/admin/api/2024-01/customers/count.json"
            headers = {"X-Shopify-Access-Token": self.access_token}

            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            data = response.json()
            count = data.get("count", 0)

            # Get threshold from benchmarks
            thresholds = benchmarks_service.get_thresholds()
            threshold = thresholds.get("customer_count_ads")
            min_required = int(threshold.bad.max) if threshold else 1000

            return {
                "count": count,
                "sufficient": count >= min_required,
                "min_required": min_required,
                "message": (
                    f"✓ {count:,} customers (sufficient for Lookalike Audiences)"
                    if count >= min_required
                    else f"✗ {count:,} customers (need {min_required:,} for best results)"
                ),
            }

        except requests.exceptions.RequestException as e:
            return {
                "count": 0,
                "sufficient": False,
                "error": f"Failed to fetch customer count: {str(e)[:200]}",
            }

    def get_data_history(self) -> dict[str, Any]:
        """
        Analyze customer data history length using GraphQL.

        Uses a single GraphQL query to get both oldest and newest orders,
        avoiding REST API rate limits (429 errors).

        Minimum 90 days recommended for meaningful patterns.

        Returns:
            Dict with history length and status
        """
        if not self.is_configured():
            return {
                "days": 0,
                "sufficient": False,
                "error": "Shopify credentials not configured",
            }

        try:
            # Single GraphQL query for both oldest and newest orders
            graphql_url = f"https://{self.shop_url}/admin/api/2024-01/graphql.json"
            headers = {
                "X-Shopify-Access-Token": self.access_token,
                "Content-Type": "application/json",
            }

            # Query for oldest and newest orders in one request
            query = """
            {
                oldest: orders(first: 1, sortKey: CREATED_AT, reverse: false) {
                    edges {
                        node {
                            createdAt
                        }
                    }
                }
                newest: orders(first: 1, sortKey: CREATED_AT, reverse: true) {
                    edges {
                        node {
                            createdAt
                        }
                    }
                }
            }
            """

            response = requests.post(
                graphql_url,
                headers=headers,
                json={"query": query},
                timeout=30,
            )
            response.raise_for_status()

            data = response.json()

            # Check for GraphQL errors
            if "errors" in data:
                error_msg = data["errors"][0].get("message", "GraphQL error")
                return {
                    "days": 0,
                    "sufficient": False,
                    "error": f"GraphQL error: {error_msg[:200]}",
                }

            oldest_edges = data.get("data", {}).get("oldest", {}).get("edges", [])
            newest_edges = data.get("data", {}).get("newest", {}).get("edges", [])

            if not oldest_edges or not newest_edges:
                return {
                    "days": 0,
                    "sufficient": False,
                    "message": "No orders found",
                }

            oldest_date_str = oldest_edges[0]["node"]["createdAt"]
            newest_date_str = newest_edges[0]["node"]["createdAt"]

            if not oldest_date_str or not newest_date_str:
                return {
                    "days": 0,
                    "sufficient": False,
                    "error": "Invalid order dates",
                }

            # Parse ISO 8601 dates (Python 3.11+ supports Z suffix natively)
            oldest_date = datetime.fromisoformat(oldest_date_str)
            newest_date = datetime.fromisoformat(newest_date_str)

            days_span = (newest_date - oldest_date).days

            # Get threshold from benchmarks
            thresholds = benchmarks_service.get_thresholds()
            threshold = thresholds.get("data_history_days")
            min_required = int(threshold.bad.max) if threshold else 90

            return {
                "days": days_span,
                "sufficient": days_span >= min_required,
                "min_required": min_required,
                "oldest_date": oldest_date.strftime("%Y-%m-%d"),
                "newest_date": newest_date.strftime("%Y-%m-%d"),
                "message": (
                    f"✓ {days_span} days of history (sufficient for trend analysis)"
                    if days_span >= min_required
                    else f"✗ {days_span} days of history (need {min_required}+ for seasonal patterns)"
                ),
            }

        except requests.exceptions.RequestException as e:
            return {
                "days": 0,
                "sufficient": False,
                "error": f"Failed to fetch order history: {str(e)[:200]}",
            }

    def check_data_quality(self) -> dict[str, Any]:
        """
        Check customer data quality for Ads campaigns.

        Validates:
        - Email presence (required for Meta/Google Ads audiences)
        - Valid order values (>0)
        - Customer tags/segments available

        Returns:
            Dict with quality metrics and status
        """
        if not self.is_configured():
            return {
                "quality_score": 0,
                "sufficient": False,
                "error": "Shopify credentials not configured",
            }

        try:
            # Sample 250 recent customers (max per request)
            url = (
                f"https://{self.shop_url}/admin/api/2024-01/customers.json"
                f"?limit=250&fields=id,email,orders_count,total_spent"
            )
            headers = {"X-Shopify-Access-Token": self.access_token}

            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            customers = response.json().get("customers", [])

            if not customers:
                return {
                    "quality_score": 0,
                    "sufficient": False,
                    "message": "No customers found",
                }

            # Quality checks
            total = len(customers)
            with_email = sum(1 for c in customers if c.get("email"))
            with_orders = sum(1 for c in customers if (c.get("orders_count") or 0) > 0)
            with_spend = sum(
                1 for c in customers if c.get("total_spent") and float(c.get("total_spent", 0)) > 0
            )

            email_rate = (with_email / total * 100) if total > 0 else 0
            order_rate = (with_orders / total * 100) if total > 0 else 0
            spend_rate = (with_spend / total * 100) if total > 0 else 0

            # Calculate quality score (0-100)
            # Email is critical (50%), orders and spend are important (25% each)
            quality_score = int((email_rate * 0.5) + (order_rate * 0.25) + (spend_rate * 0.25))

            # Get threshold from benchmarks
            thresholds = benchmarks_service.get_thresholds()
            threshold = thresholds.get("data_quality_score")
            min_quality = int(threshold.bad.max) if threshold else 80

            return {
                "quality_score": quality_score,
                "sufficient": quality_score >= min_quality,
                "min_quality": min_quality,
                "sample_size": total,
                "metrics": {
                    "email_rate": round(email_rate, 1),
                    "order_rate": round(order_rate, 1),
                    "spend_rate": round(spend_rate, 1),
                },
                "message": (
                    f"✓ Quality score: {quality_score}% (ready for Ads)"
                    if quality_score >= min_quality
                    else f"✗ Quality score: {quality_score}% (need {min_quality}% for best results)"
                ),
            }

        except requests.exceptions.RequestException as e:
            return {
                "quality_score": 0,
                "sufficient": False,
                "error": f"Failed to check data quality: {str(e)[:200]}",
            }

    def get_comprehensive_analysis(self) -> dict[str, Any]:
        """
        Get comprehensive customer data analysis.

        Returns:
            Dict with all metrics and overall readiness status
        """
        count_result = self.get_customer_count()
        history_result = self.get_data_history()
        quality_result = self.check_data_quality()

        # Overall ready if all 3 checks pass
        all_sufficient = (
            count_result.get("sufficient", False)
            and history_result.get("sufficient", False)
            and quality_result.get("sufficient", False)
        )

        return {
            "ready_for_ads": all_sufficient,
            "customer_count": count_result,
            "data_history": history_result,
            "data_quality": quality_result,
            "recommendations": self.generate_recommendations(
                count_result, history_result, quality_result
            ),
        }

    def generate_recommendations(
        self,
        count_result: dict[str, Any],
        history_result: dict[str, Any],
        quality_result: dict[str, Any],
    ) -> list[str]:
        """Generate actionable recommendations based on analysis."""
        recommendations = []

        if not count_result.get("sufficient"):
            recommendations.append(
                "Grow customer base to 1000+ before launching Lookalike Audiences"
            )

        if not history_result.get("sufficient"):
            recommendations.append(
                "Collect 90+ days of data to identify seasonal patterns and optimize timing"
            )

        if not quality_result.get("sufficient"):
            metrics = quality_result.get("metrics", {})
            email_rate = metrics.get("email_rate", 0)

            if email_rate < 90:
                recommendations.append(
                    f"Improve email collection rate (currently {email_rate}%) "
                    "for better audience targeting"
                )

        if not recommendations:
            recommendations.append("✓ Customer data is ready for Ads campaigns!")

        return recommendations
