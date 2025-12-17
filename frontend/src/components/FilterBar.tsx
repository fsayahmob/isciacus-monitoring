/**
 * FilterBar Component - ISCIACUS Monitoring Dashboard
 * ====================================================
 */

import { useCallback } from 'react'

import { STOCK_LEVEL_LABELS } from '../constants'
import { useFilters } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'
import type { ProductFilters } from '../types/product'

interface FilterSelectProps {
  value: string
  placeholder: string
  options: string[]
  onChange: (value: string) => void
}

function FilterSelect({
  value,
  placeholder,
  options,
  onChange,
}: FilterSelectProps): React.ReactElement {
  return (
    <select
      className="rounded border border-gray-300 px-3 py-1.5 text-sm"
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

function StockLevelSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}): React.ReactElement {
  return (
    <select
      className="rounded border border-gray-300 px-3 py-1.5 text-sm"
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

function BooleanFilterSelect({
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
      className="rounded border border-gray-300 px-3 py-1.5 text-sm"
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

function ActiveFilterBadge({
  filterKey,
  value,
  onClear,
}: ActiveFilterBadgeProps): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-burgundy px-2 py-1 text-xs text-white">
      {filterKey}: {value}
      <button className="hover:text-cream-dark" type="button" onClick={onClear}>
        &times;
      </button>
    </span>
  )
}

function ActiveFiltersDisplay({
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

const PUBLICATION_OPTIONS = ['true', 'false']
const STATUS_OPTIONS = ['ACTIVE', 'DRAFT', 'ARCHIVED']

function StatusFilters({
  filters,
  onFilterChange,
}: {
  filters: ProductFilters
  onFilterChange: (key: string, value: string) => void
}): React.ReactElement {
  return (
    <>
      <StockLevelSelect
        value={filters.stock_level ?? ''}
        onChange={(v) => {
          onFilterChange('stock_level', v)
        }}
      />
      <FilterSelect
        options={PUBLICATION_OPTIONS}
        placeholder="Publication (tous)"
        value={filters.publie ?? ''}
        onChange={(v) => {
          onFilterChange('publie', v)
        }}
      />
      <FilterSelect
        options={STATUS_OPTIONS}
        placeholder="Statut (tous)"
        value={filters.statut ?? ''}
        onChange={(v) => {
          onFilterChange('statut', v)
        }}
      />
    </>
  )
}

function CategoryFilters({
  filters,
  tags,
  channels,
  collections,
  onFilterChange,
}: {
  filters: ProductFilters
  tags: string[]
  channels: string[]
  collections: string[]
  onFilterChange: (key: string, value: string) => void
}): React.ReactElement {
  return (
    <>
      <FilterSelect
        options={channels}
        placeholder="Canal de vente (tous)"
        value={filters.channel ?? ''}
        onChange={(v) => {
          onFilterChange('channel', v)
        }}
      />
      <FilterSelect
        options={collections}
        placeholder="Collection (toutes)"
        value={filters.collection ?? ''}
        onChange={(v) => {
          onFilterChange('collection', v)
        }}
      />
      <FilterSelect
        options={tags}
        placeholder="Tags (tous)"
        value={filters.tag ?? ''}
        onChange={(v) => {
          onFilterChange('tag', v)
        }}
      />
    </>
  )
}

function ContentFilters({
  filters,
  onFilterChange,
}: {
  filters: ProductFilters
  onFilterChange: (key: string, value: string) => void
}): React.ReactElement {
  return (
    <>
      <BooleanFilterSelect
        placeholder="Image (tous)"
        value={filters.has_image ?? ''}
        withLabel="Avec image"
        withoutLabel="Sans image"
        onChange={(v) => {
          onFilterChange('has_image', v)
        }}
      />
      <BooleanFilterSelect
        placeholder="Prix (tous)"
        value={filters.has_price ?? ''}
        withLabel="Avec prix"
        withoutLabel="Sans prix"
        onChange={(v) => {
          onFilterChange('has_price', v)
        }}
      />
      <BooleanFilterSelect
        placeholder="Description (tous)"
        value={filters.has_description ?? ''}
        withLabel="Avec description"
        withoutLabel="Sans description"
        onChange={(v) => {
          onFilterChange('has_description', v)
        }}
      />
    </>
  )
}

function FilterControls({
  filters,
  tags,
  channels,
  collections,
  onFilterChange,
}: {
  filters: ProductFilters
  tags: string[]
  channels: string[]
  collections: string[]
  onFilterChange: (key: string, value: string) => void
}): React.ReactElement {
  return (
    <>
      <StatusFilters filters={filters} onFilterChange={onFilterChange} />
      <CategoryFilters
        filters={filters}
        tags={tags}
        channels={channels}
        collections={collections}
        onFilterChange={onFilterChange}
      />
      <ContentFilters filters={filters} onFilterChange={onFilterChange} />
    </>
  )
}

export function FilterBar(): React.ReactElement {
  const { filters, updateFilter, clearFilters } = useAppStore()
  const { tags, channels, collections } = useFilters()

  const handleFilterChange = useCallback(
    (key: string, value: string): void => {
      updateFilter(key as keyof ProductFilters, value)
    },
    [updateFilter]
  )

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== ''
  ).length

  return (
    <div className="border-b border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterControls
          channels={channels}
          collections={collections}
          filters={filters}
          tags={tags}
          onFilterChange={handleFilterChange}
        />
        {activeFiltersCount > 0 && (
          <button
            className="ml-2 text-sm text-burgundy hover:underline"
            type="button"
            onClick={clearFilters}
          >
            Effacer filtres ({activeFiltersCount})
          </button>
        )}
      </div>
      {activeFiltersCount > 0 && (
        <ActiveFiltersDisplay
          filters={filters}
          onClearFilter={(key) => {
            handleFilterChange(key, '')
          }}
        />
      )}
    </div>
  )
}
