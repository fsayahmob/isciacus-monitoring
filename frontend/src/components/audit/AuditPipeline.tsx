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
} from '../../services/api'
import { AuditCardsGrid } from './AuditCard'
import { createRunningResult } from './auditSteps'
import { GMCFlowKPI, type GMCFlowData } from './GMCFlowKPI'
import { IssuesPanel } from './IssueCard'
import { PipelineStepsPanel } from './PipelineStep'
import { useAuditPolling } from './useAuditPolling'

const HIGHLIGHT_DURATION_MS = 2000

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
