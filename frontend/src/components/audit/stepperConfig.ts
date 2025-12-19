/**
 * Stepper configuration - colors, animations, and status mapping
 */

import type { AuditStepStatus } from '../../services/api'

// Animation constants
export const ANIMATION = {
  SCALE_PULSE: 1.05,
  SCALE_BOUNCE: 1.2,
  OPACITY_FADED: 0.4,
  STAGGER_DELAY: 0.05,
} as const

// Status colors and icons
export const STATUS_CONFIG: Record<
  AuditStepStatus,
  { bg: string; border: string; text: string }
> = {
  pending: {
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    text: 'text-gray-400',
  },
  running: {
    bg: 'bg-blue-100',
    border: 'border-blue-400',
    text: 'text-blue-600',
  },
  success: {
    bg: 'bg-emerald-100',
    border: 'border-emerald-500',
    text: 'text-emerald-700',
  },
  warning: {
    bg: 'bg-amber-100',
    border: 'border-amber-500',
    text: 'text-amber-700',
  },
  error: {
    bg: 'bg-red-100',
    border: 'border-red-500',
    text: 'text-red-700',
  },
  skipped: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    text: 'text-gray-400',
  },
}

export function isStepCompleted(status: AuditStepStatus): boolean {
  return status === 'success' || status === 'warning' || status === 'error'
}

export function getLineColor(status: AuditStepStatus): string {
  if (status === 'success' || status === 'warning') {
    return 'bg-emerald-400'
  }
  if (status === 'error') {
    return 'bg-red-400'
  }
  return 'bg-gray-200'
}
