/**
 * usePocketBaseSync - Sync PocketBase realtime updates with local audit state
 */
import { type useQueryClient } from '@tanstack/react-query'
import React from 'react'

import { type AuditRun } from '../../services/pocketbase'
import { type AuditResult, type AuditSession } from '../../services/api'
import { detectRunningAuditsFromSession, type RunningAuditInfo } from './auditSteps'

interface PocketBaseSyncConfig {
  pbAuditRuns: Map<string, AuditRun>
  pbConnected: boolean
  runningAudits: Map<string, RunningAuditInfo>
  setRunningAudits: React.Dispatch<React.SetStateAction<Map<string, RunningAuditInfo>>>
  setOptimisticResults: React.Dispatch<React.SetStateAction<Map<string, AuditResult>>>
  session: AuditSession | null
  queryClient: ReturnType<typeof useQueryClient>
}

/**
 * Hook to sync PocketBase realtime updates with local audit state.
 * Handles both realtime updates and initial load from PocketBase.
 */
export function usePocketBaseSync(config: PocketBaseSyncConfig): void {
  const {
    pbAuditRuns,
    pbConnected,
    runningAudits,
    setRunningAudits,
    setOptimisticResults,
    session,
    queryClient,
  } = config

  // Sync PocketBase realtime updates with local state
  React.useEffect(() => {
    if (!pbConnected || pbAuditRuns.size === 0) {
      return
    }
    for (const [auditType, pbRun] of pbAuditRuns) {
      const isRunning = pbRun.status === 'running'
      const wasRunning = runningAudits.has(auditType)
      if (isRunning && !wasRunning) {
        setRunningAudits((prev) => new Map(prev).set(auditType, { startedAt: pbRun.started_at }))
      } else if (!isRunning && wasRunning) {
        setRunningAudits((prev) => {
          const n = new Map(prev)
          n.delete(auditType)
          return n
        })
        setOptimisticResults((prev) => {
          const n = new Map(prev)
          n.delete(auditType)
          return n
        })
        void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
        void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
      }
    }
  }, [pbAuditRuns, pbConnected, runningAudits, setRunningAudits, setOptimisticResults, queryClient])

  // Detect running audits on initial load
  // Priority: PocketBase (realtime source of truth) > Backend session (fallback)
  const hasInitializedFromPB = React.useRef(false)
  const hasInitializedFromBackend = React.useRef(false)

  React.useEffect(() => {
    // If PocketBase is connected and has data, always use it (source of truth)
    if (pbConnected && pbAuditRuns.size > 0) {
      hasInitializedFromPB.current = true
      const running = new Map<string, RunningAuditInfo>()
      for (const [t, r] of pbAuditRuns) {
        if (r.status === 'running') {
          running.set(t, { startedAt: r.started_at })
        }
      }
      // Always update from PocketBase, even if we previously initialized from backend
      setRunningAudits(running)
      return
    }

    // Fallback to backend session only if:
    // 1. We haven't initialized from PocketBase yet
    // 2. We haven't already fallen back to backend
    // 3. PocketBase connection attempt has completed (connected but empty, or failed)
    if (!hasInitializedFromPB.current && !hasInitializedFromBackend.current && session !== null) {
      // Only use backend fallback if PocketBase is connected but has no data for this session
      // This means the session exists in backend but not in PocketBase (legacy data)
      if (pbConnected) {
        hasInitializedFromBackend.current = true
        const running = detectRunningAuditsFromSession(session)
        if (running.size > 0) {
          setRunningAudits(running)
        }
      }
      // If pbConnected is false, wait for PocketBase to connect first
    }
  }, [session, pbConnected, pbAuditRuns, setRunningAudits])
}
