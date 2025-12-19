/**
 * useAuditSession - React Query based polling for audit results
 *
 * Uses React Query's built-in refetchInterval instead of manual setInterval.
 * Provides clean state management with automatic cleanup.
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import React from 'react'

import {
  fetchLatestAuditSession,
  fetchAvailableAudits,
  runAudit,
  type AuditResult,
  type AuditSession,
} from '../../services/api'
import { createRunningResult, reconcileSteps } from './auditSteps'

const POLL_INTERVAL_MS = 1000

interface UseAuditSessionReturn {
  // Data
  session: AuditSession | null
  availableAudits: ReturnType<typeof fetchAvailableAudits> extends Promise<infer T> ? T : never
  currentResult: AuditResult | null

  // State
  selectedAudit: string | null
  isRunning: boolean
  isPolling: boolean

  // Actions
  selectAudit: (auditType: string) => void
  runSelectedAudit: (auditType: string) => void
  runAuditMutation: ReturnType<typeof useMutation<unknown, Error, string>>
}

export function useAuditSession(): UseAuditSessionReturn {
  const queryClient = useQueryClient()
  const [selectedAudit, setSelectedAudit] = React.useState<string | null>(null)
  const [runningAuditType, setRunningAuditType] = React.useState<string | null>(null)
  const [optimisticResult, setOptimisticResult] = React.useState<AuditResult | null>(null)

  // Fetch available audits
  const { data: auditsData } = useQuery({
    queryKey: ['available-audits'],
    queryFn: fetchAvailableAudits,
  })

  // Main session query with conditional polling
  const { data: sessionData } = useQuery({
    queryKey: ['audit-session'],
    queryFn: fetchLatestAuditSession,
    // Only poll when an audit is running
    refetchInterval: runningAuditType !== null ? POLL_INTERVAL_MS : false,
    // Keep polling even when tab is not focused
    refetchIntervalInBackground: true,
  })

  const session = sessionData?.session ?? null

  // Check if the running audit has completed
  React.useEffect(() => {
    if (runningAuditType !== null && session?.audits[runningAuditType] !== undefined) {
      const result = session.audits[runningAuditType]
      if (result.status !== 'running') {
        // Audit completed - stop polling and clear optimistic state
        setRunningAuditType(null)
        setOptimisticResult(null)
        // Invalidate to get fresh data
        void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
      }
    }
  }, [session, runningAuditType, queryClient])

  // Run audit mutation
  const runAuditMutation = useMutation({
    mutationFn: (auditType: string) => runAudit(auditType),
    onMutate: (auditType: string) => {
      // Optimistic update: immediately show running state
      setSelectedAudit(auditType)
      setOptimisticResult(createRunningResult(auditType))
    },
    onSuccess: (data, auditType) => {
      if ('async' in data) {
        // Start polling for this audit
        setRunningAuditType(auditType)
      }
    },
    onError: () => {
      // Clear optimistic state on error
      setRunningAuditType(null)
      setOptimisticResult(null)
    },
  })

  // Determine current result with proper priority and step reconciliation
  const rawSessionResult = selectedAudit !== null ? session?.audits[selectedAudit] ?? null : null

  // Reconcile steps to ensure all expected steps are shown, even pending ones
  const currentResult = React.useMemo(() => {
    const baseResult = rawSessionResult ?? optimisticResult
    if (baseResult === null) {
      return null
    }

    // Apply step reconciliation to ensure all steps are present
    const reconciledSteps = reconcileSteps(baseResult.audit_type, baseResult.steps)
    return {
      ...baseResult,
      steps: reconciledSteps,
    }
  }, [rawSessionResult, optimisticResult])

  const selectAudit = (auditType: string): void => {
    if (auditType !== selectedAudit) {
      // Clear optimistic result when switching audits (unless that audit is running)
      if (runningAuditType !== auditType) {
        setOptimisticResult(null)
      }
      setSelectedAudit(auditType)
    }
  }

  const runSelectedAudit = (auditType: string): void => {
    runAuditMutation.mutate(auditType)
  }

  return {
    session,
    availableAudits: auditsData ?? { audits: [] },
    currentResult,
    selectedAudit,
    isRunning: runAuditMutation.isPending || runningAuditType !== null,
    isPolling: runningAuditType !== null,
    selectAudit,
    runSelectedAudit,
    runAuditMutation,
  }
}
