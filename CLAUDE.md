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
├── components/          # UI Components (max 300 lines each)
│   ├── audit/           # Audit-related components
│   │   ├── AuditCard.tsx        # Single audit card display
│   │   ├── AuditPipeline.tsx    # Pipeline visualization
│   │   ├── auditSteps.ts        # Pure functions for audit logic
│   │   └── useAuditSession.ts   # React Query hook for audits
│   ├── common/          # Shared UI components
│   └── layout/          # Layout components (Sidebar, Header)
├── hooks/               # Custom React hooks (reusable logic)
├── services/            # API calls ONLY (no business logic)
│   └── api.ts           # All fetch functions + types
├── types/               # Shared TypeScript types
├── constants/           # Magic numbers, config values
└── pages/               # Page-level components
```

### Backend Structure (Python/FastAPI)

```
backend/
├── monitoring_app.py    # FastAPI routes ONLY (thin controller)
├── services/            # Business logic (one service per domain)
│   ├── shopify_service.py      # Shopify API calls
│   ├── ga4_service.py          # Google Analytics
│   ├── audit_service.py        # Audit orchestration
│   └── theme_service.py        # Theme analysis
├── jobs/                # Inngest async functions
│   └── audit_jobs.py           # Background audit tasks
├── models/              # Pydantic models (request/response)
├── config/              # Configuration files
└── data/                # SQLite DB + JSON cache files
```

### Factorization Rules

| When file exceeds... | Action |
|---------------------|--------|
| 300 lines (frontend) | Extract to new file in same folder |
| 80 lines per function | Extract helper functions |
| 5 params per function | Create config object/interface |
| Repeated logic | Create shared utility in `hooks/` or `services/` |

### Where to Put New Code

| Type of code | Frontend location | Backend location |
|--------------|-------------------|------------------|
| API call | `services/api.ts` | `monitoring_app.py` (route) |
| Business logic | `components/<domain>/*.ts` | `services/<domain>_service.py` |
| React state | `hooks/use<Name>.ts` | N/A |
| Async task | N/A | `jobs/<name>_jobs.py` |
| Types/Models | `types/*.ts` or inline | `models/*.py` |
| Constants | `constants/index.ts` | `config/*.py` |
| Pure functions | `<component>/<name>.ts` | `services/<name>.py` |

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
