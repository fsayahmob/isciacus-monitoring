/** useAudit - Unified audit hook with PocketBase as single source of truth */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import React from 'react'

import { usePocketBaseAudit } from '../../hooks/usePocketBaseAudit'
import {
  fetchLatestAuditSession,
  fetchAvailableAudits,
  triggerAuditFromPocketBase,
  type AuditResult,
  type AuditSession,
  type AvailableAudit,
} from '../../services/api'
import {
  type AuditRun,
  type OrchestratorSession,
  createOrchestratorSession,
  createBatchAuditRuns,
  createAuditRun,
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
  useRestoreRunningSession,
  enrichAuditsWithPbData,
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
  sessionIdRef: React.RefObject<string | null>,
  setLocalSessionId: (id: string | null) => void
): {
  selectAudit: (auditType: string) => void
  runAudit: (auditType: string) => void
  isAuditRunning: (auditType: string) => boolean
  selectedAudit: string | null
} {
  const queryClient = useQueryClient()
  const [selectedAudit, setSelectedAudit] = React.useState<string | null>(null)

  const runMutation = useMutation({
    mutationFn: async (auditType: string) => {
      let pbRun = pbAuditRuns.get(auditType)
      let sid = sessionIdRef.current

      // If no session exists, generate one
      if (sid === null) {
        sid = generateSessionId()
        setLocalSessionId(sid)
      }

      // If no PocketBase record exists, create one
      if (pbRun === undefined) {
        pbRun = await createAuditRun({ sessionId: sid, auditType })
        // Wait for PocketBase to settle
        await new Promise((resolve) => setTimeout(resolve, AUDIT_TIMING.pbSettleDelayMs))
      }

      return triggerAuditFromPocketBase({
        pocketbaseRecordId: pbRun.id,
        auditType,
        sessionId: sid,
      })
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

  return { selectAudit, runAudit, isAuditRunning, selectedAudit }
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

  useOrchestratorRecovery({
    sessionId,
    hasLocalState: plannedAudits.length > 0,
    availableAudits,
    pbAuditRuns,
    pbAuditRunsRef,
    callbacks: { setOrchSession, setPlannedAudits, setIsRunning },
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

  // Restore localSessionId from PocketBase if there's a running session (after refresh)
  useRestoreRunningSession(setLocalSessionId)

  // Effective session ID: local takes precedence (for newly generated sessions)
  const effectiveSessionId = localSessionId ?? backendSessionId

  const data = useAuditData(effectiveSessionId)
  const actions = useAuditActions(data.pbAuditRuns, data.sessionIdRef, setLocalSessionId)
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

  // Enrich availableAudits with PocketBase data for status badges
  const enrichedAudits = React.useMemo(
    () => enrichAuditsWithPbData(data.availableAudits, data.pbAuditRuns),
    [data.availableAudits, data.pbAuditRuns]
  )

  return {
    session: data.session,
    sessionId: effectiveSessionId,
    availableAudits: enrichedAudits,
    pbAuditRuns: data.pbAuditRuns,
    pbConnected: data.pbConnected,
    selectedAudit: actions.selectedAudit,
    currentResult,
    isSelectedAuditRunning:
      actions.selectedAudit !== null && actions.isAuditRunning(actions.selectedAudit),
    selectAudit: actions.selectAudit,
    runAudit: actions.runAudit,
    isAuditRunning: actions.isAuditRunning,
    sequentialRun,
  }
}
