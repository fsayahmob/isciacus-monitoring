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
    const auditProgress = progress.find((p) => p.auditType === auditType)
    return auditProgress?.status === 'running' || false
  }
}

function useAuditMutations(): {
  executeAction: ReturnType<typeof useMutation>
  clearCache: ReturnType<typeof useMutation>
} {
  const queryClient = useQueryClient()

  const executeAction = useMutation({
    mutationFn: ({ auditType, actionId }: { auditType: string; actionId: string }) =>
      executeAuditAction(auditType, actionId),
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
  const auditSession = useAuditSession()
  const sequentialRunner = useSequentialAuditRunner()
  const { executeAction, clearCache } = useAuditMutations()

  const { audits } = auditSession.availableAudits
  const hasRunningAudits = auditSession.runningAudits.size > 0 || sequentialRunner.isRunning
  const checkAuditRunning = createAuditRunningChecker(
    auditSession.isAuditRunning,
    sequentialRunner.isRunning,
    sequentialRunner.progress
  )

  const runningCount = sequentialRunner.isRunning
    ? sequentialRunner.completedCount
    : auditSession.runningAudits.size

  return (
    <div className="min-h-screen bg-bg-primary p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          onRunAll={() => {
            sequentialRunner.startSequentialRun(audits)
          }}
          onClearCache={() => {
            clearCache.mutate()
          }}
          isRunning={hasRunningAudits}
          isClearingCache={clearCache.isPending}
          runningCount={runningCount}
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
          accordionContent={
            <AuditResultSection
              currentResult={auditSession.currentResult}
              selectedAudit={auditSession.selectedAudit}
              session={auditSession.session}
              isRunning={auditSession.isSelectedAuditRunning}
              onExecuteAction={(t, a) => {
                executeAction.mutate({ auditType: t, actionId: a })
              }}
              actionPending={executeAction.isPending}
            />
          }
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
