/**
 * FunnelBar Component - Individual funnel stage bar
 */

import type { BenchmarkEvaluation, FunnelStage } from '../../../types/analytics'

const FUNNEL_COLORS = [
  'bg-burgundy',
  'bg-burgundy/80',
  'bg-burgundy/60',
  'bg-burgundy/40',
  'bg-burgundy/30',
]
const PERCENT_100 = 100

interface FunnelBarProps {
  stage: FunnelStage
  maxValue: number
  index: number
}

function getBenchmarkColor(status: string | undefined): string {
  switch (status) {
    case 'good':
      return 'text-green-600'
    case 'ok':
      return 'text-yellow-600'
    case 'bad':
      return 'text-red-600'
    default:
      return 'text-gray-400'
  }
}

function getBenchmarkIcon(status: string | undefined): string {
  switch (status) {
    case 'good':
      return '✓'
    case 'ok':
      return '~'
    case 'bad':
      return '✗'
    default:
      return ''
  }
}

function getBenchmarkRange(benchmark: BenchmarkEvaluation | undefined): string {
  if (benchmark?.threshold === undefined) {
    return ''
  }
  const { ok } = benchmark.threshold
  const hasMin = typeof ok.min === 'number'
  const hasMax = typeof ok.max === 'number'

  if (hasMin && hasMax) {
    return `(${String(ok.min)}-${String(ok.max)}%)`
  }
  if (hasMin) {
    return `(>${String(ok.min)}%)`
  }
  if (hasMax) {
    return `(<${String(ok.max)}%)`
  }
  return ''
}

function FunnelBarContent({ stage, benchmarkStatus, hasBenchmark }: {
  stage: FunnelStage
  benchmarkStatus: string | undefined
  hasBenchmark: boolean
}): React.ReactElement {
  return (
    <span className="flex items-center justify-end gap-1">
      <span className={`font-mono ${hasBenchmark ? getBenchmarkColor(benchmarkStatus) : 'text-gray-500'}`}>
        {stage.rate}%
      </span>
      {hasBenchmark ? (
        <span className={`text-xs ${getBenchmarkColor(benchmarkStatus)}`}>
          {getBenchmarkIcon(benchmarkStatus)}
        </span>
      ) : null}
    </span>
  )
}

export function FunnelBar({ stage, maxValue, index }: FunnelBarProps): React.ReactElement {
  const requiresGA4 = stage.benchmark_status === 'requires_ga4'
  const width = maxValue > 0 && !requiresGA4 ? (stage.value / maxValue) * PERCENT_100 : 0
  const colorClass = requiresGA4 ? 'bg-gray-300' : (FUNNEL_COLORS[index] ?? 'bg-burgundy/20')

  const benchmarkStatus = stage.benchmark_status
  const hasBenchmark = stage.benchmark !== undefined && benchmarkStatus !== 'requires_ga4'
  const benchmarkRange = getBenchmarkRange(stage.benchmark)

  const nameClass = `w-28 flex-shrink-0 text-right text-sm ${requiresGA4 ? 'text-gray-400' : 'text-gray-600'}`
  const valueClass = `w-16 flex-shrink-0 text-right font-mono text-sm ${requiresGA4 ? 'text-gray-400' : ''}`
  const rateClass = `w-28 flex-shrink-0 text-right text-sm ${requiresGA4 ? 'text-gray-400' : ''}`

  return (
    <div className="flex items-center gap-3">
      <div className={nameClass}>{stage.name}</div>
      <div className="flex-1 min-w-0">
        {requiresGA4 ? (
          <div className="flex h-8 items-center rounded bg-gray-100 px-3">
            <span className="text-xs text-gray-400 italic">Requiert GA4</span>
          </div>
        ) : (
          <div className="h-8 w-full rounded bg-gray-100 overflow-hidden">
            <div
              className={`h-8 rounded ${colorClass} transition-all duration-300`}
              style={{ width: `${String(Math.min(width, PERCENT_100))}%` }}
            />
          </div>
        )}
      </div>
      <div className={valueClass}>
        {requiresGA4 ? '—' : stage.value.toLocaleString('fr-FR')}
      </div>
      <div className={rateClass}>
        {requiresGA4 ? '—' : (
          <FunnelBarContent
            benchmarkStatus={benchmarkStatus}
            hasBenchmark={hasBenchmark}
            stage={stage}
          />
        )}
      </div>
      <div className="w-24 flex-shrink-0 text-right text-xs text-gray-400">
        {hasBenchmark && benchmarkRange !== '' ? benchmarkRange : stage.rate_label ?? ''}
      </div>
    </div>
  )
}
