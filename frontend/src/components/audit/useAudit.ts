/** useAudit - Unified audit hook with PocketBase as single source of truth */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import React from 'react'

import { usePocketBaseAudit } from '../../hooks/usePocketBaseAudit'
import {
  fetchLatestAuditSession,
  fetchAvailableAudits,
  triggerAuditFromPocketBase,
  stopAudit as stopAuditApi,
  type AuditResult,
  type AuditSession,
  type AvailableAudit,
} from '../../services/api'
import {
  type AuditRun,
  type OrchestratorSession,
  createOrchestratorSession,
  createBatchAuditRuns,
  generateSessionId,
} from '../../services/pocketbase'
import { buildAuditNameMap, executeSequentialAudits } from './sequentialRunnerUtils'
import type { AuditProgress, CampaignScore, CampaignReadiness } from './campaignScoreUtils'
import { AUDIT_TIMING } from './auditConfig'
import {
  resolveCurrentResult,
  usePbCompletionSync,
  useOrchestratorRecovery,
  useAutoComplete,
  useSequentialProgress,
} from './useAuditHelpers'

export interface SequentialRunState {
  isRunning: boolean
  progress: AuditProgress[]
  currentIndex: number
  totalAudits: number
  completedCount: number
  score: CampaignScore | null
  readiness: CampaignReadiness | null
  showSummary: boolean
  start: (audits: AvailableAudit[]) => void
  dismissSummary: () => void
  reset: () => void
}

export interface UseAuditReturn {
  session: AuditSession | null
  sessionId: string | null
  availableAudits: AvailableAudit[]
  pbAuditRuns: Map<string, AuditRun>
  pbConnected: boolean
  selectedAudit: string | null
  currentResult: AuditResult | null
  isSelectedAuditRunning: boolean
  selectAudit: (auditType: string) => void
  runAudit: (auditType: string) => void
  stopAudit: (auditType: string) => void
  isAuditRunning: (auditType: string) => boolean
  sequentialRun: SequentialRunState
}

function useAuditData(overrideSessionId: string | null = null): {
  session: AuditSession | null
  sessionId: string | null
  availableAudits: AvailableAudit[]
  pbAuditRuns: Map<string, AuditRun>
  pbConnected: boolean
  pbAuditRunsRef: React.RefObject<Map<string, AuditRun>>
  sessionIdRef: React.RefObject<string | null>
} {
  const { data: auditsData } = useQuery({
    queryKey: ['available-audits'],
    queryFn: fetchAvailableAudits,
  })
  const { data: sessionData } = useQuery({
    queryKey: ['audit-session'],
    queryFn: fetchLatestAuditSession,
  })

  const session = sessionData?.session ?? null
  const backendSessionId = session?.id ?? null
  // Use override session ID if provided (for locally generated sessions)
  const sessionId = overrideSessionId ?? backendSessionId
  const availableAudits = React.useMemo(() => auditsData?.audits ?? [], [auditsData])
  const { auditRuns: pbAuditRuns, isConnected: pbConnected } = usePocketBaseAudit(sessionId)

  const pbAuditRunsRef = React.useRef(pbAuditRuns)
  const sessionIdRef = React.useRef(sessionId)
  React.useEffect(() => {
    pbAuditRunsRef.current = pbAuditRuns
  }, [pbAuditRuns])
  React.useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  return {
    session,
    sessionId,
    availableAudits,
    pbAuditRuns,
    pbConnected,
    pbAuditRunsRef,
    sessionIdRef,
  }
}

function useAuditActions(
  pbAuditRuns: Map<string, AuditRun>,
  sessionIdRef: React.RefObject<string | null>
): {
  selectAudit: (auditType: string) => void
  runAudit: (auditType: string) => void
  stopAudit: (auditType: string) => void
  isAuditRunning: (auditType: string) => boolean
  selectedAudit: string | null
} {
  const queryClient = useQueryClient()
  const [selectedAudit, setSelectedAudit] = React.useState<string | null>(null)

  const runMutation = useMutation({
    mutationFn: async (auditType: string) => {
      const pbRun = pbAuditRuns.get(auditType)
      const sid = sessionIdRef.current
      if (pbRun !== undefined && sid !== null) {
        return triggerAuditFromPocketBase({
          pocketbaseRecordId: pbRun.id,
          auditType,
          sessionId: sid,
        })
      }
      throw new Error('No PocketBase record or session ID')
    },
    onMutate: (auditType: string) => {
      setSelectedAudit(auditType)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    },
  })

  const isAuditRunning = React.useCallback(
    (auditType: string): boolean => pbAuditRuns.get(auditType)?.status === 'running',
    [pbAuditRuns]
  )
  const selectAudit = React.useCallback((auditType: string): void => {
    setSelectedAudit((prev) => (prev === auditType ? null : auditType))
  }, [])
  const runAudit = React.useCallback(
    (t: string): void => {
      runMutation.mutate(t)
    },
    [runMutation]
  )
  const stopAudit = React.useCallback(
    (auditType: string): void => {
      const pbRun = pbAuditRuns.get(auditType)
      if (pbRun !== undefined) {
        void stopAuditApi(pbRun.id)
      }
    },
    [pbAuditRuns]
  )

  return { selectAudit, runAudit, stopAudit, isAuditRunning, selectedAudit }
}

function useSequentialRun(params: {
  sessionId: string | null
  availableAudits: AvailableAudit[]
  pbAuditRuns: Map<string, AuditRun>
  pbAuditRunsRef: React.RefObject<Map<string, AuditRun>>
  setLocalSessionId: (id: string | null) => void
}): SequentialRunState & { effectiveSessionId: string | null } {
  const { sessionId, availableAudits, pbAuditRuns, pbAuditRunsRef, setLocalSessionId } = params
  const [plannedAudits, setPlannedAudits] = React.useState<string[]>([])
  const [isRunning, setIsRunning] = React.useState(false)
  const [showSummary, setShowSummary] = React.useState(false)
  const [orchSession, setOrchSession] = React.useState<OrchestratorSession | null>(null)

  const effectiveSessionId = sessionId

  useOrchestratorRecovery(sessionId, plannedAudits.length > 0, availableAudits, pbAuditRunsRef, {
    setOrchSession,
    setPlannedAudits,
    setIsRunning,
  })

  const auditNameMap = React.useMemo(() => buildAuditNameMap(availableAudits), [availableAudits])
  const seqProgress = useSequentialProgress(pbAuditRuns, plannedAudits, auditNameMap)

  const handleComplete = React.useCallback((): void => {
    setIsRunning(false)
    setShowSummary(true)
  }, [])
  useAutoComplete(seqProgress.allDone, isRunning, orchSession, handleComplete)

  const start = React.useCallback(
    (audits: AvailableAudit[]): void => {
      const filtered = audits.filter((a) => a.available)
      if (filtered.length === 0) {
        return
      }
      // Generate new session ID if none exists and notify parent
      const newSessionId = sessionId ?? generateSessionId()
      if (sessionId === null) {
        setLocalSessionId(newSessionId)
      }
      const auditTypes = filtered.map((a) => a.type)
      setPlannedAudits(auditTypes)
      setIsRunning(true)
      setShowSummary(false)
      void (async () => {
        const newSession = await createOrchestratorSession(newSessionId, auditTypes)
        setOrchSession(newSession)
        await createBatchAuditRuns(newSessionId, auditTypes)
        await new Promise((resolve) => setTimeout(resolve, AUDIT_TIMING.pbSettleDelayMs))
        await executeSequentialAudits(filtered, () => pbAuditRunsRef.current, newSessionId)
      })()
    },
    [sessionId, pbAuditRunsRef, setLocalSessionId]
  )
  const dismissSummary = React.useCallback((): void => {
    setShowSummary(false)
  }, [])
  const reset = React.useCallback((): void => {
    setPlannedAudits([])
    setIsRunning(false)
    setShowSummary(false)
    setLocalSessionId(null)
  }, [setLocalSessionId])

  return {
    isRunning,
    progress: seqProgress.progress,
    currentIndex: seqProgress.currentIndex,
    totalAudits: plannedAudits.length,
    completedCount: seqProgress.completedCount,
    score: seqProgress.score,
    readiness: seqProgress.readiness,
    showSummary,
    start,
    dismissSummary,
    reset,
    effectiveSessionId,
  }
}

export function useAudit(): UseAuditReturn {
  const queryClient = useQueryClient()
  const [localSessionId, setLocalSessionId] = React.useState<string | null>(null)

  // Get backend session data (for session object and available audits)
  const { data: sessionData } = useQuery({
    queryKey: ['audit-session'],
    queryFn: fetchLatestAuditSession,
  })
  const session = sessionData?.session ?? null
  const backendSessionId = session?.id ?? null

  // Effective session ID: local takes precedence (for newly generated sessions)
  const effectiveSessionId = localSessionId ?? backendSessionId

  const data = useAuditData(effectiveSessionId)
  const actions = useAuditActions(data.pbAuditRuns, data.sessionIdRef)
  const sequentialRun = useSequentialRun({
    sessionId: effectiveSessionId,
    availableAudits: data.availableAudits,
    pbAuditRuns: data.pbAuditRuns,
    pbAuditRunsRef: data.pbAuditRunsRef,
    setLocalSessionId,
  })

  usePbCompletionSync(data.pbAuditRuns, data.pbConnected, queryClient)

  const currentResult = React.useMemo(
    () => resolveCurrentResult(actions.selectedAudit, data.session, data.pbAuditRuns),
    [actions.selectedAudit, data.session, data.pbAuditRuns]
  )

  return {
    session: data.session,
    sessionId: effectiveSessionId,
    availableAudits: data.availableAudits,
    pbAuditRuns: data.pbAuditRuns,
    pbConnected: data.pbConnected,
    selectedAudit: actions.selectedAudit,
    currentResult,
    isSelectedAuditRunning:
      actions.selectedAudit !== null && actions.isAuditRunning(actions.selectedAudit),
    selectAudit: actions.selectAudit,
    runAudit: actions.runAudit,
    stopAudit: actions.stopAudit,
    isAuditRunning: actions.isAuditRunning,
    sequentialRun,
  }
}
