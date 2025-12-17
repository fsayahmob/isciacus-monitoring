# ISCIACUS Monitoring

Monorepo pour le dashboard de monitoring des produits Shopify ISCIACUS.

## Architecture

```
isciacus-monitoring/
├── frontend/           # React + TypeScript + Tailwind
├── backend/            # FastAPI + Python
├── .github/
│   └── workflows/      # CI/CD avec guards
├── docker-compose.yml  # Dev local
└── Dockerfile.*        # Images Docker
```

## Stack Technique

### Frontend
- **React 19** + TypeScript
- **Vite** - Build tool
- **Tailwind CSS 4** - Styling
- **TanStack Query** - Data fetching
- **Zustand** - State management

### Backend
- **FastAPI** - Framework API
- **Python 3.11+**
- **Shopify GraphQL Admin API**

## CI/CD - Architecture-Driven Development

Pipeline inspiré de SellGlow avec guards stricts :

### Guards Frontend (ESLint)
- Pas de `severity: warning` (tout `error`)
- Max 3 règles désactivées
- Pas de `eslint-disable` inline
- Min 30 règles actives
- TypeScript `strict: true`

### Guards Backend (Ruff/Python)
- Max 5 règles ignorées
- MyPy `strict = true`
- Pas de `# noqa` abuse
- Security rules (bandit) activées
- Print statements interdits

## Quick Start

### Prérequis
- Node.js 20+
- Python 3.11+
- Docker (optionnel)

### Installation manuelle

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend (autre terminal)
cd backend
pip install -e ".[dev]"
cp .env.example .env  # Configurer les tokens
python monitoring_app.py
```

### Avec Docker

```bash
# Démarrer tout
docker-compose up

# Frontend uniquement
docker-compose up frontend

# Backend uniquement
docker-compose up backend
```

## Scripts

### Frontend
```bash
npm run dev          # Serveur dev (port 5173)
npm run build        # Build production
npm run lint         # ESLint strict
npm run typecheck    # TypeScript
npm run test         # Tests Vitest
```

### Backend
```bash
ruff check .         # Linting
black .              # Formatting
mypy .               # Type checking
pytest               # Tests
```

## Variables d'Environnement

### Backend (`backend/.env`)
```env
SHOPIFY_STORE_URL=https://your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx
```

## Déploiement

### Option 1 : Vercel + Railway
- Frontend → Vercel (gratuit)
- Backend → Railway (~$5/mois)

### Option 2 : Docker sur cloud
- AWS ECS / Google Cloud Run / Azure Container Apps
- Frontend servi via nginx dans le container

### Option 3 : VPS
- Docker-compose sur un VPS (DigitalOcean, Hetzner)
- nginx reverse proxy devant

## License

Propriétaire - ISCIACUS
