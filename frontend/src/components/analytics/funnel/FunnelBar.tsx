/**
 * FunnelBar Component - Individual funnel stage bar
 */

import type { BenchmarkEvaluation, FunnelStage } from '../../../types/analytics'

const FUNNEL_COLORS = ['bg-brand', 'bg-brand/80', 'bg-brand/60', 'bg-brand/40', 'bg-brand/30']
const PERCENT_100 = 100

interface FunnelBarProps {
  stage: FunnelStage
  maxValue: number
  index: number
}

function getBenchmarkColor(status: string | undefined): string {
  switch (status) {
    case 'good':
      return 'text-success'
    case 'ok':
      return 'text-warning'
    case 'bad':
      return 'text-error'
    default:
      return 'text-text-muted'
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

function FunnelBarContent({
  stage,
  benchmarkStatus,
  hasBenchmark,
}: {
  stage: FunnelStage
  benchmarkStatus: string | undefined
  hasBenchmark: boolean
}): React.ReactElement {
  return (
    <span className="flex items-center justify-end gap-1">
      <span
        className={`font-mono ${hasBenchmark ? getBenchmarkColor(benchmarkStatus) : 'text-text-tertiary'}`}
      >
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
  const colorClass = requiresGA4 ? 'bg-bg-tertiary' : (FUNNEL_COLORS[index] ?? 'bg-brand/20')

  const benchmarkStatus = stage.benchmark_status
  const hasBenchmark = stage.benchmark !== undefined && benchmarkStatus !== 'requires_ga4'
  const benchmarkRange = getBenchmarkRange(stage.benchmark)

  const nameClass = `w-28 flex-shrink-0 text-right text-sm ${requiresGA4 ? 'text-text-muted' : 'text-text-secondary'}`
  const valueClass = `w-16 flex-shrink-0 text-right font-mono text-sm ${requiresGA4 ? 'text-text-muted' : 'text-text-primary'}`
  const rateClass = `w-28 flex-shrink-0 text-right text-sm ${requiresGA4 ? 'text-text-muted' : ''}`

  return (
    <div className="flex items-center gap-3">
      <div className={nameClass}>{stage.name}</div>
      <div className="flex-1 min-w-0">
        {requiresGA4 ? (
          <div className="flex h-8 items-center rounded bg-bg-tertiary px-3">
            <span className="text-xs text-text-muted italic">Requiert GA4</span>
          </div>
        ) : (
          <div className="h-8 w-full rounded bg-bg-tertiary overflow-hidden">
            <div
              className={`h-8 rounded ${colorClass} transition-all duration-300`}
              style={{ width: `${String(Math.min(width, PERCENT_100))}%` }}
            />
          </div>
        )}
      </div>
      <div className={valueClass}>{requiresGA4 ? '—' : stage.value.toLocaleString('fr-FR')}</div>
      <div className={rateClass}>
        {requiresGA4 ? (
          '—'
        ) : (
          <FunnelBarContent
            benchmarkStatus={benchmarkStatus}
            hasBenchmark={hasBenchmark}
            stage={stage}
          />
        )}
      </div>
      <div className="w-24 flex-shrink-0 text-right text-xs text-text-muted">
        {hasBenchmark && benchmarkRange !== '' ? benchmarkRange : (stage.rate_label ?? '')}
      </div>
    </div>
  )
}
