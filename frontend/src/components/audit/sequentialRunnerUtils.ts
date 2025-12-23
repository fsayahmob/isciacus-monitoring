/**
 * Sequential Runner Utilities
 * Helper functions for useSequentialAuditRunner hook.
 */

import { runAudit, type AuditResult, type AvailableAudit } from '../../services/api'
import { type AuditRun } from '../../services/pocketbase'
import { type AuditProgress } from './campaignScoreUtils'

// Constants
const POCKETBASE_SETTLE_DELAY_MS = 500
const POLL_INTERVAL_MS = 1000
const MAX_WAIT_TIME_MS = 120000 // 2 minutes max per audit

/**
 * Convert PocketBase runs to progress array for display.
 */
export function pbRunsToProgress(
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
export function buildAuditNameMap(audits: AvailableAudit[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const audit of audits) {
    map.set(audit.type, audit.name)
  }
  return map
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
export async function executeSequentialAudits(
  audits: AvailableAudit[],
  getPbRuns: () => Map<string, AuditRun>
): Promise<void> {
  for (const audit of audits) {
    try {
      await runAudit(audit.type)
      // Wait a bit for PocketBase to receive the initial "running" status
      await new Promise((resolve) => setTimeout(resolve, POCKETBASE_SETTLE_DELAY_MS))
      // Wait for the audit to complete before starting the next one
      await waitForAuditCompletion(audit.type, getPbRuns)
    } catch {
      // Continue with next audit even if one fails
    }
  }
}

/**
 * Check if state should be recovered from PocketBase after refresh.
 */
export function shouldRecoverState(
  pbRuns: Map<string, AuditRun>,
  localOrder: string[],
  localIsRunning: boolean
): boolean {
  if (localIsRunning || localOrder.length > 0) {
    return false // Already have local state
  }
  for (const run of pbRuns.values()) {
    if (run.status === 'running') {
      return true // PocketBase has running audits but we lost local state
    }
  }
  return false
}

/**
 * Recover audit order from PocketBase runs.
 * Returns all available audits when recovering (not just started ones).
 * This shows completed, running, and pending audits in the progress section.
 */
export function recoverAuditOrder(
  pbRuns: Map<string, AuditRun>,
  availableOrder: string[]
): string[] {
  // When recovering, return all available audits to show full progress
  // The pbRunsToProgress function handles showing correct status for each
  if (pbRuns.size > 0) {
    return availableOrder
  }
  return []
}

/**
 * Count completed audits in progress array.
 */
export function countCompleted(progress: AuditProgress[]): number {
  return progress.filter((p) => p.status === 'completed' || p.status === 'error').length
}

/**
 * Get available audit types in order.
 */
export function getAvailableOrder(audits: AvailableAudit[]): string[] {
  return audits.filter((a) => a.available).map((a) => a.type)
}

/**
 * Check if any audit is currently running in PocketBase.
 */
export function hasRunningAuditInPb(pbRuns: Map<string, AuditRun>): boolean {
  for (const run of pbRuns.values()) {
    if (run.status === 'running') {
      return true
    }
  }
  return false
}

/**
 * Find the index of the currently running audit in the order array.
 */
export function findRunningAuditIndex(pbRuns: Map<string, AuditRun>, auditOrder: string[]): number {
  for (let i = 0; i < auditOrder.length; i++) {
    const run = pbRuns.get(auditOrder[i])
    if (run?.status === 'running') {
      return i
    }
  }
  return -1
}
