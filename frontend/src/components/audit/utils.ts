/**
 * Audit Pipeline - Utility functions
 */

// Constants
export const DETAILS_LIMIT = 5
export const MS_PER_SECOND = 1000
export const MS_PER_MINUTE = 60000
export const MINUTES_PER_HOUR = 60
export const HOURS_PER_DAY = 24

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / MS_PER_MINUTE)

  if (diffMins < 1) {
    return "à l'instant"
  }
  if (diffMins < MINUTES_PER_HOUR) {
    return `il y a ${String(diffMins)} min`
  }

  const diffHours = Math.floor(diffMins / MINUTES_PER_HOUR)
  if (diffHours < HOURS_PER_DAY) {
    return `il y a ${String(diffHours)}h`
  }

  const diffDays = Math.floor(diffHours / HOURS_PER_DAY)
  return `il y a ${String(diffDays)}j`
}

export function formatDuration(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${String(ms)}ms`
  }
  return `${(ms / MS_PER_SECOND).toFixed(1)}s`
}
