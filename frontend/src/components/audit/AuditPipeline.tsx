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
import { IssuesPanel } from './IssueCard'
import { PipelineStepsPanel } from './PipelineStep'

export function AuditPipeline(): React.ReactElement {
  const queryClient = useQueryClient()
  const [selectedAudit, setSelectedAudit] = React.useState<string | null>(null)

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
      void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
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
  const currentResult = selectedAudit !== null && session?.audits[selectedAudit]

  const handleRunAudit = (auditType: string): void => {
    setSelectedAudit(auditType)
    runAuditMutation.mutate(auditType)
  }

  const handleExecuteAction = (auditType: string, actionId: string): void => {
    executeActionMutation.mutate({ auditType, actionId })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-cream-dark p-6">
      <div className="mx-auto max-w-6xl">
        <PageHeader />
        <AuditCardsGrid
          audits={audits}
          selectedAudit={selectedAudit}
          isRunning={runAuditMutation.isPending}
          onRun={handleRunAudit}
          onSelect={setSelectedAudit}
        />
        <AuditResultSection
          currentResult={currentResult}
          selectedAudit={selectedAudit}
          session={session}
          isRunning={runAuditMutation.isPending}
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
  return (
    <div className="space-y-6">
      <PipelineStepsPanel steps={result.steps} isRunning={isRunning} />
      <IssuesPanel
        issues={result.issues}
        auditType={result.audit_type}
        status={result.status}
        onExecuteAction={onExecuteAction}
        actionPending={actionPending}
      />
    </div>
  )
}
