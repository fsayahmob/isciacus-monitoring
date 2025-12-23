/**
 * Audit Pipeline - Modern Dark Theme Dashboard
 * Uses unified useAudit hook with PocketBase as single source of truth.
 */
import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { clearAuditCache, executeAuditAction } from '../../services/api'
import { AuditCardsGrid } from './AuditCard'
import { AuditCampaignSummary } from './AuditCampaignSummary'
import { PageHeader } from './AuditPageHeader'
import { AuditProgressIndicator } from './AuditProgressIndicator'
import { AuditResultSection } from './AuditResultSection'
import { useAudit } from './useAudit'

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

function hasRunningAudits(pbAuditRuns: Map<string, { status: string }>): boolean {
  for (const run of pbAuditRuns.values()) {
    if (run.status === 'running') {
      return true
    }
  }
  return false
}

export function AuditPipeline(): React.ReactElement {
  const audit = useAudit()
  const { executeAction, clearCache } = useAuditMutations()

  const anyRunning = hasRunningAudits(audit.pbAuditRuns) || audit.sequentialRun.isRunning
  const count = audit.sequentialRun.isRunning ? audit.sequentialRun.completedCount : 0

  return (
    <div className="min-h-screen bg-bg-primary p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          onRunAll={() => {
            audit.sequentialRun.start(audit.availableAudits)
          }}
          onClearCache={() => {
            clearCache.mutate()
          }}
          isRunning={anyRunning}
          isClearingCache={clearCache.isPending}
          runningCount={count}
          totalCount={audit.sequentialRun.isRunning ? audit.sequentialRun.totalAudits : 0}
        />
        {audit.sequentialRun.isRunning && (
          <div className="mb-6">
            <AuditProgressIndicator {...audit.sequentialRun} />
          </div>
        )}
        <AuditCardsGrid
          audits={audit.availableAudits}
          selectedAudit={audit.selectedAudit}
          isAuditRunning={audit.isAuditRunning}
          onRun={audit.runAudit}
          onSelect={audit.selectAudit}
          onStop={audit.stopAudit}
          accordionContent={
            <AuditResultSection
              currentResult={audit.currentResult}
              selectedAudit={audit.selectedAudit}
              session={audit.session}
              isRunning={audit.isSelectedAuditRunning}
              onExecuteAction={(t, a) => {
                executeAction.mutate({ auditType: t, actionId: a })
              }}
              actionPending={executeAction.isPending}
            />
          }
        />
        {audit.sequentialRun.showSummary &&
          audit.sequentialRun.score !== null &&
          audit.sequentialRun.readiness !== null && (
            <AuditCampaignSummary
              score={audit.sequentialRun.score}
              readiness={audit.sequentialRun.readiness}
              progress={audit.sequentialRun.progress}
              onDismiss={audit.sequentialRun.dismissSummary}
            />
          )}
      </div>
    </div>
  )
}
