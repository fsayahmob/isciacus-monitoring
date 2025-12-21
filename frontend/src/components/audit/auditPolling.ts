/**
 * Polling helpers for audit session queries
 */

import { type AuditSession } from '../../services/api'

const POLL_INTERVAL_MS = 1000

interface QueryState {
  state: {
    data?: { session: AuditSession }
  }
}

/**
 * Determines if polling should be active based on running audits.
 * Used as refetchInterval function for React Query.
 */
export function getAuditPollInterval(runningAuditsSize: number, query: QueryState): number | false {
  // Poll if we have locally tracked running audits
  if (runningAuditsSize > 0) {
    return POLL_INTERVAL_MS
  }
  // Also poll if backend reports running audits (for page refresh recovery)
  const session = query.state.data?.session
  if (session !== undefined) {
    const hasRunning = Object.values(session.audits).some((r) => r.status === 'running')
    if (hasRunning) {
      return POLL_INTERVAL_MS
    }
  }
  return false
}

export { POLL_INTERVAL_MS }
