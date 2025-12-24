/**
 * useAudit Helpers
 * Sub-hooks and helper functions for the unified useAudit hook.
 */
import { useQueryClient } from '@tanstack/react-query'
import React from 'react'

import {
  type AuditRun,
  type OrchestratorSession,
  getOrchestratorSession,
  completeOrchestratorSession,
  getLatestRunningSession,
} from '../../services/pocketbase'
import type { AuditResult, AuditSession, AvailableAudit } from '../../services/api'
import { buildRunningResult, buildCompletedResult } from './auditResultBuilders'
import { calculateCampaignScore, determineCampaignReadiness } from './campaignScoreUtils'
import type { AuditProgress, CampaignScore, CampaignReadiness } from './campaignScoreUtils'
import { pbRunsToProgress, resumeSequentialAudits, countCompleted } from './sequentialRunnerUtils'

// ============================================================================
// Result resolution
// ============================================================================

export function resolveCurrentResult(
  selectedAudit: string | null,
  session: AuditSession | null,
  pbAuditRuns: Map<string, AuditRun>
): AuditResult | null {
  if (selectedAudit === null) {
    return null
  }

  const pbRun = pbAuditRuns.get(selectedAudit)

  if (pbRun?.status === 'running') {
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

// ============================================================================
// Sequential run helpers
// ============================================================================

export function findCurrentIndex(pbRuns: Map<string, AuditRun>, auditOrder: string[]): number {
  for (let i = 0; i < auditOrder.length; i++) {
    if (pbRuns.get(auditOrder[i])?.status === 'running') {
      return i
    }
  }
  return -1
}

export function computeResults(
  allDone: boolean,
  progress: AuditProgress[]
): { score: CampaignScore | null; readiness: CampaignReadiness | null } {
  if (!allDone || progress.length === 0) {
    return { score: null, readiness: null }
  }
  const score = calculateCampaignScore(progress)
  return { score, readiness: determineCampaignReadiness(score, progress) }
}

// ============================================================================
// Sub-hooks
// ============================================================================

export function usePbCompletionSync(
  pbAuditRuns: Map<string, AuditRun>,
  pbConnected: boolean,
  queryClient: ReturnType<typeof useQueryClient>
): void {
  const prevStatusesRef = React.useRef<Map<string, string>>(new Map())

  React.useEffect(() => {
    if (!pbConnected || pbAuditRuns.size === 0) {
      return
    }

    let needsRefetch = false
    for (const [auditType, run] of pbAuditRuns) {
      const prevStatus = prevStatusesRef.current.get(auditType)
      if (prevStatus === 'running' && run.status !== 'running') {
        needsRefetch = true
      }
      prevStatusesRef.current.set(auditType, run.status)
    }

    if (needsRefetch) {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
      void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
    }
  }, [pbAuditRuns, pbConnected, queryClient])
}

interface RecoveryCallbacks {
  setOrchSession: (s: OrchestratorSession | null) => void
  setPlannedAudits: (a: string[]) => void
  setIsRunning: (r: boolean) => void
}

export function useOrchestratorRecovery(
  sessionId: string | null,
  hasLocalState: boolean,
  availableAudits: AvailableAudit[],
  pbAuditRunsRef: React.RefObject<Map<string, AuditRun>>,
  callbacks: RecoveryCallbacks
): void {
  const callbacksRef = React.useRef(callbacks)
  React.useEffect(() => {
    callbacksRef.current = callbacks
  })

  const hasAuditsLoaded = availableAudits.length > 0

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
        await resumeSequentialAudits(
          session.planned_audits,
          availableAudits,
          () => pbAuditRunsRef.current,
          sessionId
        )
      }
    })()
  }, [sessionId, hasLocalState, hasAuditsLoaded, availableAudits, pbAuditRunsRef])
}

export function useAutoComplete(
  allDone: boolean,
  isRunning: boolean,
  orchSession: OrchestratorSession | null,
  onComplete: () => void
): void {
  const queryClient = useQueryClient()
  const completedRef = React.useRef(false)

  React.useEffect(() => {
    if (!allDone || !isRunning || completedRef.current) {
      return
    }
    completedRef.current = true
    onComplete()
    if (orchSession !== null) {
      void completeOrchestratorSession(orchSession.id)
    }
    void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
    void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
  }, [allDone, isRunning, orchSession, onComplete, queryClient])

  React.useEffect(() => {
    if (!isRunning) {
      completedRef.current = false
    }
  }, [isRunning])
}

// ============================================================================
// Progress computation
// ============================================================================

export interface SequentialProgress {
  progress: AuditProgress[]
  completedCount: number
  currentIndex: number
  allDone: boolean
  score: CampaignScore | null
  readiness: CampaignReadiness | null
}

export function useSequentialProgress(
  pbAuditRuns: Map<string, AuditRun>,
  plannedAudits: string[],
  auditNameMap: Map<string, string>
): SequentialProgress {
  const progress = React.useMemo(
    () => pbRunsToProgress(pbAuditRuns, plannedAudits, auditNameMap),
    [pbAuditRuns, plannedAudits, auditNameMap]
  )

  const completedCount = countCompleted(progress)
  const currentIndex = findCurrentIndex(pbAuditRuns, plannedAudits)
  const allDone = plannedAudits.length > 0 && completedCount === plannedAudits.length
  const { score, readiness } = computeResults(allDone, progress)

  return { progress, completedCount, currentIndex, allDone, score, readiness }
}

/**
 * Restore localSessionId from PocketBase if there's a running orchestrator session.
 * Called on mount to recover state after page refresh.
 *
 * Always checks PocketBase for a running session, even if backend has a session.
 * This handles the case where frontend generated a sessionId that differs from backend.
 */
export function useRestoreRunningSession(
  setLocalSessionId: (id: string | null) => void
): void {
  const hasRestoredRef = React.useRef(false)

  React.useEffect(() => {
    if (hasRestoredRef.current) {
      return
    }
    hasRestoredRef.current = true
    void (async () => {
      const runningSession = await getLatestRunningSession()
      if (runningSession !== null) {
        setLocalSessionId(runningSession.session_id)
      }
    })()
  }, [setLocalSessionId])
}
