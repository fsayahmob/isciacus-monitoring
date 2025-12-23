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
  shouldRecoverState,
  recoverAuditOrder,
  countCompleted,
  getAvailableOrder,
  hasRunningAuditInPb,
  findRunningAuditIndex,
} from './sequentialRunnerUtils'

// Re-export types for consumers
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
  pbAuditRuns?: Map<string, AuditRun>
  availableAudits?: AvailableAudit[]
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
  return {
    score: calculateCampaignScore(progress),
    readiness: determineCampaignReadiness(calculateCampaignScore(progress), progress),
  }
}

interface RunnerState {
  auditOrder: string[]
  isRunning: boolean
  showSummary: boolean
  hasRecovered: boolean
}

type RunnerAction =
  | { type: 'START'; order: string[] }
  | { type: 'FINISH' }
  | { type: 'RECOVER'; order: string[] }
  | { type: 'DISMISS_SUMMARY' }
  | { type: 'RESET' }
  | { type: 'MARK_RECOVERED' }

function runnerReducer(state: RunnerState, action: RunnerAction): RunnerState {
  switch (action.type) {
    case 'START':
      return { ...state, auditOrder: action.order, isRunning: true, showSummary: false }
    case 'FINISH':
      return { ...state, isRunning: false, showSummary: true }
    case 'RECOVER':
      return { ...state, auditOrder: action.order, isRunning: true, hasRecovered: true }
    case 'DISMISS_SUMMARY':
      return { ...state, showSummary: false }
    case 'RESET':
      return {
        auditOrder: [],
        isRunning: false,
        showSummary: false,
        hasRecovered: state.hasRecovered,
      }
    case 'MARK_RECOVERED':
      return { ...state, hasRecovered: true }
  }
}

const initialState: RunnerState = {
  auditOrder: [],
  isRunning: false,
  showSummary: false,
  hasRecovered: false,
}

export function useSequentialAuditRunner(
  options: UseSequentialAuditRunnerOptions = {}
): UseSequentialAuditRunnerReturn {
  const { pbAuditRuns = new Map<string, AuditRun>(), availableAudits = [] } = options
  const queryClient = useQueryClient()

  const [state, dispatch] = React.useReducer(runnerReducer, initialState)
  const pbAuditRunsRef = React.useRef(pbAuditRuns)
  pbAuditRunsRef.current = pbAuditRuns

  const auditNameMap = React.useMemo(() => buildAuditNameMap(availableAudits), [availableAudits])
  const availableOrder = React.useMemo(() => getAvailableOrder(availableAudits), [availableAudits])

  const hasRunningAudit = React.useMemo(() => hasRunningAuditInPb(pbAuditRuns), [pbAuditRuns])

  // Recover state from PocketBase after page refresh
  React.useEffect(() => {
    if (state.hasRecovered || pbAuditRuns.size === 0 || availableOrder.length === 0) {
      return
    }
    if (!shouldRecoverState(pbAuditRuns, state.auditOrder, state.isRunning)) {
      dispatch({ type: 'MARK_RECOVERED' })
      return
    }
    const recovered = recoverAuditOrder(pbAuditRuns, availableOrder)
    if (recovered.length > 0) {
      dispatch({ type: 'RECOVER', order: recovered })
    }
  }, [pbAuditRuns, availableOrder, state.auditOrder, state.isRunning, state.hasRecovered])

  const progress = React.useMemo(
    () => pbRunsToProgress(pbAuditRuns, state.auditOrder, auditNameMap),
    [pbAuditRuns, state.auditOrder, auditNameMap]
  )

  const completedCount = countCompleted(progress)
  // Derive currentIndex from PocketBase - find which audit is currently running
  const derivedCurrentIndex = React.useMemo(
    () => findRunningAuditIndex(pbAuditRuns, state.auditOrder),
    [pbAuditRuns, state.auditOrder]
  )
  // Only consider "all done" if no audits are running in PocketBase
  const allDone =
    state.auditOrder.length > 0 && completedCount === state.auditOrder.length && !hasRunningAudit
  const { score, readiness } = React.useMemo(
    () => computeScoreAndReadiness(allDone, progress),
    [allDone, progress]
  )

  // Auto-show summary when all done (only for active runs, not recovered state)
  // wasStartedLocally prevents showing summary after refresh when audits completed while away
  const wasStartedLocallyRef = React.useRef(false)
  React.useEffect(() => {
    if (allDone && state.isRunning && wasStartedLocallyRef.current) {
      dispatch({ type: 'FINISH' })
      void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
      void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
    }
  }, [allDone, state.isRunning, queryClient])

  const startSequentialRun = React.useCallback((audits: AvailableAudit[]): void => {
    const filtered = audits.filter((a) => a.available)
    if (filtered.length === 0) {
      return
    }
    wasStartedLocallyRef.current = true
    dispatch({ type: 'START', order: filtered.map((a) => a.type) })
    void executeSequentialAudits(filtered, () => pbAuditRunsRef.current)
  }, [])

  const dismissSummary = React.useCallback((): void => {
    dispatch({ type: 'DISMISS_SUMMARY' })
  }, [])

  const reset = React.useCallback((): void => {
    dispatch({ type: 'RESET' })
  }, [])

  return {
    isRunning: state.isRunning,
    progress,
    currentIndex: derivedCurrentIndex,
    totalAudits: state.auditOrder.length,
    completedCount,
    score,
    readiness,
    showSummary: state.showSummary,
    startSequentialRun,
    dismissSummary,
    reset,
  }
}
