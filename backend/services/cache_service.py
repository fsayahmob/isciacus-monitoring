"""
Cache Service - Persistent caching layer for products and filters.

Replaces in-memory global variables with file-based cache.
Provides TTL-based invalidation and automatic persistence.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class CacheService:
    """Service de cache persistant pour produits et filtres Shopify."""

    CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"
    PRODUCTS_FILE = CACHE_DIR / "products.json"
    FILTERS_FILE = CACHE_DIR / "filters.json"
    TTL_SECONDS = 3600  # 1 heure

    def __init__(self) -> None:
        """Initialise le service et crée le dossier cache."""
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # =========================================================================
    # Products Cache
    # =========================================================================

    def get_products(self) -> list[dict[str, Any]] | None:
        """
        Récupère les produits du cache.

        Returns:
            Liste des produits si cache valide, None si périmé ou inexistant.
        """
        return self._read_cache(self.PRODUCTS_FILE)

    def set_products(self, products: list[dict[str, Any]]) -> None:
        """
        Sauvegarde les produits dans le cache.

        Args:
            products: Liste complète des produits Shopify
        """
        self._write_cache(self.PRODUCTS_FILE, products)

    # =========================================================================
    # Filters Cache
    # =========================================================================

    def get_filters(self) -> dict[str, Any] | None:
        """
        Récupère les filtres du cache.

        Returns:
            Dictionnaire des filtres si cache valide, None si périmé.
        """
        return self._read_cache(self.FILTERS_FILE)

    def set_filters(self, filters: dict[str, Any]) -> None:
        """
        Sauvegarde les filtres dans le cache.

        Args:
            filters: Dictionnaire des filtres (tags, types, etc.)
        """
        self._write_cache(self.FILTERS_FILE, filters)

    # =========================================================================
    # Cache Management
    # =========================================================================

    def clear_all(self) -> None:
        """Vide tout le cache (produits + filtres)."""
        if self.PRODUCTS_FILE.exists():
            self.PRODUCTS_FILE.unlink()
        if self.FILTERS_FILE.exists():
            self.FILTERS_FILE.unlink()

    def is_stale(self, cache_type: str = "products") -> bool:
        """
        Vérifie si un cache est périmé.

        Args:
            cache_type: "products" ou "filters"

        Returns:
            True si le cache n'existe pas ou est périmé (> TTL)
        """
        cache_file = self.PRODUCTS_FILE if cache_type == "products" else self.FILTERS_FILE
        return self._is_cache_stale(cache_file)

    # =========================================================================
    # Private Methods
    # =========================================================================

    def _is_cache_stale(self, cache_file: Path) -> bool:
        """Vérifie si un fichier cache est périmé."""
        if not cache_file.exists():
            return True

        try:
            with cache_file.open() as f:
                data = json.load(f)
                cached_at_str = data.get("cached_at")
                if not cached_at_str:
                    return True

                cached_at = datetime.fromisoformat(cached_at_str)
                age_seconds = (datetime.now(UTC) - cached_at).total_seconds()
                return age_seconds > self.TTL_SECONDS

        except (json.JSONDecodeError, ValueError, KeyError, OSError):
            return True

    def _read_cache(self, cache_file: Path) -> Any:
        """Lit un fichier cache et retourne les données si valide."""
        if self._is_cache_stale(cache_file):
            return None

        try:
            with cache_file.open() as f:
                data = json.load(f)
                return data.get("data")
        except (json.JSONDecodeError, OSError):
            return None

    def _write_cache(self, cache_file: Path, data: Any) -> None:
        """Écrit des données dans un fichier cache avec timestamp."""
        cache_data = {
            "data": data,
            "cached_at": datetime.now(UTC).isoformat(),
            "ttl_seconds": self.TTL_SECONDS,
        }

        with cache_file.open("w") as f:
            json.dump(cache_data, f, indent=2, default=str)
