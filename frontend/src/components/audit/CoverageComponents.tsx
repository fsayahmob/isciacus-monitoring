/**
 * Coverage Components - Reusable tracking coverage display components
 */

import React from 'react'

import type { TrackingCoverageItem, TrackingCoverageSection } from '../../services/api'

const MAX_ITEMS_COLLAPSED = 5
const MAX_MISSING_PREVIEW = 3

const STATUS_COLORS = {
  ok: 'border-green-200 bg-green-50',
  warning: 'border-amber-200 bg-amber-50',
  error: 'border-red-200 bg-red-50',
}

const HEADER_COLORS = {
  ok: 'text-green-700',
  warning: 'text-amber-700',
  error: 'text-red-700',
}

const PROGRESS_COLORS = {
  ok: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
}

export function PercentageBadge({
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

function SectionHeader({
  title,
  icon,
  section,
}: {
  title: string
  icon: React.ReactNode
  section: TrackingCoverageSection
}): React.ReactElement {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={HEADER_COLORS[section.status]}>{icon}</span>
        <h3 className="font-medium text-gray-900">{title}</h3>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">
          {String(section.tracked)}/{String(section.total)}
        </span>
        <PercentageBadge percentage={section.rate} status={section.status} />
      </div>
    </div>
  )
}

function ExpandToggleButton({
  expanded,
  remainingCount,
  onToggle,
}: {
  expanded: boolean
  remainingCount: number
  onToggle: () => void
}): React.ReactElement {
  return (
    <button
      className="mt-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      type="button"
      onClick={onToggle}
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
          Voir {String(remainingCount)} de plus
        </>
      )}
    </button>
  )
}

function MissingItemsPreview({ missing }: { missing: string[] }): React.ReactElement {
  const preview = missing.slice(0, MAX_MISSING_PREVIEW).join(', ')
  const hasMore = missing.length > MAX_MISSING_PREVIEW
  const remaining = missing.length - MAX_MISSING_PREVIEW

  return (
    <div className="mt-3 rounded-lg bg-white/70 p-2">
      <p className="text-xs font-medium text-gray-600">
        Non trackés: {preview}
        {hasMore && ` +${String(remaining)} autres`}
      </p>
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
      {item.description !== undefined && (
        <span className="text-xs text-gray-400">({item.description})</span>
      )}
    </div>
  )
}

function ProgressBar({ rate, status }: { rate: number; status: 'ok' | 'warning' | 'error' }): React.ReactElement {
  return (
    <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-white/50">
      <div
        className={`h-2 rounded-full transition-all ${PROGRESS_COLORS[status]}`}
        style={{ width: `${String(rate)}%` }}
      />
    </div>
  )
}

function ItemsList({ items }: { items: TrackingCoverageItem[] }): React.ReactElement {
  return (
    <div className="space-y-1">
      {items.map((item) => (
        <ChecklistItem key={item.name} item={item} />
      ))}
    </div>
  )
}

function getItems(
  section: TrackingCoverageSection,
  useSample: boolean
): TrackingCoverageItem[] | undefined {
  return useSample ? section.sample : section.items
}

function getDisplayItems(
  items: TrackingCoverageItem[] | undefined,
  showAll: boolean,
  expanded: boolean
): TrackingCoverageItem[] | undefined {
  if (showAll || expanded) { return items }
  return items?.slice(0, MAX_ITEMS_COLLAPSED)
}

export function CoverageChecklistSection({
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
  const items = getItems(section, useSample)
  const displayItems = getDisplayItems(items, showAll, expanded)
  const itemsLength = items?.length ?? 0
  const hasMore = itemsLength > MAX_ITEMS_COLLAPSED && !showAll
  const remainingCount = itemsLength - MAX_ITEMS_COLLAPSED
  const showMissing = section.missing.length > 0 && !showAll
  const hasDisplayItems = displayItems !== undefined && displayItems.length > 0

  return (
    <div className={`rounded-xl border p-4 ${STATUS_COLORS[section.status]}`}>
      <SectionHeader title={title} icon={icon} section={section} />
      <ProgressBar rate={section.rate} status={section.status} />
      {hasDisplayItems && <ItemsList items={displayItems} />}
      {hasMore && <ExpandToggleButton expanded={expanded} remainingCount={remainingCount} onToggle={() => { setExpanded(!expanded) }} />}
      {showMissing && <MissingItemsPreview missing={section.missing} />}
    </div>
  )
}
