/**
 * Audit Pipeline - Modern Dark Theme Dashboard
 */

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  executeAuditAction,
  runAllAudits,
  type AuditResult,
  type AuditSession,
} from '../../services/api'
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
    runningAudits,
    isSelectedAuditRunning,
    selectAudit,
    runAudit,
    isAuditRunning,
    markAllAuditsAsRunning,
  } = useAuditSession()

  const executeActionMutation = useMutation({
    mutationFn: ({ auditType, actionId }: { auditType: string; actionId: string }) =>
      executeAuditAction(auditType, actionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    },
  })

  const runAllMutation = useMutation({
    mutationFn: () => runAllAudits(),
    onMutate: () => {
      // Mark all available audits as running BEFORE API call
      const availableAuditTypes = audits
        .filter((audit) => audit.available)
        .map((audit) => audit.type)
      markAllAuditsAsRunning(availableAuditTypes)
    },
    onSuccess: () => {
      // Invalidate queries to fetch updated audit session
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    },
  })

  const { audits } = availableAudits

  const handleExecuteAction = (auditType: string, actionId: string): void => {
    executeActionMutation.mutate({ auditType, actionId })
  }

  const handleRunAllAudits = (): void => {
    runAllMutation.mutate()
  }

  const hasRunningAudits = runningAudits.size > 0

  return (
    <div className="min-h-screen bg-bg-primary p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          onRunAll={handleRunAllAudits}
          isRunning={hasRunningAudits}
          runningCount={runningAudits.size}
        />
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

function PageHeader({
  onRunAll,
  isRunning,
  runningCount,
}: {
  onRunAll: () => void
  isRunning: boolean
  runningCount: number
}): React.ReactElement {
  return (
    <div className="mb-8 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Audits Tracking</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Vérifiez la configuration de vos outils de tracking
        </p>
      </div>
      <button
        className="btn btn-primary flex items-center gap-2"
        disabled={isRunning}
        onClick={onRunAll}
        type="button"
      >
        {isRunning ? (
          <>
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                fill="currentColor"
              />
            </svg>
            <span>{runningCount} en cours...</span>
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M13 10V3L4 14h7v7l9-11h-7z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            <span>Lancer tous les audits</span>
          </>
        )}
      </button>
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
          <svg
            className="h-6 w-6 text-text-tertiary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <p className="text-text-secondary">Sélectionnez un audit ci-dessus pour voir les détails</p>
        <p className="mt-1 text-sm text-text-tertiary">ou lancez un nouvel audit pour commencer</p>
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
