/**
 * Audit Pipeline - Modern Dark Theme Dashboard
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
import type { AuditProgress } from './useSequentialAuditRunner'
import { useSequentialAuditRunner } from './useSequentialAuditRunner'

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
    return progress.find((p) => p.auditType === auditType)?.status === 'running' || false
  }
}

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

export function AuditPipeline(): React.ReactElement {
  const session = useAuditSession()
  const runner = useSequentialAuditRunner()
  const { executeAction, clearCache } = useAuditMutations()
  const { audits } = session.availableAudits

  const isRunning = session.runningAudits.size > 0 || runner.isRunning
  const checker = createAuditRunningChecker(
    session.isAuditRunning,
    runner.isRunning,
    runner.progress
  )
  const count = runner.isRunning ? runner.completedCount : session.runningAudits.size

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
          isRunning={isRunning}
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
          isAuditRunning={checker}
          onRun={session.runAudit}
          onSelect={session.selectAudit}
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
        {runner.showSummary && runner.score && runner.readiness && (
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
