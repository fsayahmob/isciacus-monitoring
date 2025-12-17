/**
 * BenchmarkIndicator Component - ISCIACUS Monitoring Dashboard
 * =============================================================
 */

import type { BenchmarkEvaluation, BenchmarkStatus } from '../../types/analytics'

const STATUS_CONFIG: Record<BenchmarkStatus, { bg: string; icon: string; label: string }> = {
  bad: { bg: 'bg-red-100 text-red-800', icon: '🔴', label: 'Insuffisant' },
  ok: { bg: 'bg-yellow-100 text-yellow-800', icon: '🟡', label: 'Acceptable' },
  good: { bg: 'bg-green-100 text-green-800', icon: '🟢', label: 'Bon' },
  unknown: { bg: 'bg-gray-100 text-gray-600', icon: '⚪', label: 'Inconnu' },
}

interface BenchmarkIndicatorProps {
  evaluation: BenchmarkEvaluation | undefined
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function BenchmarkIndicator({
  evaluation,
  showLabel = false,
  size = 'md',
}: BenchmarkIndicatorProps): React.ReactElement {
  const status = evaluation?.status ?? 'unknown'
  const config = STATUS_CONFIG[status]

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded ${config.bg} ${sizeClasses[size]}`}>
      <span>{config.icon}</span>
      {showLabel ? <span>{config.label}</span> : null}
    </span>
  )
}

interface StatusDotProps {
  status: BenchmarkStatus
}

export function StatusDot({ status }: StatusDotProps): React.ReactElement {
  const config = STATUS_CONFIG[status]
  return <span title={config.label}>{config.icon}</span>
}
