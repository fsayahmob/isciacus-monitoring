/**
 * FilterBar Component - ISCIACUS Monitoring Dashboard
 * ====================================================
 */

import { useCallback } from 'react'

import { STOCK_LEVEL_LABELS } from '../constants'
import { useFilters } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'

export function FilterBar(): JSX.Element {
  const { filters, updateFilter, clearFilters } = useAppStore()
  const { tags, channels, collections } = useFilters()

  const handleFilterChange = useCallback(
    (key: string, value: string): void => {
      updateFilter(key as keyof typeof filters, value)
    },
    [updateFilter, filters]
  )

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== ''
  ).length

  return (
    <div className="border-b border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Stock Filter */}
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          value={filters.stock_level ?? ''}
          onChange={(e) => {
            handleFilterChange('stock_level', e.target.value)
          }}
        >
          <option value="">Stock (tous)</option>
          {Object.entries(STOCK_LEVEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {/* Publication Filter */}
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          value={filters.publie ?? ''}
          onChange={(e) => {
            handleFilterChange('publie', e.target.value)
          }}
        >
          <option value="">Publication (tous)</option>
          <option value="true">Publié</option>
          <option value="false">Non publié</option>
        </select>

        {/* Status Filter */}
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          value={filters.statut ?? ''}
          onChange={(e) => {
            handleFilterChange('statut', e.target.value)
          }}
        >
          <option value="">Statut (tous)</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Brouillon</option>
          <option value="ARCHIVED">Archivé</option>
        </select>

        {/* Channel Filter */}
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          value={filters.channel ?? ''}
          onChange={(e) => {
            handleFilterChange('channel', e.target.value)
          }}
        >
          <option value="">Canal de vente (tous)</option>
          {channels.map((channel) => (
            <option key={channel} value={channel}>
              {channel}
            </option>
          ))}
        </select>

        {/* Collection Filter */}
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          value={filters.collection ?? ''}
          onChange={(e) => {
            handleFilterChange('collection', e.target.value)
          }}
        >
          <option value="">Collection (toutes)</option>
          {collections.map((collection) => (
            <option key={collection} value={collection}>
              {collection}
            </option>
          ))}
        </select>

        {/* Tags Filter */}
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
          value={filters.tag ?? ''}
          onChange={(e) => {
            handleFilterChange('tag', e.target.value)
          }}
        >
          <option value="">Tags (tous)</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>

        {/* Clear Filters */}
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

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(filters).map(([key, value]) => {
            if (value === undefined || value === '') {
              return null
            }
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded bg-burgundy px-2 py-1 text-xs text-white"
              >
                {key}: {String(value)}
                <button
                  className="hover:text-cream-dark"
                  type="button"
                  onClick={() => {
                    handleFilterChange(key, '')
                  }}
                >
                  &times;
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
