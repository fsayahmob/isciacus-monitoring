/**
 * Audit step definitions for each audit type
 * Used to show loading states while waiting for API response
 */

import { type AuditStep, type AuditResult, type AuditStepStatus } from '../../services/api'

// Define initial steps for each audit type (shown while waiting for API)
export const AUDIT_STEPS: Record<string, { id: string; name: string; description: string }[]> = {
  onboarding: [
    { id: 'shopify_connection', name: 'Shopify', description: 'Connexion à la boutique' },
    { id: 'ga4_config', name: 'GA4', description: 'Google Analytics 4' },
    { id: 'meta_config', name: 'Meta Pixel', description: 'Facebook/Instagram' },
    { id: 'gmc_config', name: 'GMC', description: 'Google Merchant Center' },
    { id: 'gsc_config', name: 'GSC', description: 'Google Search Console' },
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
  ],
  meta_pixel: [
    { id: 'meta_connection', name: 'Détection Pixel', description: 'Scan du thème Shopify' },
    { id: 'pixel_config', name: 'Configuration', description: 'Vérification installation' },
    { id: 'events_check', name: 'Événements', description: 'Vérification des événements' },
    { id: 'pixel_status', name: 'Statut Meta', description: 'Activité sur Meta' },
  ],
  search_console: [
    { id: 'gsc_connection', name: 'Connexion GSC', description: 'Connexion Search Console' },
    { id: 'site_verification', name: 'Vérification Site', description: 'Statut de vérification' },
    { id: 'indexing_status', name: 'Indexation', description: "Statut d'indexation" },
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
 * Reconcile steps from API with placeholder steps.
 * This ensures we always show all expected steps, even if some haven't started yet.
 * Steps from API take priority; missing steps remain as 'pending'.
 */
export function reconcileSteps(
  auditType: string,
  apiSteps: AuditStep[] | undefined
): AuditStep[] {
  const stepDefs = AUDIT_STEPS[auditType] as { id: string; name: string; description: string }[] | undefined
  if (stepDefs === undefined) {
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
