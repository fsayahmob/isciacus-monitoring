/**
 * useSequentialAuditRunner - Sequential audit execution with campaign summary
 *
 * Runs audits one by one to avoid request overload, then computes
 * an overall score and campaign readiness summary.
 *
 * Integrates with PocketBase for:
 * - Restoring state after page refresh
 * - Real-time progress updates via WebSocket
 */

import { useQueryClient } from '@tanstack/react-query'
import React from 'react'

import { type AuditRun } from '../../services/pocketbase'
import {
  fetchLatestAuditSession,
  runAudit,
  type AuditResult,
  type AvailableAudit,
} from '../../services/api'
import {
  calculateCampaignScore,
  determineCampaignReadiness,
  type AuditProgress,
  type CampaignReadiness,
  type CampaignScore,
} from './campaignScoreUtils'
import {
  buildAuditNameMap,
  calculateStateFromPbRuns,
  hasRunningAuditsInPb,
  syncProgressFromPb,
  type SequentialRunnerState,
} from './pocketBaseRunnerSync'

// Re-export types for consumers
export type { AuditProgress, CampaignReadiness, CampaignScore, SequentialRunnerState }

// Polling constants (fallback when PocketBase not connected)
const POLL_INTERVAL_MS = 1000
const MAX_POLL_ATTEMPTS = 120
const CLOCK_SKEW_MS = 5000

export interface UseSequentialAuditRunnerReturn extends SequentialRunnerState {
  startSequentialRun: (audits: AvailableAudit[]) => void
  dismissSummary: () => void
  reset: () => void
}

export interface UseSequentialAuditRunnerOptions {
  /** PocketBase audit runs for realtime sync */
  pbAuditRuns?: Map<string, AuditRun>
  /** Whether PocketBase is connected */
  pbConnected?: boolean
  /** Available audits for mapping types to names */
  availableAudits?: AvailableAudit[]
}

// ============================================================================
// Polling Helpers
// ============================================================================

const FINAL_STATUSES = ['success', 'warning', 'error', 'skipped']

async function waitForAuditCompletion(
  auditType: string,
  startedAt: string,
  queryClient: ReturnType<typeof useQueryClient>
): Promise<AuditResult | null> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    const { session } = await fetchLatestAuditSession()
    if (session === null) {
      continue
    }

    const result = session.audits[auditType] as AuditResult | undefined
    if (!result) {
      continue
    }

    const resultStarted = new Date(result.started_at).getTime()
    const ourTrigger = new Date(startedAt).getTime()

    if (resultStarted < ourTrigger - CLOCK_SKEW_MS) {
      continue
    }

    if (FINAL_STATUSES.includes(result.status) && result.completed_at !== null) {
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
      void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
      return result
    }
  }

  return null
}

// ============================================================================
// Sequential Run Logic
// ============================================================================

async function runSingleAudit(
  audit: AvailableAudit,
  queryClient: ReturnType<typeof useQueryClient>
): Promise<{ result: AuditResult | null; error: string | null }> {
  const startedAt = new Date().toISOString()

  try {
    await runAudit(audit.type)
    const result = await waitForAuditCompletion(audit.type, startedAt, queryClient)

    if (result !== null) {
      return { result, error: null }
    }
    return { result: null, error: 'Timeout - audit took too long' }
  } catch (err) {
    return {
      result: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

type ProgressCallback = (progress: AuditProgress[], index: number, completed: number) => void
type CompleteCallback = (progress: AuditProgress[]) => void

async function executeSequentialAudits(
  audits: AvailableAudit[],
  queryClient: ReturnType<typeof useQueryClient>,
  onProgress: ProgressCallback,
  onComplete: CompleteCallback
): Promise<void> {
  const progress: AuditProgress[] = audits.map((audit) => ({
    auditType: audit.type,
    name: audit.name,
    status: 'pending' as const,
    result: null,
    error: null,
  }))

  for (let i = 0; i < audits.length; i++) {
    progress[i] = { ...progress[i], status: 'running' }
    onProgress([...progress], i, i)

    const { result, error } = await runSingleAudit(audits[i], queryClient)

    progress[i] =
      result !== null
        ? { ...progress[i], status: 'completed', result }
        : { ...progress[i], status: 'error', error }

    onProgress([...progress], i, i + 1)
  }

  onComplete([...progress])
}

// ============================================================================
// Main Hook
// ============================================================================

const INITIAL_STATE: SequentialRunnerState = {
  isRunning: false,
  progress: [],
  currentIndex: -1,
  totalAudits: 0,
  completedCount: 0,
  score: null,
  readiness: null,
  showSummary: false,
}

export function useSequentialAuditRunner(
  options: UseSequentialAuditRunnerOptions = {}
): UseSequentialAuditRunnerReturn {
  const { pbAuditRuns, pbConnected = false, availableAudits = [] } = options
  const queryClient = useQueryClient()
  const [state, setState] = React.useState<SequentialRunnerState>(INITIAL_STATE)
  const hasRestoredFromPbRef = React.useRef(false)
  const isExecutingLocallyRef = React.useRef(false)

  const auditNameMap = React.useMemo(() => buildAuditNameMap(availableAudits), [availableAudits])

  // Restore state from PocketBase on initial load
  usePbStateRestoration(pbConnected, pbAuditRuns, auditNameMap, hasRestoredFromPbRef, setState)

  // Sync progress from PocketBase realtime updates
  usePbProgressSync(state, pbConnected, pbAuditRuns, isExecutingLocallyRef, setState)

  const startSequentialRun = useStartSequentialRun(
    queryClient,
    isExecutingLocallyRef,
    hasRestoredFromPbRef,
    setState
  )

  const dismissSummary = React.useCallback(() => {
    setState((prev) => ({ ...prev, showSummary: false }))
  }, [])

  const reset = React.useCallback(() => {
    isExecutingLocallyRef.current = false
    hasRestoredFromPbRef.current = false
    setState(INITIAL_STATE)
  }, [])

  return { ...state, startSequentialRun, dismissSummary, reset }
}

// ============================================================================
// Sub-hooks for code organization
// ============================================================================

function usePbStateRestoration(
  pbConnected: boolean,
  pbAuditRuns: Map<string, AuditRun> | undefined,
  auditNameMap: Map<string, string>,
  hasRestoredFromPbRef: React.RefObject<boolean>,
  setState: React.Dispatch<React.SetStateAction<SequentialRunnerState>>
): void {
  React.useEffect(() => {
    if (hasRestoredFromPbRef.current || !pbConnected || pbAuditRuns === undefined) {
      return
    }
    if (hasRunningAuditsInPb(pbAuditRuns)) {
      hasRestoredFromPbRef.current = true
      const restoredState = calculateStateFromPbRuns(pbAuditRuns, auditNameMap)
      setState(restoredState)
    }
  }, [pbConnected, pbAuditRuns, auditNameMap, hasRestoredFromPbRef, setState])
}

function usePbProgressSync(
  state: SequentialRunnerState,
  pbConnected: boolean,
  pbAuditRuns: Map<string, AuditRun> | undefined,
  isExecutingLocallyRef: React.RefObject<boolean>,
  setState: React.Dispatch<React.SetStateAction<SequentialRunnerState>>
): void {
  React.useEffect(() => {
    if (!state.isRunning || !pbConnected || pbAuditRuns === undefined || pbAuditRuns.size === 0) {
      return
    }

    const sync = syncProgressFromPb(state.progress, pbAuditRuns)

    if (sync.hasChanges) {
      if (sync.allDone) {
        const score = calculateCampaignScore(sync.progress)
        const readiness = determineCampaignReadiness(score, sync.progress)
        isExecutingLocallyRef.current = false
        setState({
          isRunning: false,
          progress: sync.progress,
          currentIndex: -1,
          totalAudits: sync.progress.length,
          completedCount: sync.completedCount,
          score,
          readiness,
          showSummary: true,
        })
      } else {
        setState((prev) => ({
          ...prev,
          progress: sync.progress,
          currentIndex: sync.runningIndex >= 0 ? sync.runningIndex : prev.currentIndex,
          completedCount: sync.completedCount,
        }))
      }
    }
  }, [pbAuditRuns, pbConnected, state.isRunning, state.progress, isExecutingLocallyRef, setState])
}

function useStartSequentialRun(
  queryClient: ReturnType<typeof useQueryClient>,
  isExecutingLocallyRef: React.RefObject<boolean>,
  hasRestoredFromPbRef: React.RefObject<boolean>,
  setState: React.Dispatch<React.SetStateAction<SequentialRunnerState>>
): (audits: AvailableAudit[]) => void {
  return React.useCallback(
    (audits: AvailableAudit[]) => {
      const filtered = audits.filter((a) => a.available)
      if (filtered.length === 0) {
        return
      }

      isExecutingLocallyRef.current = true
      hasRestoredFromPbRef.current = true

      setState({
        isRunning: true,
        progress: filtered.map((a) => ({
          auditType: a.type,
          name: a.name,
          status: 'pending',
          result: null,
          error: null,
        })),
        currentIndex: 0,
        totalAudits: filtered.length,
        completedCount: 0,
        score: null,
        readiness: null,
        showSummary: false,
      })

      void executeSequentialAudits(
        filtered,
        queryClient,
        (progress, index, completed) => {
          setState((prev) => ({ ...prev, progress, currentIndex: index, completedCount: completed }))
        },
        (finalProgress) => {
          const score = calculateCampaignScore(finalProgress)
          const readiness = determineCampaignReadiness(score, finalProgress)
          isExecutingLocallyRef.current = false
          setState((prev) => ({
            ...prev,
            isRunning: false,
            currentIndex: -1,
            progress: finalProgress,
            score,
            readiness,
            showSummary: true,
          }))
        }
      )
    },
    [queryClient, isExecutingLocallyRef, hasRestoredFromPbRef, setState]
  )
}
