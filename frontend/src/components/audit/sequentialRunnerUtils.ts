/**
 * Sequential Runner Utilities
 * Helper functions for useSequentialAuditRunner hook.
 */

import {
  triggerAuditFromPocketBase,
  type AuditResult,
  type AvailableAudit,
} from '../../services/api'
import { type AuditRun } from '../../services/pocketbase'
import { AUDIT_TIMING } from './auditConfig'
import { type AuditProgress } from './campaignScoreUtils'

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
  while (Date.now() - startTime < AUDIT_TIMING.maxWaitTimeMs) {
    await new Promise((resolve) => setTimeout(resolve, AUDIT_TIMING.pollIntervalMs))
    const pbRun = getPbRuns().get(auditType)
    if (pbRun !== undefined && pbRun.status !== 'running' && pbRun.status !== 'pending') {
      return
    }
  }
}

/**
 * Run audits sequentially by triggering them one at a time.
 * Waits for each audit to complete in PocketBase before starting the next.
 * Uses the existing PocketBase record ID to ensure proper state updates.
 */
export async function executeSequentialAudits(
  audits: AvailableAudit[],
  getPbRuns: () => Map<string, AuditRun>,
  sessionId: string
): Promise<void> {
  for (const audit of audits) {
    try {
      // Get the existing PocketBase record for this audit (created by usePocketBaseSync)
      const pbRun = getPbRuns().get(audit.type)
      if (pbRun !== undefined) {
        // Use the existing record ID so backend updates the correct record
        await triggerAuditFromPocketBase({
          pocketbaseRecordId: pbRun.id,
          auditType: audit.type,
          sessionId,
        })
      }
      await new Promise((resolve) => setTimeout(resolve, AUDIT_TIMING.pbSettleDelayMs))
      await waitForAuditCompletion(audit.type, getPbRuns)
    } catch {
      // Continue with next audit even if one fails
    }
  }
}

/**
 * Resume execution of remaining audits after page refresh.
 * Skips already completed/failed audits and continues from pending ones.
 * Uses the existing PocketBase record ID to ensure proper state updates.
 */
export async function resumeSequentialAudits(
  plannedAuditTypes: string[],
  availableAudits: AvailableAudit[],
  getPbRuns: () => Map<string, AuditRun>,
  sessionId: string
): Promise<void> {
  const auditMap = new Map(availableAudits.map((a) => [a.type, a]))

  for (const auditType of plannedAuditTypes) {
    const pbRun = getPbRuns().get(auditType)
    const isAlreadyDone = pbRun?.status === 'completed' || pbRun?.status === 'failed'

    if (isAlreadyDone) {
      continue
    }

    // If running, wait for it to complete
    if (pbRun?.status === 'running') {
      await waitForAuditCompletion(auditType, getPbRuns)
      continue
    }

    // Pending - start it using the existing PocketBase record
    const audit = auditMap.get(auditType)
    if (audit === undefined || pbRun === undefined) {
      continue
    }

    try {
      // Use the existing record ID so backend updates the correct record
      await triggerAuditFromPocketBase({
        pocketbaseRecordId: pbRun.id,
        auditType: audit.type,
        sessionId,
      })
      await new Promise((resolve) => setTimeout(resolve, AUDIT_TIMING.pbSettleDelayMs))
      await waitForAuditCompletion(audit.type, getPbRuns)
    } catch {
      // Continue with next audit even if one fails
    }
  }
}

/**
 * Count completed audits in progress array.
 */
export function countCompleted(progress: AuditProgress[]): number {
  return progress.filter((p) => p.status === 'completed' || p.status === 'error').length
}
