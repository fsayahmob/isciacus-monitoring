# ISCIACUS Monitoring - Claude Code Guidelines

## Project Overview
Dashboard de monitoring pour boutiques Shopify avec audits automatisés via Inngest.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + TanStack Query
- **Backend**: Python 3.11 + FastAPI + Inngest
- **Database**: SQLite (data/)

---

## LINT RULES - MUST READ BEFORE CODING

### Frontend (TypeScript/React) - ESLint Strict

| Rule | Limit | Action |
|------|-------|--------|
| `max-lines` | **300 lines/file** | Extract to separate files |
| `max-lines-per-function` | **80 lines** | Split into sub-functions |
| `max-depth` | **4 levels** | Avoid deep nesting |
| `max-params` | **5 params** | Use config objects |
| `max-statements` | **25 per function** | Split logic |
| `max-nested-callbacks` | **3 levels** | Flatten with async/await |
| `complexity` | **15** | Simplify conditions |
| `curly` | always `{}` | Never if/else without braces |
| `no-console` | except warn/error | Remove console.log |
| `no-magic-numbers` | except -1,0,1,2,100 | Create constants |
| `explicit-function-return-type` | required | Always type returns |
| `strict-boolean-expressions` | no truthy | Use `=== null`, `!== undefined` |
| `consistent-type-imports` | `type` keyword | `import { type X }` |

### Backend (Python) - Ruff + MyPy Strict

| Rule | Limit | Action |
|------|-------|--------|
| `line-length` | **100 chars** | Break long lines |
| `max-args` (PLR0913) | **6 params** | Use dataclass/dict |
| `max-branches` | **12** | Simplify if/elif/else |
| `max-returns` | **6 per function** | Reduce exit points |
| `max-statements` | **50 per function** | Split logic |
| `max-complexity` (mccabe) | **12** | Simplify conditions |
| `T20` (print) | forbidden | Use logger |
| `S` (security) | enabled | No hardcoded secrets |
| `N` (naming) | PEP8 | snake_case, UPPER_CASE |
| `mypy strict` | enabled | All types required |

---

## Validation Commands

```bash
# Frontend - Run ALL before committing
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run format:check

# Backend - Run ALL before committing
cd backend && ruff check .
cd backend && mypy .
cd backend && black --check .
```

---

## MANDATORY Development Workflow

### BEFORE each file modification:
1. Check current file line count: `wc -l <file>`
2. Review lint limits above

### AFTER each file modification:
1. Check new line count stays under limit
2. Run lint commands for that stack

### BEFORE showing code to user:
```bash
# Frontend
npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend run format:check

# Backend
cd backend && ruff check . && black --check .
```

### NEVER:
- Commit code that fails lint
- Show user code without running validation first
- Exceed file/function line limits

---

## Architecture & Factorization Rules

### Frontend Structure (React/TypeScript)

```
frontend/src/
├── components/           # UI Components (max 300 lines each)
│   ├── audit/            # Audit pipeline & cards
│   ├── analytics/        # Analytics dashboards
│   │   ├── sales/        # Sales analysis
│   │   ├── sales-analysis/
│   │   └── funnel/       # Conversion funnel
│   ├── filters/          # Product filters
│   └── settings/         # Settings & wizard
│       └── wizard/       # Setup wizard steps
├── hooks/                # Shared React hooks
├── lib/                  # Utility libraries
├── pages/                # Page components (route endpoints)
├── services/             # API calls ONLY
│   └── api.ts            # All fetch functions + types
├── stores/               # State management (Zustand?)
├── constants/            # Magic numbers, config
├── types/                # Shared TypeScript types
└── test/                 # Test utilities
```

### Backend Structure (Python/FastAPI)

```
backend/
├── monitoring_app.py     # FastAPI routes (50K lines - needs refactor!)
├── services/             # Business logic services
│   ├── audit_orchestrator.py   # Main audit orchestration (164K)
│   ├── audit_service.py        # Audit helpers
│   ├── shopify_analytics.py    # Shopify data fetching
│   ├── ga4_analytics.py        # Google Analytics 4
│   ├── theme_analyzer.py       # Theme code analysis
│   ├── cart_recovery_analyzer.py
│   ├── customer_data_analyzer.py
│   ├── permissions_checker.py
│   ├── config_service.py       # Configuration management
│   ├── cache_service.py        # Cache management
│   ├── secure_store.py         # Encrypted credentials
│   ├── benchmarks.py           # Benchmark thresholds
│   ├── meta_capi.py            # Meta Conversions API
│   └── rate_limiter.py
├── jobs/                 # Inngest async workflows
│   ├── inngest_setup.py        # Inngest client setup
│   ├── audit_workflow.py       # Workflow definitions
│   └── workflows/              # Individual workflow steps
├── models/               # Pydantic models
├── config/               # Configuration files
├── tests/                # Test files
└── data/                 # SQLite + JSON cache
```

### Factorization Rules

| When file exceeds... | Action |
|---------------------|--------|
| 300 lines (frontend) | Extract to new file in same folder |
| 80 lines per function | Extract helper functions to `*Steps.ts` or `*Utils.ts` |
| 5 params per function | Create config interface |
| Repeated logic | Extract to `hooks/` (frontend) or new service (backend) |

### Where to Put New Code

| Type of code | Frontend location | Backend location |
|--------------|-------------------|------------------|
| API call | `services/api.ts` | `monitoring_app.py` (route) |
| Business logic | `components/<domain>/<name>.ts` | `services/<name>_analyzer.py` |
| React hook | `components/<domain>/use<Name>.ts` | N/A |
| Shared hook | `hooks/use<Name>.ts` | N/A |
| Async workflow | N/A | `jobs/workflows/<name>.py` |
| Types/Models | `services/api.ts` (with API) | `models/<name>.py` |
| Constants | `constants/index.ts` | `config/<name>.py` |
| Pure functions | `components/<domain>/<name>Steps.ts` | `services/<name>.py` |

### Naming Conventions

**Frontend:**
- Components: `PascalCase.tsx` (e.g., `AuditCard.tsx`)
- Hooks: `use<Name>.ts` (e.g., `useAuditSession.ts`)
- Pure functions: `camelCase.ts` (e.g., `auditSteps.ts`)
- Types: `PascalCase` (e.g., `AuditResult`)

**Backend:**
- Files: `snake_case.py` (e.g., `audit_service.py`)
- Functions: `snake_case` (e.g., `run_audit`)
- Classes: `PascalCase` (e.g., `AuditResult`)
- Constants: `UPPER_CASE` (e.g., `MAX_RETRIES`)

---

## Current TODO (Multi-tenant)

1. [ ] Implement multi-tenant for multiple Shopify stores
2. [ ] Add user authentication (login/register)
3. [ ] Create tenant data model (stores)
4. [ ] Isolate data per tenant (credentials, cache, audit results)
5. [ ] Add store selector in UI
