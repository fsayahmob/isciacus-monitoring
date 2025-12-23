/**
 * Audit Configuration
 * Centralized constants for audit timing and polling.
 */

export const AUDIT_TIMING = {
  /** Delay after creating PocketBase records before starting execution */
  pbSettleDelayMs: 500,
  /** Polling interval when waiting for audit completion */
  pollIntervalMs: 1000,
  /** Maximum wait time per audit before timeout */
  maxWaitTimeMs: 120000,
  /** Duration for visual highlight effects */
  highlightDurationMs: 2000,
} as const

export type AuditTiming = typeof AUDIT_TIMING
