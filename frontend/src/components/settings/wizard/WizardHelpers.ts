/**
 * Configuration Wizard Helper Functions
 */

import type { CheckStatus } from './types'

export function getStatusBg(status: CheckStatus): string {
  switch (status) {
    case 'success':
      return 'bg-success/10 border-success/30'
    case 'warning':
      return 'bg-warning/10 border-warning/30'
    case 'error':
      return 'bg-error/10 border-error/30'
    case 'loading':
      return 'bg-info/10 border-info/30'
    default:
      return 'bg-bg-tertiary border-border-subtle'
  }
}

export function getOverallIconBg(status: string): string {
  if (status === 'ready') {
    return 'bg-success/20'
  }
  if (status === 'loading') {
    return 'bg-info/20'
  }
  if (status === 'partial') {
    return 'bg-warning/20'
  }
  return 'bg-error/20'
}

export const OVERALL_COLORS: Record<string, string> = {
  ready: 'border-success/30 bg-success/5',
  partial: 'border-warning/30 bg-warning/5',
  not_ready: 'border-error/30 bg-error/5',
  loading: 'border-info/30 bg-info/5',
}

export const OVERALL_LABELS: Record<string, string> = {
  ready: 'Prêt pour les audits',
  partial: 'Configuration partielle',
  not_ready: 'Configuration requise',
  loading: 'Vérification en cours...',
}

export const OVERALL_BADGE_COLORS: Record<string, string> = {
  ready: 'bg-success/20 text-success',
  partial: 'bg-warning/20 text-warning',
  not_ready: 'bg-error/20 text-error',
  loading: 'bg-info/20 text-info',
}
