"""
Tests for Customer Data Analyzer Service.

Tests customer data readiness checks for Ads campaigns.
Validates that credentials are read from ConfigService (SQLite), not os.getenv.
"""

from unittest.mock import MagicMock, patch

import pytest

from services.customer_data_analyzer import CustomerDataAnalyzer


@pytest.fixture
def mock_config():
    """Mock ConfigService to return test credentials."""
    with patch("services.customer_data_analyzer.ConfigService") as mock_class:
        mock_instance = MagicMock()
        mock_instance.get_shopify_config.return_value = {
            "store_url": "test-shop.myshopify.com",
            "access_token": "test-token",
        }
        mock_class.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_config_empty():
    """Mock ConfigService with no credentials."""
    with patch("services.customer_data_analyzer.ConfigService") as mock_class:
        mock_instance = MagicMock()
        mock_instance.get_shopify_config.return_value = {}
        mock_class.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def analyzer(mock_config):
    """Create CustomerDataAnalyzer instance with mocked ConfigService."""
    return CustomerDataAnalyzer()


def test_uses_config_service_not_os_environ(mock_config):
    """Test that analyzer reads credentials from ConfigService, not os.getenv."""
    analyzer = CustomerDataAnalyzer()

    # Verify ConfigService.get_shopify_config was called
    mock_config.get_shopify_config.assert_called_once()

    # Verify credentials are set from ConfigService
    assert analyzer.shop_url == "test-shop.myshopify.com"
    assert analyzer.access_token == "test-token"


def test_is_configured_with_credentials(analyzer):
    """Test that service detects configured credentials."""
    assert analyzer.is_configured() is True


def test_is_configured_without_credentials(mock_config_empty):
    """Test that service detects missing credentials."""
    analyzer = CustomerDataAnalyzer()
    assert analyzer.is_configured() is False


@patch("services.customer_data_analyzer.requests.get")
def test_get_customer_count_success(mock_get, analyzer):
    """Test successful customer count retrieval."""
    mock_response = MagicMock()
    mock_response.json.return_value = {"count": 2500}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.get_customer_count()

    assert result["count"] == 2500
    assert result["sufficient"] is True
    assert result["min_required"] == 1000
    assert "sufficient for Lookalike Audiences" in result["message"]


@patch("services.customer_data_analyzer.requests.get")
def test_get_customer_count_insufficient(mock_get, analyzer):
    """Test customer count below minimum."""
    mock_response = MagicMock()
    mock_response.json.return_value = {"count": 500}
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.get_customer_count()

    assert result["count"] == 500
    assert result["sufficient"] is False
    assert "need 1,000 for best results" in result["message"]


@patch("services.customer_data_analyzer.requests.get")
def test_get_customer_count_api_error(mock_get, analyzer):
    """Test API error handling."""
    mock_get.side_effect = Exception("API Error")

    result = analyzer.get_customer_count()

    assert result["count"] == 0
    assert result["sufficient"] is False
    assert "error" in result


@patch("services.customer_data_analyzer.requests.get")
def test_get_data_history_success(mock_get, analyzer):
    """Test successful data history analysis."""
    # Mock oldest order
    mock_oldest = MagicMock()
    mock_oldest.json.return_value = {"orders": [{"created_at": "2023-01-01T00:00:00Z"}]}
    mock_oldest.raise_for_status = MagicMock()

    # Mock newest order
    mock_newest = MagicMock()
    mock_newest.json.return_value = {"orders": [{"created_at": "2023-12-31T00:00:00Z"}]}
    mock_newest.raise_for_status = MagicMock()

    mock_get.side_effect = [mock_oldest, mock_newest]

    result = analyzer.get_data_history()

    assert result["days"] == 364
    assert result["sufficient"] is True
    assert result["min_required"] == 90


@patch("services.customer_data_analyzer.requests.get")
def test_get_data_history_insufficient(mock_get, analyzer):
    """Test insufficient data history."""
    mock_oldest = MagicMock()
    mock_oldest.json.return_value = {"orders": [{"created_at": "2023-11-01T00:00:00Z"}]}
    mock_oldest.raise_for_status = MagicMock()

    mock_newest = MagicMock()
    mock_newest.json.return_value = {"orders": [{"created_at": "2023-12-01T00:00:00Z"}]}
    mock_newest.raise_for_status = MagicMock()

    mock_get.side_effect = [mock_oldest, mock_newest]

    result = analyzer.get_data_history()

    assert result["days"] == 30
    assert result["sufficient"] is False


@patch("services.customer_data_analyzer.requests.get")
def test_check_data_quality_high(mock_get, analyzer):
    """Test high quality customer data."""
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "customers": [
            {
                "id": 1,
                "email": "customer1@test.com",
                "orders_count": 5,
                "total_spent": "500.00",
            },
            {
                "id": 2,
                "email": "customer2@test.com",
                "orders_count": 3,
                "total_spent": "300.00",
            },
        ]
    }
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.check_data_quality()

    assert result["quality_score"] == 100
    assert result["sufficient"] is True
    assert result["sample_size"] == 2
    assert result["metrics"]["email_rate"] == 100.0


@patch("services.customer_data_analyzer.requests.get")
def test_check_data_quality_low(mock_get, analyzer):
    """Test low quality customer data."""
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "customers": [
            {"id": 1, "email": None, "orders_count": 0, "total_spent": "0.00"},
            {"id": 2, "email": "test@test.com", "orders_count": 1, "total_spent": "10.00"},
        ]
    }
    mock_response.raise_for_status = MagicMock()
    mock_get.return_value = mock_response

    result = analyzer.check_data_quality()

    assert result["quality_score"] < 80
    assert result["sufficient"] is False


def test_generate_recommendations_all_good(analyzer):
    """Test recommendations when all checks pass."""
    count_result = {"sufficient": True}
    history_result = {"sufficient": True}
    quality_result = {"sufficient": True}

    recommendations = analyzer.generate_recommendations(
        count_result, history_result, quality_result
    )

    assert len(recommendations) == 1
    assert "ready for Ads" in recommendations[0]


def test_generate_recommendations_missing_count(analyzer):
    """Test recommendations when customer count is low."""
    count_result = {"sufficient": False}
    history_result = {"sufficient": True}
    quality_result = {"sufficient": True}

    recommendations = analyzer.generate_recommendations(
        count_result, history_result, quality_result
    )

    assert any("1000+" in rec for rec in recommendations)


def test_generate_recommendations_missing_history(analyzer):
    """Test recommendations when history is insufficient."""
    count_result = {"sufficient": True}
    history_result = {"sufficient": False}
    quality_result = {"sufficient": True}

    recommendations = analyzer.generate_recommendations(
        count_result, history_result, quality_result
    )

    assert any("90+ days" in rec for rec in recommendations)


def test_generate_recommendations_low_quality(analyzer):
    """Test recommendations when data quality is low."""
    count_result = {"sufficient": True}
    history_result = {"sufficient": True}
    quality_result = {"sufficient": False, "metrics": {"email_rate": 50}}

    recommendations = analyzer.generate_recommendations(
        count_result, history_result, quality_result
    )

    assert any("email" in rec.lower() for rec in recommendations)
