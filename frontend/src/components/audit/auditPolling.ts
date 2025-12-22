/**
 * Polling helpers for audit session queries
 */

import type { Query } from '@tanstack/react-query'
import { type AuditSession } from '../../services/api'

const POLL_INTERVAL_MS = 1000

interface SessionData {
  session: AuditSession | null
}

/**
 * Determines if polling should be active based on running audits.
 * Used as refetchInterval function for React Query.
 *
 * Key insight: On page refresh, runningAudits is empty but backend may have
 * running audits. We poll until we know for sure there are no running audits.
 */
export function getAuditPollInterval(
  runningAuditsSize: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: Query<SessionData, any, SessionData, any>
): number | false {
  // Poll if we have locally tracked running audits
  if (runningAuditsSize > 0) {
    return POLL_INTERVAL_MS
  }

  // If query hasn't loaded yet, poll to get initial data
  if (query.state.status === 'pending') {
    return POLL_INTERVAL_MS
  }

  // Once loaded, check if backend reports running audits (page refresh recovery)
  const session = query.state.data?.session
  if (session !== undefined && session !== null) {
    const hasRunning = Object.values(session.audits).some((r) => r.status === 'running')
    if (hasRunning) {
      return POLL_INTERVAL_MS
    }
  }

  return false
}

export { POLL_INTERVAL_MS }
