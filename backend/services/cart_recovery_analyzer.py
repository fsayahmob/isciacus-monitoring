"""
Cart Recovery Analysis Service.

Analyzes abandoned carts to determine recovery opportunities for Ads:
- Cart abandonment tracking availability
- Abandoned cart volume (minimum 50/month for retargeting)
- Email capture rate in checkout
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import requests

from services.benchmarks import benchmarks_service
from services.config_service import ConfigService


class CartRecoveryAnalyzer:
    """Analyzes cart abandonment data for Ads retargeting readiness."""

    def __init__(self) -> None:
        """Initialize with Shopify credentials from ConfigService."""
        config = ConfigService()
        shopify_config = config.get_shopify_config()
        self.shop_url = shopify_config.get("store_url")
        self.access_token = shopify_config.get("access_token")

    def is_configured(self) -> bool:
        """Check if Shopify credentials are configured."""
        return bool(self.shop_url and self.access_token)

    def check_cart_tracking(self) -> dict[str, Any]:
        """
        Check if cart abandonment tracking is enabled.

        Verifies:
        - Checkout API access
        - Abandoned checkouts endpoint availability
        - Recent abandoned cart data exists

        Returns:
            Dict with tracking status and availability
        """
        if not self.is_configured():
            return {
                "enabled": False,
                "error": "Shopify credentials not configured",
            }

        try:
            # Try to fetch abandoned checkouts to verify tracking is enabled
            thirty_days_ago = (datetime.now(UTC) - timedelta(days=30)).isoformat()
            url = (
                f"https://{self.shop_url}/admin/api/2024-01/checkouts.json"
                f"?status=open&created_at_min={thirty_days_ago}&limit=1"
            )
            headers = {"X-Shopify-Access-Token": self.access_token}

            response = requests.get(url, headers=headers, timeout=30)

            # If we get 200, tracking is enabled (even if no data)
            if response.status_code == 200:
                checkouts = response.json().get("checkouts", [])
                return {
                    "enabled": True,
                    "has_data": len(checkouts) > 0,
                    "message": (
                        "✓ Cart abandonment tracking enabled"
                        if len(checkouts) > 0
                        else "✓ Tracking enabled (no recent abandonments)"
                    ),
                }

            # 403 means no access to checkout endpoint
            if response.status_code == 403:
                return {
                    "enabled": False,
                    "error": "No access to checkout data - upgrade Shopify plan",
                }

            response.raise_for_status()
            return {
                "enabled": False,
                "error": f"Unexpected response: {response.status_code}",
            }

        except requests.exceptions.RequestException as e:
            return {
                "enabled": False,
                "error": f"Failed to check cart tracking: {str(e)[:200]}",
            }

    def get_abandonment_volume(self, days: int = 30) -> dict[str, Any]:
        """
        Analyze abandoned cart volume.

        Checks if store has enough abandoned carts to justify
        retargeting campaigns (minimum 50/month recommended).

        Args:
            days: Number of days to analyze (default 30)

        Returns:
            Dict with abandonment metrics and retargeting readiness
        """
        if not self.is_configured():
            return {
                "count": 0,
                "sufficient": False,
                "error": "Shopify credentials not configured",
            }

        try:
            # Get abandoned checkouts from last N days
            start_date = (datetime.now(UTC) - timedelta(days=days)).isoformat()
            url = (
                f"https://{self.shop_url}/admin/api/2024-01/checkouts.json"
                f"?status=open&created_at_min={start_date}&limit=250"
            )
            headers = {"X-Shopify-Access-Token": self.access_token}

            response = requests.get(url, headers=headers, timeout=30)

            if response.status_code == 403:
                return {
                    "count": 0,
                    "sufficient": False,
                    "error": "No access to checkout data - upgrade Shopify plan required",
                }

            response.raise_for_status()
            checkouts = response.json().get("checkouts", [])
            count = len(checkouts)

            # Get threshold from benchmarks
            thresholds = benchmarks_service.get_thresholds()
            threshold = thresholds.get("cart_abandonment_volume")
            min_required = int(threshold.bad.max) if threshold else 50

            # Calculate monthly rate if analyzing different period
            monthly_rate = int((count / days) * 30) if days != 30 else count

            return {
                "count": count,
                "period_days": days,
                "monthly_rate": monthly_rate,
                "sufficient": monthly_rate >= min_required,
                "min_required": min_required,
                "message": (
                    f"✓ {monthly_rate} abandonments/month (sufficient for retargeting)"
                    if monthly_rate >= min_required
                    else f"✗ {monthly_rate} abandonments/month (need {min_required}+ for effective campaigns)"
                ),
            }

        except requests.exceptions.RequestException as e:
            return {
                "count": 0,
                "sufficient": False,
                "error": f"Failed to fetch abandonment data: {str(e)[:200]}",
            }

    def check_email_capture(self, days: int = 30) -> dict[str, Any]:
        """
        Check email capture rate in abandoned checkouts.

        Email is required for:
        - Meta/Google Customer Match audiences
        - Email retargeting campaigns
        - Recovery automation

        Args:
            days: Number of days to analyze (default 30)

        Returns:
            Dict with email capture rate and retargeting readiness
        """
        if not self.is_configured():
            return {
                "capture_rate": 0,
                "sufficient": False,
                "error": "Shopify credentials not configured",
            }

        try:
            start_date = (datetime.now(UTC) - timedelta(days=days)).isoformat()
            url = (
                f"https://{self.shop_url}/admin/api/2024-01/checkouts.json"
                f"?status=open&created_at_min={start_date}&limit=250"
            )
            headers = {"X-Shopify-Access-Token": self.access_token}

            response = requests.get(url, headers=headers, timeout=30)

            if response.status_code == 403:
                return {
                    "capture_rate": 0,
                    "sufficient": False,
                    "error": "No access to checkout data",
                }

            response.raise_for_status()
            checkouts = response.json().get("checkouts", [])

            if not checkouts:
                return {
                    "capture_rate": 0,
                    "sample_size": 0,
                    "sufficient": False,
                    "message": "No abandoned carts to analyze",
                }

            total = len(checkouts)
            with_email = sum(1 for c in checkouts if c.get("email"))

            capture_rate = (with_email / total * 100) if total > 0 else 0

            # Get threshold from benchmarks
            thresholds = benchmarks_service.get_thresholds()
            threshold = thresholds.get("cart_email_capture_rate")
            min_required = int(threshold.bad.max) if threshold else 60

            return {
                "capture_rate": round(capture_rate, 1),
                "sample_size": total,
                "with_email": with_email,
                "sufficient": capture_rate >= min_required,
                "min_required": min_required,
                "message": (
                    f"✓ {capture_rate:.1f}% email capture (ready for retargeting)"
                    if capture_rate >= min_required
                    else f"✗ {capture_rate:.1f}% email capture (need {min_required}%+ for best results)"
                ),
            }

        except requests.exceptions.RequestException as e:
            return {
                "capture_rate": 0,
                "sufficient": False,
                "error": f"Failed to check email capture: {str(e)[:200]}",
            }

    def calculate_recovery_potential(self, days: int = 30) -> dict[str, Any]:
        """
        Calculate cart recovery revenue potential.

        Estimates potential revenue from abandoned cart retargeting:
        - Total abandoned cart value
        - Average cart value
        - Estimated recovery rate (industry standard 10-15%)

        Args:
            days: Number of days to analyze (default 30)

        Returns:
            Dict with recovery potential metrics
        """
        if not self.is_configured():
            return {
                "total_value": 0,
                "potential_revenue": 0,
                "error": "Shopify credentials not configured",
            }

        try:
            start_date = (datetime.now(UTC) - timedelta(days=days)).isoformat()
            url = (
                f"https://{self.shop_url}/admin/api/2024-01/checkouts.json"
                f"?status=open&created_at_min={start_date}&limit=250"
            )
            headers = {"X-Shopify-Access-Token": self.access_token}

            response = requests.get(url, headers=headers, timeout=30)

            if response.status_code == 403:
                return {
                    "total_value": 0,
                    "potential_revenue": 0,
                    "error": "No access to checkout data",
                }

            response.raise_for_status()
            checkouts = response.json().get("checkouts", [])

            if not checkouts:
                return {
                    "total_value": 0,
                    "average_value": 0,
                    "potential_revenue": 0,
                    "count": 0,
                }

            # Calculate total abandoned value
            total_value = 0.0
            for checkout in checkouts:
                if checkout.get("total_price"):
                    total_value += float(checkout["total_price"])

            count = len(checkouts)
            avg_value = total_value / count if count > 0 else 0

            # Get recovery rate from benchmarks (use conservative estimate)
            thresholds = benchmarks_service.get_thresholds()
            threshold = thresholds.get("cart_recovery_rate")
            recovery_rate = (threshold.bad.max / 100) if threshold else 0.10
            potential_revenue = total_value * recovery_rate

            # Calculate monthly projections
            monthly_value = (total_value / days) * 30 if days != 30 else total_value
            monthly_potential = (potential_revenue / days) * 30 if days != 30 else potential_revenue

            return {
                "total_value": round(total_value, 2),
                "average_value": round(avg_value, 2),
                "count": count,
                "period_days": days,
                "monthly_abandoned_value": round(monthly_value, 2),
                "potential_revenue": round(potential_revenue, 2),
                "monthly_potential": round(monthly_potential, 2),
                "recovery_rate": recovery_rate * 100,
                "message": f"Potential ${monthly_potential:,.0f}/month from cart recovery campaigns",
            }

        except requests.exceptions.RequestException as e:
            return {
                "total_value": 0,
                "potential_revenue": 0,
                "error": f"Failed to calculate recovery potential: {str(e)[:200]}",
            }

    def get_comprehensive_analysis(self, days: int = 30) -> dict[str, Any]:
        """
        Get comprehensive cart recovery analysis.

        Args:
            days: Number of days to analyze (default 30)

        Returns:
            Dict with all metrics and overall readiness status
        """
        tracking_result = self.check_cart_tracking()
        volume_result = self.get_abandonment_volume(days)
        email_result = self.check_email_capture(days)
        potential_result = self.calculate_recovery_potential(days)

        # Overall ready if tracking enabled AND (volume OR email) sufficient
        # Volume and email are optional if store is new
        ready = tracking_result.get("enabled", False) and (
            volume_result.get("sufficient", False) or email_result.get("sufficient", False)
        )

        return {
            "ready_for_retargeting": ready,
            "cart_tracking": tracking_result,
            "abandonment_volume": volume_result,
            "email_capture": email_result,
            "recovery_potential": potential_result,
            "recommendations": self.generate_recommendations(
                tracking_result, volume_result, email_result, potential_result
            ),
        }

    def generate_recommendations(
        self,
        tracking_result: dict[str, Any],
        volume_result: dict[str, Any],
        email_result: dict[str, Any],
        potential_result: dict[str, Any],
    ) -> list[str]:
        """Generate actionable recommendations based on analysis."""
        recommendations = []

        if not tracking_result.get("enabled"):
            recommendations.append(
                "Upgrade Shopify plan to enable checkout data access for cart recovery"
            )
            return recommendations

        if not volume_result.get("sufficient"):
            monthly_rate = volume_result.get("monthly_rate", 0)
            recommendations.append(
                f"Cart abandonment rate is low ({monthly_rate}/month). "
                "Focus on driving more traffic before retargeting"
            )

        if not email_result.get("sufficient"):
            capture_rate = email_result.get("capture_rate", 0)
            recommendations.append(
                f"Improve email capture in checkout (currently {capture_rate}%) "
                "for better retargeting audience quality"
            )

        # Add positive recommendation if recovery potential is high
        monthly_potential = potential_result.get("monthly_potential", 0)
        if monthly_potential > 1000:
            recommendations.append(
                f"High recovery potential: ${monthly_potential:,.0f}/month "
                "- prioritize cart abandonment campaigns"
            )

        if not recommendations:
            recommendations.append("✓ Cart recovery data is ready for retargeting campaigns!")

        return recommendations
