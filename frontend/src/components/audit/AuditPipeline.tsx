/**
 * Audit Pipeline - GitHub Actions style audit progress display
 */

import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchAvailableAudits,
  fetchLatestAuditSession,
  runAudit,
  executeAuditAction,
  type AuditResult,
  type AuditSession,
  type AuditStep,
} from '../../services/api'
import { AuditCardsGrid } from './AuditCard'
import { GMCFlowKPI, type GMCFlowData } from './GMCFlowKPI'
import { IssuesPanel } from './IssueCard'
import { PipelineStepsPanel } from './PipelineStep'

// Constants
const POLL_INTERVAL_MS = 1000
const HIGHLIGHT_DURATION_MS = 2000

// Custom hook for audit polling
interface UseAuditPollingReturn {
  isPolling: boolean
  startPolling: (auditType: string) => void
  stopPolling: () => void
  pollingIntervalRef: React.RefObject<ReturnType<typeof setInterval> | null>
}

function useAuditPolling(
  setRunningResult: React.Dispatch<React.SetStateAction<AuditResult | null>>,
  queryClient: ReturnType<typeof useQueryClient>
): UseAuditPollingReturn {
  const [isPolling, setIsPolling] = React.useState(false)
  const pollingIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  const stopPolling = (): void => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
  }

  const startPolling = (auditType: string): void => {
    setIsPolling(true)

    pollingIntervalRef.current = setInterval(() => {
      void (async () => {
        const sessionResponse = await fetchLatestAuditSession()
        const auditResult = sessionResponse.session?.audits[auditType]

        if (auditResult && auditResult.status !== 'running') {
          stopPolling()
          setRunningResult(auditResult)
          void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
          void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
        } else if (auditResult) {
          setRunningResult(auditResult)
        }
      })()
    }, POLL_INTERVAL_MS)
  }

  return { isPolling, startPolling, stopPolling, pollingIntervalRef }
}

// Define initial steps for each audit type (shown while waiting for API)
const AUDIT_STEPS: Record<string, { id: string; name: string; description: string }[]> = {
  onboarding: [
    { id: 'shopify_connection', name: 'Shopify', description: 'Connexion à la boutique' },
    { id: 'ga4_config', name: 'GA4', description: 'Google Analytics 4' },
    { id: 'meta_config', name: 'Meta Pixel', description: 'Facebook/Instagram' },
    { id: 'gmc_config', name: 'GMC', description: 'Google Merchant Center' },
    { id: 'gsc_config', name: 'GSC', description: 'Google Search Console' },
  ],
  ga4_tracking: [
    { id: 'ga4_connection', name: 'Connexion GA4', description: 'Vérification de la connexion' },
    { id: 'collections_coverage', name: 'Couverture Collections', description: 'Analyse des collections' },
    { id: 'products_coverage', name: 'Couverture Produits', description: 'Analyse des produits' },
    { id: 'events_coverage', name: 'Événements E-commerce', description: 'Vérification des événements' },
    { id: 'transactions_match', name: 'Match Transactions', description: 'Comparaison GA4 vs Shopify' },
  ],
  theme_code: [
    { id: 'theme_access', name: 'Accès Thème', description: 'Récupération des fichiers' },
    { id: 'ga4_code', name: 'Code GA4', description: 'Analyse du code GA4' },
    { id: 'meta_code', name: 'Code Meta Pixel', description: 'Analyse Meta Pixel' },
    { id: 'gtm_code', name: 'Google Tag Manager', description: 'Détection GTM' },
    { id: 'issues_detection', name: 'Détection Erreurs', description: 'Identification des problèmes' },
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

function createRunningResult(auditType: string): AuditResult {
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
  }
}

export function AuditPipeline(): React.ReactElement {
  const queryClient = useQueryClient()
  const [selectedAudit, setSelectedAudit] = React.useState<string | null>(null)
  const [runningResult, setRunningResult] = React.useState<AuditResult | null>(null)

  const { isPolling, startPolling, stopPolling } = useAuditPolling(setRunningResult, queryClient)

  const { data: auditsData } = useQuery({
    queryKey: ['available-audits'],
    queryFn: fetchAvailableAudits,
  })

  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ['audit-session'],
    queryFn: fetchLatestAuditSession,
  })

  const runAuditMutation = useMutation({
    mutationFn: (auditType: string) => runAudit(auditType),
    onSuccess: (data) => {
      if ('async' in data) {
        startPolling(data.audit_type)
        return
      }
      if ('result' in data) {
        setRunningResult(data.result)
        void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
        void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
      }
    },
    onError: () => {
      setRunningResult(null)
      stopPolling()
    },
  })

  const executeActionMutation = useMutation({
    mutationFn: ({ auditType, actionId }: { auditType: string; actionId: string }) =>
      executeAuditAction(auditType, actionId),
    onSuccess: () => {
      void refetchSession()
    },
  })

  const audits = auditsData?.audits ?? []
  const session = sessionData?.session

  // Use runningResult while audit is in progress, otherwise use session result
  const currentResult =
    runningResult ?? (selectedAudit !== null ? session?.audits[selectedAudit] : undefined)

  const handleRunAudit = (auditType: string): void => {
    setSelectedAudit(auditType)
    // Immediately show running state with pending steps (clears old result)
    setRunningResult(createRunningResult(auditType))
    runAuditMutation.mutate(auditType)
  }

  const handleExecuteAction = (auditType: string, actionId: string): void => {
    executeActionMutation.mutate({ auditType, actionId })
  }

  const handleSelectAudit = (auditType: string): void => {
    // Clear runningResult when selecting a different audit to show session data
    if (auditType !== selectedAudit) {
      setRunningResult(null)
    }
    setSelectedAudit(auditType)
  }

  // isRunning includes both mutation pending and async polling states
  const isRunning = runAuditMutation.isPending || isPolling

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-cream-dark p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader />
        <AuditCardsGrid
          audits={audits}
          selectedAudit={selectedAudit}
          isRunning={isRunning}
          onRun={handleRunAudit}
          onSelect={handleSelectAudit}
        />
        <AuditResultSection
          currentResult={currentResult}
          selectedAudit={selectedAudit}
          session={session}
          isRunning={isRunning}
          onExecuteAction={handleExecuteAction}
          actionPending={executeActionMutation.isPending}
        />
      </div>
    </div>
  )
}

function PageHeader(): React.ReactElement {
  return (
    <div className="mb-8">
      <h1 className="font-serif text-3xl text-burgundy">Audits Tracking</h1>
      <p className="mt-1 text-gray-600">Vérifiez la configuration de vos outils de tracking</p>
    </div>
  )
}

function AuditResultSection({
  currentResult,
  selectedAudit,
  session,
  isRunning,
  onExecuteAction,
  actionPending,
}: {
  currentResult: AuditResult | false | undefined
  selectedAudit: string | null
  session: AuditSession | null | undefined
  isRunning: boolean
  onExecuteAction: (auditType: string, actionId: string) => void
  actionPending: boolean
}): React.ReactElement | null {
  if (currentResult !== undefined && currentResult !== false) {
    return (
      <AuditResultPanel
        result={currentResult}
        isRunning={isRunning && selectedAudit === currentResult.audit_type}
        onExecuteAction={onExecuteAction}
        actionPending={actionPending}
      />
    )
  }

  if (selectedAudit === null && session === null) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-gray-500">
          Sélectionnez un audit ci-dessus pour voir les détails ou lancez un nouvel audit.
        </p>
      </div>
    )
  }

  return null
}

function AuditResultPanel({
  result,
  isRunning,
  onExecuteAction,
  actionPending,
}: {
  result: AuditResult
  isRunning: boolean
  onExecuteAction: (auditType: string, actionId: string) => void
  actionPending: boolean
}): React.ReactElement {
  // Extract KPI data for GMC audits
  const kpiData = result.summary.kpi as GMCFlowData | undefined

  // Function to scroll to issue when clicking on KPI elements
  const handleNavigateToIssue = (issueId: string): void => {
    const element = document.getElementById(`issue-${issueId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Add highlight effect
      element.classList.add('ring-2', 'ring-burgundy', 'ring-offset-2')
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-burgundy', 'ring-offset-2')
      }, HIGHLIGHT_DURATION_MS)
    }
  }

  // Filter out the kpi_summary issue since we now show it visually
  const filteredIssues = result.issues.filter((issue) => issue.id !== 'kpi_summary')

  return (
    <div className="space-y-6">
      <PipelineStepsPanel steps={result.steps} isRunning={isRunning} />

      {/* GMC Flow KPI Visualization - only show for merchant_center audit when complete */}
      {result.audit_type === 'merchant_center' && kpiData && !isRunning && (
        <GMCFlowKPI data={kpiData} onNavigateToIssue={handleNavigateToIssue} />
      )}

      <IssuesPanel
        issues={filteredIssues}
        auditType={result.audit_type}
        status={result.status}
        onExecuteAction={onExecuteAction}
        actionPending={actionPending}
      />
    </div>
  )
}
