# Plan: ISCIACUS Analytics Dashboard v3

## Résumé
Extension du dashboard monitoring ISCIACUS avec 3 nouvelles sections Analytics :
1. **Analytics DATA** - Métriques clients (base, email, SMS opt-in)
2. **Tunnel de Conversion** - Funnel complet avec CVR par palier
3. **Audit Shopify Admin** - Optimisations recommandées

---

## QUESTIONS POUR CLARIFICATION (AVANT IMPLÉMENTATION)

### 1. APIs déjà configurées ?
Avez-vous déjà des accès configurés pour :
- [ ] **Google Analytics 4** : Property ID et credentials OAuth ?
- [ ] **Meta Ads** : App ID, Ad Account ID, accès API ?
- [ ] **Google Search Console** : Site vérifié et credentials ?

### 2. Priorité des fonctionnalités
Voulez-vous développer les 3 fonctions en parallèle ou par ordre de priorité ?
1. Analytics DATA (clients, abonnés email/SMS)
2. Tunnel de Conversion (funnel complet avec CVR)
3. Audit Shopify Admin (optimisations)

### 3. Image Sidebar
Où se trouve l'image `SLIDE_2.jpeg` de la keynote ? (chemin complet)

### 4. Benchmarks dynamiques
Pour la page de benchmarks (seuils rouge/jaune/vert) :
- **Option A** : Fichier JSON éditable manuellement
- **Option B** : Interface admin dans le dashboard
- **Option C** : Les deux (fichier par défaut + override via UI)

---

## Architecture Proposée

### Sources de Données par Métrique

| Métrique | Source Principale | Source Alternative |
|----------|-------------------|-------------------|
| Base clients | Shopify GraphQL | - |
| Abonnés email | Shopify GraphQL (`emailMarketingConsent`) | - |
| Numéros téléphone | Shopify GraphQL (`phone`) | - |
| Opt-in SMS | Shopify GraphQL (`smsMarketingConsent`) | - |
| Visiteurs | Google Analytics 4 | Shopify Analytics (limité) |
| Vues produit | Google Analytics 4 (`view_item`) | - |
| Ajout panier | Google Analytics 4 (`add_to_cart`) | - |
| Checkout | Google Analytics 4 (`begin_checkout`) | Shopify (abandonedCheckouts) |
| Achat | Shopify GraphQL (orders) | GA4 (`purchase`) |

### Benchmarks E-commerce 2025 (Fashion/Luxury)

| Métrique | Rouge (Bad) | Jaune (OK) | Vert (Good) | Source |
|----------|-------------|------------|-------------|--------|
| CVR Global Fashion | < 2.0% | 2.0-3.3% | > 3.3% | Dynamic Yield |
| CVR Luxury | < 0.5% | 0.5-1.2% | > 1.2% | Statista |
| Product View → ATC | < 5% | 5-10% | > 10% | Industry avg |
| ATC → Checkout | < 30% | 30-50% | > 50% | Industry avg |
| Checkout Completion | < 40% | 40-60% | > 60% | Baymard |
| Email Opt-in | < 70% | 70-85% | > 85% | Omnisend |
| SMS Opt-in | < 3% | 3-6% | > 6% | Klaviyo |

---

## Structure des Fichiers (Proposition)

### Backend (Python/FastAPI)

```
backend/
├── monitoring_app.py          # Existant - étendre
├── services/
│   ├── __init__.py
│   ├── shopify_analytics.py   # Nouveaux endpoints clients
│   ├── ga4_service.py         # Google Analytics 4 API
│   └── benchmarks.py          # Gestion des seuils
├── models/
│   ├── __init__.py
│   ├── analytics.py           # Types Pydantic
│   └── benchmarks.py          # Types benchmarks
└── config/
    └── benchmarks.json        # Seuils par défaut
```

### Frontend (React/TypeScript)

```
frontend/src/
├── pages/
│   ├── AnalyticsDataPage.tsx      # Section 1: DATA
│   ├── ConversionFunnelPage.tsx   # Section 2: Tunnel
│   ├── AuditPage.tsx              # Section 3: Audit
│   └── BenchmarksPage.tsx         # Page seuils
├── components/
│   ├── analytics/
│   │   ├── CustomerStats.tsx      # Cards clients/email/SMS
│   │   ├── FunnelChart.tsx        # Visualisation funnel
│   │   ├── CVRByEntry.tsx         # CVR par point d'entrée
│   │   └── BenchmarkIndicator.tsx # Badge couleur
│   └── ...
├── hooks/
│   ├── useAnalytics.ts            # Hook données analytics
│   ├── useFunnel.ts               # Hook données funnel
│   └── useBenchmarks.ts           # Hook seuils
└── types/
    ├── analytics.ts               # Types analytics
    └── benchmarks.ts              # Types benchmarks
```

---

## Endpoints API (Proposition)

### Analytics DATA
```
GET /api/analytics/customers
→ { total, email_subscribers, phone_count, sms_optin, opt_in_rates }

GET /api/analytics/customers/refresh
→ Force refresh depuis Shopify
```

### Tunnel de Conversion
```
GET /api/analytics/funnel?period=30d
→ {
    visitors, product_views, add_to_cart, checkout, purchase,
    cvr_by_stage: { homepage_cvr, collection_cvr, product_cvr },
    cvr_stats: { mean, min, max, median }
  }

GET /api/analytics/funnel/by-collection
→ CVR détaillé par collection
```

### Benchmarks
```
GET /api/benchmarks
→ { industry: "fashion", thresholds: {...}, sources: [...] }

PUT /api/benchmarks
→ Update seuils (admin)
```

---

## Visualisation Funnel (Wireframe)

```
┌─────────────────────────────────────────────────────────────┐
│  TUNNEL DE CONVERSION - 30 derniers jours        [Refresh]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Visiteurs    →    Vues     →   Panier   →  Checkout → Achat
│   ████████████      ███████      ███          ██         █
│   24,882            6,285        136          104        26
│                                                             │
│   CVR: 100%   →    25.3%   →    2.2%    →   76.5%   →  25%
│                    (🟢)         (🔴)         (🟢)       (🟡)
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  CVR par point d'entrée:                                    │
│  ┌──────────────┬────────┬─────────┬─────────┐              │
│  │ Point        │ CVR    │ Min-Max │ Status  │              │
│  ├──────────────┼────────┼─────────┼─────────┤              │
│  │ Homepage     │ 0.08%  │ 0-0.2%  │ 🔴      │              │
│  │ Collection   │ 0.12%  │ 0-0.5%  │ 🔴      │              │
│  │ Product Page │ 0.41%  │ 0-1.2%  │ 🟡      │              │
│  │ Direct       │ 0.15%  │ 0-0.3%  │ 🔴      │              │
│  └──────────────┴────────┴─────────┴─────────┘              │
│                                                             │
│  [▼ Détails par collection]  (accordion/tiroir)             │
│    Collection "Nouveautés" - CVR: 0.18%                     │
│    Collection "Classiques" - CVR: 0.25%                     │
│    Collection "Promo" - CVR: 0.42%                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Étapes d'implémentation

### Phase 1: Infrastructure (estimé 2-3h)
- [ ] Créer structure backend (services/, models/, config/)
- [ ] Ajouter fichier benchmarks.json avec seuils par défaut
- [ ] Créer types TypeScript frontend
- [ ] Ajouter nouvelles pages dans navigation
- [ ] Copier image SLIDE_2.jpeg dans public/static/

### Phase 2: Analytics DATA - Shopify (estimé 3-4h)
- [ ] Implémenter `shopify_analytics.py` (GraphQL customers)
- [ ] Query: `customers(first:250)` avec pagination
- [ ] Extraire: emailMarketingConsent, smsMarketingConsent, phone
- [ ] Créer endpoint `/api/analytics/customers`
- [ ] Créer composant `CustomerStats.tsx`
- [ ] Intégrer dans page Analytics

### Phase 3: Tunnel de Conversion (estimé 4-5h)
- [ ] Si GA4 configuré: implémenter `ga4_service.py`
- [ ] Sinon: utiliser données Shopify (abandonedCheckouts + orders)
- [ ] Créer endpoint `/api/analytics/funnel`
- [ ] Créer composant `FunnelChart.tsx` (visualisation barres)
- [ ] Créer `CVRByEntry.tsx` (tableau CVR par palier)
- [ ] Implémenter accordion par collection
- [ ] Ajouter statistiques (mean, min, max excluant zéros)

### Phase 4: Benchmarks & Indicateurs (estimé 2h)
- [ ] Créer fichier `config/benchmarks.json`
- [ ] Créer page `BenchmarksPage.tsx` (édition seuils)
- [ ] Implémenter `BenchmarkIndicator.tsx` (badges 🔴🟡🟢)
- [ ] Connecter indicateurs aux seuils dynamiques

### Phase 5: Audit Shopify (À DÉFINIR)
- Besoin de clarification sur le contenu souhaité
- Exemples possibles:
  - SEO produits (titres, descriptions)
  - Images manquantes
  - Variants sans SKU
  - Produits sans collection

---

## Dépendances à installer

### Backend
```bash
pip install google-analytics-data  # GA4 API (si utilisé)
pip install google-auth            # OAuth Google (si utilisé)
```

### Frontend
```bash
npm install recharts  # Bibliothèque charts pour le funnel
```

---

## Fichiers clés à modifier

### Backend
- `backend/monitoring_app.py` - Ajouter routes analytics
- Créer `backend/services/shopify_analytics.py`
- Créer `backend/services/benchmarks.py`
- Créer `backend/config/benchmarks.json`

### Frontend
- `frontend/src/App.tsx` - Ajouter pages
- `frontend/src/constants/index.ts` - Ajouter PAGES
- `frontend/src/components/Sidebar.tsx` - Ajouter navigation
- Créer `frontend/src/components/analytics/` (dossier)
- Créer `frontend/src/hooks/useAnalytics.ts`
- Créer `frontend/src/types/analytics.ts`

---

## Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| GA4 non configuré | Pas de données visiteurs/funnel | Fallback sur Shopify (partiel) |
| Rate limits Shopify | Données incomplètes | Cache agressif + bulk operations |
| Données temps réel | Latence perçue | Bouton refresh + cache 5min |
| Calcul CVR avec zéros | Statistiques faussées | Médiane + exclusion zéros |

---

## PROCHAINES ÉTAPES

**Répondre aux questions de clarification ci-dessus, puis valider ce plan pour commencer l'implémentation.**
