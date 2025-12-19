/**
 * Audit Pipeline - Modern Dark Theme Dashboard
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

  const {
    session,
    availableAudits,
    currentResult,
    selectedAudit,
    isSelectedAuditRunning,
    selectAudit,
    runAudit,
    isAuditRunning,
  } = useAuditSession()

  const executeActionMutation = useMutation({
    mutationFn: ({ auditType, actionId }: { auditType: string; actionId: string }) =>
      executeAuditAction(auditType, actionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    },
  })

  const { audits } = availableAudits

  const handleExecuteAction = (auditType: string, actionId: string): void => {
    executeActionMutation.mutate({ auditType, actionId })
  }

  return (
    <div className="min-h-screen bg-bg-primary p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader />
        <AuditCardsGrid
          audits={audits}
          selectedAudit={selectedAudit}
          isAuditRunning={isAuditRunning}
          onRun={runAudit}
          onSelect={selectAudit}
        />
        <AuditResultSection
          currentResult={currentResult}
          selectedAudit={selectedAudit}
          session={session}
          isRunning={isSelectedAuditRunning}
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
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Audits Tracking</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Vérifiez la configuration de vos outils de tracking
      </p>
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
        isRunning={isRunning}
        onExecuteAction={onExecuteAction}
        actionPending={actionPending}
      />
    )
  }

  if (selectedAudit === null && session === null) {
    return (
      <div className="card-elevated animate-fade-in p-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary">
          <svg className="h-6 w-6 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <p className="text-text-secondary">
          Sélectionnez un audit ci-dessus pour voir les détails
        </p>
        <p className="mt-1 text-sm text-text-tertiary">
          ou lancez un nouvel audit pour commencer
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
  const kpiData = result.summary.kpi as GMCFlowData | undefined

  const handleNavigateToIssue = (issueId: string): void => {
    const element = document.getElementById(`issue-${issueId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add('ring-2', 'ring-brand', 'ring-offset-2', 'ring-offset-bg-primary')
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-brand', 'ring-offset-2', 'ring-offset-bg-primary')
      }, HIGHLIGHT_DURATION_MS)
    }
  }

  const filteredIssues = result.issues.filter((issue) => issue.id !== 'kpi_summary')

  return (
    <div className="animate-slide-up space-y-6">
      <PipelineStepsPanel
        steps={result.steps}
        isRunning={isRunning}
        executionMode={result.execution_mode}
      />

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
