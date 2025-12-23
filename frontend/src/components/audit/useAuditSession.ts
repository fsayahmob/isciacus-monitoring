/**
 * useAuditSession - Audit session hook using PocketBase as source of truth
 *
 * Architecture:
 * - PocketBase = source de vérité pour les états running/completed/failed
 * - État local optimiste pour les audits lancés en attente de PocketBase
 */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import React from 'react'

import { usePocketBaseAudit } from '../../hooks/usePocketBaseAudit'
import {
  fetchLatestAuditSession,
  fetchAvailableAudits,
  runAudit,
  stopAudit as stopAuditApi,
  type AuditResult,
  type AuditSession,
  type AvailableAudit,
} from '../../services/api'
import { type AuditRun } from '../../services/pocketbase'
import type { AuditStep, AuditIssue } from '../../services/api'

/**
 * Extract steps array from PocketBase result with type safety.
 */
function extractSteps(result: Record<string, unknown> | null | undefined): AuditStep[] {
  if (result === null || result === undefined) {
    return []
  }
  const { steps } = result
  return Array.isArray(steps) ? (steps as AuditStep[]) : []
}

/**
 * Extract issues array from PocketBase result with type safety.
 */
function extractIssues(result: Record<string, unknown> | null | undefined): AuditIssue[] {
  if (result === null || result === undefined) {
    return []
  }
  const { issues } = result
  return Array.isArray(issues) ? (issues as AuditIssue[]) : []
}

/**
 * Build a running AuditResult from PocketBase data.
 */
function buildRunningResult(auditType: string, pbRun: AuditRun | undefined): AuditResult {
  return {
    id: `running-${auditType}`,
    audit_type: auditType,
    status: 'running',
    started_at: pbRun?.started_at ?? new Date().toISOString(),
    completed_at: null,
    steps: extractSteps(pbRun?.result),
    issues: extractIssues(pbRun?.result),
    summary: {},
    raw_data: null,
  } as AuditResult
}

/**
 * Build a completed AuditResult from PocketBase data.
 */
function buildCompletedResult(rawResult: Record<string, unknown>): AuditResult {
  return {
    ...rawResult,
    steps: extractSteps(rawResult),
    issues: extractIssues(rawResult),
  } as unknown as AuditResult
}

interface UseAuditSessionReturn {
  session: AuditSession | null
  sessionId: string | null
  availableAudits: { audits: AvailableAudit[] }
  currentResult: AuditResult | null
  selectedAudit: string | null
  isSelectedAuditRunning: boolean
  selectAudit: (auditType: string) => void
  runAudit: (auditType: string) => void
  stopAudit: (auditType: string) => void
  isAuditRunning: (auditType: string) => boolean
  pbAuditRuns: Map<string, AuditRun>
  pbConnected: boolean
}

function resolveCurrentResult(
  selectedAudit: string | null,
  session: AuditSession | null,
  pbAuditRuns: Map<string, AuditRun>,
  optimisticRunning: Set<string>
): AuditResult | null {
  if (selectedAudit === null) {
    return null
  }

  const pbRun = pbAuditRuns.get(selectedAudit)
  const isRunning = pbRun?.status === 'running' || optimisticRunning.has(selectedAudit)

  if (isRunning) {
    return buildRunningResult(selectedAudit, pbRun)
  }

  if (pbRun?.status === 'completed' && pbRun.result !== null) {
    return buildCompletedResult(pbRun.result)
  }

  if (session !== null && selectedAudit in session.audits) {
    return session.audits[selectedAudit]
  }

  return null
}

function usePbCompletionSync(
  pbAuditRuns: Map<string, AuditRun>,
  pbConnected: boolean,
  queryClient: ReturnType<typeof useQueryClient>,
  setOptimisticRunning: React.Dispatch<React.SetStateAction<Set<string>>>
): void {
  const prevStatusesRef = React.useRef<Map<string, string>>(new Map())

  React.useEffect(() => {
    if (!pbConnected || pbAuditRuns.size === 0) {
      return
    }

    let needsRefetch = false
    for (const [auditType, run] of pbAuditRuns) {
      const prevStatus = prevStatusesRef.current.get(auditType)

      // Clear optimistic state when PocketBase confirms running
      if (run.status === 'running') {
        setOptimisticRunning((prev) => {
          if (prev.has(auditType)) {
            const next = new Set(prev)
            next.delete(auditType)
            return next
          }
          return prev
        })
      }

      if (prevStatus === 'running' && run.status !== 'running') {
        needsRefetch = true
      }
      prevStatusesRef.current.set(auditType, run.status)
    }

    if (needsRefetch) {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
      void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
    }
  }, [pbAuditRuns, pbConnected, queryClient, setOptimisticRunning])
}

interface AuditActionsReturn {
  handleRunAudit: (auditType: string) => void
  handleStopAudit: (auditType: string) => void
  isAuditRunning: (auditType: string) => boolean
  selectAudit: (auditType: string) => void
}

function useAuditActions(
  pbAuditRuns: Map<string, AuditRun>,
  optimisticRunning: Set<string>,
  setOptimisticRunning: React.Dispatch<React.SetStateAction<Set<string>>>,
  setSelectedAudit: React.Dispatch<React.SetStateAction<string | null>>,
  queryClient: ReturnType<typeof useQueryClient>
): AuditActionsReturn {
  const runAuditMutation = useMutation({
    mutationFn: (auditType: string) => runAudit(auditType),
    onMutate: (auditType: string) => {
      setSelectedAudit(auditType)
      setOptimisticRunning((prev) => new Set(prev).add(auditType))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    },
    onError: (_error, auditType) => {
      setOptimisticRunning((prev) => {
        const next = new Set(prev)
        next.delete(auditType)
        return next
      })
    },
  })

  const isAuditRunning = React.useCallback(
    (auditType: string): boolean => {
      // PocketBase is source of truth, optimistic state is fallback
      const pbStatus = pbAuditRuns.get(auditType)?.status
      if (pbStatus === 'running') {
        return true
      }
      // Optimistic state for audits just launched (waiting for PocketBase)
      return optimisticRunning.has(auditType)
    },
    [pbAuditRuns, optimisticRunning]
  )

  const selectAudit = React.useCallback(
    (auditType: string): void => {
      setSelectedAudit((prev) => (prev === auditType ? null : auditType))
    },
    [setSelectedAudit]
  )

  const handleRunAudit = React.useCallback(
    (auditType: string): void => {
      runAuditMutation.mutate(auditType)
    },
    [runAuditMutation]
  )

  const handleStopAudit = React.useCallback(
    (auditType: string): void => {
      const pbRun = pbAuditRuns.get(auditType)
      if (pbRun !== undefined) {
        void stopAuditApi(pbRun.id)
      }
      setOptimisticRunning((prev) => {
        const next = new Set(prev)
        next.delete(auditType)
        return next
      })
    },
    [pbAuditRuns, setOptimisticRunning]
  )

  return { handleRunAudit, handleStopAudit, isAuditRunning, selectAudit }
}

export function useAuditSession(): UseAuditSessionReturn {
  const queryClient = useQueryClient()
  const [selectedAudit, setSelectedAudit] = React.useState<string | null>(null)
  const [optimisticRunning, setOptimisticRunning] = React.useState<Set<string>>(new Set())

  const { data: auditsData } = useQuery({
    queryKey: ['available-audits'],
    queryFn: fetchAvailableAudits,
  })

  const { data: sessionData } = useQuery({
    queryKey: ['audit-session'],
    queryFn: fetchLatestAuditSession,
  })

  const session = sessionData?.session ?? null
  const sessionId = session?.id ?? null
  const { auditRuns: pbAuditRuns, isConnected: pbConnected } = usePocketBaseAudit(sessionId)

  usePbCompletionSync(pbAuditRuns, pbConnected, queryClient, setOptimisticRunning)

  const actions = useAuditActions(
    pbAuditRuns,
    optimisticRunning,
    setOptimisticRunning,
    setSelectedAudit,
    queryClient
  )

  const currentResult = React.useMemo(
    () => resolveCurrentResult(selectedAudit, session, pbAuditRuns, optimisticRunning),
    [selectedAudit, session, pbAuditRuns, optimisticRunning]
  )

  return {
    session,
    sessionId,
    availableAudits: auditsData ?? { audits: [] },
    currentResult,
    selectedAudit,
    isSelectedAuditRunning: selectedAudit !== null && actions.isAuditRunning(selectedAudit),
    selectAudit: actions.selectAudit,
    runAudit: actions.handleRunAudit,
    stopAudit: actions.handleStopAudit,
    isAuditRunning: actions.isAuditRunning,
    pbAuditRuns,
    pbConnected,
  }
}
