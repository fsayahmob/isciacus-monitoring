/**
 * Audit Pipeline - Modern Dark Theme Dashboard
 *
 * Simplified architecture using PocketBase as single source of truth.
 */

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { clearAuditCache, executeAuditAction } from '../../services/api'
import { AuditCardsGrid } from './AuditCard'
import { AuditCampaignSummary } from './AuditCampaignSummary'
import { PageHeader } from './AuditPageHeader'
import { AuditProgressIndicator } from './AuditProgressIndicator'
import { AuditResultSection } from './AuditResultSection'
import { useAuditSession } from './useAuditSession'
import { useSequentialAuditRunner } from './useSequentialAuditRunner'

function useAuditMutations(): {
  executeAction: {
    mutate: (args: { auditType: string; actionId: string }) => void
    isPending: boolean
  }
  clearCache: { mutate: () => void; isPending: boolean }
} {
  const queryClient = useQueryClient()
  const executeAction = useMutation({
    mutationFn: (args: { auditType: string; actionId: string }) =>
      executeAuditAction(args.auditType, args.actionId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['audit-session'] }),
  })
  const clearCache = useMutation({
    mutationFn: clearAuditCache,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
      void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
    },
  })
  return { executeAction, clearCache }
}

/**
 * Check if any audit is currently running in PocketBase.
 */
function hasRunningAudits(pbAuditRuns: Map<string, { status: string }>): boolean {
  for (const run of pbAuditRuns.values()) {
    if (run.status === 'running') {
      return true
    }
  }
  return false
}

export function AuditPipeline(): React.ReactElement {
  const session = useAuditSession()
  const { audits } = session.availableAudits

  const runner = useSequentialAuditRunner({
    sessionId: session.sessionId,
    pbAuditRuns: session.pbAuditRuns,
    availableAudits: audits,
  })
  const { executeAction, clearCache } = useAuditMutations()

  // PocketBase is the source of truth for running state
  const anyRunning = hasRunningAudits(session.pbAuditRuns) || runner.isRunning
  const count = runner.isRunning ? runner.completedCount : 0

  return (
    <div className="min-h-screen bg-bg-primary p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          onRunAll={() => {
            runner.startSequentialRun(audits)
          }}
          onClearCache={() => {
            clearCache.mutate()
          }}
          isRunning={anyRunning}
          isClearingCache={clearCache.isPending}
          runningCount={count}
          totalCount={runner.isRunning ? runner.totalAudits : 0}
        />
        {runner.isRunning && (
          <div className="mb-6">
            <AuditProgressIndicator {...runner} />
          </div>
        )}
        <AuditCardsGrid
          audits={audits}
          selectedAudit={session.selectedAudit}
          isAuditRunning={session.isAuditRunning}
          onRun={session.runAudit}
          onSelect={session.selectAudit}
          onStop={session.stopAudit}
          accordionContent={
            <AuditResultSection
              currentResult={session.currentResult}
              selectedAudit={session.selectedAudit}
              session={session.session}
              isRunning={session.isSelectedAuditRunning}
              onExecuteAction={(t, a) => {
                executeAction.mutate({ auditType: t, actionId: a })
              }}
              actionPending={executeAction.isPending}
            />
          }
        />
        {runner.showSummary && runner.score !== null && runner.readiness !== null && (
          <AuditCampaignSummary
            score={runner.score}
            readiness={runner.readiness}
            progress={runner.progress}
            onDismiss={runner.dismissSummary}
          />
        )}
      </div>
    </div>
  )
}
