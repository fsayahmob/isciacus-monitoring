/**
 * Filter Components - Reusable filter UI elements
 * ================================================
 */

import { STOCK_LEVEL_LABELS } from '../../constants'
import type { ProductFilters } from '../../types/product'

interface FilterSelectProps {
  value: string
  placeholder: string
  options: string[]
  onChange: (value: string) => void
}

export function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
}: FilterSelectProps): React.ReactElement {
  return (
    <select
      className="filter-select"
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

export function StockLevelSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}): React.ReactElement {
  return (
    <select
      className="filter-select"
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
      }}
    >
      <option value="">Stock (tous)</option>
      {Object.entries(STOCK_LEVEL_LABELS).map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  )
}

export function BooleanFilterSelect({
  value,
  placeholder,
  withLabel,
  withoutLabel,
  onChange,
}: {
  value: string
  placeholder: string
  withLabel: string
  withoutLabel: string
  onChange: (v: string) => void
}): React.ReactElement {
  return (
    <select
      className="filter-select"
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
      }}
    >
      <option value="">{placeholder}</option>
      <option value="true">{withLabel}</option>
      <option value="false">{withoutLabel}</option>
    </select>
  )
}

interface ActiveFilterBadgeProps {
  filterKey: string
  value: string
  onClear: () => void
}

export function ActiveFilterBadge({
  filterKey,
  value,
  onClear,
}: ActiveFilterBadgeProps): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-brand px-2 py-1 text-xs text-white">
      {filterKey}: {value}
      <button className="hover:text-white/70" type="button" onClick={onClear}>
        &times;
      </button>
    </span>
  )
}

export function ActiveFiltersDisplay({
  filters,
  onClearFilter,
}: {
  filters: ProductFilters
  onClearFilter: (key: string) => void
}): React.ReactElement {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {Object.entries(filters).map(([key, value]) => {
        if (value === undefined || value === '') {
          return null
        }
        return (
          <ActiveFilterBadge
            key={key}
            filterKey={key}
            value={String(value)}
            onClear={() => {
              onClearFilter(key)
            }}
          />
        )
      })}
    </div>
  )
}
