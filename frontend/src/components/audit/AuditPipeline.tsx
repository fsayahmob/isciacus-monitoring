/**
 * Audit Pipeline - Modern Dark Theme Dashboard
 */

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  executeAuditAction,
  type AuditResult,
  type AuditSession,
} from '../../services/api'
import { AuditCardsGrid } from './AuditCard'
import { AuditCampaignSummary } from './AuditCampaignSummary'
import { AuditProgressIndicator } from './AuditProgressIndicator'
import { GMCFlowKPI, type GMCFlowData } from './GMCFlowKPI'
import { IssuesPanel } from './IssueCard'
import { PipelineStepsPanel } from './PipelineStep'
import { useAuditSession } from './useAuditSession'
import type { AuditProgress } from './useSequentialAuditRunner'
import { useSequentialAuditRunner } from './useSequentialAuditRunner'

const HIGHLIGHT_DURATION_MS = 2000

function createAuditRunningChecker(
  isAuditRunning: (type: string) => boolean,
  isSequentialRunning: boolean,
  progress: AuditProgress[]
): (auditType: string) => boolean {
  return (auditType: string): boolean => {
    if (isAuditRunning(auditType)) {
      return true
    }
    if (!isSequentialRunning) {
      return false
    }
    const auditProgress = progress.find((p) => p.auditType === auditType)
    return auditProgress?.status === 'running' || false
  }
}

export function AuditPipeline(): React.ReactElement {
  const queryClient = useQueryClient()
  const auditSession = useAuditSession()
  const sequentialRunner = useSequentialAuditRunner()

  const executeActionMutation = useMutation({
    mutationFn: ({ auditType, actionId }: { auditType: string; actionId: string }) =>
      executeAuditAction(auditType, actionId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['audit-session'] }),
  })

  const { audits } = auditSession.availableAudits
  const hasRunningAudits = auditSession.runningAudits.size > 0 || sequentialRunner.isRunning
  const checkAuditRunning = createAuditRunningChecker(
    auditSession.isAuditRunning,
    sequentialRunner.isRunning,
    sequentialRunner.progress
  )

  return (
    <div className="min-h-screen bg-bg-primary p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          onRunAll={() => { sequentialRunner.startSequentialRun(audits) }}
          isRunning={hasRunningAudits}
          runningCount={sequentialRunner.isRunning ? sequentialRunner.completedCount : auditSession.runningAudits.size}
          totalCount={sequentialRunner.isRunning ? sequentialRunner.totalAudits : 0}
        />
        {sequentialRunner.isRunning && (
          <div className="mb-6">
            <AuditProgressIndicator
              progress={sequentialRunner.progress}
              currentIndex={sequentialRunner.currentIndex}
              totalAudits={sequentialRunner.totalAudits}
              completedCount={sequentialRunner.completedCount}
            />
          </div>
        )}
        <AuditCardsGrid
          audits={audits}
          selectedAudit={auditSession.selectedAudit}
          isAuditRunning={checkAuditRunning}
          onRun={auditSession.runAudit}
          onSelect={auditSession.selectAudit}
        />
        <AuditResultSection
          currentResult={auditSession.currentResult}
          selectedAudit={auditSession.selectedAudit}
          session={auditSession.session}
          isRunning={auditSession.isSelectedAuditRunning}
          onExecuteAction={(t, a) => { executeActionMutation.mutate({ auditType: t, actionId: a }) }}
          actionPending={executeActionMutation.isPending}
        />
        {sequentialRunner.showSummary && sequentialRunner.score && sequentialRunner.readiness && (
          <AuditCampaignSummary
            score={sequentialRunner.score}
            readiness={sequentialRunner.readiness}
            progress={sequentialRunner.progress}
            onDismiss={sequentialRunner.dismissSummary}
          />
        )}
      </div>
    </div>
  )
}

function PageHeader({
  onRunAll,
  isRunning,
  runningCount,
  totalCount,
}: {
  onRunAll: () => void
  isRunning: boolean
  runningCount: number
  totalCount: number
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
            <span>
              {totalCount > 0 ? `${String(runningCount)}/${String(totalCount)}` : String(runningCount)} en cours...
            </span>
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
