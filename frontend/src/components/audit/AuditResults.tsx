/**
 * Audit Results - Display audit results with progressive checklist
 */
/* eslint-disable max-lines, max-lines-per-function, complexity, no-magic-numbers, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/restrict-template-expressions */

import React from 'react'

import type {
  TrackingAuditData,
  TrackingCoverageItem,
  TrackingCoverageSection,
  AuditCheck,
} from '../../services/api'

const PERCENT_100 = 100
const GOOD_THRESHOLD = 90
const WARNING_THRESHOLD = 70
const MAX_DETAILS_SHOWN = 5
const MAX_ITEMS_COLLAPSED = 5

export function AuditResults({
  audit,
  onRefresh,
}: {
  audit: TrackingAuditData
  onRefresh: () => void
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-cream-dark p-6">
      <ResultsHeader onRefresh={onRefresh} />
      <ConnectionStatus connected={audit.ga4_connected} />
      <SummaryCards summary={audit.summary} />

      {/* Progressive Checklist Section */}
      {audit.tracking_coverage !== null && (
        <TrackingCoverageChecklist coverage={audit.tracking_coverage} />
      )}

      {/* Legacy coverage charts for backward compatibility */}
      {audit.tracking_coverage === null && <CoverageSection audit={audit} />}

      {audit.collections_coverage.missing.length > 0 && audit.tracking_coverage === null && (
        <MissingCollections collections={audit.collections_coverage.missing} />
      )}

      <ChecksSection checks={audit.checks} />
    </div>
  )
}

function ResultsHeader({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
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
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Relancer
      </button>
    </div>
  )
}

function ConnectionStatus({ connected }: { connected: boolean }): React.ReactElement {
  const statusClass = connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
  const iconBg = connected ? 'bg-green-100' : 'bg-red-100'
  const textColor = connected ? 'text-green-800' : 'text-red-800'
  const subtextColor = connected ? 'text-green-600' : 'text-red-600'

  return (
    <div className={`mb-8 rounded-2xl border p-4 ${statusClass}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
          {connected ? (
            <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        <div>
          <p className={`font-medium ${textColor}`}>Google Analytics 4</p>
          <p className={`text-sm ${subtextColor}`}>
            {connected ? 'Connecté et opérationnel' : 'Non connecté - configurez GA4 dans les paramètres'}
          </p>
        </div>
      </div>
    </div>
  )
}

function SummaryCards({ summary }: { summary: TrackingAuditData['summary'] }): React.ReactElement {
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

// Progressive Checklist Components

function TrackingCoverageChecklist({
  coverage,
}: {
  coverage: TrackingAuditData['tracking_coverage']
}): React.ReactElement {
  return (
    <div className="mb-8 space-y-4">
      <h2 className="font-serif text-xl text-burgundy">Couverture du Tracking</h2>

      {/* Events Section - Most Important */}
      <CoverageChecklistSection
        title="Événements E-commerce"
        icon={
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        }
        section={coverage.events}
        showAll
      />

      {/* Collections Section */}
      <CoverageChecklistSection
        title="Collections"
        icon={
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        }
        section={coverage.collections}
      />

      {/* Products Section */}
      <CoverageChecklistSection
        title="Produits"
        icon={
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        }
        section={coverage.products}
        useSample
      />

      {/* Pages Section (if available) */}
      {coverage.pages !== null && (
        <CoverageChecklistSection
          title="Pages Shopify"
          icon={
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
          section={coverage.pages}
        />
      )}
    </div>
  )
}

function CoverageChecklistSection({
  title,
  icon,
  section,
  showAll = false,
  useSample = false,
}: {
  title: string
  icon: React.ReactNode
  section: TrackingCoverageSection
  showAll?: boolean
  useSample?: boolean
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const items = useSample ? section.sample : section.items
  const displayItems = showAll || expanded ? items : items?.slice(0, MAX_ITEMS_COLLAPSED)
  const hasMore = (items?.length ?? 0) > MAX_ITEMS_COLLAPSED && !showAll

  const statusColors = {
    ok: 'border-green-200 bg-green-50',
    warning: 'border-amber-200 bg-amber-50',
    error: 'border-red-200 bg-red-50',
  }

  const headerColors = {
    ok: 'text-green-700',
    warning: 'text-amber-700',
    error: 'text-red-700',
  }

  return (
    <div className={`rounded-xl border p-4 ${statusColors[section.status]}`}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={headerColors[section.status]}>{icon}</span>
          <h3 className="font-medium text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {section.tracked}/{section.total}
          </span>
          <PercentageBadge percentage={section.rate} status={section.status} />
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-white/50">
        <div
          className={`h-2 rounded-full transition-all ${getProgressColor(section.status)}`}
          style={{ width: `${section.rate}%` }}
        />
      </div>

      {/* Items Checklist */}
      {displayItems !== null && displayItems !== undefined && displayItems.length > 0 && (
        <div className="space-y-1">
          {displayItems.map((item) => (
            <ChecklistItem key={item.name} item={item} />
          ))}
        </div>
      )}

      {/* Show More / Less Toggle */}
      {hasMore && (
        <button
          className="mt-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          type="button"
          onClick={() => {
            setExpanded(!expanded)
          }}
        >
          {expanded ? (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Voir moins
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Voir {(items?.length ?? 0) - MAX_ITEMS_COLLAPSED} de plus
            </>
          )}
        </button>
      )}

      {/* Missing Items Warning */}
      {section.missing.length > 0 && !showAll && (
        <div className="mt-3 rounded-lg bg-white/70 p-2">
          <p className="text-xs font-medium text-gray-600">
            Non trackés: {section.missing.slice(0, 3).join(', ')}
            {section.missing.length > 3 && ` +${section.missing.length - 3} autres`}
          </p>
        </div>
      )}
    </div>
  )
}

function ChecklistItem({ item }: { item: TrackingCoverageItem }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/50 px-3 py-2">
      {item.tracked ? (
        <svg className="h-4 w-4 flex-shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className={`text-sm ${item.tracked ? 'text-gray-700' : 'text-gray-500'}`}>
        {item.name}
      </span>
      {item.description !== null && item.description !== undefined && (
        <span className="text-xs text-gray-400">({item.description})</span>
      )}
    </div>
  )
}

function PercentageBadge({
  percentage,
  status,
}: {
  percentage: number
  status: 'ok' | 'warning' | 'error'
}): React.ReactElement {
  const colors = {
    ok: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
  }

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {Math.round(percentage)}%
    </span>
  )
}

function getProgressColor(status: 'ok' | 'warning' | 'error'): string {
  const colors = {
    ok: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
  }
  return colors[status]
}

// Legacy Components for backward compatibility

function CoverageSection({ audit }: { audit: TrackingAuditData }): React.ReactElement {
  return (
    <div className="mb-8 grid gap-4 md:grid-cols-2">
      <CoverageChart
        label="Collections trackées"
        total={audit.collections_coverage.shopify_total}
        tracked={audit.collections_coverage.ga4_tracked}
      />
      <CoverageChart
        label="Transactions matchées"
        total={audit.transactions_match.shopify_orders}
        tracked={Math.round(audit.transactions_match.shopify_orders * audit.transactions_match.match_rate)}
      />
    </div>
  )
}

function CoverageChart({
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
        <span className="text-2xl font-bold text-gray-900">{percentage}%</span>
      </div>
      <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-3 rounded-full transition-all ${getColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-2 text-sm text-gray-500">
        {tracked} / {total} trackés
      </p>
    </div>
  )
}

function MissingCollections({ collections }: { collections: string[] }): React.ReactElement {
  return (
    <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <h3 className="mb-3 flex items-center gap-2 font-medium text-amber-900">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        Collections non trackées dans GA4
      </h3>
      <div className="flex flex-wrap gap-2">
        {collections.map((collection) => (
          <span key={collection} className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">
            {collection}
          </span>
        ))}
      </div>
    </div>
  )
}

function ChecksSection({ checks }: { checks: AuditCheck[] }): React.ReactElement {
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
        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyles[check.status]}`}>
          {icons[check.status]} {check.status.toUpperCase()}
        </span>
      </div>

      {check.details !== null && check.details !== undefined && check.details.length > 0 && <CheckDetails details={check.details} />}

      {check.recommendation !== null && check.recommendation !== undefined && (
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
          <li className="text-xs text-gray-400">+{details.length - MAX_DETAILS_SHOWN} autres...</li>
        )}
      </ul>
    </div>
  )
}
