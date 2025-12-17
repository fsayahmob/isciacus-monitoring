/**
 * Settings Utils - Utility functions for settings components
 */

const HUNDRED_PERCENT = 100

export function getProgressBarColor(configured: number, total: number): string {
  if (configured === total) {
    return 'bg-green-500'
  }
  if (configured > 0) {
    return 'bg-amber-500'
  }
  return 'bg-red-500'
}

export function getProgressWidth(configured: number, total: number): number {
  if (total === 0) {
    return 0
  }
  return (configured / total) * HUNDRED_PERCENT
}
