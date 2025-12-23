/**
 * PocketBase client configuration and types.
 *
 * This module provides:
 * - Singleton PocketBase client
 * - Type definitions for audit runs
 *
 * For realtime subscriptions, use the useRealtimeCollection hook instead
 * of manual subscription management.
 */
import PocketBase from 'pocketbase'

const DEFAULT_POCKETBASE_URL = 'http://localhost:8090'
const envUrl = import.meta.env.VITE_POCKETBASE_URL as string | undefined
const POCKETBASE_URL: string =
  envUrl !== undefined && envUrl !== '' ? envUrl : DEFAULT_POCKETBASE_URL

// Audit run status types
export type AuditRunStatus = 'pending' | 'running' | 'completed' | 'failed'
export type OrchestratorStatus = 'running' | 'completed'

// Orchestrator session record (stores planned audits for recovery after refresh)
export interface OrchestratorSession {
  id: string
  session_id: string
  planned_audits: string[]
  status: OrchestratorStatus
  started_at: string
  completed_at: string | null
}

// PocketBase audit run record
export interface AuditRun {
  id: string
  audit_type: string
  status: AuditRunStatus
  started_at: string
  completed_at: string | null
  result: Record<string, unknown> | null
  error: string | null
  run_id: string
  session_id: string
}

// Singleton PocketBase client
let pbClient: PocketBase | null = null

/**
 * Get or create PocketBase client singleton.
 * The client handles:
 * - Connection management
 * - Automatic reconnection
 * - WebSocket subscriptions
 */
export function getPocketBase(): PocketBase {
  pbClient ??= new PocketBase(POCKETBASE_URL)
  return pbClient
}

// ============================================================================
// Audit Run Operations (write directly to PocketBase)
// ============================================================================

export interface CreateAuditRunParams {
  sessionId: string
  auditType: string
}

/**
 * Create a new audit run in PocketBase with status 'pending'.
 * This triggers the backend webhook which starts the Inngest workflow.
 */
export async function createAuditRun(params: CreateAuditRunParams): Promise<AuditRun> {
  const pb = getPocketBase()
  const record = await pb.collection('audit_runs').create<AuditRun>({
    session_id: params.sessionId,
    audit_type: params.auditType,
    status: 'pending',
    started_at: new Date().toISOString(),
    completed_at: null,
    result: null,
    error: null,
    run_id: '',
  })
  return record
}

/**
 * Check if an audit is already running or pending for the given session.
 * Prevents double-launching the same audit.
 */
export async function isAuditInProgress(sessionId: string, auditType: string): Promise<boolean> {
  const pb = getPocketBase()
  try {
    const records = await pb.collection('audit_runs').getList<AuditRun>(1, 1, {
      filter: `session_id="${sessionId}" && audit_type="${auditType}" && (status="pending" || status="running")`,
    })
    return records.totalItems > 0
  } catch {
    return false
  }
}

/**
 * Create multiple audit runs for a batch execution.
 * Returns the created records.
 */
export async function createBatchAuditRuns(
  sessionId: string,
  auditTypes: string[]
): Promise<AuditRun[]> {
  const results: AuditRun[] = []
  for (const auditType of auditTypes) {
    const inProgress = await isAuditInProgress(sessionId, auditType)
    if (!inProgress) {
      const record = await createAuditRun({ sessionId, auditType })
      results.push(record)
    }
  }
  return results
}

// Session ID length for unique identification
const SESSION_ID_LENGTH = 8

/**
 * Generate a unique session ID for grouping audit runs.
 */
export function generateSessionId(): string {
  return crypto.randomUUID().slice(0, SESSION_ID_LENGTH)
}

/**
 * Update an audit run's status in PocketBase.
 * Used by frontend for optimistic updates or cancellation.
 */
export async function updateAuditRunStatus(
  recordId: string,
  status: AuditRunStatus,
  error?: string
): Promise<AuditRun> {
  const pb = getPocketBase()
  const updateData: Partial<AuditRun> = { status }
  if (error !== undefined) {
    updateData.error = error
  }
  if (status === 'completed' || status === 'failed') {
    updateData.completed_at = new Date().toISOString()
  }
  return pb.collection('audit_runs').update<AuditRun>(recordId, updateData)
}

/**
 * Cancel an in-progress audit by setting its status to 'failed'.
 * Note: This only updates the status in PocketBase - stopping the Inngest
 * workflow requires a separate webhook trigger (future enhancement).
 */
export async function cancelAuditRun(recordId: string): Promise<AuditRun> {
  return updateAuditRunStatus(recordId, 'failed', 'Cancelled by user')
}

// ============================================================================
// Orchestrator Session Operations (for state recovery after refresh)
// ============================================================================

/**
 * Create an orchestrator session to track planned audits.
 * Called when "Lancer tous les audits" is clicked.
 */
export async function createOrchestratorSession(
  sessionId: string,
  plannedAudits: string[]
): Promise<OrchestratorSession> {
  const pb = getPocketBase()
  return pb.collection('orchestrator_sessions').create<OrchestratorSession>({
    session_id: sessionId,
    planned_audits: plannedAudits,
    status: 'running',
    started_at: new Date().toISOString(),
    completed_at: null,
  })
}

/**
 * Get the orchestrator session for a given session ID.
 * Returns null if no session exists.
 */
export async function getOrchestratorSession(
  sessionId: string
): Promise<OrchestratorSession | null> {
  const pb = getPocketBase()
  try {
    const records = await pb
      .collection('orchestrator_sessions')
      .getList<OrchestratorSession>(1, 1, { filter: `session_id="${sessionId}"` })
    return records.items[0] ?? null
  } catch {
    return null
  }
}

/**
 * Mark an orchestrator session as completed.
 */
export async function completeOrchestratorSession(recordId: string): Promise<OrchestratorSession> {
  const pb = getPocketBase()
  return pb.collection('orchestrator_sessions').update<OrchestratorSession>(recordId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  })
}
