"""
monitoring_app.py - Application web de monitoring des produits ISCIACUS
Backend FastAPI avec données Shopify GraphQL uniquement
"""

from __future__ import annotations

import os
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import requests
import uvicorn
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded


# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from services.audit_orchestrator import AuditOrchestrator, AuditType
from services.audit_service import AuditService
from services.benchmarks import BenchmarksService
from services.config_service import ConfigService
from services.ga4_analytics import GA4AnalyticsService
from services.permissions_checker import PermissionsCheckerService
from services.rate_limiter import limiter
from services.shopify_analytics import ShopifyAnalyticsService
from services.theme_analyzer import ThemeAnalyzerService


# Type aliases for clarity
ShopifyProduct = dict[str, Any]
ProductData = dict[str, Any]
FiltersData = dict[str, Any]


# Constants for stock and margin thresholds
STOCK_CRITICAL = 0
STOCK_LOW = 2
STOCK_MEDIUM = 5
MARGIN_HIGH = 60
MARGIN_MEDIUM = 40

# Configuration - uses SQLite via ConfigService
# No load_dotenv() needed - ConfigService._get_value() falls back to os.getenv()
BASE_DIR = Path(__file__).parent

# Initialize ConfigService first to load config from SQLite
_config_service = ConfigService()
_shopify_config = _config_service.get_shopify_values()

STORE_URL = _shopify_config.get("store_url", "")
ACCESS_TOKEN = _shopify_config.get("access_token", "")
TVA_RATE = float(os.getenv("TVA_RATE", "1.20"))  # TVA stays in env (not a service config)

if not STORE_URL or not ACCESS_TOKEN:
    raise ValueError(
        "Shopify non configuré. Allez dans Settings > Shopify pour configurer "
        "SHOPIFY_STORE_URL et SHOPIFY_ACCESS_TOKEN"
    )

GRAPHQL_URL = f"{STORE_URL}/admin/api/2024-01/graphql.json"
HEADERS = {"X-Shopify-Access-Token": ACCESS_TOKEN, "Content-Type": "application/json"}

# Cache global
PRODUCTS_CACHE: list[ProductData] = []
FILTERS_CACHE: FiltersData = {}

# Analytics services
benchmarks_service = BenchmarksService()
shopify_analytics = ShopifyAnalyticsService()
config_service = ConfigService()
ga4_analytics = GA4AnalyticsService(config_service=config_service)
audit_service = AuditService(shopify_analytics, ga4_analytics)
permissions_checker = PermissionsCheckerService()
theme_analyzer = ThemeAnalyzerService()
audit_orchestrator = AuditOrchestrator(
    ga4_audit_service=audit_service,
    theme_analyzer=theme_analyzer,
)

# GraphQL Query avec image, canaux de vente et collections
PRODUCTS_QUERY = """
query getProducts($cursor: String, $query: String) {
    products(first: 250, after: $cursor, query: $query) {
        pageInfo { hasNextPage endCursor }
        nodes {
            id title handle status tags publishedAt
            featuredImage { url altText }
            publications(first: 20) {
                nodes {
                    channel { name }
                }
            }
            collections(first: 10) {
                nodes {
                    id title handle
                }
            }
            variants(first: 100) {
                nodes {
                    id title sku price inventoryQuantity
                    inventoryItem { unitCost { amount } }
                }
            }
        }
    }
}
"""


def extract_id(gid: str) -> str:
    """Extrait l'ID numérique depuis un GID Shopify."""
    return gid.split("/")[-1] if "/" in gid else gid


def calculate_margin_tag(prix_ht: float, cout_ht: float) -> str | None:
    """Calcule le tag de marge basé sur le pourcentage."""
    if prix_ht <= 0 or cout_ht <= 0:
        return None
    marge_pct = ((prix_ht - cout_ht) / prix_ht) * 100
    if marge_pct >= MARGIN_HIGH:
        return "marge:haute"
    if marge_pct >= MARGIN_MEDIUM:
        return "marge:moyenne"
    return "marge:faible"


def calculate_stock_tag(stock: int) -> str:
    """Calcule le tag de stock."""
    if stock == STOCK_CRITICAL:
        return "stock:rupture"
    if stock <= STOCK_LOW:
        return "stock:faible"
    if stock <= STOCK_MEDIUM:
        return "stock:moyen"
    return "stock:ok"


def get_stock_level(stock: int) -> str:
    """Retourne le niveau de stock pour le filtrage."""
    if stock == STOCK_CRITICAL:
        return "rupture"
    if stock <= STOCK_LOW:
        return "faible"
    if stock <= STOCK_MEDIUM:
        return "moyen"
    return "ok"


def build_tags(
    status: str,
    *,
    published: bool,
    stock: int,
    prix_ht: float,
    cout_ht: float,
) -> list[str]:
    """Construit la liste des tags calculés."""
    tags = []
    if status:
        tags.append(f"statut:{status}")
    tags.append("publié" if published else "non-publié")
    tags.append(calculate_stock_tag(stock))
    margin_tag = calculate_margin_tag(prix_ht, cout_ht)
    if margin_tag:
        tags.append(margin_tag)
    return tags


def fetch_shopify_products(tag_filter: str | None = None) -> list[ShopifyProduct]:
    """Récupère tous les produits depuis Shopify GraphQL."""
    all_products: list[ShopifyProduct] = []
    cursor = None
    query_str = f"tag:'{tag_filter}'" if tag_filter else ""

    while True:
        resp = requests.post(
            GRAPHQL_URL,
            headers=HEADERS,
            json={"query": PRODUCTS_QUERY, "variables": {"cursor": cursor, "query": query_str}},
            timeout=30,
        )
        data = resp.json()

        if "errors" in data:
            break

        products_data = data.get("data", {}).get("products", {})
        all_products.extend(products_data.get("nodes", []))

        page_info = products_data.get("pageInfo", {})
        if page_info.get("hasNextPage"):
            cursor = page_info.get("endCursor")
        else:
            break

    return all_products


def _calculate_margin_pct(prix_ht: float, cout_ht: float) -> str:
    """Calcule le pourcentage de marge formaté."""
    if prix_ht > 0 and cout_ht > 0:
        return f"{((prix_ht - cout_ht) / prix_ht * 100):.1f}%"
    return ""


def transform_product(shopify_product: ShopifyProduct, variant: ShopifyProduct) -> ProductData:
    """Transforme un produit Shopify en format interne."""
    product_id = extract_id(shopify_product.get("id", ""))
    variant_id = extract_id(variant.get("id", ""))

    prix_ttc = float(variant.get("price", 0) or 0)
    prix_ht = prix_ttc / TVA_RATE
    stock = variant.get("inventoryQuantity", 0) or 0

    cout_ht = 0.0
    inv_item = variant.get("inventoryItem")
    if inv_item and inv_item.get("unitCost"):
        cout_ht = float(inv_item["unitCost"].get("amount", 0) or 0)

    status = shopify_product.get("status", "")
    published = shopify_product.get("publishedAt") is not None
    shopify_tags = shopify_product.get("tags", [])

    # Image
    featured_image = shopify_product.get("featuredImage")
    image_url = featured_image.get("url") if featured_image else None

    # Canaux de vente
    publications = shopify_product.get("publications", {}).get("nodes", [])
    channels = [pub.get("channel", {}).get("name") for pub in publications if pub.get("channel")]

    # Collections
    collections_data = shopify_product.get("collections", {}).get("nodes", [])
    collections = [col.get("title") for col in collections_data if col.get("title")]

    # Tags calculés + tags Shopify
    tags = build_tags(status, published=published, stock=stock, prix_ht=prix_ht, cout_ht=cout_ht)
    tags.extend(shopify_tags)

    return {
        "product_id": product_id,
        "variant_id": variant_id,
        "titre": shopify_product.get("title", ""),
        "variante": variant.get("title", ""),
        "sku": variant.get("sku", ""),
        "stock": stock,
        "stock_level": get_stock_level(stock),
        "prix_ttc": prix_ttc,
        "prix_ht": round(prix_ht, 2),
        "cout_ht": cout_ht,
        "marge_brute": round(prix_ht - cout_ht, 2) if cout_ht else 0,
        "marge_pct": _calculate_margin_pct(prix_ht, cout_ht),
        "statut": status,
        "publie": published,
        "channels": channels,
        "collections": collections,
        "url": f"https://www.isciacusstore.com/products/{shopify_product.get('handle', '')}",
        "image_url": image_url,
        "shopify_tags": shopify_tags,
        "tags": tags,
    }


def load_all_products() -> tuple[list[ProductData], FiltersData]:
    """Charge tous les produits depuis Shopify GraphQL."""
    shopify_products = fetch_shopify_products()

    products: list[ProductData] = []
    all_tags: set[str] = set()
    all_channels: set[str] = set()
    all_collections: set[str] = set()

    for sp in shopify_products:
        for variant in sp.get("variants", {}).get("nodes", []):
            product = transform_product(sp, variant)
            products.append(product)
            all_tags.update(product["tags"])
            all_channels.update(product["channels"])
            all_collections.update(product["collections"])

    # Compter les produits uniques (par product_id)
    unique_product_ids = {p["product_id"] for p in products}

    filters = {
        "tags": sorted(all_tags),
        "channels": sorted(all_channels),
        "collections": sorted(all_collections),
        "stock_levels": ["rupture", "faible", "moyen", "ok"],
        "statuts": ["ACTIVE", "DRAFT", "ARCHIVED"],
        "total_products": len(unique_product_ids),
        "total_variants": len(products),
    }

    return products, filters


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    global PRODUCTS_CACHE, FILTERS_CACHE
    PRODUCTS_CACHE, FILTERS_CACHE = load_all_products()
    yield


app = FastAPI(title="ISCIACUS Monitoring", version="2.3.0", lifespan=lifespan)

# Rate limiter setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Inngest setup (conditional - only if configured)
try:
    from jobs.inngest_setup import setup_inngest

    inngest_enabled = setup_inngest(app)
except ImportError:
    inngest_enabled = False

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/products")
async def get_products(
    search: str | None = None,
    tag: str | None = None,
    stock_level: str | None = None,
    *,
    publie: bool | None = None,
    channel: str | None = None,
    collection: str | None = None,
    statut: str | None = None,
    has_image: bool | None = None,
    has_price: bool | None = None,
    has_description: bool | None = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
) -> ProductData:
    """Liste les produits avec filtres."""
    filtered = _apply_filters(
        PRODUCTS_CACHE,
        search=search,
        tag=tag,
        stock_level=stock_level,
        publie=publie,
        channel=channel,
        collection=collection,
        statut=statut,
        has_image=has_image,
        has_price=has_price,
        has_description=has_description,
    )

    # Compter les produits uniques dans les résultats filtrés
    unique_filtered_products = len({p["product_id"] for p in filtered})

    return {
        "total": len(filtered),
        "total_products": unique_filtered_products,
        "limit": limit,
        "offset": offset,
        "products": filtered[offset : offset + limit],
    }


def _apply_filters(
    products: list[ProductData],
    *,
    search: str | None,
    tag: str | None,
    stock_level: str | None,
    publie: bool | None,
    channel: str | None,
    collection: str | None,
    statut: str | None,
    has_image: bool | None = None,
    has_price: bool | None = None,
    has_description: bool | None = None,
) -> list[ProductData]:
    """Apply all filters to the products list."""
    filtered = products

    # Recherche texte
    if search:
        s = search.lower()
        filtered = [
            p
            for p in filtered
            if s in (p.get("titre") or "").lower()
            or s in (p.get("sku") or "").lower()
            or s in (p.get("variante") or "").lower()
            or s in p.get("product_id", "")
        ]

    # Filtre par tag
    if tag:
        filtered = [p for p in filtered if tag in p.get("tags", [])]

    # Filtre par niveau de stock
    if stock_level:
        if stock_level == "en_stock":
            filtered = [p for p in filtered if p.get("stock", 0) > 0]
        else:
            filtered = [p for p in filtered if p.get("stock_level") == stock_level]

    # Filtre par publication
    if publie is not None:
        filtered = [p for p in filtered if p.get("publie") == publie]

    # Filtre par canal de vente
    if channel:
        filtered = [p for p in filtered if channel in p.get("channels", [])]

    # Filtre par collection
    if collection:
        filtered = [p for p in filtered if collection in p.get("collections", [])]

    # Filtre par statut
    if statut:
        filtered = [p for p in filtered if p.get("statut") == statut]

    # Filtre par présence d'image
    if has_image is not None:
        if has_image:
            filtered = [p for p in filtered if p.get("image_url")]
        else:
            filtered = [p for p in filtered if not p.get("image_url")]

    # Filtre par présence de prix (prix > 0)
    if has_price is not None:
        if has_price:
            filtered = [p for p in filtered if (p.get("prix_ttc") or 0) > 0]
        else:
            filtered = [p for p in filtered if (p.get("prix_ttc") or 0) == 0]

    # Filtre par présence de description
    if has_description is not None:
        if has_description:
            filtered = [p for p in filtered if p.get("description")]
        else:
            filtered = [p for p in filtered if not p.get("description")]

    return filtered


@app.get("/api/products/{product_id}")
async def get_product(product_id: str) -> ProductData:
    """Détails complets d'un produit."""
    for p in PRODUCTS_CACHE:
        if p["product_id"] == product_id:
            return p
    return {"error": "Produit non trouvé"}


@app.get("/api/filters")
async def get_filters() -> FiltersData:
    """Retourne les valeurs disponibles pour les filtres."""
    return FILTERS_CACHE


@app.get("/api/reload")
async def reload_data() -> ProductData:
    """Recharge les données depuis Shopify."""
    global PRODUCTS_CACHE, FILTERS_CACHE
    PRODUCTS_CACHE, FILTERS_CACHE = load_all_products()
    return {"status": "ok", "count": len(PRODUCTS_CACHE)}


@app.get("/api/health")
async def health_check() -> ProductData:
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "products_count": len(PRODUCTS_CACHE)}


@app.get("/api/health/services")
async def health_check_services() -> dict[str, Any]:
    """Comprehensive health check for all services."""
    services = {
        "backend": {"status": "healthy", "message": "API opérationnelle"},
        "inngest": {"status": "unknown", "message": "Non vérifié"},
    }

    # Check Inngest status
    if inngest_enabled:
        inngest_url = os.getenv("INNGEST_EVENT_API_URL") or os.getenv("INNGEST_DEV", "")
        if inngest_url:
            try:
                # Simple ping to Inngest
                resp = requests.get(f"{inngest_url.rstrip('/')}/health", timeout=5)
                if resp.status_code == 200:
                    services["inngest"] = {
                        "status": "healthy",
                        "message": "Inngest connecté",
                        "url": inngest_url,
                    }
                else:
                    services["inngest"] = {
                        "status": "degraded",
                        "message": f"Inngest répond avec code {resp.status_code}",
                        "url": inngest_url,
                    }
            except requests.exceptions.RequestException:
                # Inngest dev server doesn't have /health, just check if URL is configured
                services["inngest"] = {
                    "status": "configured",
                    "message": "Inngest configuré (mode dev)",
                    "url": inngest_url,
                }
        else:
            services["inngest"] = {
                "status": "not_configured",
                "message": "Inngest non configuré",
            }
    else:
        services["inngest"] = {
            "status": "disabled",
            "message": "Inngest désactivé",
        }

    # Overall status
    all_healthy = all(s["status"] in ("healthy", "configured") for s in services.values())

    return {
        "overall_status": "healthy" if all_healthy else "degraded",
        "services": services,
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    }


# ============================================================================
# ANALYTICS ENDPOINTS - Customer Stats, Funnel, Benchmarks
# ============================================================================


@app.get("/api/analytics/customers")
async def get_customer_stats(request: Request, *, refresh: bool = False) -> dict[str, Any]:
    """Get customer statistics from Shopify."""
    stats = shopify_analytics.fetch_customer_stats(force_refresh=refresh)

    # Evaluate against benchmarks
    email_benchmark = benchmarks_service.evaluate("email_optin", stats.email_optin_rate)
    sms_benchmark = benchmarks_service.evaluate("sms_optin", stats.sms_optin_rate)
    phone_benchmark = benchmarks_service.evaluate("phone_rate", stats.phone_rate)

    return {
        **stats.model_dump(),
        "benchmarks": {
            "email_optin": email_benchmark,
            "sms_optin": sms_benchmark,
            "phone_rate": phone_benchmark,
        },
    }


@app.get("/api/analytics/funnel")
async def get_conversion_funnel(
    request: Request,
    period: int = Query(30, description="Period in days"),
    *,
    refresh: bool = False,
) -> dict[str, Any]:
    """Get conversion funnel data.

    IMPORTANT: Funnel CVR uses GA4 data ONLY for consistency.
    Shopify data is provided separately for business metrics (CA, orders).

    This avoids the common mistake of mixing GA4 visitors with Shopify purchases,
    which inflates CVR because GA4 misses some traffic (ad blockers, consent, etc.)
    while Shopify captures ALL orders.
    """
    # Get Shopify business data (real orders, revenue)
    shopify_funnel = shopify_analytics.fetch_conversion_funnel(period, force_refresh=refresh)
    shopify_data = shopify_funnel.model_dump()

    # Get GA4 funnel data (all stages from same source = consistent CVR)
    ga4_data = ga4_analytics.get_funnel_metrics(period, force_refresh=refresh)
    ga4_available = ga4_data.get("error") is None

    # GA4 funnel metrics (consistent source)
    visitors = ga4_data.get("visitors", 0) if ga4_available else 0
    product_views = ga4_data.get("product_views", 0) if ga4_available else 0
    add_to_cart = ga4_data.get("add_to_cart", 0) if ga4_available else 0
    begin_checkout = ga4_data.get("begin_checkout", 0) if ga4_available else 0
    ga4_purchases = ga4_data.get("purchase", 0) if ga4_available else 0

    # Shopify business metrics (source of truth for revenue)
    shopify_orders = shopify_data["purchases"]
    shopify_checkout = shopify_data["checkout"]

    def calc_rate(current: int, previous: int) -> float:
        """Calculate rate: current / previous * 100."""
        return round((current / previous) * 100, 2) if previous > 0 else 0.0

    # Calculate GA4-only CVR (consistent, reliable for funnel analysis)
    ga4_cvr = calc_rate(ga4_purchases, visitors) if ga4_available else 0.0

    # Build stages with GA4 data for consistency
    stages = []

    # Stage 1: Visiteurs (base = 100%)
    stages.append(
        {
            "name": "Visiteurs",
            "value": visitors,
            "rate": 100.0 if ga4_available else 0.0,
            "rate_label": "Base",
            "source": "GA4",
            "benchmark_key": None,
            "benchmark_status": "ok" if ga4_available else "requires_ga4",
        }
    )

    # Stage 2: Vues Produit (% des visiteurs qui voient un produit)
    pv_rate = calc_rate(product_views, visitors) if ga4_available else 0.0
    stages.append(
        {
            "name": "Vues Produit",
            "value": product_views,
            "rate": pv_rate,
            "rate_label": "% Visiteurs",
            "source": "GA4",
            "benchmark_key": None,
            "benchmark_status": "ok" if ga4_available else "requires_ga4",
        }
    )

    # Stage 3: Ajout Panier (% des vues produit qui ajoutent au panier)
    atc_rate = calc_rate(add_to_cart, product_views) if ga4_available else 0.0
    atc_benchmark = (
        benchmarks_service.evaluate("product_view_to_atc", atc_rate) if ga4_available else None
    )
    stages.append(
        {
            "name": "Ajout Panier",
            "value": add_to_cart,
            "rate": atc_rate,
            "rate_label": "% Vues Produit",
            "source": "GA4",
            "benchmark_key": "product_view_to_atc",
            "benchmark_status": atc_benchmark["status"] if atc_benchmark else "requires_ga4",
            "benchmark": atc_benchmark,
        }
    )

    # Stage 4: Checkout (% des ajouts panier qui passent au checkout)
    checkout_rate = calc_rate(begin_checkout, add_to_cart) if ga4_available else 0.0
    checkout_benchmark = (
        benchmarks_service.evaluate("atc_to_checkout", checkout_rate) if ga4_available else None
    )
    stages.append(
        {
            "name": "Checkout",
            "value": begin_checkout,
            "rate": checkout_rate,
            "rate_label": "% Ajout Panier",
            "source": "GA4",
            "benchmark_key": "atc_to_checkout",
            "benchmark_status": (
                checkout_benchmark["status"] if checkout_benchmark else "requires_ga4"
            ),
            "benchmark": checkout_benchmark,
        }
    )

    # Stage 5: Achat GA4 (% des checkouts qui achètent - GA4 tracked only)
    purchase_rate = calc_rate(ga4_purchases, begin_checkout) if ga4_available else 0.0
    purchase_benchmark = (
        benchmarks_service.evaluate("checkout_completion", purchase_rate) if ga4_available else None
    )
    stages.append(
        {
            "name": "Achat",
            "value": ga4_purchases,
            "rate": purchase_rate,
            "rate_label": "% Checkout",
            "source": "GA4",
            "benchmark_key": "checkout_completion",
            "benchmark_status": (
                purchase_benchmark["status"] if purchase_benchmark else "requires_ga4"
            ),
            "benchmark": purchase_benchmark,
        }
    )

    # Evaluate global CVR against benchmark (GA4-only CVR)
    cvr_benchmark = benchmarks_service.evaluate("cvr_luxury", ga4_cvr)

    return {
        # GA4 Funnel (consistent source for CVR analysis)
        "visitors": visitors,
        "product_views": product_views,
        "add_to_cart": add_to_cart,
        "checkout": begin_checkout,
        "purchases": ga4_purchases,
        "global_cvr": ga4_cvr,
        "stages": stages,
        "ga4_available": ga4_available,
        "ga4_error": ga4_data.get("error"),
        # Shopify Business Metrics (source of truth for revenue)
        "shopify": {
            "orders": shopify_orders,
            "checkout_started": shopify_checkout,
            "revenue": shopify_data.get("revenue", 0),
            "aov": shopify_data.get("aov", 0),
        },
        # Tracking coverage (GA4 vs Shopify comparison)
        "tracking_coverage": {
            "ga4_purchases": ga4_purchases,
            "shopify_orders": shopify_orders,
            "coverage_rate": calc_rate(ga4_purchases, shopify_orders) if shopify_orders > 0 else 0,
            "note": "Si < 100%, certaines commandes ne sont pas trackées par GA4",
        },
        "benchmarks": {
            "global_cvr": cvr_benchmark,
        },
        # Empty cvr_by_entry - requires GA4 landing pages integration
        "cvr_by_entry": [],
        "cvr_stats": {
            "mean": ga4_cvr,
            "min": ga4_cvr,
            "max": ga4_cvr,
            "median": ga4_cvr,
            "count": 1,
        },
        "period": f"{period}d",
        "last_updated": shopify_data.get("last_updated", ""),
    }


@app.get("/api/analytics/funnel/by-collection")
async def get_funnel_by_collection(
    period: int = Query(30, description="Period in days"),
) -> dict[str, Any]:
    """Get CVR breakdown by collection with GA4 visitor data."""
    # Get Shopify purchase data by collection
    collections = shopify_analytics.get_cvr_by_collection(period)

    # Get GA4 visitor data by collection page
    ga4_visitors = ga4_analytics.get_visitors_by_collection(period)
    ga4_available = len(ga4_visitors) > 0

    # Enrich collections with GA4 visitor data and calculate real CVR
    enriched_collections = []
    for coll in collections:
        coll_dict = coll.model_dump()

        # Try to match by collection handle (from collection name or ID)
        # GA4 uses handles from URL paths like /collections/handle
        handle = coll_dict.get("collection_name", "").lower().replace(" ", "-")
        visitors = ga4_visitors.get(handle, 0)

        # Also try with numeric ID in case it's stored differently
        coll_id = coll_dict.get("collection_id", "")
        if visitors == 0:
            visitors = ga4_visitors.get(coll_id, 0)

        coll_dict["visitors"] = visitors
        coll_dict["ga4_available"] = visitors > 0

        # Calculate real CVR if we have visitors
        purchases = coll_dict.get("purchases", 0)
        if visitors > 0:
            coll_dict["cvr"] = round((purchases / visitors) * 100, 2)
            # Evaluate against benchmark
            benchmark = benchmarks_service.evaluate("cvr_luxury", coll_dict["cvr"])
            coll_dict["benchmark_status"] = benchmark["status"]
        else:
            coll_dict["cvr"] = 0
            coll_dict["benchmark_status"] = "requires_ga4"

        enriched_collections.append(coll_dict)

    # Sort by CVR descending (prioritize collections with CVR data)
    enriched_collections.sort(key=lambda x: (x["cvr"], x["purchases"]), reverse=True)

    return {
        "period": f"{period}d",
        "ga4_available": ga4_available,
        "collections": enriched_collections,
    }


@app.get("/api/analytics/sales/filters")
async def get_sales_filters(
    request: Request,
    period: int = Query(30, description="Period in days"),
    *,
    all_catalog: bool = Query(default=False, description="Include all tags from catalog"),
) -> dict[str, Any]:
    """Get available tags and collections for filtering sales analysis.

    Args:
        period: Period in days for sold products
        all_catalog: If True, return ALL tags from catalog, not just sold products
    """
    filters = shopify_analytics.get_available_filters(period, include_all_catalog=all_catalog)
    return {
        **filters.model_dump(),
        "source": "catalog" if all_catalog else "sold_products",
        "period": f"{period}d" if not all_catalog else None,
    }


@app.get("/api/analytics/sales/by-tag/{tag}")
async def get_sales_by_tag(
    tag: str,
    period: int = Query(30, description="Period in days"),
) -> dict[str, Any]:
    """Get sales analysis filtered by a specific tag with GA4 view data."""
    analysis = shopify_analytics.get_sales_by_tag(tag, period)
    result = analysis.model_dump()

    # Get GA4 product views to calculate CVR per product
    ga4_product_views = ga4_analytics.get_visitors_by_product(period)
    ga4_available = len(ga4_product_views) > 0

    # Enrich products with view data and CVR
    total_views = 0
    products_with_cvr = []
    for product in result.get("products", []):
        handle = product.get("product_handle", "")
        views = ga4_product_views.get(handle, 0)
        total_views += views

        product["views"] = views
        product["ga4_available"] = views > 0

        # Calculate CVR: sales / views
        quantity_sold = product.get("quantity_sold", 0)
        if views > 0:
            product["cvr"] = round((quantity_sold / views) * 100, 2)
        else:
            product["cvr"] = 0

        products_with_cvr.append(product)

    result["products"] = products_with_cvr
    result["total_views"] = total_views
    result["ga4_available"] = ga4_available

    # Calculate overall CVR for the tag
    if total_views > 0:
        result["overall_cvr"] = round((result["total_quantity"] / total_views) * 100, 2)
    else:
        result["overall_cvr"] = 0

    return result


@app.get("/api/analytics/sales/by-collection/{collection_id}")
async def get_sales_by_collection(
    collection_id: str,
    period: int = Query(30, description="Period in days"),
) -> dict[str, Any]:
    """Get sales analysis filtered by a specific collection with GA4 view data."""
    analysis = shopify_analytics.get_sales_by_collection(collection_id, period)
    result = analysis.model_dump()

    # Get GA4 product views to calculate CVR per product
    ga4_product_views = ga4_analytics.get_visitors_by_product(period)
    ga4_available = len(ga4_product_views) > 0

    # Enrich products with view data and CVR
    total_views = 0
    products_with_cvr = []
    for product in result.get("products", []):
        handle = product.get("product_handle", "")
        views = ga4_product_views.get(handle, 0)
        total_views += views

        product["views"] = views
        product["ga4_available"] = views > 0

        # Calculate CVR: sales / views
        quantity_sold = product.get("quantity_sold", 0)
        if views > 0:
            product["cvr"] = round((quantity_sold / views) * 100, 2)
        else:
            product["cvr"] = 0

        products_with_cvr.append(product)

    result["products"] = products_with_cvr
    result["total_views"] = total_views
    result["ga4_available"] = ga4_available

    # Calculate overall CVR for the collection
    if total_views > 0:
        result["overall_cvr"] = round((result["total_quantity"] / total_views) * 100, 2)
    else:
        result["overall_cvr"] = 0

    return result


@app.get("/api/analytics/ga4/status")
async def get_ga4_status() -> dict[str, Any]:
    """Check GA4 integration status."""
    ga4_config = config_service.get_ga4_values()
    property_id = ga4_config.get("property_id", "")

    available = ga4_analytics.is_available()
    if available:
        # Try a quick test fetch
        test_data = ga4_analytics.get_funnel_metrics(7)
        return {
            "available": test_data.get("error") is None,
            "error": test_data.get("error"),
            "property_id": property_id,
            "sample_data": (
                {
                    "visitors_7d": test_data.get("visitors"),
                    "product_views_7d": test_data.get("product_views"),
                    "add_to_cart_7d": test_data.get("add_to_cart"),
                }
                if test_data.get("error") is None
                else None
            ),
        }
    return {
        "available": False,
        "error": "GA4 client not initialized. Check settings.",
        "property_id": property_id,
    }


@app.get("/api/benchmarks")
async def get_benchmarks() -> dict[str, Any]:
    """Get benchmark configuration."""
    return benchmarks_service.get_full_config()


@app.get("/api/benchmarks/industries")
async def get_industries() -> dict[str, Any]:
    """Get available industries for benchmark configuration."""
    return {"industries": benchmarks_service.get_available_industries()}


@app.put("/api/benchmarks/industry/{industry_id}")
async def set_industry(industry_id: str) -> dict[str, Any]:
    """Set the current industry for benchmarks."""
    try:
        benchmarks_service.set_industry(industry_id)
        return benchmarks_service.get_full_config()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@app.put("/api/benchmarks")
async def update_benchmarks(config_data: dict[str, Any]) -> dict[str, Any]:
    """Update benchmark configuration."""
    benchmarks_service.save_config(config_data)
    return benchmarks_service.get_full_config()


# ============================================================================
# AUDIT ENDPOINTS - GA4 vs Shopify Data Cross-Check
# ============================================================================


@app.get("/api/audit/status")
async def get_audit_status() -> dict[str, Any]:
    """Get quick audit status without running full audit."""
    return audit_service.get_status()


@app.get("/api/audit/tracking")
async def run_tracking_audit(
    request: Request,
    period: int = Query(30, description="Period in days"),
) -> dict[str, Any]:
    """Run comprehensive tracking audit comparing GA4 vs Shopify data."""
    return audit_service.run_full_audit(period)


@app.post("/api/audit/trigger")
async def trigger_audit_job(
    period: int = Query(30, description="Period in days"),
) -> dict[str, Any]:
    """Trigger async GA4 tracking audit job via Inngest (if configured)."""
    from jobs.inngest_setup import trigger_ga4_audit

    return await trigger_ga4_audit(period)


# ============================================================================
# CONFIGURATION ENDPOINTS - Settings Management
# ============================================================================


@app.get("/api/config")
async def get_config() -> dict[str, Any]:
    """Get all configuration sections with current values."""
    return config_service.get_all_config()


@app.post("/api/config/test/shopify")
async def test_shopify() -> dict[str, Any]:
    """Test Shopify API connection."""
    return config_service.test_shopify_connection()


@app.post("/api/config/test/ga4")
async def test_ga4() -> dict[str, Any]:
    """Test Google Analytics 4 connection."""
    return config_service.test_ga4_connection()


@app.post("/api/config/test/inngest")
async def test_inngest() -> dict[str, Any]:
    """Test Inngest connection."""
    return config_service.test_inngest_connection()


@app.post("/api/config/test/meta")
async def test_meta() -> dict[str, Any]:
    """Test Meta (Facebook) API connection."""
    return config_service.test_meta_connection()


@app.post("/api/config/test/search_console")
async def test_search_console() -> dict[str, Any]:
    """Test Google Search Console connection."""
    return config_service.test_search_console_connection()


@app.post("/api/config/test/serpapi")
async def test_serpapi() -> dict[str, Any]:
    """Test SerpAPI connection."""
    return config_service.test_serpapi_connection()


@app.post("/api/config/test/merchant_center")
async def test_merchant_center() -> dict[str, Any]:
    """Test Google Merchant Center connection."""
    return config_service.test_merchant_center_connection()


@app.put("/api/config")
async def update_config(updates: dict[str, str]) -> dict[str, Any]:
    """Update configuration values."""
    return config_service.update_config(updates)


# ============================================================================
# PERMISSIONS & THEME ANALYSIS ENDPOINTS
# ============================================================================


@app.get("/api/permissions")
async def get_permissions() -> dict[str, Any]:
    """Get full permissions report for all configured services."""
    return permissions_checker.get_permissions_summary()


@app.get("/api/permissions/shopify")
async def get_shopify_permissions() -> dict[str, Any]:
    """Get Shopify-only permissions report (faster)."""
    report = permissions_checker.check_shopify_permissions_only()
    return {
        "all_granted": report.all_granted,
        "results": [
            {
                "id": r.requirement.id,
                "name": r.requirement.name,
                "status": r.status.value,
                "severity": r.requirement.severity.value,
                "error_message": r.error_message,
                "how_to_grant": r.requirement.how_to_grant.strip(),
            }
            for r in report.results
        ],
        "checked_at": report.checked_at,
    }


@app.get("/api/theme/analysis")
async def get_theme_analysis(refresh: bool = False) -> dict[str, Any]:
    """Analyze the active Shopify theme for tracking code issues."""
    return theme_analyzer.get_analysis_summary()


@app.get("/api/theme/tracking-code")
async def get_tracking_code_analysis(refresh: bool = False) -> dict[str, Any]:
    """Get detailed tracking code analysis from theme files."""
    analysis = theme_analyzer.analyze_theme(force_refresh=refresh)
    return {
        "ga4": {
            "configured": analysis.ga4_configured,
            "measurement_id": analysis.ga4_measurement_id,
            "events_found": analysis.ga4_events_found,
            "required_events": theme_analyzer.REQUIRED_GA4_EVENTS,
            "missing_events": [
                e for e in theme_analyzer.REQUIRED_GA4_EVENTS if e not in analysis.ga4_events_found
            ],
        },
        "meta_pixel": {
            "configured": analysis.meta_pixel_configured,
            "pixel_id": analysis.meta_pixel_id,
            "events_found": analysis.meta_events_found,
            "required_events": (
                theme_analyzer.REQUIRED_META_EVENTS if analysis.meta_pixel_configured else []
            ),
            "missing_events": (
                [
                    e
                    for e in theme_analyzer.REQUIRED_META_EVENTS
                    if e not in analysis.meta_events_found
                ]
                if analysis.meta_pixel_configured
                else []
            ),
        },
        "gtm": {
            "configured": analysis.gtm_configured,
            "container_id": analysis.gtm_container_id,
        },
        "issues": [
            {
                "type": i.issue_type,
                "tracking": i.tracking_type.value,
                "event": i.event,
                "file": i.file_path,
                "line": i.line_number,
                "description": i.description,
                "severity": i.severity,
                "fix_available": i.fix_available,
            }
            for i in analysis.issues
        ],
        "files_analyzed": analysis.files_analyzed,
        "analyzed_at": analysis.analyzed_at,
    }


@app.post("/api/theme/fix/{issue_index}")
async def apply_theme_fix(issue_index: int) -> dict[str, Any]:
    """Apply a fix for a specific tracking issue.

    WARNING: This modifies the Shopify theme files.
    """
    analysis = theme_analyzer.analyze_theme()

    if issue_index < 0 or issue_index >= len(analysis.issues):
        raise HTTPException(status_code=404, detail="Issue index out of range")

    issue = analysis.issues[issue_index]

    if not issue.fix_available:
        raise HTTPException(status_code=400, detail="No automatic fix available for this issue")

    success = theme_analyzer.apply_fix(issue)

    if success:
        return {
            "success": True,
            "message": f"Fix applied for {issue.event} event",
            "issue": {
                "type": issue.issue_type,
                "event": issue.event,
                "file": issue.file_path,
            },
        }
    raise HTTPException(
        status_code=500, detail="Failed to apply fix - check theme write permissions"
    )


# ============================================================================
# AUDIT ORCHESTRATOR ENDPOINTS (Pipeline-style audits)
# ============================================================================


@app.get("/api/audits")
async def get_available_audits() -> dict[str, Any]:
    """Get list of available audit types with their last run status."""
    return {
        "audits": audit_orchestrator.get_available_audits(),
    }


@app.get("/api/audits/session")
async def get_latest_audit_session() -> dict[str, Any]:
    """Get the latest audit session with all results."""
    session = audit_orchestrator.get_latest_session()
    if not session:
        return {"session": None}

    return {
        "session": {
            "id": session.id,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "audits": {k: audit_orchestrator.result_to_dict(v) for k, v in session.audits.items()},
        },
    }


@app.post("/api/audits/run/{audit_type}")
async def run_audit(
    audit_type: str,
    period: int = Query(default=30),
) -> dict[str, Any]:
    """Run a specific audit type via Inngest async workflows.

    All audits run asynchronously via Inngest. Poll /api/audits/session for results.

    Args:
        audit_type: The type of audit to run
        period: Number of days to analyze (for GA4)
    """
    try:
        audit_enum = AuditType(audit_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown audit type: {audit_type}")

    from jobs.inngest_setup import (
        trigger_audit,
        trigger_onboarding_audit,
    )

    # Onboarding has its own specialized workflow
    if audit_enum == AuditType.ONBOARDING:
        trigger_result = await trigger_onboarding_audit()
    else:
        # Use dedicated workflows via trigger_audit dispatcher
        trigger_result = await trigger_audit(audit_type, period)

    if trigger_result.get("status") == "error":
        raise HTTPException(
            status_code=503,
            detail=f"Inngest not available: {trigger_result.get('message', 'Unknown error')}",
        )

    # Return async response - frontend will poll /api/audits/session
    return {
        "async": True,
        "run_id": trigger_result.get("run_id"),
        "audit_type": audit_type,
        "status": "triggered",
        "message": "Audit started via Inngest. Poll /api/audits/session for results.",
    }


# Background task storage for async actions
_background_tasks_status: dict[str, dict[str, Any]] = {}


def _run_action_in_background(task_id: str, audit_type: str, action_id: str) -> None:
    """Execute an audit action in background and store result."""
    try:
        _background_tasks_status[task_id]["status"] = "running"
        result = audit_orchestrator.execute_action(audit_type, action_id)
        _background_tasks_status[task_id] = {
            "status": "completed" if result.get("success") else "failed",
            "result": result,
        }
    except Exception as e:
        _background_tasks_status[task_id] = {
            "status": "failed",
            "result": {"success": False, "error": str(e)},
        }


@app.post("/api/audits/action")
async def execute_audit_action(
    background_tasks: BackgroundTasks,
    audit_type: str = Query(...),
    action_id: str = Query(...),
    async_mode: bool = Query(default=False),
) -> dict[str, Any]:
    """Execute a correction action on an audit issue.

    This is ONLY triggered by explicit user action (button click).
    The action must have been identified in a previous audit run.

    Args:
        audit_type: The type of audit (e.g., "merchant_center")
        action_id: The specific action to execute (e.g., "publish_to_google")
        async_mode: If True, run in background and return task_id for polling
    """
    if async_mode:
        # Generate task ID and start background execution
        import uuid

        task_id = str(uuid.uuid4())
        _background_tasks_status[task_id] = {"status": "pending"}
        background_tasks.add_task(_run_action_in_background, task_id, audit_type, action_id)
        return {"async": True, "task_id": task_id, "status": "pending"}

    # Synchronous execution (for quick actions)
    result = audit_orchestrator.execute_action(audit_type, action_id)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Action failed"))

    return result


@app.get("/api/audits/action/status")
async def get_action_status(task_id: str = Query(...)) -> dict[str, Any]:
    """Get the status of an async action.

    Returns the task status and result when completed.
    """
    if task_id not in _background_tasks_status:
        raise HTTPException(status_code=404, detail="Task not found")

    task_data = _background_tasks_status[task_id]

    # Clean up completed tasks after returning (keep for 5 min max)
    if task_data["status"] in ("completed", "failed"):
        # Don't delete immediately - let frontend fetch result
        pass

    return task_data


@app.get("/")
async def dashboard() -> FileResponse:
    """Sert le dashboard HTML."""
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/static/{filename:path}", response_model=None)
async def static_files(filename: str) -> FileResponse:
    """Sert les fichiers statiques (images, etc.)."""
    filepath = BASE_DIR / "static" / filename
    if filepath.exists():
        return FileResponse(filepath)
    raise HTTPException(status_code=404, detail="Fichier non trouvé")


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8080"))
    uvicorn.run(app, host=host, port=port)
