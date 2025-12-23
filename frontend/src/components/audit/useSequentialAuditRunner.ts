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
  createBatchAuditRuns,
} from '../../services/pocketbase'
import { type AvailableAudit } from '../../services/api'
import { calculateCampaignScore, determineCampaignReadiness } from './campaignScoreUtils'
import {
  pbRunsToProgress,
  buildAuditNameMap,
  executeSequentialAudits,
  resumeSequentialAudits,
  countCompleted,
  POCKETBASE_SETTLE_DELAY_MS,
} from './sequentialRunnerUtils'
import type {
  RecoveryConfig,
  AutoCompleteConfig,
  RunnerState,
  RunnerActions,
  StartRunConfig,
  UseSequentialAuditRunnerOptions,
  UseSequentialAuditRunnerReturn,
} from './sequentialRunnerTypes'

export type {
  AuditProgress,
  CampaignReadiness,
  CampaignScore,
  SequentialRunnerState,
  UseSequentialAuditRunnerReturn,
  UseSequentialAuditRunnerOptions,
} from './sequentialRunnerTypes'

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
  progress: { status: string }[]
): {
  score: ReturnType<typeof calculateCampaignScore> | null
  readiness: ReturnType<typeof determineCampaignReadiness> | null
} {
  if (!allDone || progress.length === 0) {
    return { score: null, readiness: null }
  }
  const score = calculateCampaignScore(progress as Parameters<typeof calculateCampaignScore>[0])
  const typedProgress = progress as Parameters<typeof determineCampaignReadiness>[1]
  return { score, readiness: determineCampaignReadiness(score, typedProgress) }
}

function useOrchestratorRecovery(config: RecoveryConfig): void {
  const {
    sessionId,
    hasLocalState,
    hasAuditsLoaded,
    availableAudits,
    pbAuditRunsRef,
    wasStartedLocallyRef,
  } = config

  const callbacksRef = React.useRef({
    setOrchSession: config.setOrchSession,
    setPlannedAudits: config.setPlannedAudits,
    setIsRunning: config.setIsRunning,
  })
  React.useEffect(() => {
    callbacksRef.current = {
      setOrchSession: config.setOrchSession,
      setPlannedAudits: config.setPlannedAudits,
      setIsRunning: config.setIsRunning,
    }
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

function useAutoComplete(config: AutoCompleteConfig): void {
  const { allDone, isRunning, wasStartedLocally, orchSession, onComplete } = config
  const queryClient = useQueryClient()
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
      const auditTypes = filtered.map((a) => a.type)
      setPlannedAudits(auditTypes)
      setIsRunning(true)
      setShowSummary(false)
      void (async () => {
        const session = await createOrchestratorSession(sessionId, auditTypes)
        setOrchSession(session)
        await createBatchAuditRuns(sessionId, auditTypes)
        await new Promise((resolve) => setTimeout(resolve, POCKETBASE_SETTLE_DELAY_MS))
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
