/**
 * FilterBar Component - ISCIACUS Monitoring Dashboard
 * ====================================================
 */

import { useCallback } from 'react'

import { useFilters } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'
import type { ProductFilters } from '../types/product'
import {
  ActiveFiltersDisplay,
  BooleanFilterSelect,
  FilterSelect,
  StockLevelSelect,
} from './filters'

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
        channels={channels}
        collections={collections}
        filters={filters}
        tags={tags}
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
    <div className="border-b border-border-default bg-bg-secondary p-4">
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
            className="ml-2 text-sm text-brand hover:underline"
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
