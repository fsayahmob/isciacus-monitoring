# ISCIACUS Monitoring - Guidelines Claude Code

## Lint Rules - A RESPECTER AVANT DE CODER

### Frontend (TypeScript/React) - ESLint Strict

| Regle | Limite | Action |
|-------|--------|--------|
| `max-lines` | 300 lignes/fichier | Extraire dans fichiers separes |
| `max-lines-per-function` | 80 lignes | Split en sub-fonctions |
| `max-params` | 5 params | Utiliser un objet config |
| `max-depth` | 4 niveaux | Eviter nesting profond |
| `curly` | toujours `{}` | Jamais if/else sans accolades |
| `no-console` | sauf warn/error | Supprimer console.log |
| `explicit-function-return-type` | requis | Typer les retours |

### Backend (Python) - Ruff + MyPy Strict

| Regle | Limite | Action |
|-------|--------|--------|
| `line-length` | 100 chars | Casser les lignes longues |
| `max-args` (PLR0913) | 6 params | Utiliser dataclass/dict |
| `max-statements` | 50/fonction | Split la logique |
| `T20` (print) | interdit | Utiliser logger |
| `mypy strict` | active | Tous les types requis |

### Commandes de Validation

```bash
# Frontend - AVANT chaque commit
npm --prefix frontend run lint
npm --prefix frontend run typecheck

# Backend - AVANT chaque commit
cd backend && ruff check . && mypy .
```

---

## Architecture Projet

### Vue d'ensemble

```
isciacus-monitoring/
├── frontend/          # React 19 + TypeScript + Vite + Tailwind
├── backend/           # FastAPI + Python 3.11 + Inngest
├── e2e/               # Tests Playwright
└── docker-compose.yml # Orchestration locale
```

### Services Docker

| Service | Port | Description |
|---------|------|-------------|
| frontend | 5173 | React + Vite dev server |
| backend | 8080 | FastAPI API |
| inngest | 8288 | Job queue dashboard |
| pocketbase | 8090 | Realtime DB (admin: `/_/`) |

---

## Frontend (`frontend/src/`)

```
src/
├── pages/              # Pages (routes)
│   ├── AuditPage.tsx
│   ├── AnalyticsDataPage.tsx
│   ├── SettingsPage.tsx
│   └── BenchmarksPage.tsx
│
├── components/         # Composants UI
│   ├── audit/          # Pipeline d'audits (18 fichiers)
│   │   ├── AuditPipeline.tsx
│   │   ├── useAuditSession.ts
│   │   ├── useSequentialAuditRunner.ts
│   │   └── usePocketBaseSync.ts
│   ├── analytics/      # Dashboards analytics
│   ├── settings/       # Config wizard
│   └── filters/        # Filtres produits
│
├── hooks/              # Hooks partages
│   ├── useRealtimeCollection.ts  # WebSocket PocketBase
│   └── usePocketBaseAudit.ts     # Audit realtime
│
├── services/           # Clients API
│   ├── api.ts          # Endpoints produits
│   ├── auditApi.ts     # Endpoints audits
│   ├── configApi.ts    # Endpoints config
│   └── pocketbase.ts   # Client PocketBase
│
└── stores/             # State Zustand
    └── useAppStore.ts  # Navigation, filtres
```

### Stack Frontend
- **React 19** + TypeScript 5.9 (strict)
- **Vite 7** pour le build
- **Tailwind CSS 4** pour le styling
- **TanStack Query 5** pour le data fetching
- **Zustand 5** pour le state management
- **PocketBase SDK** pour le realtime

---

## Backend (`backend/`)

```
backend/
├── monitoring_app.py       # Routes FastAPI principales
│
├── services/               # Logique metier (~10K lignes)
│   ├── audit_orchestrator.py   # Coordinateur central
│   ├── shopify_analytics.py    # GraphQL Shopify
│   ├── ga4_analytics.py        # Google Analytics 4
│   ├── config_service.py       # Gestion secrets (SQLite)
│   ├── cache_service.py        # Cache produits/filtres
│   ├── pocketbase_service.py   # Client PocketBase
│   ├── theme_analyzer.py       # Analyse theme Shopify
│   ├── meta_capi.py            # Meta Conversions API
│   └── [autres analyseurs]
│
├── jobs/                   # Workflows Inngest
│   ├── inngest_setup.py        # Config client Inngest
│   ├── audit_workflow.py       # Definitions workflows
│   └── workflows/              # 11 workflows d'audit
│       ├── ga4_audit.py
│       ├── meta_audit.py
│       ├── gmc_audit.py
│       ├── theme_audit.py
│       └── [autres audits]
│
├── models/                 # Modeles Pydantic
├── config/                 # Fichiers config JSON
├── tests/                  # Tests Pytest
└── data/                   # Persistence (SQLite + cache JSON)
```

### Stack Backend
- **FastAPI** + Uvicorn
- **Inngest** pour les workflows async
- **SQLite** pour les secrets (chiffres)
- **PocketBase** pour l'etat realtime des audits

---

## Realtime Architecture (PocketBase)

### Collection `audit_runs`

| Champ | Type | Description |
|-------|------|-------------|
| `session_id` | text | Groupe les audits d'une session |
| `audit_type` | text | ga4_tracking, meta_pixel, etc. |
| `status` | select | pending, running, completed, failed |
| `result` | json | Resultat complet (nullable) |
| `error` | text | Message d'erreur (nullable) |

### Flux de donnees

```
Frontend                    Backend                     PocketBase
   │                           │                            │
   │ useRealtimeCollection()   │                            │
   │ ──────────────────────────│────── WebSocket ──────────>│
   │                           │                            │
   │                           │ POST /api/audits/{type}    │
   │                           │<───────────────────────────│
   │                           │                            │
   │                           │ Inngest workflow           │
   │                           │ ─────────────────────────> │
   │                           │   update audit_runs        │
   │<─────────────────────────────────── realtime update ───│
```

---

## Tests

### E2E (Playwright)
```bash
npm run test:e2e           # Lancer tous les tests
npm run test:e2e:ui        # Mode UI interactif
```

### Frontend (Vitest)
```bash
npm --prefix frontend run test
```

### Backend (Pytest)
```bash
cd backend && pytest
```

---

## CI/CD

### Workflows GitHub Actions

1. **code-quality.yml** - Lint + Types + Format
   - `frontend-quality`: ESLint + TypeScript + Prettier
   - `backend-quality`: Ruff + MyPy + Black
   - `config-guard`: Empeche l'affaiblissement des regles

2. **e2e-tests.yml** - Tests Playwright
   - Demarre tous les services Docker
   - Execute les tests E2E
   - Upload rapport en cas d'echec

---

## Commandes Utiles

```bash
# Demarrer le projet
docker-compose up

# Logs d'un service
docker-compose logs -f backend

# Lint complet
npm --prefix frontend run lint && cd backend && ruff check .

# Typecheck complet
npm --prefix frontend run typecheck && cd backend && mypy .
```
