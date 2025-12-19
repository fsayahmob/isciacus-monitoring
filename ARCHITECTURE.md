# Architecture ISCIACUS Monitoring

## 🏗️ Vue d'Ensemble

Le projet est un **monorepo** avec 3 briques distinctes orchestrées par Docker Compose.

```
isciacus-monitoring/  (Monorepo Git)
│
├── frontend/         → Brique 1: Interface React
├── backend/          → Brique 2: API FastAPI + Workflows Inngest
└── docker-compose.yml → Orchestration 3 services Docker
    ├── Service: frontend (React)
    ├── Service: backend (FastAPI)
    └── Service: inngest (Serveur Inngest)
```

---

## 📦 Brique 1 : Frontend

**Stack** : React 19.2 + TypeScript 5.9 + Tailwind CSS 4.1 + React Query 5.90

**Responsabilités** :
- ✅ Interface utilisateur
- ✅ Modification des secrets via SettingsPage → `PUT /api/config`
- ✅ Polling temps réel des audits (hook `useAuditSession`)
- ❌ Aucune logique métier
- ❌ Aucun accès direct aux APIs externes

**Port** : 5173

---

## ⚙️ Brique 2 : Backend

**Stack** : FastAPI 0.109+ + Python 3.11+ + Inngest SDK 0.4.0

**Structure en couches** :

```
backend/
│
├── monitoring_app.py        ← COUCHE GATEWAY (endpoints FastAPI)
│
├── services/                ← COUCHE MÉTIER
│   ├── config_service.py      → Gère config.db (secrets)
│   ├── cache_service.py       → Gère cache/ (produits, filtres)
│   ├── audit_orchestrator.py → Gère audits/ (rapports)
│   ├── shopify_analytics.py
│   ├── ga4_analytics.py
│   └── ...
│
├── jobs/                    ← COUCHE WORKFLOWS ASYNC
│   ├── inngest_setup.py
│   ├── audit_workflow.py      → Client Inngest partagé
│   └── workflows/
│       ├── ga4_audit.py
│       ├── gmc_audit.py
│       └── onboarding.py
│
└── data/                    ← COUCHE PERSISTENCE (volume Docker)
    ├── config.db              → SQLite (secrets chiffrés)
    ├── cache/                 → Cache JSON (produits, filtres)
    │   ├── products.json
    │   └── filters.json
    ├── audits/                → Rapports JSON (sessions)
    │   ├── latest_session.json
    │   └── session_*.json
    └── credentials/           → Google service accounts
```

**Responsabilités** :
- ✅ API REST pour le frontend
- ✅ Logique métier (services)
- ✅ Définition des workflows Inngest (code Python)
- ✅ Stockage persistant (SQLite + JSON)
- ❌ N'exécute PAS directement les workflows longs (délégués à Inngest)

**Port** : 8080

---

## 🚀 Brique 3 : Inngest

**Type** : Image Docker officielle `inngest/inngest:latest` (binaire Go)

**Responsabilités** :
- ✅ Orchestration des workflows asynchrones
- ✅ Queue d'events
- ✅ Retry automatique en cas d'échec
- ✅ Dashboard de monitoring
- ✅ Appelle le backend pour exécuter les fonctions Python
- ❌ Ne contient AUCUN code métier (juste orchestration)

**Port** : 8288 (Dashboard)

**Configuration** :
```bash
inngest dev -u http://backend:8080/api/inngest
```

---

## 🗄️ Séparation des Données

### 1. **Secrets & Configuration** → `config.db` (SQLite)

**Géré par** : `ConfigService`
**Stockage** : `backend/data/config.db`
**Modifiable** : ✅ OUI via Frontend (PUT /api/config)
**Persistant** : ✅ OUI (volume Docker)

**Contenu** :
- Shopify credentials (store_url, access_token)
- GA4 credentials (property_id, measurement_id)
- Meta credentials (pixel_id, access_token)
- Google credentials (merchant_id, service account paths)

**Endpoints** :
```
GET  /api/config           → Récupère toutes les sections
PUT  /api/config           → Modifie secrets (depuis Frontend)
POST /api/config/test/*    → Teste connexions
```

---

### 2. **Cache Produits/Filtres** → `cache/*.json`

**Géré par** : `CacheService` (NOUVEAU)
**Stockage** : `backend/data/cache/`
**Modifiable** : ❌ NON (auto-géré)
**Persistant** : ✅ OUI (volume Docker)
**TTL** : 1 heure

**Contenu** :
- `products.json` → Liste complète produits Shopify
- `filters.json` → Filtres (tags, types, collections)

**Avantages** :
- ✅ Remplace variables globales `PRODUCTS_CACHE` / `FILTERS_CACHE`
- ✅ Survit aux redémarrages du backend
- ✅ Partageable entre workers (si scaling)

**Endpoints** :
```
GET /api/products   → Utilise cache ou recharge depuis Shopify
GET /api/reload     → Force rechargement et mise à jour cache
```

---

### 3. **Rapports d'Audit** → `audits/*.json`

**Géré par** : `AuditOrchestrator`
**Stockage** : `backend/data/audits/`
**Modifiable** : ❌ NON (généré automatiquement)
**Persistant** : ✅ OUI (volume Docker)

**Contenu** :
- `latest_session.json` → Session audit courante (pollée par Frontend)
- `session_<uuid>.json` → Historique des sessions

**Endpoints** :
```
GET  /api/audits/session       → Frontend poll toutes les 1s
POST /api/audits/run/{type}    → Déclenche audit async (Inngest)
```

---

## 🔄 Flow Complet : User Modifie un Secret

```
┌──────────────┐
│   Frontend   │  1. User modifie "META_PIXEL_ID" dans Settings
│  Settings    │  2. Clique "Save"
│   Page       │
└──────┬───────┘
       │ PUT /api/config
       │ { "META_PIXEL_ID": "123456" }
       ▼
┌──────────────┐
│   Backend    │  3. Endpoint reçoit requête
│  Gateway     │     @app.put("/api/config")
└──────┬───────┘     async def update_config(updates)
       │
       ▼
┌──────────────┐
│ ConfigService│  4. Service update
│              │     config_service.update_config(updates)
└──────┬───────┘     → Écrit dans config.db (chiffré)
       │
       ▼
┌──────────────┐
│  config.db   │  5. SQLite stocke (persistant)
│  (SQLite)    │     Table: meta_config
└──────────────┘     Row: { key: "pixel_id", value: "123456" }
       │
       │ Succès
       ▼
┌──────────────┐
│   Frontend   │  6. Confirmation "Sauvegardé ✓"
│  Settings    │  7. React Query invalide cache
└──────────────┘  8. Recharge config via GET /api/config
```

---

## 🔄 Flow Complet : User Lance un Audit

```
┌──────────────┐
│   Frontend   │  1. User clique "Run GA4 Audit"
│  Audit Page  │
└──────┬───────┘
       │ POST /api/audits/run/ga4_tracking
       ▼
┌──────────────┐
│   Backend    │  2. Endpoint déclenche Inngest
│  Gateway     │     await inngest_client.send(
└──────┬───────┘       Event("audit/ga4.requested")
       │             )
       │ HTTP Event
       ▼
┌──────────────┐
│   Inngest    │  3. Reçoit event dans queue
│   Server     │  4. Trouve fonction matching
└──────┬───────┘  5. POST /api/inngest (callback)
       │
       │ HTTP Callback
       ▼
┌──────────────┐
│   Backend    │  6. Exécute workflow Python
│  Workflow    │     async def ga4_audit(ctx):
│              │       step1 = await ctx.step.run("check_connection")
│              │       _save_progress()  → audits/latest_session.json
│              │       step2 = await ctx.step.run("analyze_coverage")
│              │       _save_progress()
└──────┬───────┘       ...
       │
       │ Polling (toutes les 1s)
       ▼
┌──────────────┐
│   Frontend   │  7. GET /api/audits/session (polling)
│  Audit Page  │  8. Lit latest_session.json
│              │  9. Affiche steps en temps réel
└──────────────┘ 10. Animation stepper + résultats
```

---

## 🎯 Règles Architecturales

### ✅ FAIRE

1. **Gateway (monitoring_app.py)** :
   - Endpoints FastAPI uniquement
   - Validation des requêtes
   - Appelle les services
   - Aucune logique métier
   - Aucun état global (pas de variables globales)

2. **Services (services/)** :
   - Logique métier réutilisable
   - Gestion du cache et de la persistance
   - Pas d'accès direct aux endpoints

3. **Workflows (jobs/workflows/)** :
   - Tâches async orchestrées par Inngest
   - Utilisent les services
   - Sauvegardent le progress après chaque step

4. **Persistence (data/)** :
   - SQLite pour secrets et config modifiable
   - JSON pour cache et rapports
   - Toujours via volume Docker

### ❌ NE PAS FAIRE

1. ❌ Variables globales dans `monitoring_app.py`
2. ❌ Logique métier dans les endpoints
3. ❌ État en mémoire non persistant
4. ❌ Accès direct au filesystem depuis les endpoints
5. ❌ Workflows synchrones longs dans FastAPI

---

## 📊 Matrice de Responsabilités

| Fonctionnalité | Frontend | Backend Gateway | Services | Inngest Workflows | Inngest Server |
|----------------|----------|----------------|----------|-------------------|----------------|
| **Affichage UI** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Endpoints REST** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Validation** | ⚠️ (client) | ✅ | ❌ | ❌ | ❌ |
| **Logique métier** | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Cache produits** | ❌ | ❌ | ✅ (CacheService) | ❌ | ❌ |
| **Config secrets** | ✅ (modif UI) | ❌ | ✅ (ConfigService) | ❌ | ❌ |
| **Audits** | ❌ | ❌ (trigger) | ✅ (orchestration) | ✅ (exécution) | ✅ (queue) |
| **Persistence** | ❌ | ❌ | ✅ (SQLite/JSON) | ✅ (sauvegarde) | ❌ |

---

## 🚀 Commandes Utiles

### Démarrer l'application
```bash
docker-compose up
```

### Accéder aux services
- **Frontend** : http://localhost:5173
- **Backend API** : http://localhost:8080
- **Inngest Dashboard** : http://localhost:8288
- **API Docs** : http://localhost:8080/docs

### Vérifier la persistence
```bash
# Secrets et config
ls -lh backend/data/config.db

# Cache produits
ls -lh backend/data/cache/

# Rapports audits
ls -lh backend/data/audits/
```

### Tester un endpoint
```bash
# Récupérer la config
curl http://localhost:8080/api/config

# Modifier un secret
curl -X PUT http://localhost:8080/api/config \
  -H "Content-Type: application/json" \
  -d '{"META_PIXEL_ID": "123456789"}'

# Lancer un audit
curl -X POST http://localhost:8080/api/audits/run/ga4_tracking
```

---

## 📝 Prochaines Étapes pour Nouvelles Features

Lors de l'ajout de nouvelles fonctionnalités (ex: Customer RFM, Ads Optimization) :

1. ✅ **Créer le service** dans `services/` si logique métier réutilisable
2. ✅ **Créer le workflow** dans `jobs/workflows/` si tâche async
3. ✅ **Ajouter les endpoints** dans `monitoring_app.py` (gateway)
4. ✅ **Utiliser les patterns existants** :
   - `ConfigService` pour secrets
   - `CacheService` pour cache temporaire
   - `AuditOrchestrator` pour rapports d'audit
5. ✅ **Persister dans** `data/` avec volume Docker

**Ne PAS créer de nouveau système de stockage parallèle !**

---

## 🔒 Sécurité

- **Secrets** : Chiffrés dans SQLite via `SecureStore`
- **API Keys** : Jamais loggées (masked dans responses)
- **Credentials** : Stockées dans `credentials/` (Google service accounts)
- **CORS** : Configuré pour localhost uniquement en dev

---

## 📚 Documentation Complémentaire

- **Inngest SDK** : https://www.inngest.com/docs/sdk/python
- **FastAPI** : https://fastapi.tiangolo.com/
- **React Query** : https://tanstack.com/query/latest

---

**Dernière mise à jour** : 2025-12-19
