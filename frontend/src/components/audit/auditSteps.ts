/**
 * Audit step definitions for each audit type
 * Used to show loading states while waiting for API response
 */

import { type AuditStep, type AuditResult, type AuditStepStatus } from '../../services/api'

// Define initial steps for each audit type (shown while waiting for API)
// search_console has two modes: GSC mode (when configured) and basic SEO mode (when not configured)
export const AUDIT_STEPS: Record<string, { id: string; name: string; description: string }[]> = {
  onboarding: [
    { id: 'shopify_connection', name: 'Shopify', description: 'Connexion à la boutique' },
    { id: 'ga4_config', name: 'GA4', description: 'Google Analytics 4' },
    { id: 'meta_config', name: 'Meta Pixel', description: 'Facebook/Instagram' },
    { id: 'gmc_config', name: 'GMC', description: 'Google Merchant Center' },
    { id: 'gsc_config', name: 'GSC', description: 'Google Search Console' },
  ],
  customer_data: [
    {
      id: 'customer_count',
      name: 'Nombre de clients',
      description: 'Vérification du nombre minimum (1000+)',
    },
    {
      id: 'data_history',
      name: 'Historique données',
      description: 'Analyse de la profondeur historique (90+ jours)',
    },
    {
      id: 'data_quality',
      name: 'Qualité des données',
      description: 'Vérification emails et valeurs commandes',
    },
  ],
  cart_recovery: [
    {
      id: 'cart_tracking',
      name: 'Tracking paniers',
      description: 'Vérification du suivi des abandons',
    },
    {
      id: 'abandonment_volume',
      name: 'Volume abandons',
      description: 'Analyse du volume (50+/mois minimum)',
    },
    {
      id: 'email_capture',
      name: 'Capture emails',
      description: 'Taux de capture email (60%+ requis)',
    },
    {
      id: 'recovery_potential',
      name: 'Potentiel récupération',
      description: 'Estimation du revenu récupérable',
    },
  ],
  ga4_tracking: [
    { id: 'ga4_connection', name: 'Connexion GA4', description: 'Vérification de la connexion' },
    {
      id: 'collections_coverage',
      name: 'Couverture Collections',
      description: 'Analyse des collections',
    },
    { id: 'products_coverage', name: 'Couverture Produits', description: 'Analyse des produits' },
    {
      id: 'events_coverage',
      name: 'Événements E-commerce',
      description: 'Vérification des événements',
    },
    {
      id: 'transactions_match',
      name: 'Match Transactions',
      description: 'Comparaison GA4 vs Shopify',
    },
  ],
  theme_code: [
    { id: 'theme_access', name: 'Accès Thème', description: 'Récupération des fichiers' },
    { id: 'ga4_code', name: 'Code GA4', description: 'Analyse du code GA4' },
    { id: 'meta_code', name: 'Code Meta Pixel', description: 'Analyse Meta Pixel' },
    { id: 'gtm_code', name: 'Google Tag Manager', description: 'Détection GTM' },
    {
      id: 'issues_detection',
      name: 'Détection Erreurs',
      description: 'Identification des problèmes',
    },
  ],
  merchant_center: [
    { id: 'gmc_connection', name: 'Connexion GMC', description: 'Connexion au Merchant Center' },
    { id: 'products_status', name: 'Statut Produits', description: 'Analyse des produits GMC' },
    { id: 'feed_sync', name: 'Synchronisation Feed', description: 'Vérification de la sync' },
    { id: 'issues_check', name: 'Problèmes', description: 'Détection des problèmes' },
  ],
  meta_pixel: [
    { id: 'meta_connection', name: 'Détection Pixel', description: 'Scan du thème Shopify' },
    { id: 'pixel_config', name: 'Configuration', description: 'Vérification installation' },
    { id: 'events_check', name: 'Événements', description: 'Vérification des événements' },
    { id: 'pixel_status', name: 'Statut Meta', description: 'Activité sur Meta' },
  ],
  // search_console: Steps shown initially (basic SEO mode, will be replaced by API response)
  search_console: [
    { id: 'robots_txt', name: 'Robots.txt', description: 'Analyse du fichier robots.txt' },
    { id: 'sitemap_check', name: 'Sitemap', description: 'Vérification du sitemap public' },
    { id: 'meta_tags', name: 'Meta Tags', description: 'Analyse des balises meta' },
    { id: 'seo_basics', name: 'SEO Basique', description: 'Vérifications techniques SEO' },
  ],
  // Alternative steps for GSC mode (used when GSC is configured)
  search_console_gsc: [
    { id: 'gsc_connection', name: 'Connexion GSC', description: 'Connexion Search Console' },
    { id: 'indexation', name: 'Indexation', description: "Couverture d'indexation" },
    { id: 'errors', name: 'Erreurs', description: 'Vérification des erreurs' },
    { id: 'sitemaps', name: 'Sitemaps', description: 'Statut des sitemaps' },
  ],
  bot_access: [
    {
      id: 'robots_txt',
      name: 'Robots.txt',
      description: 'Vérification des règles pour crawlers Ads',
    },
    {
      id: 'googlebot_access',
      name: 'Accès Googlebot',
      description: "Test d'accès avec User-Agent Googlebot",
    },
    {
      id: 'facebookbot_access',
      name: 'Accès Facebookbot',
      description: "Test d'accès avec User-Agent Meta/Facebook",
    },
    {
      id: 'protection_headers',
      name: 'Protection Anti-Bot',
      description: 'Détection de Cloudflare, WAF, etc.',
    },
  ],
}

export function createRunningResult(auditType: string, isAsync = true): AuditResult {
  const stepDefs = AUDIT_STEPS[auditType] ?? [
    { id: 'loading', name: 'Chargement...', description: 'Audit en cours' },
  ]
  // Create steps with first one running, others pending
  const steps: AuditStep[] = stepDefs.map((def, index) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    status: index === 0 ? 'running' : 'pending',
    started_at: index === 0 ? new Date().toISOString() : null,
    completed_at: null,
    duration_ms: null,
    result: null,
    error_message: null,
  }))
  return {
    id: 'running',
    audit_type: auditType,
    status: 'running',
    started_at: new Date().toISOString(),
    completed_at: null,
    steps,
    issues: [],
    summary: {},
    raw_data: null,
    // Default to async (Inngest) mode - will be confirmed by API response
    execution_mode: isAsync ? 'inngest' : 'sync',
  }
}

/**
 * Detect which mode the search_console audit is running in based on step IDs.
 * Returns 'gsc' if GSC steps are detected, 'basic' otherwise.
 */
function detectSearchConsoleMode(apiSteps: AuditStep[] | undefined): 'gsc' | 'basic' {
  if (!apiSteps || apiSteps.length === 0) {
    return 'basic' // Default to basic SEO mode
  }
  // GSC mode has 'gsc_connection' step, basic mode has 'robots_txt'
  const hasGscStep = apiSteps.some((step) => step.id === 'gsc_connection')
  return hasGscStep ? 'gsc' : 'basic'
}

/**
 * Reconcile steps from API with placeholder steps.
 * This ensures we always show all expected steps, even if some haven't started yet.
 * Steps from API take priority; missing steps remain as 'pending'.
 */
export function reconcileSteps(auditType: string, apiSteps: AuditStep[] | undefined): AuditStep[] {
  let stepDefs: { id: string; name: string; description: string }[] | undefined

  // Special handling for search_console: detect mode from API steps
  if (auditType === 'search_console') {
    const mode = detectSearchConsoleMode(apiSteps)
    // Use bracket notation to access keys with underscores
    stepDefs = mode === 'gsc' ? AUDIT_STEPS.search_console_gsc : AUDIT_STEPS.search_console
  } else {
    stepDefs = AUDIT_STEPS[auditType] as typeof stepDefs
  }

  if (!stepDefs) {
    return apiSteps ?? []
  }

  // Create a map of API steps by ID for quick lookup
  const apiStepMap = new Map<string, AuditStep>()
  if (apiSteps) {
    for (const step of apiSteps) {
      apiStepMap.set(step.id, step)
    }
  }

  // Build reconciled steps: use API step if available, otherwise create pending placeholder
  return stepDefs.map((def) => {
    const apiStep = apiStepMap.get(def.id)
    if (apiStep) {
      return apiStep
    }
    // Create pending placeholder for steps not yet in API response
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      status: 'pending' as AuditStepStatus,
      started_at: null,
      completed_at: null,
      duration_ms: null,
      result: null,
      error_message: null,
    }
  })
}

/**
 * Merge a new result with an existing one, preserving step states.
 * This prevents UI flickering by keeping previous step states until new ones arrive.
 */
export function mergeAuditResults(
  existing: AuditResult | null,
  incoming: AuditResult | null
): AuditResult | null {
  if (!incoming) {
    return existing
  }
  if (!existing || existing.audit_type !== incoming.audit_type) {
    return incoming
  }

  // Reconcile steps to ensure all expected steps are present
  const reconciledSteps = reconcileSteps(incoming.audit_type, incoming.steps)

  return {
    ...incoming,
    steps: reconciledSteps,
  }
}

// Constants and types for running audit detection
export interface RunningAuditInfo {
  startedAt: string
  runId?: string
}

const CLOCK_SKEW_TOLERANCE_MS = 5000
const FINAL_STATUSES = ['success', 'warning', 'error', 'skipped']
const MAX_AUDIT_DURATION_MS = 120000

/** Detect audits with status 'running' from backend session (for page refresh recovery) */
export function detectRunningAuditsFromSession(session: {
  audits: Record<string, AuditResult>
}): Map<string, RunningAuditInfo> {
  const running = new Map<string, RunningAuditInfo>()
  Object.entries(session.audits).forEach(([auditType, result]) => {
    if (result.status === 'running') {
      running.set(auditType, { startedAt: result.started_at })
    }
  })
  return running
}

export function isResultFromCurrentRun(
  result: AuditResult | null,
  runInfo: RunningAuditInfo | undefined
): boolean {
  if (result === null || runInfo === undefined) {
    return false
  }
  const serverStarted = new Date(result.started_at).getTime()
  const ourTrigger = new Date(runInfo.startedAt).getTime()
  return serverStarted >= ourTrigger - CLOCK_SKEW_TOLERANCE_MS
}

export function findCompletedAudits(
  running: Map<string, RunningAuditInfo>,
  session: { audits: Record<string, AuditResult> } | null
): string[] {
  if (session === null) {
    return []
  }
  const completed: string[] = []
  const now = Date.now()
  running.forEach((runInfo, auditType) => {
    if (!(auditType in session.audits)) {
      return
    }
    const result = session.audits[auditType]
    const serverStarted = new Date(result.started_at).getTime()
    const ourTrigger = new Date(runInfo.startedAt).getTime()
    if (serverStarted < ourTrigger - CLOCK_SKEW_TOLERANCE_MS) {
      return
    }
    if (FINAL_STATUSES.includes(result.status) && result.completed_at !== null) {
      completed.push(auditType)
      return
    }
    const elapsed = now - ourTrigger
    if (elapsed > MAX_AUDIT_DURATION_MS) {
      console.warn(`⏱️ Audit ${auditType} timeout - forcing completion`)
      completed.push(auditType)
    }
  })
  return completed
}

export function resolveCurrentResult(
  selected: string | null,
  session: { audits: Record<string, AuditResult> } | null,
  optimistic: Map<string, AuditResult>,
  running: Map<string, RunningAuditInfo>
): AuditResult | null {
  if (selected === null) {
    return null
  }
  const serverResult = session?.audits[selected] ?? null
  const runInfo = running.get(selected)
  let base: AuditResult | null = null
  if (runInfo !== undefined) {
    const fromCurrent = serverResult !== null && isResultFromCurrentRun(serverResult, runInfo)
    base = fromCurrent ? serverResult : (optimistic.get(selected) ?? null)
  } else {
    base = serverResult
  }
  if (base === null) {
    return null
  }
  return { ...base, steps: reconcileSteps(base.audit_type, base.steps) }
}
