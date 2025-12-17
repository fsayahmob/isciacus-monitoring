#!/usr/bin/env python3
"""
monitoring_app.py - Application web de monitoring des produits ISCIACUS
Backend FastAPI avec données Shopify GraphQL uniquement
"""

import os
from pathlib import Path
from typing import Optional

import requests
import uvicorn
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.responses import FileResponse


# Load environment variables
load_dotenv()

# Configuration from environment
BASE_DIR = Path(__file__).parent
STORE_URL = os.getenv("SHOPIFY_STORE_URL", "")
ACCESS_TOKEN = os.getenv("SHOPIFY_ACCESS_TOKEN", "")
TVA_RATE = float(os.getenv("TVA_RATE", "1.20"))

if not STORE_URL or not ACCESS_TOKEN:
    raise ValueError("SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN must be set in .env")

GRAPHQL_URL = f"{STORE_URL}/admin/api/2024-01/graphql.json"
HEADERS = {"X-Shopify-Access-Token": ACCESS_TOKEN, "Content-Type": "application/json"}

# Cache global
PRODUCTS_CACHE: list[dict] = []
FILTERS_CACHE: dict = {}

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


def calculate_margin_tag(prix_ht: float, cout_ht: float) -> Optional[str]:
    """Calcule le tag de marge basé sur le pourcentage."""
    if prix_ht <= 0 or cout_ht <= 0:
        return None
    marge_pct = ((prix_ht - cout_ht) / prix_ht) * 100
    if marge_pct >= 60:
        return "marge:haute"
    if marge_pct >= 40:
        return "marge:moyenne"
    return "marge:faible"


def calculate_stock_tag(stock: int) -> str:
    """Calcule le tag de stock."""
    if stock == 0:
        return "stock:rupture"
    if stock <= 2:
        return "stock:faible"
    if stock <= 5:
        return "stock:moyen"
    return "stock:ok"


def get_stock_level(stock: int) -> str:
    """Retourne le niveau de stock pour le filtrage."""
    if stock == 0:
        return "rupture"
    if stock <= 2:
        return "faible"
    if stock <= 5:
        return "moyen"
    return "ok"


def build_tags(
    status: str, published: bool, stock: int, prix_ht: float, cout_ht: float
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


def fetch_shopify_products(tag_filter: Optional[str] = None) -> list[dict]:
    """Récupère tous les produits depuis Shopify GraphQL."""
    all_products: list[dict] = []
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


def transform_product(shopify_product: dict, variant: dict) -> dict:
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
    tags = build_tags(status, published, stock, prix_ht, cout_ht)
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
        "marge_pct": f"{((prix_ht - cout_ht) / prix_ht * 100):.1f}%" if prix_ht > 0 and cout_ht > 0 else "",
        "statut": status,
        "publie": published,
        "channels": channels,
        "collections": collections,
        "url": f"https://www.isciacusstore.com/products/{shopify_product.get('handle', '')}",
        "image_url": image_url,
        "shopify_tags": shopify_tags,
        "tags": tags,
    }


def load_all_products() -> tuple[list[dict], dict]:
    """Charge tous les produits depuis Shopify GraphQL."""
    shopify_products = fetch_shopify_products()

    products: list[dict] = []
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


app = FastAPI(title="ISCIACUS Monitoring", version="2.2.0", lifespan=lifespan)


@app.get("/api/products")
async def get_products(
    search: Optional[str] = None,
    tag: Optional[str] = None,
    stock_level: Optional[str] = None,
    publie: Optional[bool] = None,
    channel: Optional[str] = None,
    collection: Optional[str] = None,
    statut: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
) -> dict:
    """Liste les produits avec filtres."""
    filtered = PRODUCTS_CACHE

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

    # Compter les produits uniques dans les résultats filtrés
    unique_filtered_products = len({p["product_id"] for p in filtered})

    return {
        "total": len(filtered),
        "total_products": unique_filtered_products,
        "limit": limit,
        "offset": offset,
        "products": filtered[offset : offset + limit],
    }


@app.get("/api/products/{product_id}")
async def get_product(product_id: str) -> dict:
    """Détails complets d'un produit."""
    for p in PRODUCTS_CACHE:
        if p["product_id"] == product_id:
            return p
    return {"error": "Produit non trouvé"}


@app.get("/api/filters")
async def get_filters() -> dict:
    """Retourne les valeurs disponibles pour les filtres."""
    return FILTERS_CACHE


@app.get("/api/reload")
async def reload_data() -> dict:
    """Recharge les données depuis Shopify."""
    global PRODUCTS_CACHE, FILTERS_CACHE
    PRODUCTS_CACHE, FILTERS_CACHE = load_all_products()
    return {"status": "ok", "count": len(PRODUCTS_CACHE)}


@app.get("/api/health")
async def health_check() -> dict:
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "products_count": len(PRODUCTS_CACHE)}


@app.get("/")
async def dashboard() -> FileResponse:
    """Sert le dashboard HTML."""
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/static/{filename:path}")
async def static_files(filename: str) -> FileResponse | dict:
    """Sert les fichiers statiques (images, etc.)."""
    filepath = BASE_DIR / "static" / filename
    if filepath.exists():
        return FileResponse(filepath)
    return {"error": "Fichier non trouvé"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
