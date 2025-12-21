"""
Tests for Cart Recovery Analyzer Service.

Tests cart abandonment analysis for Ads retargeting readiness.
Validates that credentials are read from ConfigService (SQLite), not os.getenv.
"""

from unittest.mock import MagicMock, patch

import pytest

from services.cart_recovery_analyzer import CartRecoveryAnalyzer


@pytest.fixture
def mock_config():
    """Mock ConfigService to return test credentials."""
    with patch("services.cart_recovery_analyzer.ConfigService") as mock_class:
        mock_instance = MagicMock()
        mock_instance.get_all_config.return_value = {
            "SHOPIFY_STORE_URL": "test-shop.myshopify.com",
            "SHOPIFY_ACCESS_TOKEN": "test-token",
        }
        mock_class.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_config_empty():
    """Mock ConfigService with no credentials."""
    with patch("services.cart_recovery_analyzer.ConfigService") as mock_class:
        mock_instance = MagicMock()
        mock_instance.get_all_config.return_value = {}
        mock_class.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def analyzer(mock_config):
    """Create CartRecoveryAnalyzer instance with mocked ConfigService."""
    return CartRecoveryAnalyzer()


def test_uses_config_service_not_os_environ(mock_config):
    """Test that analyzer reads credentials from ConfigService, not os.getenv."""
    analyzer = CartRecoveryAnalyzer()

    # Verify ConfigService was called
    mock_config.get_all_config.assert_called_once()

    # Verify credentials are set from ConfigService
    assert analyzer.shop_url == "test-shop.myshopify.com"
    assert analyzer.access_token == "test-token"


def test_is_configured_with_credentials(analyzer):
    """Test that service detects configured credentials."""
    assert analyzer.is_configured() is True


def test_is_configured_without_credentials(mock_config_empty):
    """Test that service detects missing credentials."""
    analyzer = CartRecoveryAnalyzer()
    assert analyzer.is_configured() is False


@patch("services.cart_recovery_analyzer.requests.get")
def test_check_cart_tracking_enabled(mock_get, analyzer):
    """Test cart tracking is enabled with data."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "checkouts": [
            {
                "id": 1,
                "email": "customer@test.com",
                "created_at": "2023-12-01T00:00:00Z",
                "total_price": "100.00",
            }
        ]
    }
    mock_get.return_value = mock_response

    result = analyzer.check_cart_tracking()

    assert result["enabled"] is True
    assert result["has_data"] is True
    assert "Cart abandonment tracking enabled" in result["message"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_check_cart_tracking_no_data(mock_get, analyzer):
    """Test cart tracking enabled but no recent data."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"checkouts": []}
    mock_get.return_value = mock_response

    result = analyzer.check_cart_tracking()

    assert result["enabled"] is True
    assert result["has_data"] is False
    assert "Tracking enabled (no recent abandonments)" in result["message"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_check_cart_tracking_no_access(mock_get, analyzer):
    """Test cart tracking not available (403)."""
    mock_response = MagicMock()
    mock_response.status_code = 403
    mock_get.return_value = mock_response

    result = analyzer.check_cart_tracking()

    assert result["enabled"] is False
    assert "No access to checkout data" in result["error"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_get_abandonment_volume_sufficient(mock_get, analyzer):
    """Test sufficient abandonment volume."""
    # Create 75 abandoned checkouts (above minimum of 50)
    checkouts = [
        {"id": i, "created_at": f"2023-12-{i % 30 + 1:02d}T00:00:00Z", "total_price": "50.00"}
        for i in range(75)
    ]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"checkouts": checkouts}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.get_abandonment_volume()

    assert result["count"] == 75
    assert result["monthly_rate"] == 75
    assert result["sufficient"] is True
    assert result["min_required"] == 50
    assert "sufficient for retargeting" in result["message"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_get_abandonment_volume_insufficient(mock_get, analyzer):
    """Test insufficient abandonment volume."""
    # Create only 30 abandoned checkouts (below minimum of 50)
    checkouts = [
        {"id": i, "created_at": f"2023-12-{i % 30 + 1:02d}T00:00:00Z", "total_price": "50.00"}
        for i in range(30)
    ]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"checkouts": checkouts}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.get_abandonment_volume()

    assert result["count"] == 30
    assert result["monthly_rate"] == 30
    assert result["sufficient"] is False
    assert "need 50+ for effective campaigns" in result["message"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_check_email_capture_high(mock_get, analyzer):
    """Test high email capture rate."""
    # 80% email capture rate
    checkouts = [
        {"id": i, "email": f"customer{i}@test.com" if i < 80 else None} for i in range(100)
    ]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"checkouts": checkouts}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.check_email_capture()

    assert result["capture_rate"] == 80.0
    assert result["sample_size"] == 100
    assert result["with_email"] == 80
    assert result["sufficient"] is True
    assert "ready for retargeting" in result["message"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_check_email_capture_low(mock_get, analyzer):
    """Test low email capture rate."""
    # 40% email capture rate (below 60% minimum)
    checkouts = [
        {"id": i, "email": f"customer{i}@test.com" if i < 40 else None} for i in range(100)
    ]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"checkouts": checkouts}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.check_email_capture()

    assert result["capture_rate"] == 40.0
    assert result["sufficient"] is False
    assert "need 60%+ for best results" in result["message"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_check_email_capture_no_data(mock_get, analyzer):
    """Test email capture with no abandoned carts."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"checkouts": []}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.check_email_capture()

    assert result["capture_rate"] == 0
    assert result["sample_size"] == 0
    assert result["sufficient"] is False
    assert "No abandoned carts to analyze" in result["message"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_calculate_recovery_potential(mock_get, analyzer):
    """Test recovery potential calculation."""
    # 50 abandoned carts worth $5000 total
    checkouts = [{"id": i, "total_price": "100.00"} for i in range(50)]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"checkouts": checkouts}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.calculate_recovery_potential()

    assert result["total_value"] == 5000.0
    assert result["average_value"] == 100.0
    assert result["count"] == 50
    assert result["recovery_rate"] == 10.0  # 10% industry standard
    assert result["potential_revenue"] == 500.0  # 10% of 5000
    assert result["monthly_potential"] == 500.0
    assert "$500/month" in result["message"]


@patch("services.cart_recovery_analyzer.requests.get")
def test_calculate_recovery_potential_no_data(mock_get, analyzer):
    """Test recovery potential with no abandoned carts."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"checkouts": []}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.calculate_recovery_potential()

    assert result["total_value"] == 0
    assert result["average_value"] == 0
    assert result["count"] == 0
    assert result["potential_revenue"] == 0


def test_generate_recommendations_all_good(analyzer):
    """Test recommendations when all checks pass."""
    tracking_result = {"enabled": True}
    volume_result = {"sufficient": True, "monthly_rate": 75}
    email_result = {"sufficient": True, "capture_rate": 80}
    potential_result = {"monthly_potential": 1500}

    recommendations = analyzer.generate_recommendations(
        tracking_result, volume_result, email_result, potential_result
    )

    assert len(recommendations) == 2
    assert "ready for retargeting campaigns" in recommendations[0]
    assert "$1,500/month" in recommendations[1]


def test_generate_recommendations_tracking_disabled(analyzer):
    """Test recommendations when tracking is disabled."""
    tracking_result = {"enabled": False}
    volume_result = {"sufficient": True}
    email_result = {"sufficient": True}
    potential_result = {"monthly_potential": 0}

    recommendations = analyzer.generate_recommendations(
        tracking_result, volume_result, email_result, potential_result
    )

    assert len(recommendations) == 1
    assert "Upgrade Shopify plan" in recommendations[0]


def test_generate_recommendations_low_volume(analyzer):
    """Test recommendations when abandonment volume is low."""
    tracking_result = {"enabled": True}
    volume_result = {"sufficient": False, "monthly_rate": 30}
    email_result = {"sufficient": True, "capture_rate": 80}
    potential_result = {"monthly_potential": 200}

    recommendations = analyzer.generate_recommendations(
        tracking_result, volume_result, email_result, potential_result
    )

    assert any("abandonment rate is low" in rec for rec in recommendations)
    assert any("30/month" in rec for rec in recommendations)


def test_generate_recommendations_low_email_capture(analyzer):
    """Test recommendations when email capture is low."""
    tracking_result = {"enabled": True}
    volume_result = {"sufficient": True, "monthly_rate": 75}
    email_result = {"sufficient": False, "capture_rate": 45}
    potential_result = {"monthly_potential": 500}

    recommendations = analyzer.generate_recommendations(
        tracking_result, volume_result, email_result, potential_result
    )

    assert any("Improve email capture" in rec for rec in recommendations)
    assert any("45%" in rec for rec in recommendations)
