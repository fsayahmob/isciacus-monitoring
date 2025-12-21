/**
 * usePocketBaseAudit - Hook for realtime audit updates via PocketBase
 *
 * Uses the generic useRealtimeCollection hook for Firestore-like synchronization.
 * Provides a Map keyed by audit_type for easy lookups.
 */
import React from 'react'

import { type AuditRun } from '../services/pocketbase'
import { useRealtimeCollection } from './useRealtimeCollection'

interface UsePocketBaseAuditReturn {
  /** Map of audit runs keyed by audit_type */
  auditRuns: Map<string, AuditRun>
  /** Whether connected to PocketBase */
  isConnected: boolean
  /** Whether initial fetch is in progress */
  isLoading: boolean
  /** Error if any */
  error: Error | null
}

/**
 * Hook to subscribe to realtime audit updates from PocketBase.
 *
 * @param sessionId - The audit session ID to subscribe to
 * @returns Object containing audit runs map, connection status, and loading state
 */
export function usePocketBaseAudit(sessionId: string | null): UsePocketBaseAuditReturn {
  const { records, isLoading, isConnected, error } = useRealtimeCollection<AuditRun>(
    'audit_runs',
    {
      filter: sessionId !== null ? `session_id="${sessionId}"` : undefined,
      sort: '-started_at',
      enabled: sessionId !== null,
    }
  )

  // Convert from id-keyed Map to audit_type-keyed Map for backward compatibility
  const auditRuns = React.useMemo(() => {
    const byType = new Map<string, AuditRun>()
    for (const record of records.values()) {
      // Keep the most recent record for each audit_type
      const existing = byType.get(record.audit_type)
      if (existing === undefined || record.started_at > existing.started_at) {
        byType.set(record.audit_type, record)
      }
    }
    return byType
  }, [records])

  return {
    auditRuns,
    isConnected,
    isLoading,
    error,
  }
}
