/**
 * useSequentialAuditRunner - Sequential audit execution with campaign summary
 *
 * Runs audits one by one to avoid request overload, then computes
 * an overall score and campaign readiness summary.
 */

import { useQueryClient } from '@tanstack/react-query'
import React from 'react'

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

// Re-export types for consumers
export type { AuditProgress, CampaignReadiness, CampaignScore }

// Polling constants
const POLL_INTERVAL_MS = 1000
const MAX_POLL_ATTEMPTS = 120
const CLOCK_SKEW_MS = 5000

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

export function useSequentialAuditRunner(): UseSequentialAuditRunnerReturn {
  const queryClient = useQueryClient()
  const [state, setState] = React.useState<SequentialRunnerState>(INITIAL_STATE)

  const startSequentialRun = React.useCallback(
    (audits: AvailableAudit[]) => {
      const availableAudits = audits.filter((a) => a.available)

      if (availableAudits.length === 0) {
        return
      }

      setState({
        isRunning: true,
        progress: availableAudits.map((a) => ({
          auditType: a.type,
          name: a.name,
          status: 'pending',
          result: null,
          error: null,
        })),
        currentIndex: 0,
        totalAudits: availableAudits.length,
        completedCount: 0,
        score: null,
        readiness: null,
        showSummary: false,
      })

      void executeSequentialAudits(
        availableAudits,
        queryClient,
        (progress, index, completed) => {
          setState((prev) => ({
            ...prev,
            progress,
            currentIndex: index,
            completedCount: completed,
          }))
        },
        (finalProgress) => {
          const finalScore = calculateCampaignScore(finalProgress)
          const readiness = determineCampaignReadiness(finalScore, finalProgress)
          setState((prev) => ({
            ...prev,
            isRunning: false,
            currentIndex: -1,
            progress: finalProgress,
            score: finalScore,
            readiness,
            showSummary: true,
          }))
        }
      )
    },
    [queryClient]
  )

  const dismissSummary = React.useCallback(() => {
    setState((prev) => ({ ...prev, showSummary: false }))
  }, [])

  const reset = React.useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return { ...state, startSequentialRun, dismissSummary, reset }
}
