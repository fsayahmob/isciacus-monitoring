/**
 * GMC Flow Constants - Shared constants for the GMC pipeline visualization
 */

export const HIGH_APPROVAL_THRESHOLD = 95
export const MEDIUM_APPROVAL_THRESHOLD = 80
export const PERCENTAGE_MULTIPLIER = 100

export function getApprovalRateColor(rate: number): string {
  if (rate >= HIGH_APPROVAL_THRESHOLD) {
    return 'bg-success/20 text-success'
  }
  if (rate >= MEDIUM_APPROVAL_THRESHOLD) {
    return 'bg-warning/20 text-warning'
  }
  return 'bg-error/20 text-error'
}
