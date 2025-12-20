/**
 * Audit Tooltips - Detailed explanations for each audit type
 */

export interface AuditTooltipData {
  what: string
  why: string
  checks: string[]
  impact: string
}

export const AUDIT_TOOLTIPS: Record<string, AuditTooltipData> = {
  onboarding: {
    what: 'Diagnostic initial de votre configuration',
    why: 'Vérifie que tous les services Ads et SEO sont connectés avant de lancer les audits détaillés',
    checks: [
      'GA4 configuré et connecté',
      'Meta Pixel installé',
      'Google Merchant Center lié',
      'Search Console configuré',
    ],
    impact: 'Bloquant pour lancer les autres audits',
  },
  theme_code: {
    what: 'Analyse du code de tracking dans votre thème Shopify',
    why: 'Détecte les pixels multiples, codes obsolètes et problèmes de Consent Mode v2',
    checks: [
      'Pixels GA4 installés (tag gtag.js)',
      'Pixels Meta Pixel présents',
      'Consent Mode v2 configuré (4 paramètres obligatoires)',
      'Doublons de pixels',
    ],
    impact: 'Qualité du tracking et conformité RGPD',
  },
  ga4_tracking: {
    what: 'Vérification de la qualité du tracking Google Analytics 4',
    why: 'Valide que tous les événements e-commerce sont bien trackés et que les conversions matchent Shopify',
    checks: [
      'Événements GA4 complets (view_item, add_to_cart, purchase, etc.)',
      'Match rate transactions GA4 vs Shopify',
      'Segmentation disponible (device, country, source)',
      'Liaison Google Ads active',
    ],
    impact: 'Attribution et optimisation Google Ads',
  },
  meta_pixel: {
    what: 'Audit de la configuration Meta Pixel (Facebook/Instagram Ads)',
    why: 'Vérifie que le pixel Meta track correctement les conversions pour optimiser vos campagnes',
    checks: [
      'Pixel Meta installé et actif',
      'Événements standard présents (ViewContent, AddToCart, Purchase)',
      'Paramètres de conversion configurés',
      'Déduplication avec CAPI active',
    ],
    impact: 'Performance des campagnes Meta Ads',
  },
  capi: {
    what: 'Configuration Meta Conversions API (server-side tracking)',
    why: 'Récupère les conversions perdues avec iOS 14.5+ et améliore la qualité des données',
    checks: [
      'CAPI configuré et connecté',
      'Test events reçus par Meta',
      'Déduplication pixel client-side ↔ CAPI',
      'Event Match Quality (EMQ) score évalué',
    ],
    impact: 'Signal loss recovery et meilleur ROAS',
  },
  customer_data: {
    what: 'Analyse de la qualité des données clients pour les audiences Ads',
    why: 'Des données clients riches permettent un meilleur ciblage et des audiences Lookalike performantes',
    checks: [
      'Taux opt-in email',
      'Numéros de téléphone capturés',
      'Opt-in SMS/marketing',
      'Volume de clients suffisant',
    ],
    impact: 'Qualité des audiences et taux de match',
  },
  cart_recovery: {
    what: 'Évaluation du potentiel de récupération des paniers abandonnés',
    why: 'Les campagnes de retargeting panier génèrent souvent un excellent ROI',
    checks: [
      'Volume de paniers abandonnés',
      'Taux de capture email',
      'Valeur moyenne des paniers',
      'Taux de récupération actuel',
    ],
    impact: 'ROI des campagnes de retargeting',
  },
  ads_readiness: {
    what: 'Score /100 de préparation pour lancer des campagnes Ads',
    why: 'Évalue si vous avez assez de données et de tracking pour lancer des campagnes rentables',
    checks: [
      'Tracking Quality (50 pts) - Événements GA4/Meta complets',
      'Conversion Completeness (15 pts) - Match rate GA4 ↔ Shopify',
      'Segmentation Data (15 pts) - Device/Country/Source disponibles',
      'Attribution Readiness (10 pts) - UTM tracking fonctionnel',
      'Ads Metrics Calculable (10 pts) - ROAS/CPA/LTV calculables',
    ],
    impact: 'Validation complète avant lancement Ads',
  },
  merchant_center: {
    what: 'Audit Google Merchant Center pour Google Shopping',
    why: 'Vérifie que vos produits sont correctement synchronisés et sans erreurs pour Google Shopping',
    checks: [
      'Flux produits synchronisé',
      'Erreurs de validation (prix, images, GTIN)',
      "Taux d'approbation des produits",
      'Couverture du catalogue',
    ],
    impact: 'Visibilité sur Google Shopping',
  },
  search_console: {
    what: 'Analyse Google Search Console pour le SEO',
    why: "Identifie les problèmes d'indexation et d'exploration qui limitent votre visibilité organique",
    checks: [
      'Pages indexées vs total',
      "Erreurs d'exploration (404, 500)",
      'Sitemap configuré',
      'Core Web Vitals (LCP, FID, CLS)',
    ],
    impact: 'Trafic organique et positions SEO',
  },
}
