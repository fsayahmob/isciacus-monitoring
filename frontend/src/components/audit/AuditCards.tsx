/**
 * Audit Cards - Reusable card components for audit results
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
        <h1 className="font-serif text-3xl text-burgundy">Résultats de l'audit</h1>
        <p className="mt-1 text-gray-600">Analyse terminée</p>
      </div>
      <button
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-burgundy hover:text-burgundy"
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
  const statusClass = connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
  const iconBg = connected ? 'bg-green-100' : 'bg-red-100'
  const textColor = connected ? 'text-green-800' : 'text-red-800'
  const subtextColor = connected ? 'text-green-600' : 'text-red-600'

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
    gray: 'bg-white border-gray-200 text-gray-900',
    green: 'bg-green-50 border-green-200 text-green-600',
    amber: 'bg-amber-50 border-amber-200 text-amber-600',
    red: 'bg-red-50 border-red-200 text-red-600',
  }
  const textColors = {
    gray: 'text-gray-500',
    green: 'text-green-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
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
      return 'bg-green-500'
    }
    if (percentage >= WARNING_THRESHOLD) {
      return 'bg-amber-500'
    }
    return 'bg-red-500'
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">{label}</span>
        <span className="text-2xl font-bold text-gray-900">{String(percentage)}%</span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-3 rounded-full transition-all ${getColor()}`}
          style={{ width: `${String(percentage)}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-gray-500">
        {String(tracked)} / {String(total)} trackés
      </p>
    </div>
  )
}

export function MissingCollections({ collections }: { collections: string[] }): React.ReactElement {
  return (
    <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <h3 className="mb-3 flex items-center gap-2 font-medium text-amber-900">
        <WarningIcon />
        Collections non trackées dans GA4
      </h3>
      <div className="flex flex-wrap gap-2">
        {collections.map((collection) => (
          <span
            key={collection}
            className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800"
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
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-medium text-gray-900">Détail des vérifications</h3>
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
    ok: 'border-l-green-500 bg-green-50/50',
    warning: 'border-l-amber-500 bg-amber-50/50',
    error: 'border-l-red-500 bg-red-50/50',
  }
  const badgeStyles = {
    ok: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
  }
  const icons = { ok: '✓', warning: '⚠', error: '✗' }
  return (
    <div className={`rounded-lg border-l-4 p-4 ${statusStyles[check.status]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">{check.name}</h4>
          <p className="mt-1 text-sm text-gray-600">{check.message}</p>
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
        <div className="mt-3 rounded-lg bg-blue-50 p-3">
          <p className="text-xs text-blue-800">
            <strong>Recommandation:</strong> {check.recommendation}
          </p>
        </div>
      )}
    </div>
  )
}

function CheckDetails({ details }: { details: string[] }): React.ReactElement {
  return (
    <div className="mt-3 rounded-lg bg-white/80 p-3">
      <p className="mb-1 text-xs font-medium text-gray-500">Détails:</p>
      <ul className="space-y-1">
        {details.slice(0, MAX_DETAILS_SHOWN).map((detail) => (
          <li key={detail} className="flex items-start gap-2 text-xs text-gray-600">
            <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-gray-400" />
            {detail}
          </li>
        ))}
        {details.length > MAX_DETAILS_SHOWN && (
          <li className="text-xs text-gray-400">
            +{String(details.length - MAX_DETAILS_SHOWN)} autres...
          </li>
        )}
      </ul>
    </div>
  )
}
