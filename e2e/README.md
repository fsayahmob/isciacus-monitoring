# E2E Tests - ISCIACUS Monitoring

Tests de bout en bout avec Playwright pour valider l'interface audit.

## 📋 Prérequis

- Node.js installé
- Backend FastAPI en cours d'exécution (`uvicorn monitoring_app:app`)
- Frontend Vite en cours d'exécution (`npm run dev`)
- Inngest dev server en cours d'exécution (`npx inngest-cli@latest dev`)

## 🚀 Commandes de Test

### Exécuter tous les tests (mode headless)
```bash
npm run test:e2e
```

### Mode UI interactif (recommandé pour développement)
```bash
npm run test:e2e:ui
```

### Mode headed (voir le navigateur)
```bash
npm run test:e2e:headed
```

### Mode debug (pause à chaque step)
```bash
npm run test:e2e:debug
```

### Voir le rapport HTML
```bash
npm run test:e2e:report
```

## 📝 Tests Couverts

### `audit-page.spec.ts` - Workflow Complet

**Fonctionnalités testées :**
1. ✅ Affichage de la grille d'audit cards
2. ✅ Tooltips au survol des cards
3. ✅ Bouton "Lancer tous les audits"
4. ✅ Exécution d'un audit unique
5. ✅ Exécution de tous les audits en parallèle
6. ✅ Stepper vertical avec animations
7. ✅ Affichage des issues/problèmes
8. ✅ Navigation entre les résultats
9. ✅ Persistance après reload
10. ✅ GMC Flow KPI (si configuré)

**Composants UI testés :**
1. ✅ Dark theme styling
2. ✅ Responsive design (desktop/mobile)
3. ✅ Gestion des états d'erreur

## 🎯 Scénarios de Test

### Test 1: Run Single Audit
```typescript
// 1. Click sur audit card "Diagnostic Initial"
// 2. Click sur bouton "Lancer"
// 3. Vérifie loading state
// 4. Attend résultats (max 30s)
// 5. Vérifie affichage du stepper
```

### Test 2: Run All Audits
```typescript
// 1. Click sur "Lancer tous les audits"
// 2. Vérifie "X en cours..."
// 3. Vérifie plusieurs cards en loading
// 4. Attend au moins 1 audit terminé (max 60s)
```

### Test 3: UI Components
```typescript
// 1. Vérifie dark theme
// 2. Teste responsive (1280x720 → 375x667)
// 3. Vérifie gestion erreurs
```

## 🏗️ Structure des Tests

```
e2e/
├── audit-page.spec.ts    # Tests audit workflow
└── README.md             # Cette doc
```

## 🔧 Configuration

### `playwright.config.ts`
- **baseURL**: `http://localhost:5173`
- **Workers**: 1 en CI, parallel en local
- **Retries**: 2 en CI, 0 en local
- **Browser**: Chromium (Chrome Desktop)
- **Screenshots**: Sur échec uniquement
- **Video**: Conservé sur échec

### WebServers Auto-Start
Les serveurs se lancent automatiquement avant les tests :
1. Frontend Vite (`localhost:5173`)
2. Backend FastAPI (`localhost:8000`)

## 📊 Rapports

Après exécution, un rapport HTML est généré dans `playwright-report/`:
```bash
npm run test:e2e:report
```

Le rapport inclut :
- Screenshots des échecs
- Vidéos des tests failés
- Traces pour debug
- Timeline d'exécution

## 🐛 Debug

### Mode Debug Interactif
```bash
npm run test:e2e:debug
```

Permet de :
- Pause à chaque étape
- Inspecter les éléments
- Voir les sélecteurs
- Rejouer les actions

### VS Code Integration

1. Installer l'extension "Playwright Test for VSCode"
2. Cliquer sur l'icône "Testing" dans la sidebar
3. Lancer/debugger individuellement chaque test

## ✅ Intégration CI/CD

### GitHub Actions
Ajouter dans `.github/workflows/e2e.yml` :

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm install
          npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

## 🎨 Best Practices

1. **Utilisez data-testid** pour les sélecteurs stables
2. **Évitez les timeouts hardcodés** sauf nécessaire
3. **Testez les états de loading** pour UX
4. **Vérifiez la persistance** après reload
5. **Testez mobile ET desktop**

## 📚 Resources

- [Playwright Docs](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright)
