/**
 * useAuditSession - React Query based polling for audit results
 *
 * Tracks running state PER AUDIT, not globally.
 * Each audit can run independently and show its own state.
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
const CLOCK_SKEW_TOLERANCE_MS = 5000

interface RunningAuditInfo {
  startedAt: string
  runId?: string
}

interface UseAuditSessionReturn {
  session: AuditSession | null
  availableAudits: ReturnType<typeof fetchAvailableAudits> extends Promise<infer T> ? T : never
  currentResult: AuditResult | null
  selectedAudit: string | null
  runningAudits: Map<string, RunningAuditInfo>
  isSelectedAuditRunning: boolean
  selectAudit: (auditType: string) => void
  runAudit: (auditType: string) => void
  isAuditRunning: (auditType: string) => boolean
}

/**
 * Check if a server result is from the current run (started after we triggered it)
 */
function isResultFromCurrentRun(
  serverResult: AuditResult | null,
  runInfo: RunningAuditInfo | undefined
): boolean {
  if (!serverResult || !runInfo) {
    return false
  }

  // Compare timestamps - server result must be started AFTER our trigger
  const serverStarted = new Date(serverResult.started_at).getTime()
  const ourTrigger = new Date(runInfo.startedAt).getTime()

  // Allow tolerance for clock skew
  return serverStarted >= ourTrigger - CLOCK_SKEW_TOLERANCE_MS
}

/**
 * Check which audits have completed and return their types
 *
 * Uses Inngest-style completion detection:
 * - Poll until status is final (not 'running' or 'pending')
 * - Respect completed_at timestamp from backend
 * - Safety timeout after 2 minutes (max audit duration)
 */
function findCompletedAudits(
  runningAudits: Map<string, RunningAuditInfo>,
  session: AuditSession | null
): string[] {
  if (session === null) {
    return []
  }

  const completed: string[] = []
  const now = Date.now()
  const MAX_AUDIT_DURATION_MS = 120000 // 2 minutes max per audit

  runningAudits.forEach((runInfo, auditType) => {
    const result = session.audits[auditType] as AuditResult | undefined

    // No result yet - audit still initializing
    if (result === undefined) {
      return
    }

    // Inngest pattern: Check if run has reached final status
    // Final statuses: 'success', 'warning', 'error', 'skipped'
    // Running statuses: 'running', 'pending'
    const FINAL_STATUSES = ['success', 'warning', 'error', 'skipped']
    const isFinalStatus = FINAL_STATUSES.includes(result.status)

    if (isFinalStatus && result.completed_at !== null) {
      console.log(`✅ Audit ${auditType} completed: ${result.status}`)
      completed.push(auditType)
      return
    }

    // Safety timeout: Force completion if running too long
    // This prevents infinite polling if backend fails to update status
    const elapsed = now - new Date(runInfo.startedAt).getTime()

    if (elapsed > MAX_AUDIT_DURATION_MS) {
      console.warn(
        `⏱️ Audit ${auditType} timeout after ${(elapsed / 1000).toFixed(0)}s - forcing completion`
      )
      completed.push(auditType)
    }
  })

  return completed
}

/**
 * Determine which result to show for the selected audit
 */
function resolveCurrentResult(
  selectedAudit: string | null,
  session: AuditSession | null,
  optimisticResults: Map<string, AuditResult>,
  runningAudits: Map<string, RunningAuditInfo>
): AuditResult | null {
  if (selectedAudit === null) {
    return null
  }

  const serverResult = session?.audits[selectedAudit] ?? null
  const optimistic = optimisticResults.get(selectedAudit)
  const runInfo = runningAudits.get(selectedAudit)
  const isRunning = runInfo !== undefined

  let baseResult: AuditResult | null = null

  if (isRunning) {
    // We're running - check if server has data from THIS run
    if (serverResult !== null && isResultFromCurrentRun(serverResult, runInfo)) {
      // Server has data from our current run - use it
      baseResult = serverResult
    } else {
      // Server doesn't have data yet, or has old data - use optimistic
      baseResult = optimistic ?? null
    }
  } else {
    // Not running - show server result (could be from previous run)
    baseResult = serverResult
  }

  if (baseResult === null) {
    return null
  }

  const reconciledSteps = reconcileSteps(baseResult.audit_type, baseResult.steps)
  return {
    ...baseResult,
    steps: reconciledSteps,
  }
}

/**
 * Effect that detects completed audits and cleans up state
 */
function useCompletionEffect(
  runningAudits: Map<string, RunningAuditInfo>,
  session: AuditSession | null,
  setRunningAudits: React.Dispatch<React.SetStateAction<Map<string, RunningAuditInfo>>>,
  setOptimisticResults: React.Dispatch<React.SetStateAction<Map<string, AuditResult>>>,
  queryClient: ReturnType<typeof useQueryClient>
): void {
  React.useEffect(() => {
    if (runningAudits.size === 0) {
      return
    }

    const completedAudits = findCompletedAudits(runningAudits, session)

    if (completedAudits.length > 0) {
      setRunningAudits((prev) => {
        const next = new Map(prev)
        completedAudits.forEach((t) => next.delete(t))
        return next
      })

      setOptimisticResults((prev) => {
        const next = new Map(prev)
        completedAudits.forEach((t) => next.delete(t))
        return next
      })

      void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
    }
  }, [session, runningAudits, queryClient, setRunningAudits, setOptimisticResults])
}

/**
 * Hook for audit mutation with optimistic updates
 */
function useAuditMutation(
  setSelectedAudit: React.Dispatch<React.SetStateAction<string | null>>,
  setRunningAudits: React.Dispatch<React.SetStateAction<Map<string, RunningAuditInfo>>>,
  setOptimisticResults: React.Dispatch<React.SetStateAction<Map<string, AuditResult>>>,
  removeAuditFromRunning: (auditType: string) => void,
  queryClient: ReturnType<typeof useQueryClient>
): ReturnType<typeof useMutation<Awaited<ReturnType<typeof runAudit>>, Error, string>> {
  return useMutation({
    mutationFn: (auditType: string) => runAudit(auditType),
    onMutate: (auditType: string) => {
      const startedAt = new Date().toISOString()
      setSelectedAudit(auditType)
      setRunningAudits((prev) => new Map(prev).set(auditType, { startedAt }))
      const optimistic = createRunningResult(auditType)
      setOptimisticResults((prev) => new Map(prev).set(auditType, optimistic))
    },
    onSuccess: (response, auditType) => {
      if ('async' in response && response.run_id !== '') {
        setRunningAudits((prev) => {
          const existing = prev.get(auditType)
          if (existing) {
            const next = new Map(prev)
            next.set(auditType, { ...existing, runId: response.run_id })
            return next
          }
          return prev
        })
      }
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    },
    onError: (_error, auditType) => {
      removeAuditFromRunning(auditType)
    },
  })
}

export function useAuditSession(): UseAuditSessionReturn {
  const queryClient = useQueryClient()
  const [selectedAudit, setSelectedAudit] = React.useState<string | null>(null)
  const [runningAudits, setRunningAudits] = React.useState<Map<string, RunningAuditInfo>>(new Map())
  const [optimisticResults, setOptimisticResults] = React.useState<Map<string, AuditResult>>(
    new Map()
  )

  const { data: auditsData } = useQuery({
    queryKey: ['available-audits'],
    queryFn: fetchAvailableAudits,
  })

  const { data: sessionData } = useQuery({
    queryKey: ['audit-session'],
    queryFn: fetchLatestAuditSession,
    refetchInterval: runningAudits.size > 0 ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  })

  const session = sessionData?.session ?? null

  const removeAuditFromRunning = React.useCallback((auditType: string): void => {
    setRunningAudits((prev) => {
      const next = new Map(prev)
      next.delete(auditType)
      return next
    })
    setOptimisticResults((prev) => {
      const next = new Map(prev)
      next.delete(auditType)
      return next
    })
  }, [])

  useCompletionEffect(runningAudits, session, setRunningAudits, setOptimisticResults, queryClient)

  const runAuditMutation = useAuditMutation(
    setSelectedAudit,
    setRunningAudits,
    setOptimisticResults,
    removeAuditFromRunning,
    queryClient
  )

  const currentResult = React.useMemo(
    () => resolveCurrentResult(selectedAudit, session, optimisticResults, runningAudits),
    [selectedAudit, session, optimisticResults, runningAudits]
  )

  const selectAudit = React.useCallback((auditType: string): void => {
    setSelectedAudit(auditType)
  }, [])

  const handleRunAudit = React.useCallback(
    (auditType: string): void => {
      runAuditMutation.mutate(auditType)
    },
    [runAuditMutation]
  )

  const isAuditRunning = React.useCallback(
    (auditType: string): boolean => {
      return runningAudits.has(auditType)
    },
    [runningAudits]
  )

  return {
    session,
    availableAudits: auditsData ?? { audits: [] },
    currentResult,
    selectedAudit,
    runningAudits,
    isSelectedAuditRunning: selectedAudit !== null && runningAudits.has(selectedAudit),
    selectAudit,
    runAudit: handleRunAudit,
    isAuditRunning,
  }
}
