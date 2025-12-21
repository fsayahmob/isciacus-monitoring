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
