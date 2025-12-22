/**
 * Audit API - ISCIACUS Monitoring Dashboard
 * ==========================================
 * Audit-related HTTP endpoints
 */

import { apiClient } from './apiClient'
import type {
  AuditResult,
  AuditSession,
  AvailableAudit,
  PermissionsReport,
  TrackingAuditData,
} from './apiTypes'

export async function fetchTrackingAudit(): Promise<TrackingAuditData> {
  const response = await apiClient.get<TrackingAuditData>('/api/audit/tracking')
  return response.data
}

export async function fetchAuditStatus(): Promise<{
  has_issues: boolean
  last_audit: string | null
}> {
  const response = await apiClient.get<{ has_issues: boolean; last_audit: string | null }>(
    '/api/audit/status'
  )
  return response.data
}

export async function fetchAvailableAudits(): Promise<{ audits: AvailableAudit[] }> {
  const response = await apiClient.get<{ audits: AvailableAudit[] }>('/api/audits')
  return response.data
}

export async function fetchLatestAuditSession(): Promise<{ session: AuditSession | null }> {
  const response = await apiClient.get<{ session: AuditSession | null }>('/api/audits/session')
  return response.data
}

// Response types for runAudit
interface SyncAuditResponse {
  result: AuditResult
}

interface AsyncAuditResponse {
  async: true
  run_id: string
  audit_type: string
  status: 'triggered'
  message: string
}

type RunAuditResponse = SyncAuditResponse | AsyncAuditResponse

export async function runAudit(
  auditType: string,
  period = 30
): Promise<{ result: AuditResult } | { async: true; run_id: string; audit_type: string }> {
  const response = await apiClient.post<RunAuditResponse>(
    `/api/audits/run/${auditType}?period=${String(period)}`
  )

  const { data } = response

  // If async response, return the run_id for polling
  if ('async' in data) {
    return {
      async: true,
      run_id: data.run_id,
      audit_type: data.audit_type,
    }
  }

  // Sync response - return result directly
  return { result: data.result }
}

export async function runAllAudits(
  period = 30
): Promise<{ triggered_count: number; failed_count: number; message: string }> {
  const response = await apiClient.post<{
    async: true
    triggered_count: number
    failed_count: number
    triggered: { audit_type: string; run_id: string; status: string }[]
    failed: { audit_type: string; error: string }[] | null
    message: string
  }>(`/api/audits/run-all?period=${String(period)}`)

  return response.data
}

// Types for async action responses
interface AsyncActionResponse {
  async: true
  task_id: string
  status: 'pending' | 'running'
}

interface SyncActionResponse {
  success: boolean
  message?: string
  error?: string
}

interface ActionStatusResponse {
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: { success: boolean; message?: string; error?: string }
}

type ActionResponse = AsyncActionResponse | SyncActionResponse

const POLL_INTERVAL_MS = 1000
const MAX_POLL_ATTEMPTS = 120 // 2 minutes max

async function pollActionStatus(taskId: string): Promise<SyncActionResponse> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await apiClient.get<ActionStatusResponse>(
      `/api/audits/action/status?task_id=${taskId}`
    )
    const { data } = response

    if (data.status === 'completed' || data.status === 'failed') {
      return data.result ?? { success: data.status === 'completed' }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return { success: false, error: 'Action timed out after 2 minutes' }
}

export async function executeAuditAction(
  auditType: string,
  actionId: string,
  asyncMode = true
): Promise<{ success: boolean; message?: string; error?: string }> {
  const asyncParam = asyncMode ? '&async_mode=true' : ''
  const response = await apiClient.post<ActionResponse>(
    `/api/audits/action?audit_type=${auditType}&action_id=${actionId}${asyncParam}`
  )

  const { data } = response

  // If async response, poll for result
  if ('async' in data) {
    return pollActionStatus(data.task_id)
  }

  // Sync response
  return data
}

// Permissions API
export async function fetchShopifyPermissions(): Promise<PermissionsReport> {
  const response = await apiClient.get<PermissionsReport>('/api/permissions/shopify')
  return response.data
}

// Cache management
export async function clearAuditCache(): Promise<{
  success: boolean
  deleted_sessions: number
  message: string
}> {
  const response = await apiClient.delete<{
    success: boolean
    deleted_sessions: number
    message: string
  }>('/api/audits/cache')
  return response.data
}

// ============================================================================
// PocketBase-first pattern (Firebase-like architecture)
// ============================================================================

interface TriggerAuditFromPocketBaseParams {
  pocketbaseRecordId: string
  auditType: string
  sessionId: string
}

interface TriggerAuditFromPocketBaseResponse {
  status: 'triggered' | 'error'
  run_id?: string
  message?: string
}

/**
 * Trigger an Inngest workflow from a PocketBase record.
 *
 * This is part of the Firebase-like pattern:
 * 1. Frontend creates record in PocketBase (status: pending)
 * 2. Frontend calls this endpoint to trigger Inngest
 * 3. Inngest updates PocketBase (status: running → completed/failed)
 */
export async function triggerAuditFromPocketBase(
  params: TriggerAuditFromPocketBaseParams
): Promise<TriggerAuditFromPocketBaseResponse> {
  const response = await apiClient.post<TriggerAuditFromPocketBaseResponse>('/api/audits/trigger', {
    pocketbase_record_id: params.pocketbaseRecordId,
    audit_type: params.auditType,
    session_id: params.sessionId,
  })
  return response.data
}

/**
 * Run an audit using the PocketBase-first pattern (Firebase-like).
 *
 * This is the recommended way to run audits:
 * 1. Creates a record in PocketBase (source of truth)
 * 2. Triggers the Inngest workflow via backend
 * 3. Returns the PocketBase record ID for realtime updates
 *
 * The frontend should subscribe to PocketBase realtime for status updates.
 */
export interface RunAuditViaPocketBaseResult {
  pocketbaseRecordId: string
  runId: string
  auditType: string
  sessionId: string
}

export async function runAuditViaPocketBase(
  auditType: string,
  sessionId: string
): Promise<RunAuditViaPocketBaseResult> {
  // Import PocketBase functions dynamically to avoid circular deps
  const { createAuditRun, isAuditInProgress } = await import('./pocketbase')

  // Check if already running
  const alreadyRunning = await isAuditInProgress(sessionId, auditType)
  if (alreadyRunning) {
    throw new Error(`Audit ${auditType} is already running for this session`)
  }

  // Step 1: Create record in PocketBase (source of truth)
  const pbRecord = await createAuditRun({ sessionId, auditType })

  // Step 2: Trigger Inngest workflow via backend
  const triggerResult = await triggerAuditFromPocketBase({
    pocketbaseRecordId: pbRecord.id,
    auditType,
    sessionId,
  })

  if (triggerResult.status === 'error') {
    // Update PocketBase record to failed
    const { updateAuditRunStatus } = await import('./pocketbase')
    await updateAuditRunStatus(
      pbRecord.id,
      'failed',
      triggerResult.message ?? 'Failed to trigger workflow'
    )
    throw new Error(triggerResult.message ?? 'Failed to trigger audit workflow')
  }

  return {
    pocketbaseRecordId: pbRecord.id,
    runId: triggerResult.run_id ?? '',
    auditType,
    sessionId,
  }
}

/**
 * Run multiple audits in batch using PocketBase-first pattern.
 */
export async function runBatchAuditsViaPocketBase(
  auditTypes: string[],
  sessionId: string
): Promise<RunAuditViaPocketBaseResult[]> {
  const results: RunAuditViaPocketBaseResult[] = []

  for (const auditType of auditTypes) {
    try {
      const result = await runAuditViaPocketBase(auditType, sessionId)
      results.push(result)
    } catch {
      // Continue with next audit even if one fails
      // The failed one will be marked in PocketBase
    }
  }

  return results
}

/**
 * Stop a running audit by updating its status to 'failed' in PocketBase.
 */
export async function stopAudit(recordId: string): Promise<void> {
  const { cancelAuditRun } = await import('./pocketbase')
  await cancelAuditRun(recordId)
}
