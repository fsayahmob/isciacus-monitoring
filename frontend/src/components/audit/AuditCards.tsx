/**
 * Audit Cards - Reusable card components for audit results
 * Modern Dark Theme
 */

import type { AuditCheck, TrackingAuditData } from '../../services/api'
import { CheckIcon, RefreshIcon, WarningIcon, XIcon } from './AuditIcons'

const PERCENT_100 = 100
const GOOD_THRESHOLD = 90
const WARNING_THRESHOLD = 70
const MAX_DETAILS_SHOWN = 5

export function ResultsHeader({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <div className="mb-8 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-semibold text-text-primary">Résultats de l'audit</h1>
        <p className="mt-1 text-text-secondary">Analyse terminée</p>
      </div>
      <button
        className="btn btn-secondary flex items-center gap-2"
        type="button"
        onClick={onRefresh}
      >
        <RefreshIcon />
        Relancer
      </button>
    </div>
  )
}

export function ConnectionStatus({ connected }: { connected: boolean }): React.ReactElement {
  const statusClass = connected
    ? 'bg-success/10 border-success/30'
    : 'bg-error/10 border-error/30'
  const iconBg = connected ? 'bg-success/20' : 'bg-error/20'
  const textColor = connected ? 'text-success' : 'text-error'
  const subtextColor = connected ? 'text-success/80' : 'text-error/80'

  return (
    <div className={`mb-8 rounded-2xl border p-4 ${statusClass}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
          {connected ? <CheckIcon /> : <XIcon />}
        </div>
        <div>
          <p className={`font-medium ${textColor}`}>Google Analytics 4</p>
          <p className={`text-sm ${subtextColor}`}>
            {connected
              ? 'Connecté et opérationnel'
              : 'Non connecté - configurez GA4 dans les paramètres'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function SummaryCards({
  summary,
}: {
  summary: TrackingAuditData['summary']
}): React.ReactElement {
  return (
    <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
      <SummaryCard count={summary.total_checks} label="Vérifications" color="gray" />
      <SummaryCard count={summary.passed} label="OK" color="green" />
      <SummaryCard count={summary.warnings} label="Avertissements" color="amber" />
      <SummaryCard count={summary.errors} label="Erreurs" color="red" />
    </div>
  )
}

function SummaryCard({
  count,
  label,
  color,
}: {
  count: number
  label: string
  color: 'gray' | 'green' | 'amber' | 'red'
}): React.ReactElement {
  const colors = {
    gray: 'bg-bg-secondary border-border-default text-text-primary',
    green: 'bg-success/10 border-success/30 text-success',
    amber: 'bg-warning/10 border-warning/30 text-warning',
    red: 'bg-error/10 border-error/30 text-error',
  }
  const textColors = {
    gray: 'text-text-secondary',
    green: 'text-success/80',
    amber: 'text-warning/80',
    red: 'text-error/80',
  }
  return (
    <div className={`rounded-xl border p-4 text-center ${colors[color]}`}>
      <div className="text-3xl font-bold">{count}</div>
      <div className={`mt-1 text-xs font-medium ${textColors[color]}`}>{label}</div>
    </div>
  )
}

export function CoverageChart({
  tracked,
  total,
  label,
}: {
  tracked: number
  total: number
  label: string
}): React.ReactElement {
  const percentage = total > 0 ? Math.round((tracked / total) * PERCENT_100) : 0
  const getColor = (): string => {
    if (percentage >= GOOD_THRESHOLD) {
      return 'bg-success'
    }
    if (percentage >= WARNING_THRESHOLD) {
      return 'bg-warning'
    }
    return 'bg-error'
  }
  return (
    <div className="card-elevated rounded-xl p-5">
      <div className="flex items-center justify-between">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-2xl font-bold text-text-primary">{String(percentage)}%</span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className={`h-3 rounded-full transition-all ${getColor()}`}
          style={{ width: `${String(percentage)}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-text-tertiary">
        {String(tracked)} / {String(total)} trackés
      </p>
    </div>
  )
}

export function MissingCollections({ collections }: { collections: string[] }): React.ReactElement {
  return (
    <div className="mb-8 rounded-xl border border-warning/30 bg-warning/10 p-5">
      <h3 className="mb-3 flex items-center gap-2 font-medium text-warning">
        <WarningIcon />
        Collections non trackées dans GA4
      </h3>
      <div className="flex flex-wrap gap-2">
        {collections.map((collection) => (
          <span
            key={collection}
            className="rounded-full bg-warning/20 px-3 py-1 text-sm text-warning"
          >
            {collection}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ChecksSection({ checks }: { checks: AuditCheck[] }): React.ReactElement {
  return (
    <div className="card-elevated rounded-2xl p-6">
      <h3 className="mb-4 font-medium text-text-primary">Détail des vérifications</h3>
      <div className="space-y-4">
        {checks.map((check) => (
          <AuditCheckCard key={check.name} check={check} />
        ))}
      </div>
    </div>
  )
}

function AuditCheckCard({ check }: { check: AuditCheck }): React.ReactElement {
  const statusStyles = {
    ok: 'border-l-success bg-success/10',
    warning: 'border-l-warning bg-warning/10',
    error: 'border-l-error bg-error/10',
  }
  const badgeStyles = {
    ok: 'bg-success/20 text-success',
    warning: 'bg-warning/20 text-warning',
    error: 'bg-error/20 text-error',
  }
  const icons = { ok: '✓', warning: '⚠', error: '✗' }
  return (
    <div className={`rounded-lg border-l-4 p-4 ${statusStyles[check.status]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-medium text-text-primary">{check.name}</h4>
          <p className="mt-1 text-sm text-text-secondary">{check.message}</p>
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyles[check.status]}`}
        >
          {icons[check.status]} {check.status.toUpperCase()}
        </span>
      </div>
      {check.details !== undefined && check.details.length > 0 && (
        <CheckDetails details={check.details} />
      )}
      {check.recommendation !== undefined && (
        <div className="mt-3 rounded-lg bg-info/10 p-3">
          <p className="text-xs text-info">
            <strong>Recommandation:</strong> {check.recommendation}
          </p>
        </div>
      )}
    </div>
  )
}

function CheckDetails({ details }: { details: string[] }): React.ReactElement {
  return (
    <div className="mt-3 rounded-lg bg-bg-tertiary/50 p-3">
      <p className="mb-1 text-xs font-medium text-text-tertiary">Détails:</p>
      <ul className="space-y-1">
        {details.slice(0, MAX_DETAILS_SHOWN).map((detail) => (
          <li key={detail} className="flex items-start gap-2 text-xs text-text-secondary">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-text-muted" />
            {detail}
          </li>
        ))}
        {details.length > MAX_DETAILS_SHOWN && (
          <li className="text-xs text-text-muted">
            +{String(details.length - MAX_DETAILS_SHOWN)} autres...
          </li>
        )}
      </ul>
    </div>
  )
}
