/**
 * Date formatting utilities for audit cards.
 */

// Time conversion constants
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_WEEK = 7
const DAYS_PER_MONTH = 30

const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE
const MS_PER_HOUR = MS_PER_MINUTE * MINUTES_PER_HOUR
const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY

function formatRelativeTime(diffMs: number, date: Date): string {
  const diffMinutes = Math.floor(diffMs / MS_PER_MINUTE)
  const diffHours = Math.floor(diffMs / MS_PER_HOUR)
  const diffDays = Math.floor(diffMs / MS_PER_DAY)

  if (diffMinutes < 1) { return "À l'instant" }
  if (diffMinutes < MINUTES_PER_HOUR) { return `Il y a ${String(diffMinutes)} min` }
  if (diffHours < HOURS_PER_DAY) { return `Il y a ${String(diffHours)}h` }
  if (diffDays === 1) { return 'Hier' }
  if (diffDays < DAYS_PER_WEEK) { return `Il y a ${String(diffDays)} jours` }
  if (diffDays < DAYS_PER_MONTH) {
    const weeks = Math.floor(diffDays / DAYS_PER_WEEK)
    return `Il y a ${String(weeks)} sem.`
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Format a date for display in relative format.
 * Examples: "À l'instant", "Il y a 5 min", "Hier", "Il y a 3 jours"
 */
export function formatLastRunDate(dateString: string | null): string | null {
  if (dateString === null) { return null }
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) { return null }
    return formatRelativeTime(Date.now() - date.getTime(), date)
  } catch {
    return null
  }
}
