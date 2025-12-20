# Guide de Test - ISCIACUS Monitoring

Guide complet pour exécuter et valider les tests E2E de l'interface audit.

## 🚀 Quick Start

### 1. Prérequis

Assurez-vous que tous les services sont en cours d'exécution :

```bash
# Terminal 1: Backend
cd backend
uvicorn monitoring_app:app --reload

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Inngest Dev Server
npx inngest-cli@latest dev
```

### 2. Exécuter les Tests

**Mode UI (Recommandé pour validation manuelle)** :
```bash
npm run test:e2e:ui
```

Interface interactive Playwright s'ouvre avec :
- Liste de tous les tests
- Bouton play/pause pour chaque test
- Vue en temps réel du navigateur
- Timeline des actions
- Console logs

**Mode Headless (CI)** :
```bash
npm run test:e2e
```

**Mode Headed (Voir le navigateur)** :
```bash
npm run test:e2e:headed
```

**Mode Debug (Step-by-step)** :
```bash
npm run test:e2e:debug
```

## 📋 Checklist de Validation

Utilise cette checklist pour valider manuellement l'interface avant de lancer les tests :

### ✅ Page Audit - Affichage Initial

- [ ] Le titre "Audits Tracking" est visible
- [ ] La description "Vérifiez la configuration..." s'affiche
- [ ] Le bouton "Lancer tous les audits" est présent et enabled
- [ ] Les audit cards sont affichées dans une grille
- [ ] La card "Diagnostic Initial" est visible en premier
- [ ] Les autres cards (GA4, GMC, Meta, etc.) sont visibles

### ✅ Audit Cards - Interactivité

- [ ] Hover sur une card → tooltip s'affiche
- [ ] Tooltip contient description détaillée de l'audit
- [ ] Click sur une card → bordure colorée indiquant sélection
- [ ] Bouton "Lancer" est cliquable sur chaque card disponible
- [ ] Bouton "Indisponible" est disabled pour services non configurés

### ✅ Exécution d'un Audit Unique

- [ ] Click sur card "Diagnostic Initial"
- [ ] Click sur "Lancer"
- [ ] Bouton passe en "En cours..." avec spinner
- [ ] Card montre badge bleu "En cours"
- [ ] Stepper vertical apparaît en dessous des cards
- [ ] Chaque étape s'anime progressivement
- [ ] Icônes de statut changent (pending → running → success/warning/error)
- [ ] Durée d'exécution affichée pour chaque étape
- [ ] Résultat final s'affiche après ~10-30 secondes

### ✅ Exécution de Tous les Audits

- [ ] Click sur "Lancer tous les audits"
- [ ] Bouton change en "X en cours..." avec spinner
- [ ] Plusieurs cards montrent "En cours" simultanément
- [ ] Les audits progressent en parallèle
- [ ] Chaque audit complété passe à "success/warning/error"
- [ ] Bouton redevient "Lancer tous les audits" quand tout est terminé

### ✅ Stepper Vertical

- [ ] Étapes affichées dans l'ordre correct
- [ ] Ligne de connexion entre les étapes (grise → verte)
- [ ] Icônes circulaires avec statut (spinner, checkmark, X)
- [ ] Animations fluides lors des changements d'état
- [ ] Durée affichée (ex: "2.3s")
- [ ] Messages d'erreur visibles si échec

### ✅ Issues Panel

- [ ] Panel "Problèmes détectés" s'affiche si issues trouvées
- [ ] Severity badges (Critical, High, Medium, Low) corrects
- [ ] Description détaillée de chaque issue
- [ ] Boutons d'action disponibles si correction possible
- [ ] Click sur action → exécution de la correction

### ✅ GMC Flow KPI (Si Merchant Center configuré)

- [ ] Diagramme de flux Shopify → GMC → Ads visible
- [ ] Métriques correctes (produits, approuvés, désapprouvés)
- [ ] Couleurs cohérentes (vert = bon, orange = warning, rouge = error)
- [ ] Click sur KPI → scroll vers issue correspondante

### ✅ Responsive Design

- [ ] Desktop (1280x720) : grille de cards 2-3 colonnes
- [ ] Mobile (375x667) : cards en colonne unique
- [ ] Stepper lisible sur mobile
- [ ] Boutons accessibles sur toutes tailles

### ✅ Persistance

- [ ] Lancer un audit
- [ ] Recharger la page (F5)
- [ ] Résultats encore visibles après reload
- [ ] Dernier audit sélectionné est toujours mis en avant

## 🧪 Scénarios de Test Détaillés

### Scénario 1: Premier Diagnostic

**Objectif** : Valider le workflow d'onboarding complet

1. Ouvrir `/audit` dans un navigateur propre (cache vidé)
2. Observer l'état initial : "Jamais exécuté" sur toutes les cards
3. Click sur card "Diagnostic Initial"
4. Click "Lancer"
5. **Attendre** : Max 30 secondes
6. **Vérifier** :
   - 5-8 étapes visibles dans le stepper
   - Au moins 1 étape "success"
   - Aucune étape ne reste en "pending" à la fin
   - Issues panel s'affiche (normal d'avoir des warnings)

### Scénario 2: Audit GA4 Tracking

**Objectif** : Tester audit avec dépendance GA4

1. Click sur card "Google Analytics 4"
2. Si "Indisponible" → **SKIP** (GA4 non configuré)
3. Si "Lancer" disponible → Click
4. **Vérifier** :
   - Étape "Vérification connexion GA4" passe à success
   - Étape "Analyse couverture tracking" s'exécute
   - Coverage metrics affichées (événements, collections, produits)
   - Recommendations affichées si problèmes

### Scénario 3: Exécution Parallèle Complète

**Objectif** : Stress test de l'UI avec tous les audits

1. Click "Lancer tous les audits"
2. **Observer** :
   - Minimum 3-4 cards passent en "En cours" simultanément
   - Certains terminent avant d'autres (asynchrone)
   - Aucun crash ou freeze de l'UI
   - Chaque audit a ses propres résultats
3. Click sur différentes cards terminées
4. **Vérifier** : Chaque résultat s'affiche indépendamment

### Scénario 4: Error Handling

**Objectif** : Vérifier robustesse

1. Couper Inngest dev server (Ctrl+C)
2. Essayer de lancer un audit
3. **Vérifier** :
   - Message d'erreur explicite
   - UI ne crash pas
   - Possibilité de réessayer après relance d'Inngest

## 📊 Interpréter les Résultats

### Tests Réussis ✅

```
Running 13 tests using 1 worker

✓ should display audit cards grid (1.2s)
✓ should show tooltips on card hover (2.1s)
✓ should display "Run All Audits" button (0.8s)
...

13 passed (45s)
```

**Action** : Aucune. Tous les tests E2E sont valides ✅

### Tests Échoués ❌

```
✗ should run a single audit and show results (30.0s)

Error: Timed out 30000ms waiting for expect(locator).toBeVisible()
```

**Causes possibles** :
1. Backend pas démarré (`uvicorn` pas en cours)
2. Inngest pas démarré
3. Audit réellement bloqué (vérifier logs backend)

**Action** :
1. Vérifier tous les services sont UP
2. Re-run le test spécifique : `npx playwright test -g "should run a single"`
3. Si encore échoué → check logs Inngest

### Screenshots/Videos

En cas d'échec, Playwright génère automatiquement :
- **Screenshots** : `test-results/*/test-failed-1.png`
- **Videos** : `test-results/*/video.webm`
- **Traces** : `test-results/*/trace.zip`

Ouvrir le rapport HTML :
```bash
npm run test:e2e:report
```

## 🐛 Debugging

### Mode Debug Interactif

```bash
npm run test:e2e:debug
```

**Features** :
- Pause avant chaque action
- Inspecter les éléments
- Voir les sélecteurs
- Step-by-step execution

### VS Code Integration

1. Installer extension : "Playwright Test for VSCode"
2. Sidebar → Testing
3. Voir tous les tests
4. Run/Debug individuellement
5. Breakpoints supportés

### Logs Backend

Pendant les tests, surveiller :

```bash
# Terminal backend
tail -f backend/logs/audit.log  # Si logs activés
# OU
docker logs -f isciacus-backend
```

## 🔄 CI/CD Integration

### GitHub Actions

Les tests E2E s'exécutent automatiquement sur :
- Push vers `main` ou `develop`
- Pull Requests vers `main`

Workflow : `.github/workflows/e2e-tests.yml`

**Sur échec** :
1. Check GitHub Actions logs
2. Download artifacts (playwright-report, test-videos)
3. Reproduire localement

### Exécution Locale Mode CI

Simuler l'environnement CI :

```bash
CI=true npm run test:e2e
```

Différences :
- 2 retries par test
- 1 worker (séquentiel)
- Pas de réutilisation de serveurs

## 📚 Resources

- **Playwright Docs** : https://playwright.dev
- **Best Practices** : https://playwright.dev/docs/best-practices
- **Selectors** : https://playwright.dev/docs/selectors
- **Debugging** : https://playwright.dev/docs/debug

## 🎯 Next Steps

Une fois les tests E2E validés :

1. ✅ Valider manuellement avec checklist ci-dessus
2. ✅ Lancer `npm run test:e2e:ui` et vérifier tous les tests passent
3. ✅ Tester sur mobile (responsive)
4. ✅ Push vers GitHub → CI valide automatiquement
5. 🚀 Passer à la page Analytics !
