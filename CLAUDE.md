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

## Development Workflow

1. **Before coding**: Check current file line count
2. **During coding**: Validate lint after each function
3. **Before showing user**: Run ALL validation commands
4. **Never commit** code that fails lint

---

## Project Structure

```
isciacus-monitoring/
├── frontend/           # React app
│   └── src/
│       ├── components/ # Max 300 lines each
│       ├── hooks/      # Custom React hooks
│       ├── services/   # API calls
│       └── types/      # TypeScript types
├── backend/            # FastAPI app
│   ├── services/       # Business logic
│   ├── jobs/           # Inngest functions
│   ├── models/         # Pydantic models
│   └── data/           # SQLite + cache
└── .claude/            # Claude Code config
```

---

## Current TODO (Multi-tenant)

1. [ ] Implement multi-tenant for multiple Shopify stores
2. [ ] Add user authentication (login/register)
3. [ ] Create tenant data model (stores)
4. [ ] Isolate data per tenant (credentials, cache, audit results)
5. [ ] Add store selector in UI
