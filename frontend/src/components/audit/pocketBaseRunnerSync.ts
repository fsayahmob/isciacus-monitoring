/**
 * PocketBase state synchronization for the sequential audit runner.
 *
 * Provides helpers to:
 * - Restore runner state from PocketBase after page refresh
 * - Sync progress updates from PocketBase realtime events
 */

import type { AuditRun } from '../../services/pocketbase'
import type { AuditResult, AvailableAudit } from '../../services/api'
import {
  calculateCampaignScore,
  determineCampaignReadiness,
  type AuditProgress,
  type CampaignReadiness,
  type CampaignScore,
} from './campaignScoreUtils'

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

/**
 * Convert PocketBase audit runs to AuditProgress array.
 * Used to restore state after page refresh.
 */
function pbRunsToProgress(
  pbRuns: Map<string, AuditRun>,
  auditNameMap: Map<string, string>
): AuditProgress[] {
  const progress: AuditProgress[] = []

  for (const [auditType, run] of pbRuns) {
    const name = auditNameMap.get(auditType) ?? auditType

    let status: AuditProgress['status']
    if (run.status === 'running') {
      status = 'running'
    } else if (run.status === 'completed') {
      status = 'completed'
    } else if (run.status === 'failed') {
      status = 'error'
    } else {
      status = 'pending'
    }

    progress.push({
      auditType,
      name,
      status,
      result: run.result as AuditResult | null,
      error: run.error,
    })
  }

  return progress
}

/**
 * Calculate runner state from PocketBase audit runs.
 */
export function calculateStateFromPbRuns(
  pbRuns: Map<string, AuditRun>,
  auditNameMap: Map<string, string>
): SequentialRunnerState {
  const progress = pbRunsToProgress(pbRuns, auditNameMap)
  const runningAudits = progress.filter((p) => p.status === 'running')
  const completedAudits = progress.filter((p) => p.status === 'completed' || p.status === 'error')
  const isRunning = runningAudits.length > 0

  // Find current index (first running audit)
  const currentIndex = progress.findIndex((p) => p.status === 'running')

  // If all done, calculate score
  let score: CampaignScore | null = null
  let readiness: CampaignReadiness | null = null
  const allDone = progress.length > 0 && runningAudits.length === 0

  if (allDone) {
    score = calculateCampaignScore(progress)
    readiness = determineCampaignReadiness(score, progress)
  }

  return {
    isRunning,
    progress,
    currentIndex,
    totalAudits: progress.length,
    completedCount: completedAudits.length,
    score,
    readiness,
    showSummary: allDone && score !== null,
  }
}

/**
 * Build a map from audit type to display name.
 */
export function buildAuditNameMap(audits: AvailableAudit[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const audit of audits) {
    map.set(audit.type, audit.name)
  }
  return map
}

/**
 * Check if there are running audits in PocketBase.
 */
export function hasRunningAuditsInPb(pbRuns: Map<string, AuditRun> | undefined): boolean {
  if (pbRuns === undefined || pbRuns.size === 0) {
    return false
  }
  return Array.from(pbRuns.values()).some((r) => r.status === 'running')
}

/**
 * Sync progress from PocketBase updates.
 * Returns updated progress array and completion info.
 */
export function syncProgressFromPb(
  currentProgress: AuditProgress[],
  pbRuns: Map<string, AuditRun>
): {
  progress: AuditProgress[]
  hasChanges: boolean
  completedCount: number
  runningIndex: number
  allDone: boolean
} {
  const newProgress = currentProgress.map((p) => {
    const pbRun = pbRuns.get(p.auditType)
    if (pbRun === undefined) {
      return p
    }

    // Map PocketBase status to progress status
    if (pbRun.status === 'completed' && p.status === 'running') {
      return {
        ...p,
        status: 'completed' as const,
        result: pbRun.result as AuditResult | null,
      }
    }
    if (pbRun.status === 'failed' && p.status === 'running') {
      return {
        ...p,
        status: 'error' as const,
        error: pbRun.error,
      }
    }
    if (pbRun.status === 'running' && p.status === 'pending') {
      return {
        ...p,
        status: 'running' as const,
      }
    }
    return p
  })

  const hasChanges = newProgress.some(
    (p, i) => p.status !== currentProgress[i]?.status || p.result !== currentProgress[i]?.result
  )

  const completedCount = newProgress.filter(
    (p) => p.status === 'completed' || p.status === 'error'
  ).length

  const runningIndex = newProgress.findIndex((p) => p.status === 'running')
  const allDone = newProgress.every((p) => p.status === 'completed' || p.status === 'error')

  return { progress: newProgress, hasChanges, completedCount, runningIndex, allDone }
}
