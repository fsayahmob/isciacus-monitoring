/**
 * Audit Result Builders
 * Helper functions for building AuditResult objects from PocketBase data.
 */

import { type AuditRun } from '../../services/pocketbase'
import type { AuditResult, AuditStep, AuditIssue } from '../../services/api'

/**
 * Extract steps array from PocketBase result with type safety.
 */
export function extractSteps(result: Record<string, unknown> | null | undefined): AuditStep[] {
  if (result === null || result === undefined) {
    return []
  }
  const { steps } = result
  return Array.isArray(steps) ? (steps as AuditStep[]) : []
}

/**
 * Extract issues array from PocketBase result with type safety.
 */
export function extractIssues(result: Record<string, unknown> | null | undefined): AuditIssue[] {
  if (result === null || result === undefined) {
    return []
  }
  const { issues } = result
  return Array.isArray(issues) ? (issues as AuditIssue[]) : []
}

/**
 * Build a running AuditResult from PocketBase data.
 */
export function buildRunningResult(auditType: string, pbRun: AuditRun | undefined): AuditResult {
  return {
    id: `running-${auditType}`,
    audit_type: auditType,
    status: 'running',
    started_at: pbRun?.started_at ?? new Date().toISOString(),
    completed_at: null,
    steps: extractSteps(pbRun?.result),
    issues: extractIssues(pbRun?.result),
    summary: {},
    raw_data: null,
  } as AuditResult
}

/**
 * Build a completed AuditResult from PocketBase data.
 */
export function buildCompletedResult(rawResult: Record<string, unknown>): AuditResult {
  return {
    ...rawResult,
    steps: extractSteps(rawResult),
    issues: extractIssues(rawResult),
  } as unknown as AuditResult
}
