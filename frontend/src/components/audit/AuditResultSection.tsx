/**
 * Audit Result Section Components
 */

import React from 'react'

import type { AuditResult, AuditSession } from '../../services/api'
import { SummaryCards } from './AuditCards'
import { GMCFlowKPI, type GMCFlowData } from './GMCFlowKPI'
import { IssuesPanel } from './IssueCard'
import { PipelineStepsPanel } from './PipelineStep'

const HIGHLIGHT_DURATION_MS = 2000

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
  const hasSummary =
    'total_checks' in result.summary && typeof result.summary.total_checks === 'number'

  return (
    <div className="animate-slide-up space-y-6">
      <PipelineStepsPanel
        steps={result.steps}
        isRunning={isRunning}
        executionMode={result.execution_mode}
      />

      {hasSummary && !isRunning && (
        <SummaryCards
          summary={
            result.summary as {
              total_checks: number
              passed: number
              warnings: number
              errors: number
            }
          }
        />
      )}

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

function EmptyStatePanel(): React.ReactElement {
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

export function AuditResultSection({
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
    return <EmptyStatePanel />
  }

  return null
}
