"""Pydantic models for analytics data."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CustomerStats(BaseModel):
    """Customer statistics from Shopify."""

    total_customers: int = Field(description="Total number of customers")
    # Email stats
    email_available: int = Field(description="Customers with email address")
    email_available_rate: float = Field(description="Email available rate percentage")
    email_subscribers: int = Field(description="Customers with email marketing consent")
    email_optin_rate: float = Field(description="Email opt-in rate (vs available)")
    # Phone stats
    phone_count: int = Field(description="Customers with phone number")
    phone_rate: float = Field(description="Phone rate percentage")
    # SMS stats
    sms_optin: int = Field(description="Customers with SMS marketing consent")
    sms_optin_rate: float = Field(description="SMS opt-in rate (vs phone)")
    last_updated: str = Field(description="ISO timestamp of last update")


class FunnelStage(BaseModel):
    """Single stage in the conversion funnel."""

    name: str
    value: int
    rate: float = Field(description="Rate from previous stage (percentage)")
    benchmark_status: str | None = None


class CVRByEntry(BaseModel):
    """Conversion rate by entry point."""

    entry_point: str
    cvr: float
    min_cvr: float
    max_cvr: float
    mean_cvr: float
    benchmark_status: str


class CVRStats(BaseModel):
    """Statistical analysis of CVR values."""

    mean: float
    min: float
    max: float
    median: float
    count: int


class ConversionFunnel(BaseModel):
    """Complete conversion funnel data."""

    period: str = Field(description="Period for the funnel data (e.g., '30d')")
    visitors: int
    product_views: int
    add_to_cart: int
    checkout: int
    purchases: int
    stages: list[FunnelStage]
    cvr_by_entry: list[CVRByEntry]
    cvr_stats: CVRStats
    global_cvr: float = Field(description="Overall conversion rate")
    last_updated: str


class CollectionCVR(BaseModel):
    """CVR data for a specific collection."""

    collection_id: str
    collection_name: str
    visitors: int
    purchases: int
    cvr: float
    benchmark_status: str


class ProductSales(BaseModel):
    """Product sales data."""

    product_id: str
    product_title: str
    product_handle: str
    quantity_sold: int
    order_count: int


class TagAnalysis(BaseModel):
    """Sales analysis by tag."""

    tag: str
    total_quantity: int = Field(description="Total units sold with this tag")
    order_count: int = Field(description="Number of orders containing this tag")
    products: list[ProductSales] = Field(description="Products with this tag")


class CollectionAnalysis(BaseModel):
    """Sales analysis by collection."""

    collection_id: str
    collection_name: str
    collection_handle: str
    total_quantity: int = Field(description="Total units sold from this collection")
    order_count: int = Field(description="Number of orders from this collection")
    products: list[ProductSales] = Field(description="Products in this collection")


class SalesByTagAndCollection(BaseModel):
    """Complete sales breakdown by tags and collections."""

    period: str
    total_orders: int
    total_products_sold: int
    by_tag: list[TagAnalysis]
    by_collection: list[CollectionAnalysis]
    last_updated: str


class FilteredSalesAnalysis(BaseModel):
    """Sales analysis filtered by a specific tag or collection."""

    filter_type: str = Field(description="'tag' or 'collection'")
    filter_value: str = Field(description="The tag name or collection name")
    period: str
    total_quantity: int
    order_count: int
    unique_orders: int = Field(description="Number of unique orders")
    products: list[ProductSales]
    last_updated: str


class AvailableFilters(BaseModel):
    """Available tags and collections for filtering."""

    tags: list[str] = Field(description="All tags from products sold")
    collections: list[dict[str, str]] = Field(description="Collections with id, name, handle")
