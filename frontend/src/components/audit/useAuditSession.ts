/** useAuditSession - React Query based polling for audit results */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import React from 'react'

import {
  fetchLatestAuditSession,
  fetchAvailableAudits,
  runAudit,
  type AuditResult,
  type AuditSession,
} from '../../services/api'
import {
  createRunningResult,
  detectRunningAuditsFromSession,
  findCompletedAudits,
  resolveCurrentResult,
  type RunningAuditInfo,
} from './auditSteps'

const POLL_INTERVAL_MS = 1000

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
  markAllAuditsAsRunning: (auditTypes: string[]) => void
}

function useCompletionEffect(
  running: Map<string, RunningAuditInfo>,
  session: AuditSession | null,
  setRunning: React.Dispatch<React.SetStateAction<Map<string, RunningAuditInfo>>>,
  setOptimistic: React.Dispatch<React.SetStateAction<Map<string, AuditResult>>>,
  qc: ReturnType<typeof useQueryClient>
): void {
  React.useEffect(() => {
    if (running.size === 0) {
      return
    }
    const done = findCompletedAudits(running, session)
    if (done.length > 0) {
      setRunning((prev) => {
        const n = new Map(prev)
        done.forEach((t) => n.delete(t))
        return n
      })
      setOptimistic((prev) => {
        const n = new Map(prev)
        done.forEach((t) => n.delete(t))
        return n
      })
      void qc.invalidateQueries({ queryKey: ['available-audits'] })
    }
  }, [session, running, qc, setRunning, setOptimistic])
}

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
      setOptimisticResults((prev) => new Map(prev).set(auditType, createRunningResult(auditType)))
    },
    onSuccess: (response, auditType) => {
      if ('async' in response && response.run_id !== '') {
        setRunningAudits((prev) => {
          const existing = prev.get(auditType)
          if (existing !== undefined) {
            return new Map(prev).set(auditType, { ...existing, runId: response.run_id })
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

type MutationType = ReturnType<
  typeof useMutation<Awaited<ReturnType<typeof runAudit>>, Error, string>
>

function useAuditControls(
  setSelectedAudit: React.Dispatch<React.SetStateAction<string | null>>,
  runAuditMutation: MutationType,
  runningAudits: Map<string, RunningAuditInfo>,
  setRunningAudits: React.Dispatch<React.SetStateAction<Map<string, RunningAuditInfo>>>,
  setOptimisticResults: React.Dispatch<React.SetStateAction<Map<string, AuditResult>>>
): {
  selectAudit: (t: string) => void
  handleRunAudit: (t: string) => void
  isAuditRunning: (t: string) => boolean
  markAllAuditsAsRunning: (types: string[]) => void
} {
  const selectAudit = React.useCallback(
    (t: string): void => {
      setSelectedAudit((p) => (p === t ? null : t))
    },
    [setSelectedAudit]
  )
  const handleRunAudit = React.useCallback(
    (t: string): void => {
      runAuditMutation.mutate(t)
    },
    [runAuditMutation]
  )
  const isAuditRunning = React.useCallback(
    (t: string): boolean => runningAudits.has(t),
    [runningAudits]
  )
  const markAllAuditsAsRunning = React.useCallback(
    (types: string[]): void => {
      const startedAt = new Date().toISOString()
      setRunningAudits((prev) => {
        const next = new Map(prev)
        types.forEach((t) => {
          next.set(t, { startedAt })
        })
        return next
      })
      setOptimisticResults((prev) => {
        const next = new Map(prev)
        types.forEach((t) => {
          next.set(t, createRunningResult(t))
        })
        return next
      })
    },
    [setRunningAudits, setOptimisticResults]
  )
  return { selectAudit, handleRunAudit, isAuditRunning, markAllAuditsAsRunning }
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

  // Detect running audits from backend on initial load (survives page refresh)
  const hasInitializedFromBackend = React.useRef(false)
  React.useEffect(() => {
    if (hasInitializedFromBackend.current || session === null) {
      return
    }
    hasInitializedFromBackend.current = true
    const running = detectRunningAuditsFromSession(session)
    if (running.size > 0) {
      setRunningAudits(running)
    }
  }, [session])

  const removeAuditFromRunning = React.useCallback((t: string): void => {
    setRunningAudits((prev) => {
      const n = new Map(prev)
      n.delete(t)
      return n
    })
    setOptimisticResults((prev) => {
      const n = new Map(prev)
      n.delete(t)
      return n
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

  const controls = useAuditControls(
    setSelectedAudit,
    runAuditMutation,
    runningAudits,
    setRunningAudits,
    setOptimisticResults
  )

  return {
    session,
    availableAudits: auditsData ?? { audits: [] },
    currentResult,
    selectedAudit,
    runningAudits,
    isSelectedAuditRunning: selectedAudit !== null && runningAudits.has(selectedAudit),
    selectAudit: controls.selectAudit,
    runAudit: controls.handleRunAudit,
    isAuditRunning: controls.isAuditRunning,
    markAllAuditsAsRunning: controls.markAllAuditsAsRunning,
  }
}
