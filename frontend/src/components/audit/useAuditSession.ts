/** useAuditSession - React Query + PocketBase realtime for audit results */
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
} from '../../services/api'
import { type AuditRun } from '../../services/pocketbase'
import {
  createRunningResult,
  findCompletedAudits,
  resolveCurrentResult,
  type RunningAuditInfo,
} from './auditSteps'
import { getAuditPollInterval } from './auditPolling'
import { usePocketBaseSync } from './usePocketBaseSync'

interface UseAuditSessionReturn {
  session: AuditSession | null
  availableAudits: ReturnType<typeof fetchAvailableAudits> extends Promise<infer T> ? T : never
  currentResult: AuditResult | null
  selectedAudit: string | null
  runningAudits: Map<string, RunningAuditInfo>
  isSelectedAuditRunning: boolean
  selectAudit: (auditType: string) => void
  runAudit: (auditType: string) => void
  stopAudit: (auditType: string) => void
  isAuditRunning: (auditType: string) => boolean
  markAllAuditsAsRunning: (auditTypes: string[]) => void
  /** PocketBase audit runs for realtime sync */
  pbAuditRuns: Map<string, AuditRun>
  /** Whether PocketBase is connected */
  pbConnected: boolean
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

interface AuditControlsConfig {
  setSelectedAudit: React.Dispatch<React.SetStateAction<string | null>>
  runAuditMutation: MutationType
  runningAudits: Map<string, RunningAuditInfo>
  session: { audits: Record<string, { status: string }> } | null
  setRunningAudits: React.Dispatch<React.SetStateAction<Map<string, RunningAuditInfo>>>
  setOptimisticResults: React.Dispatch<React.SetStateAction<Map<string, AuditResult>>>
  pbAuditRuns: Map<string, AuditRun>
  removeAuditFromRunning: (auditType: string) => void
}

function useAuditControls(config: AuditControlsConfig): {
  selectAudit: (t: string) => void
  handleRunAudit: (t: string) => void
  handleStopAudit: (t: string) => void
  isAuditRunning: (t: string) => boolean
  markAllAuditsAsRunning: (types: string[]) => void
} {
  const {
    setSelectedAudit,
    runAuditMutation,
    runningAudits,
    session,
    setRunningAudits,
    setOptimisticResults,
    pbAuditRuns,
    removeAuditFromRunning,
  } = config
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
  // Check running status: PocketBase is source of truth, with local fallback for optimistic UI
  const isAuditRunning = React.useCallback(
    (t: string): boolean => {
      // PocketBase realtime data is the source of truth
      const pbStatus = pbAuditRuns.get(t)?.status
      if (pbStatus !== undefined) {
        return pbStatus === 'running'
      }
      // Fallback to local tracking only if PocketBase doesn't have data yet
      // (brief window after clicking Run before PocketBase receives the update)
      if (runningAudits.has(t)) {
        return true
      }
      // Last resort: check backend session (for legacy data)
      if (session !== null && t in session.audits) {
        return session.audits[t].status === 'running'
      }
      return false
    },
    [pbAuditRuns, runningAudits, session]
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
  const handleStopAudit = React.useCallback(
    (auditType: string): void => {
      const pbRun = pbAuditRuns.get(auditType)
      if (pbRun === undefined) {
        return
      }
      void stopAuditApi(pbRun.id)
      removeAuditFromRunning(auditType)
    },
    [pbAuditRuns, removeAuditFromRunning]
  )
  return { selectAudit, handleRunAudit, handleStopAudit, isAuditRunning, markAllAuditsAsRunning }
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
    refetchInterval: (query) => getAuditPollInterval(runningAudits.size, query),
    refetchIntervalInBackground: true,
  })

  const session = sessionData?.session ?? null

  // PocketBase realtime subscription for audit updates
  const sessionId = session?.id ?? null
  const { auditRuns: pbAuditRuns, isConnected: pbConnected } = usePocketBaseAudit(sessionId)

  // Sync PocketBase realtime updates with local state
  usePocketBaseSync({
    pbAuditRuns,
    pbConnected,
    setRunningAudits,
    setOptimisticResults,
    session,
    queryClient,
  })

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

  const controls = useAuditControls({
    setSelectedAudit,
    runAuditMutation,
    runningAudits,
    session,
    setRunningAudits,
    setOptimisticResults,
    pbAuditRuns,
    removeAuditFromRunning,
  })

  return {
    session,
    availableAudits: auditsData ?? { audits: [] },
    currentResult,
    selectedAudit,
    runningAudits,
    isSelectedAuditRunning: selectedAudit !== null && controls.isAuditRunning(selectedAudit),
    selectAudit: controls.selectAudit,
    runAudit: controls.handleRunAudit,
    stopAudit: controls.handleStopAudit,
    isAuditRunning: controls.isAuditRunning,
    markAllAuditsAsRunning: controls.markAllAuditsAsRunning,
    pbAuditRuns,
    pbConnected,
  }
}
