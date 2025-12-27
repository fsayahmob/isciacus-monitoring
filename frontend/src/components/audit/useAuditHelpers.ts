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
  getLatestAuditRunSessionId,
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

interface RecoveryParams {
  sessionId: string | null
  hasLocalState: boolean
  availableAudits: AvailableAudit[]
  pbAuditRuns: Map<string, AuditRun>
  pbAuditRunsRef: React.RefObject<Map<string, AuditRun>>
  callbacks: RecoveryCallbacks
}

export function useOrchestratorRecovery(params: RecoveryParams): void {
  const { sessionId, hasLocalState, availableAudits, pbAuditRuns, pbAuditRunsRef, callbacks } =
    params
  const callbacksRef = React.useRef(callbacks)
  React.useEffect(() => {
    callbacksRef.current = callbacks
  })

  const hasAuditsLoaded = availableAudits.length > 0

  // Track if recovery has been attempted to avoid infinite loops
  const hasRecoveredRef = React.useRef(false)

  React.useEffect(() => {
    // Use pbAuditRuns.size (reactive) to trigger when data arrives
    const pbRunsCount = pbAuditRuns.size

    if (sessionId === null || hasLocalState || !hasAuditsLoaded) {
      return
    }
    // Wait for PocketBase data to sync (at least some runs should be present)
    if (pbRunsCount === 0) {
      return
    }
    // Prevent running twice
    if (hasRecoveredRef.current) {
      return
    }
    hasRecoveredRef.current = true

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
  }, [sessionId, hasLocalState, hasAuditsLoaded, availableAudits, pbAuditRuns, pbAuditRunsRef])
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
 * Restore localSessionId from PocketBase after page refresh.
 * Checks both orchestrator_sessions (for batch runs) and audit_runs (for individual audits).
 */
export function useRestoreRunningSession(setLocalSessionId: (id: string | null) => void): void {
  const hasRestoredRef = React.useRef(false)

  React.useEffect(() => {
    if (hasRestoredRef.current) {
      return
    }
    hasRestoredRef.current = true
    void (async () => {
      // First check for running orchestrator session
      const runningSession = await getLatestRunningSession()
      if (runningSession !== null) {
        setLocalSessionId(runningSession.session_id)
        return
      }
      // Fallback: get latest session_id from audit_runs (for individual audits)
      const latestSessionId = await getLatestAuditRunSessionId()
      if (latestSessionId !== null) {
        setLocalSessionId(latestSessionId)
      }
    })()
  }, [setLocalSessionId])
}

// ============================================================================
// Audit enrichment
// ============================================================================

interface IssueWithSeverity {
  severity: string
}

function isIssueWithSeverity(obj: unknown): obj is IssueWithSeverity {
  return typeof obj === 'object' && obj !== null && 'severity' in obj
}

/**
 * Enrich availableAudits with PocketBase data for status badges.
 * PocketBase is the source of truth for last_status and issues_count.
 */
export function enrichAuditsWithPbData(
  audits: AvailableAudit[],
  pbAuditRuns: Map<string, AuditRun>
): AvailableAudit[] {
  if (pbAuditRuns.size === 0) {
    return audits
  }

  return audits.map((audit) => {
    const pbRun = pbAuditRuns.get(audit.type)
    if (pbRun === undefined || pbRun.status === 'pending') {
      return audit
    }

    // Map PocketBase status to AuditStepStatus
    type PbStatus = 'pending' | 'running' | 'completed' | 'failed'
    const statusMap: Record<PbStatus, 'running' | 'success' | 'error'> = {
      pending: 'running',
      running: 'running',
      completed: 'success',
      failed: 'error',
    }

    // Count issues from PocketBase result
    let issuesCount = 0
    let lastStatus: 'running' | 'success' | 'warning' | 'error' =
      statusMap[pbRun.status as PbStatus]

    if (pbRun.result !== null && typeof pbRun.result === 'object') {
      const { issues } = pbRun.result as { issues?: unknown }
      if (Array.isArray(issues)) {
        issuesCount = issues.length
        // If completed with issues, mark as warning or error based on severity
        if (pbRun.status === 'completed' && issuesCount > 0) {
          const hasErrors = issues.some(
            (i) =>
              isIssueWithSeverity(i) &&
              (i.severity === 'critical' || i.severity === 'high' || i.severity === 'medium')
          )
          lastStatus = hasErrors ? 'error' : 'warning'
        }
      }
    }

    // Use completed_at as the last run date (more accurate than started_at)
    const lastRun = pbRun.completed_at ?? pbRun.started_at

    return {
      ...audit,
      last_status: lastStatus,
      issues_count: issuesCount,
      last_run: lastRun,
    }
  })
}
