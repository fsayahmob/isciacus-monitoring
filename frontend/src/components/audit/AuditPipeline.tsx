/**
 * Audit Pipeline - GitHub Actions style audit progress display
 *
 * Uses React Query for state management with proper step reconciliation.
 * Steps are always displayed progressively, never replaced wholesale.
 */

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { executeAuditAction, type AuditResult, type AuditSession } from '../../services/api'
import { AuditCardsGrid } from './AuditCard'
import { GMCFlowKPI, type GMCFlowData } from './GMCFlowKPI'
import { IssuesPanel } from './IssueCard'
import { PipelineStepsPanel } from './PipelineStep'
import { useAuditSession } from './useAuditSession'

const HIGHLIGHT_DURATION_MS = 2000

export function AuditPipeline(): React.ReactElement {
  const queryClient = useQueryClient()

  // Use the new consolidated hook for all audit state
  const {
    session,
    availableAudits,
    currentResult,
    selectedAudit,
    isRunning,
    selectAudit,
    runSelectedAudit,
  } = useAuditSession()

  const executeActionMutation = useMutation({
    mutationFn: ({ auditType, actionId }: { auditType: string; actionId: string }) =>
      executeAuditAction(auditType, actionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    },
  })

  const { audits } = availableAudits

  const handleRunAudit = (auditType: string): void => {
    runSelectedAudit(auditType)
  }

  const handleExecuteAction = (auditType: string, actionId: string): void => {
    executeActionMutation.mutate({ auditType, actionId })
  }

  const handleSelectAudit = (auditType: string): void => {
    selectAudit(auditType)
  }

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
  currentResult: AuditResult | null
  selectedAudit: string | null
  session: AuditSession | null
  isRunning: boolean
  onExecuteAction: (auditType: string, actionId: string) => void
  actionPending: boolean
}): React.ReactElement | null {
  if (currentResult !== null) {
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
      <PipelineStepsPanel
        steps={result.steps}
        isRunning={isRunning}
        executionMode={result.execution_mode}
      />

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
