/**
 * Stepper configuration - Modern Dark Theme colors, animations, and status mapping
 */

import type { AuditStepStatus } from '../../services/api'

// Animation constants
export const ANIMATION = {
  SCALE_PULSE: 1.05,
  SCALE_BOUNCE: 1.2,
  OPACITY_FADED: 0.4,
  STAGGER_DELAY: 0.05,
} as const

// Status colors and icons - Dark Theme
export const STATUS_CONFIG: Record<AuditStepStatus, { bg: string; border: string; text: string }> =
  {
    pending: {
      bg: 'bg-bg-tertiary',
      border: 'border-border-subtle',
      text: 'text-text-muted',
    },
    running: {
      bg: 'bg-info/20',
      border: 'border-info',
      text: 'text-info',
    },
    success: {
      bg: 'bg-success/20',
      border: 'border-success',
      text: 'text-success',
    },
    warning: {
      bg: 'bg-warning/20',
      border: 'border-warning',
      text: 'text-warning',
    },
    error: {
      bg: 'bg-error/20',
      border: 'border-error',
      text: 'text-error',
    },
    skipped: {
      bg: 'bg-bg-tertiary',
      border: 'border-border-subtle',
      text: 'text-text-muted',
    },
  }

export function isStepCompleted(status: AuditStepStatus): boolean {
  return status === 'success' || status === 'warning' || status === 'error'
}

export function getLineColor(status: AuditStepStatus): string {
  if (status === 'success' || status === 'warning') {
    return 'bg-success'
  }
  if (status === 'error') {
    return 'bg-error'
  }
  return 'bg-border-subtle'
}
