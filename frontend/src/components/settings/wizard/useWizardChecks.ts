/**
 * Configuration Wizard Custom Hook
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchHealthCheck, fetchShopifyPermissions } from '../../../services/api'
import type { CheckStatus, WizardCheck } from './types'

// Constants
const HEALTH_STALE_TIME = 30000
const PERMISSIONS_STALE_TIME = 60000

function buildBackendCheck(
  healthLoading: boolean,
  health: Awaited<ReturnType<typeof fetchHealthCheck>> | undefined
): WizardCheck | null {
  if (healthLoading) {
    return {
      id: 'backend',
      name: 'Backend API',
      description: 'Vérification du serveur...',
      status: 'loading',
    }
  }
  if (health !== undefined) {
    const backendOk = health.services.backend.status === 'healthy'
    return {
      id: 'backend',
      name: 'Backend API',
      description: backendOk ? 'Le serveur fonctionne correctement' : 'Problème de connexion',
      status: backendOk ? 'success' : 'error',
      details: health.services.backend.message,
    }
  }
  return null
}

function buildInngestCheck(
  healthLoading: boolean,
  health: Awaited<ReturnType<typeof fetchHealthCheck>> | undefined
): WizardCheck | null {
  if (healthLoading) {
    return {
      id: 'inngest',
      name: 'Inngest (Jobs)',
      description: 'Vérification du service de jobs...',
      status: 'loading',
    }
  }
  if (health !== undefined) {
    const inngestStatus = health.services.inngest.status
    let status: CheckStatus = 'pending'
    if (inngestStatus === 'healthy' || inngestStatus === 'configured') {
      status = 'success'
    } else if (
      inngestStatus === 'degraded' ||
      inngestStatus === 'disabled' ||
      inngestStatus === 'not_configured'
    ) {
      status = 'warning'
    }
    return {
      id: 'inngest',
      name: 'Inngest (Jobs)',
      description:
        status === 'success' ? 'Service de jobs asynchrones opérationnel' : 'Jobs synchrones (plus lent)',
      status,
      details: health.services.inngest.message,
    }
  }
  return null
}

function buildPermissionsCheck(
  permissionsLoading: boolean,
  permissions: Awaited<ReturnType<typeof fetchShopifyPermissions>> | undefined
): WizardCheck | null {
  if (permissionsLoading) {
    return {
      id: 'permissions',
      name: 'Permissions Shopify',
      description: 'Vérification des permissions...',
      status: 'loading',
    }
  }
  if (permissions !== undefined) {
    const allGranted = permissions.all_granted
    const grantedCount = permissions.results.filter((p) => p.status === 'granted').length
    const total = permissions.results.length
    return {
      id: 'permissions',
      name: 'Permissions Shopify',
      description: allGranted
        ? 'Toutes les permissions sont accordées'
        : `${String(grantedCount)}/${String(total)} permissions accordées`,
      status: allGranted ? 'success' : 'warning',
      details: allGranted ? undefined : 'Certaines fonctionnalités peuvent être limitées',
    }
  }
  return null
}

export interface UseWizardChecksResult {
  checks: WizardCheck[]
  isLoading: boolean
  refresh: () => void
}

export function useWizardChecks(): UseWizardChecksResult {
  const queryClient = useQueryClient()

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health-check'],
    queryFn: fetchHealthCheck,
    staleTime: HEALTH_STALE_TIME,
  })

  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['shopify-permissions'],
    queryFn: fetchShopifyPermissions,
    staleTime: PERMISSIONS_STALE_TIME,
  })

  // Build checks array
  const checks: WizardCheck[] = []

  const backendCheck = buildBackendCheck(healthLoading, health)
  if (backendCheck !== null) {
    checks.push(backendCheck)
  }

  const inngestCheck = buildInngestCheck(healthLoading, health)
  if (inngestCheck !== null) {
    checks.push(inngestCheck)
  }

  const permissionsCheck = buildPermissionsCheck(permissionsLoading, permissions)
  if (permissionsCheck !== null) {
    checks.push(permissionsCheck)
  }

  const isLoading = checks.some((c) => c.status === 'loading')

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['health-check'] })
    void queryClient.invalidateQueries({ queryKey: ['shopify-permissions'] })
  }

  return {
    checks,
    isLoading,
    refresh,
  }
}
