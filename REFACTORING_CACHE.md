# Refactoring Cache - Migration vers CacheService

**Date** : 2025-12-19
**Objectif** : Remplacer les variables globales en mémoire par un service de cache persistant

---

## 🎯 Problème Initial

### Variables globales volatiles
```python
# ❌ AVANT - monitoring_app.py
PRODUCTS_CACHE: list[ProductData] = []  # Mémoire volatile
FILTERS_CACHE: FiltersData = {}         # Mémoire volatile

@asynccontextmanager
async def lifespan(_: FastAPI):
    global PRODUCTS_CACHE, FILTERS_CACHE
    PRODUCTS_CACHE, FILTERS_CACHE = load_all_products()
    yield
```

**Problèmes** :
1. ❌ Cache perdu au redémarrage du backend
2. ❌ Non partageable entre workers (si scaling horizontal)
3. ❌ Non persistant entre déploiements
4. ❌ Variables globales = anti-pattern architectural
5. ❌ Impossible de vérifier si le cache est périmé (stale)

---

## ✅ Solution Implémentée

### Nouveau CacheService persistant

**Fichier créé** : `backend/services/cache_service.py`

```python
class CacheService:
    """Service de cache persistant pour produits et filtres Shopify."""

    CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"
    PRODUCTS_FILE = CACHE_DIR / "products.json"
    FILTERS_FILE = CACHE_DIR / "filters.json"
    TTL_SECONDS = 3600  # 1 heure

    def get_products(self) -> list[dict[str, Any]] | None
    def set_products(self, products: list[dict[str, Any]]) -> None
    def get_filters(self) -> dict[str, Any] | None
    def set_filters(self, filters: dict[str, Any]) -> None
    def is_stale(self, cache_type: str) -> bool
    def clear_all(self) -> None
```

**Structure du cache JSON** :
```json
{
  "data": [...],
  "cached_at": "2025-12-19T17:30:00.000000+00:00",
  "ttl_seconds": 3600
}
```

---

## 🔄 Modifications Effectuées

### 1. Import du nouveau service
```python
# monitoring_app.py
from services.cache_service import CacheService
```

### 2. Initialisation du service
```python
# Remplace les variables globales
cache_service = CacheService()
```

### 3. Fonction lifespan refactorisée
```python
@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    """Initialize application - load products cache on startup."""
    # Try to load from cache first
    products = cache_service.get_products()
    filters = cache_service.get_filters()

    # If cache miss or stale, reload from Shopify
    if products is None or filters is None:
        products, filters = load_all_products()
        cache_service.set_products(products)
        cache_service.set_filters(filters)

    yield
```

### 4. Endpoints mis à jour

#### GET /api/products
```python
@app.get("/api/products")
async def get_products(...):
    # ✅ Nouveau pattern
    products = cache_service.get_products()
    if products is None:
        products, filters = load_all_products()
        cache_service.set_products(products)
        cache_service.set_filters(filters)

    filtered = _apply_filters(products, ...)
    return {...}
```

#### GET /api/products/{product_id}
```python
@app.get("/api/products/{product_id}")
async def get_product(product_id: str):
    products = cache_service.get_products()
    if products is None:
        products, filters = load_all_products()
        cache_service.set_products(products)
        cache_service.set_filters(filters)

    for p in products:
        if p["product_id"] == product_id:
            return p
    return {"error": "Produit non trouvé"}
```

#### GET /api/filters
```python
@app.get("/api/filters")
async def get_filters():
    filters = cache_service.get_filters()
    if filters is None:
        products, filters = load_all_products()
        cache_service.set_products(products)
        cache_service.set_filters(filters)
    return filters
```

#### GET /api/reload
```python
@app.get("/api/reload")
async def reload_data():
    """Recharge les données depuis Shopify et met à jour le cache."""
    products, filters = load_all_products()
    cache_service.set_products(products)
    cache_service.set_filters(filters)
    return {"status": "ok", "count": len(products)}
```

#### GET /api/health
```python
@app.get("/api/health")
async def health_check():
    products = cache_service.get_products()
    count = len(products) if products else 0
    return {"status": "healthy", "products_count": count}
```

---

## 📊 Comparaison Avant/Après

| Aspect | Avant (Global Vars) | Après (CacheService) |
|--------|---------------------|----------------------|
| **Persistance** | ❌ Perdu au restart | ✅ Sauvegardé dans fichiers JSON |
| **TTL** | ❌ Pas de gestion | ✅ 1 heure (configurable) |
| **Stale detection** | ❌ Impossible | ✅ Automatique via timestamp |
| **Scaling** | ❌ Non partageable | ✅ Partageable via fichiers |
| **Architecture** | ❌ Anti-pattern (global) | ✅ Service séparé |
| **Testabilité** | ❌ Difficile | ✅ Facilement mockable |
| **Visibilité** | ❌ Opaque | ✅ Fichiers JSON inspectables |

---

## 🗂️ Structure des Fichiers

```
backend/data/cache/  (nouveau dossier)
├── products.json    ← Cache produits Shopify
└── filters.json     ← Cache filtres (tags, collections, etc.)
```

**Exemple `products.json`** :
```json
{
  "data": [
    {
      "product_id": "123",
      "titre": "T-Shirt",
      "prix_ttc": 29.99,
      ...
    }
  ],
  "cached_at": "2025-12-19T17:30:00.000000+00:00",
  "ttl_seconds": 3600
}
```

---

## ✅ Avantages du Refactoring

### 1. **Persistance**
- Cache survit aux redémarrages du backend
- Pas besoin de recharger depuis Shopify à chaque restart

### 2. **Performance**
- TTL de 1 heure évite les appels Shopify inutiles
- Détection automatique du cache périmé

### 3. **Architecture propre**
- Séparation des responsabilités (SRP)
- Service réutilisable et testable
- Plus de variables globales

### 4. **Debugging**
- Fichiers JSON inspectables manuellement
- Timestamp visible pour diagnostics
- Possibilité de vider le cache facilement

### 5. **Scalabilité**
- Cache partageable entre workers
- Possibilité future de migrer vers Redis si besoin

---

## 🧪 Tests de Validation

### Import du service
```bash
python3 -c "from services.cache_service import CacheService; print('✅ OK')"
```

### Import de l'app
```bash
python3 -c "from monitoring_app import app; print('✅ OK')"
```

### Vérifier qu'il n'y a plus de variables globales
```bash
grep -n "PRODUCTS_CACHE\|FILTERS_CACHE" backend/monitoring_app.py
# Doit retourner : ✅ No matches (plus aucune référence)
```

### Tester les endpoints
```bash
# Health check
curl http://localhost:8080/api/health

# Products
curl http://localhost:8080/api/products?limit=5

# Filters
curl http://localhost:8080/api/filters

# Reload cache
curl http://localhost:8080/api/reload
```

---

## 🔮 Évolutions Futures Possibles

### 1. Migration vers Redis (si besoin de scaling)
```python
class RedisCacheService(CacheService):
    def __init__(self, redis_url: str):
        self.redis = Redis.from_url(redis_url)

    def get_products(self):
        data = self.redis.get("products")
        return json.loads(data) if data else None
```

### 2. Cache multi-niveaux
```python
# L1: Mémoire (rapide)
# L2: Fichier JSON (persistant)
# L3: Redis (partagé)
```

### 3. Cache par collection/tag
```python
cache_service.get_products(tag="winter")
cache_service.get_products(collection="new-arrivals")
```

### 4. Monitoring du cache
```python
cache_service.get_stats()
# → {"hits": 1234, "misses": 56, "hit_rate": 95.6}
```

---

## 📝 Checklist de Déploiement

- [x] CacheService créé et testé
- [x] Variables globales supprimées
- [x] Fonction lifespan refactorisée
- [x] Tous les endpoints mis à jour
- [x] Imports vérifiés (pas d'erreurs)
- [x] Dossier `backend/data/cache/` créé
- [x] Volume Docker configuré (`./backend:/app`)
- [ ] Tests fonctionnels après redémarrage
- [ ] Vérifier que le cache persiste au restart
- [ ] Monitorer les performances (temps de réponse)

---

## 🎯 Impact sur le Projet

### Code supprimé
- 2 variables globales (`PRODUCTS_CACHE`, `FILTERS_CACHE`)
- 3 lignes `global` statements

### Code ajouté
- 1 nouveau service (145 lignes)
- 1 nouveau dossier de cache
- Gestion TTL automatique

### Endpoints modifiés
- `GET /api/products`
- `GET /api/products/{product_id}`
- `GET /api/filters`
- `GET /api/reload`
- `GET /api/health`
- Fonction `lifespan`

---

## 🔗 Références

- [Architecture.md](ARCHITECTURE.md) - Architecture complète du projet
- [CacheService source](backend/services/cache_service.py)
- [monitoring_app.py](backend/monitoring_app.py) - Application refactorisée

---

**Refactoring réalisé avec succès** ✅
**Prêt pour les nouvelles fonctionnalités (RFM, Ads Strategy)** 🚀
