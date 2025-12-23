/**
 * useSequentialAuditRunner - Sequential audit execution with PocketBase state persistence
 *
 * Simple architecture:
 * - PocketBase orchestrator_sessions stores planned audits (survives refresh)
 * - PocketBase audit_runs stores individual audit progress
 * - After refresh, we read both to restore exact state
 */

import { useQueryClient } from '@tanstack/react-query'
import React from 'react'

import {
  type AuditRun,
  type OrchestratorSession,
  createOrchestratorSession,
  getOrchestratorSession,
  completeOrchestratorSession,
} from '../../services/pocketbase'
import { type AvailableAudit } from '../../services/api'
import {
  calculateCampaignScore,
  determineCampaignReadiness,
  type AuditProgress,
  type CampaignReadiness,
  type CampaignScore,
} from './campaignScoreUtils'
import {
  pbRunsToProgress,
  buildAuditNameMap,
  executeSequentialAudits,
  resumeSequentialAudits,
  countCompleted,
} from './sequentialRunnerUtils'

export type { AuditProgress, CampaignReadiness, CampaignScore }

export interface SequentialRunnerState {
  isRunning: boolean
  progress: AuditProgress[]
  currentIndex: number
  totalAudits: number
  completedCount: number
  score: CampaignScore | null
  readiness: CampaignReadiness | null
  showSummary: boolean
}

export interface UseSequentialAuditRunnerReturn extends SequentialRunnerState {
  startSequentialRun: (audits: AvailableAudit[]) => void
  dismissSummary: () => void
  reset: () => void
}

export interface UseSequentialAuditRunnerOptions {
  sessionId?: string | null
  pbAuditRuns?: Map<string, AuditRun>
  availableAudits?: AvailableAudit[]
}

function findCurrentIndex(pbRuns: Map<string, AuditRun>, auditOrder: string[]): number {
  for (let i = 0; i < auditOrder.length; i++) {
    if (pbRuns.get(auditOrder[i])?.status === 'running') {
      return i
    }
  }
  return -1
}

function computeResults(
  allDone: boolean,
  progress: AuditProgress[]
): {
  score: CampaignScore | null
  readiness: CampaignReadiness | null
} {
  if (!allDone || progress.length === 0) {
    return { score: null, readiness: null }
  }
  const score = calculateCampaignScore(progress)
  return { score, readiness: determineCampaignReadiness(score, progress) }
}

interface RecoveryConfig {
  sessionId: string | null
  hasLocalState: boolean
  hasAuditsLoaded: boolean
  availableAudits: AvailableAudit[]
  pbAuditRunsRef: React.RefObject<Map<string, AuditRun>>
  wasStartedLocallyRef: React.RefObject<boolean>
  setOrchSession: (s: OrchestratorSession | null) => void
  setPlannedAudits: (a: string[]) => void
  setIsRunning: (r: boolean) => void
}

function useOrchestratorRecovery(config: RecoveryConfig): void {
  const {
    sessionId,
    hasLocalState,
    hasAuditsLoaded,
    availableAudits,
    pbAuditRunsRef,
    wasStartedLocallyRef,
    setOrchSession,
    setPlannedAudits,
    setIsRunning,
  } = config

  // Store callbacks in ref to avoid dependency array issues
  const callbacksRef = React.useRef({ setOrchSession, setPlannedAudits, setIsRunning })
  React.useEffect(() => {
    callbacksRef.current = { setOrchSession, setPlannedAudits, setIsRunning }
  })

  React.useEffect(() => {
    if (sessionId === null || hasLocalState || !hasAuditsLoaded) {
      return
    }
    void (async () => {
      const session = await getOrchestratorSession(sessionId)
      if (session !== null && session.status === 'running') {
        callbacksRef.current.setOrchSession(session)
        callbacksRef.current.setPlannedAudits(session.planned_audits)
        callbacksRef.current.setIsRunning(true)
        wasStartedLocallyRef.current = true
        // Resume execution of remaining audits
        await resumeSequentialAudits(
          session.planned_audits,
          availableAudits,
          () => pbAuditRunsRef.current,
          sessionId
        )
      }
    })()
  }, [
    sessionId,
    hasLocalState,
    hasAuditsLoaded,
    availableAudits,
    pbAuditRunsRef,
    wasStartedLocallyRef,
  ])
}

interface AutoCompleteConfig {
  allDone: boolean
  isRunning: boolean
  wasStartedLocally: boolean
  orchSession: OrchestratorSession | null
  onComplete: () => void
  queryClient: ReturnType<typeof useQueryClient>
}

function useAutoComplete(config: AutoCompleteConfig): void {
  const { allDone, isRunning, wasStartedLocally, orchSession, onComplete, queryClient } = config
  React.useEffect(() => {
    if (!allDone || !isRunning || !wasStartedLocally) {
      return
    }
    onComplete()
    if (orchSession !== null) {
      void completeOrchestratorSession(orchSession.id)
    }
    void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
  }, [allDone, isRunning, wasStartedLocally, orchSession, onComplete, queryClient])
}

interface RunnerState {
  plannedAudits: string[]
  isRunning: boolean
  showSummary: boolean
  orchSession: OrchestratorSession | null
}

interface RunnerActions {
  setPlannedAudits: React.Dispatch<React.SetStateAction<string[]>>
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>
  setShowSummary: React.Dispatch<React.SetStateAction<boolean>>
  setOrchSession: React.Dispatch<React.SetStateAction<OrchestratorSession | null>>
}

function useRunnerState(): RunnerState & RunnerActions {
  const [plannedAudits, setPlannedAudits] = React.useState<string[]>([])
  const [isRunning, setIsRunning] = React.useState(false)
  const [showSummary, setShowSummary] = React.useState(false)
  const [orchSession, setOrchSession] = React.useState<OrchestratorSession | null>(null)
  return {
    plannedAudits,
    isRunning,
    showSummary,
    orchSession,
    setPlannedAudits,
    setIsRunning,
    setShowSummary,
    setOrchSession,
  }
}

interface StartRunConfig {
  sessionId: string | null
  setPlannedAudits: React.Dispatch<React.SetStateAction<string[]>>
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>
  setShowSummary: React.Dispatch<React.SetStateAction<boolean>>
  setOrchSession: React.Dispatch<React.SetStateAction<OrchestratorSession | null>>
  wasStartedLocallyRef: React.RefObject<boolean>
  pbAuditRunsRef: React.RefObject<Map<string, AuditRun>>
}

function useStartSequentialRun(config: StartRunConfig): (audits: AvailableAudit[]) => void {
  const { sessionId, setPlannedAudits, setIsRunning, setShowSummary, setOrchSession } = config
  const { wasStartedLocallyRef, pbAuditRunsRef } = config
  return React.useCallback(
    (audits: AvailableAudit[]): void => {
      const filtered = audits.filter((a) => a.available)
      if (filtered.length === 0 || sessionId === null) {
        return
      }
      wasStartedLocallyRef.current = true
      setPlannedAudits(filtered.map((a) => a.type))
      setIsRunning(true)
      setShowSummary(false)
      void (async () => {
        const session = await createOrchestratorSession(
          sessionId,
          filtered.map((a) => a.type)
        )
        setOrchSession(session)
        await executeSequentialAudits(filtered, () => pbAuditRunsRef.current, sessionId)
      })()
    },
    [
      sessionId,
      setPlannedAudits,
      setIsRunning,
      setShowSummary,
      setOrchSession,
      wasStartedLocallyRef,
      pbAuditRunsRef,
    ]
  )
}

export function useSequentialAuditRunner(
  options: UseSequentialAuditRunnerOptions = {}
): UseSequentialAuditRunnerReturn {
  const {
    sessionId = null,
    pbAuditRuns = new Map<string, AuditRun>(),
    availableAudits = [],
  } = options
  const queryClient = useQueryClient()
  const state = useRunnerState()
  const { plannedAudits, isRunning, showSummary, orchSession } = state
  const { setPlannedAudits, setIsRunning, setShowSummary, setOrchSession } = state

  const pbAuditRunsRef = React.useRef(pbAuditRuns)
  pbAuditRunsRef.current = pbAuditRuns
  const wasStartedLocallyRef = React.useRef(false)

  const auditNameMap = React.useMemo(() => buildAuditNameMap(availableAudits), [availableAudits])

  useOrchestratorRecovery({
    sessionId,
    hasLocalState: plannedAudits.length > 0,
    hasAuditsLoaded: availableAudits.length > 0,
    availableAudits,
    pbAuditRunsRef,
    wasStartedLocallyRef,
    setOrchSession,
    setPlannedAudits,
    setIsRunning,
  })

  const progress = React.useMemo(
    () => pbRunsToProgress(pbAuditRuns, plannedAudits, auditNameMap),
    [pbAuditRuns, plannedAudits, auditNameMap]
  )
  const completedCount = countCompleted(progress)
  const currentIndex = findCurrentIndex(pbAuditRuns, plannedAudits)
  const allDone = plannedAudits.length > 0 && completedCount === plannedAudits.length
  const { score, readiness } = computeResults(allDone, progress)

  const handleComplete = React.useCallback((): void => {
    setIsRunning(false)
    setShowSummary(true)
  }, [setIsRunning, setShowSummary])

  useAutoComplete({
    allDone,
    isRunning,
    wasStartedLocally: wasStartedLocallyRef.current,
    orchSession,
    onComplete: handleComplete,
    queryClient,
  })

  const startSequentialRun = useStartSequentialRun({
    sessionId,
    setPlannedAudits,
    setIsRunning,
    setShowSummary,
    setOrchSession,
    wasStartedLocallyRef,
    pbAuditRunsRef,
  })

  const dismissSummary = React.useCallback((): void => {
    setShowSummary(false)
  }, [setShowSummary])
  const reset = React.useCallback((): void => {
    setPlannedAudits([])
    setIsRunning(false)
    setShowSummary(false)
  }, [setPlannedAudits, setIsRunning, setShowSummary])

  return {
    isRunning,
    progress,
    currentIndex,
    totalAudits: plannedAudits.length,
    completedCount,
    score,
    readiness,
    showSummary,
    startSequentialRun,
    dismissSummary,
    reset,
  }
}
