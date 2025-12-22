/**
 * useSequentialAuditRunner - Sequential audit execution using PocketBase as source of truth
 *
 * Simplified architecture:
 * - PocketBase = single source of truth for audit progress
 * - No local progress array - derive everything from pbAuditRuns
 * - Campaign score computed from PocketBase data
 */

import { useQueryClient } from '@tanstack/react-query'
import React from 'react'

import { type AuditRun } from '../../services/pocketbase'
import { runAudit, type AuditResult, type AvailableAudit } from '../../services/api'
import {
  calculateCampaignScore,
  determineCampaignReadiness,
  type AuditProgress,
  type CampaignReadiness,
  type CampaignScore,
} from './campaignScoreUtils'

// Re-export types for consumers
export type { AuditProgress, CampaignReadiness, CampaignScore }

// Constants
const POCKETBASE_SETTLE_DELAY_MS = 500
const POLL_INTERVAL_MS = 1000
const MAX_WAIT_TIME_MS = 120000 // 2 minutes max per audit

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
  pbAuditRuns?: Map<string, AuditRun>
  availableAudits?: AvailableAudit[]
}

/**
 * Convert PocketBase runs to progress array for display.
 */
function pbRunsToProgress(
  pbRuns: Map<string, AuditRun>,
  auditOrder: string[],
  auditNameMap: Map<string, string>
): AuditProgress[] {
  return auditOrder.map((auditType) => {
    const pbRun = pbRuns.get(auditType)
    const name = auditNameMap.get(auditType) ?? auditType

    if (pbRun === undefined) {
      return { auditType, name, status: 'pending' as const, result: null, error: null }
    }

    if (pbRun.status === 'running') {
      return { auditType, name, status: 'running' as const, result: null, error: null }
    }
    if (pbRun.status === 'completed') {
      return {
        auditType,
        name,
        status: 'completed' as const,
        result: pbRun.result as AuditResult | null,
        error: null,
      }
    }
    if (pbRun.status === 'failed') {
      return { auditType, name, status: 'error' as const, result: null, error: pbRun.error }
    }

    return { auditType, name, status: 'pending' as const, result: null, error: null }
  })
}

/**
 * Build a map from audit type to display name.
 */
function buildAuditNameMap(audits: AvailableAudit[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const audit of audits) {
    map.set(audit.type, audit.name)
  }
  return map
}

/**
 * Compute campaign score and readiness when all audits are done.
 */
function computeScoreAndReadiness(
  allDone: boolean,
  progress: AuditProgress[]
): { score: CampaignScore | null; readiness: CampaignReadiness | null } {
  if (!allDone || progress.length === 0) {
    return { score: null, readiness: null }
  }
  const s = calculateCampaignScore(progress)
  const r = determineCampaignReadiness(s, progress)
  return { score: s, readiness: r }
}

/**
 * Wait for an audit to complete by polling PocketBase.
 */
async function waitForAuditCompletion(
  auditType: string,
  getPbRuns: () => Map<string, AuditRun>
): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    const pbRun = getPbRuns().get(auditType)
    if (pbRun !== undefined && pbRun.status !== 'running' && pbRun.status !== 'pending') {
      return // Audit completed (success, warning, error, or failed)
    }
  }
  // Timeout - continue to next audit anyway
}

/**
 * Run audits sequentially by triggering them one at a time.
 * Waits for each audit to complete in PocketBase before starting the next.
 */
async function executeSequentialAudits(
  audits: AvailableAudit[],
  onProgress: (index: number) => void,
  getPbRuns: () => Map<string, AuditRun>
): Promise<void> {
  for (let i = 0; i < audits.length; i++) {
    onProgress(i)
    try {
      await runAudit(audits[i].type)
      // Wait a bit for PocketBase to receive the initial "running" status
      await new Promise((resolve) => setTimeout(resolve, POCKETBASE_SETTLE_DELAY_MS))
      // Wait for the audit to complete before starting the next one
      await waitForAuditCompletion(audits[i].type, getPbRuns)
    } catch {
      // Continue with next audit even if one fails
    }
  }
}

export function useSequentialAuditRunner(
  options: UseSequentialAuditRunnerOptions = {}
): UseSequentialAuditRunnerReturn {
  const { pbAuditRuns = new Map<string, AuditRun>(), availableAudits = [] } = options
  const queryClient = useQueryClient()

  // Track which audits we're running in this session
  const [auditOrder, setAuditOrder] = React.useState<string[]>([])
  const [isRunning, setIsRunning] = React.useState(false)
  const [currentIndex, setCurrentIndex] = React.useState(-1)
  const [showSummary, setShowSummary] = React.useState(false)

  // Ref to access current pbAuditRuns from async callback
  const pbAuditRunsRef = React.useRef(pbAuditRuns)
  pbAuditRunsRef.current = pbAuditRuns

  const auditNameMap = React.useMemo(() => buildAuditNameMap(availableAudits), [availableAudits])

  // Derive progress from PocketBase data
  const progress = React.useMemo(
    () => pbRunsToProgress(pbAuditRuns, auditOrder, auditNameMap),
    [pbAuditRuns, auditOrder, auditNameMap]
  )

  const completedCount = progress.filter(
    (p) => p.status === 'completed' || p.status === 'error'
  ).length

  const allDone = auditOrder.length > 0 && completedCount === auditOrder.length

  // Compute score when all audits are done
  const { score, readiness } = React.useMemo(
    () => computeScoreAndReadiness(allDone, progress),
    [allDone, progress]
  )

  // Auto-show summary when all done
  React.useEffect(() => {
    if (allDone && isRunning) {
      setIsRunning(false)
      setCurrentIndex(-1)
      setShowSummary(true)
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
      void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
    }
  }, [allDone, isRunning, queryClient])

  const startSequentialRun = React.useCallback(
    (audits: AvailableAudit[]): void => {
      const filtered = audits.filter((a) => a.available)
      if (filtered.length === 0) {
        return
      }

      const order = filtered.map((a) => a.type)
      setAuditOrder(order)
      setIsRunning(true)
      setCurrentIndex(0)
      setShowSummary(false)

      void executeSequentialAudits(
        filtered,
        (index) => {
          setCurrentIndex(index)
        },
        () => pbAuditRunsRef.current
      )
    },
    []
  )

  const dismissSummary = React.useCallback((): void => {
    setShowSummary(false)
  }, [])

  const reset = React.useCallback((): void => {
    setAuditOrder([])
    setIsRunning(false)
    setCurrentIndex(-1)
    setShowSummary(false)
  }, [])

  return {
    isRunning,
    progress,
    currentIndex,
    totalAudits: auditOrder.length,
    completedCount,
    score,
    readiness,
    showSummary,
    startSequentialRun,
    dismissSummary,
    reset,
  }
}
