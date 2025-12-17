# ISCIACUS Monitoring Dashboard

Dashboard de monitoring des produits Shopify pour ISCIACUS, construit avec React + TypeScript + Tailwind CSS.

## Stack Technique

- **React 19** avec TypeScript
- **Vite** - Build tool rapide
- **Tailwind CSS 4** - Styling utilitaire
- **TanStack Query** - Gestion des requêtes API
- **Zustand** - State management léger
- **Axios** - Client HTTP

## Architecture

```
src/
├── components/     # Composants React réutilisables
├── constants/      # Constantes centralisées (pas de magic numbers)
├── hooks/          # Custom hooks (useProducts, etc.)
├── services/       # Services API (api.ts)
├── stores/         # Zustand stores
├── types/          # Types TypeScript
└── test/           # Setup et utils de test
```

## CI/CD

Pipeline GitHub Actions inspiré de l'Architecture-Driven Development :

1. **ESLint Config Guard** - Protège les règles de lint
2. **Code Quality** - ESLint strict + TypeScript type checking
3. **Tests** - Vitest avec coverage 70% minimum
4. **Build** - Vérification du build production
5. **Deploy** - Déploiement sur main branch

### Guards de Configuration

- Toutes les règles ESLint sont en **severity: error** (pas de warning)
- Maximum 3 règles désactivées
- Pas de `eslint-disable` dans le code
- TypeScript `strict: true` obligatoire

## Installation

```bash
npm install
```

## Développement

```bash
# Démarrer le serveur de dev
npm run dev

# Backend FastAPI (dans un autre terminal)
cd ../ads-isciacus
python monitoring_app.py
```

## Scripts

```bash
npm run dev          # Serveur de développement
npm run build        # Build production
npm run lint         # ESLint (strict)
npm run lint:fix     # Fix ESLint auto-fixable
npm run typecheck    # TypeScript type check
npm run format       # Prettier format
npm run format:check # Vérifier le format
npm run test         # Tests unitaires
npm run test:coverage # Tests avec coverage
```

## Variables d'Environnement

Créer un fichier `.env.local` (ne pas commiter) :

```env
VITE_API_BASE_URL=http://localhost:8080
```

## License

Propriétaire - ISCIACUS
