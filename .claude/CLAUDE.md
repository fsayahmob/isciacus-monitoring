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
│   ├── audit/          # Pipeline d'audits (25 fichiers)
│   │   ├── AuditPipeline.tsx       # Orchestration UI
│   │   ├── useAudit.ts             # Hook unifie (PocketBase = source de verite)
│   │   ├── useAuditHelpers.ts      # Sub-hooks extraits
│   │   ├── auditConfig.ts          # Constantes timing centralisees
│   │   ├── AuditCard.tsx, IssueCard.tsx, PipelineStep.tsx...
│   │   └── [15 composants UI + 6 utils]
│   ├── analytics/      # Dashboards analytics
│   ├── settings/       # Config wizard
│   └── filters/        # Filtres produits
│
├── hooks/              # Hooks partages
│   ├── useRealtimeCollection.ts  # WebSocket PocketBase
│   ├── usePocketBaseAudit.ts     # Audit realtime
│   ├── useProducts.ts            # Data produits
│   └── useAnalytics.ts           # Data analytics
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
├── monitoring_app.py       # Routes FastAPI (1682 LOC - A SPLITTER)
│
├── services/               # Logique metier
│   ├── audit_orchestrator.py   # Session mgmt + Actions (1367 LOC, Epic 4 ✅)
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
│   ├── pocketbase_progress.py  # Helper PocketBase (Epic 3.1 ✅)
│   │   # Fonctions centralisees: init_audit_result(), save_audit_progress(), get_audit_result()
│   └── workflows/              # 11 workflows (7249 LOC, refactores Epic 3)
│       ├── onboarding.py       # Diagnostic initial
│       ├── ga4_audit.py        # Google Analytics 4
│       ├── meta_audit.py       # Meta Pixel
│       ├── gmc_audit.py        # Google Merchant Center
│       ├── gsc_audit.py        # Google Search Console (dual mode GSC/Basic SEO)
│       ├── theme_audit.py      # Code tracking theme
│       ├── capi_audit.py       # Meta CAPI
│       ├── customer_data_audit.py
│       ├── cart_recovery_audit.py
│       ├── ads_readiness_audit.py  # Agrege resultats GA4/Meta/CAPI via PocketBase
│       └── bot_access_audit.py
│
├── routes/                 # Routes modulaires (partiel)
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

---

## Plan de Refactoring - Architecture Simplifiee

### Diagnostic Actuel

**Probleme** : Architecture sur-ingenierie pour 11 audits

| Composant | Avant | Actuel | Cible |
|-----------|-------|--------|-------|
| Fichiers `components/audit/` | 28 | 25 | 16 |
| Sources d'etat | 4 | 1 (PocketBase) ✅ | 1 (PocketBase) |
| `audit_orchestrator.py` | 3827 LOC | 3827 LOC | 500 LOC |
| Workflows Inngest | 11 copies | 11 copies | 1 generique |
| Tests unitaires | 0% | 0% | 70% |

### Detail des 25 fichiers audit/

| Type | Fichiers | Contenu |
|------|----------|---------|
| Composants UI | 15 | AuditCard, IssueCard, PipelineStep, GMCFlowKPI, etc. |
| Hooks | 2 | useAudit (unifie), useAuditHelpers |
| Utils/Types | 5 | campaignScoreUtils, sequentialRunnerUtils, etc. |
| Config | 3 | auditConfig, stepperConfig, auditTooltips |

---

### Epic 1 : Simplification Etat Frontend ✅ TERMINE

| Story | Tache | Status |
|-------|-------|--------|
| 1.1 | Fusionner `useAuditSession` + `useSequentialAuditRunner` en `useAudit.ts` | ✅ Done |
| 1.2 | Supprimer l'optimistic state, garder PocketBase seul | ✅ Done |
| 1.3 | Centraliser constantes dans `auditConfig.ts` | ✅ Done |

**Resultat** : 28 → 25 fichiers, 1 source de verite (PocketBase)

---

### Epic 2 : Refactor Composants UI (Priorite 🟡 Moyen)

| Story | Tache | Effort | Impact |
|-------|-------|--------|--------|
| 2.1 | Split `GMCFlowKPI.tsx` (330 LOC) en 3 composants | 1j | Respect regle 300 LOC |
| 2.2 | Fusionner fichiers redondants (StepIcon + StatusIcons, AuditResults + AuditResultSection) | 1j | Moins de fichiers |

**Resultat** : ~20 → ~16 fichiers

---

### Epic 3 : Simplification Backend ✅ TERMINE (partiel)

| Story | Tache | Effort | Status |
|-------|-------|--------|--------|
| 3.1 | Extraire `_save_progress()` et `_init_result()` dans `pocketbase_progress.py` | 1j | ✅ Done (-531 LOC) |
| 3.2 | Creer 1 workflow Inngest generique | 2j | ⏭️ Reporte (ROI insuffisant) |
| 3.3 | Supprimer stockage JSON, garder PocketBase seul | 1j | ✅ Done (-55 LOC) |
| 3.4 | Split `monitoring_app.py` en routes modulaires | 2j | ⏭️ Reporte |

**Resultat** : -586 LOC dans workflows (7835 → 7249), PocketBase = seule source de verite

**Note Epic 3.2** : Analyse detaillee des 11 workflows montre que ~45% ont une logique trop specifique
(gsc_audit dual mode, ads_readiness agrege d'autres audits). Factory pattern partiel possible mais ROI < effort.

---

### Epic 4 : Nettoyage audit_orchestrator.py ✅ TERMINE

| Story | Tache | Effort | Status |
|-------|-------|--------|--------|
| 4.1 | Analyser dependances et usage reel | 0.5j | ✅ Done |
| 4.2 | Supprimer 6 methodes run_* obsoletes | 0.5j | ✅ Done (-2460 LOC) |

**Resultat** : 3827 → 1367 LOC (-64%), code mort supprime

**Note** : Les methodes run_* etaient des duplicatas des workflows Inngest. L'orchestrator garde maintenant uniquement :
- Session management (`get_latest_session`, `clear_all_sessions`)
- Action execution (`execute_action` pour corrections manuelles)
- API support (`get_available_audits`, `result_to_dict`)

---

### Epic 5 : Tests Unitaires (Priorite 🟢 Apres refacto)

| Story | Tache | Effort | Impact |
|-------|-------|--------|--------|
| 5.1 | Tests services critiques (`pocketbase.ts`, `auditApi.ts`) | 2j | Couverture 40% |
| 5.2 | Tests hooks (`useAudit` unifie) | 2j | Couverture 70% |

---

### Resume du Plan

| Epic | Stories | Effort | Status |
|------|---------|--------|--------|
| 1. Etat Frontend | 3 | 3.5j | ✅ Termine |
| 2. Composants UI | 2 | 2j | 🟡 A faire |
| 3. Backend simplifie | 2/4 | 2j | ✅ Termine (partiel) |
| 4. Nettoyage orchestrator | 2 | 1j | ✅ Termine |
| 5. Tests | 2 | 4j | 🟢 Apres refacto |

**Effort restant** : ~8 jours

**Ordre d'execution** : ~~Epic 1~~ → ~~Epic 3~~ → ~~Epic 4~~ → Epic 2 → Epic 5

**Accomplissements Epic 3** :
- `pocketbase_progress.py` : fonctions centralisees `init_audit_result()`, `save_audit_progress()`, `get_audit_result()`
- 11 workflows refactores pour utiliser les fonctions partagees
- Suppression du stockage JSON (`latest_session.json`) - PocketBase est maintenant la seule source de verite
- Total : **-586 LOC** dans les workflows

**Accomplissements Epic 4** :
- Suppression de 6 methodes run_* obsoletes (remplacees par workflows Inngest)
- `audit_orchestrator.py` : 3827 → 1367 LOC (-64%)
- Total : **-2460 LOC** de code mort
