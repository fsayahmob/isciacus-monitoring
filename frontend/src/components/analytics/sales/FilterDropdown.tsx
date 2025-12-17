/**
 * FilterDropdown Component - Tag/Collection selector for sales analysis
 */

import type { AvailableFilters } from '../../../types/analytics'

type FilterType = 'tag' | 'collection'

interface FilterDropdownProps {
  filterType: FilterType
  selectedTag: string | null
  selectedCollection: string | null
  filters: AvailableFilters | undefined
  filtersLoading: boolean
  onChange: (value: string) => void
  showAllCatalog?: boolean
  onToggleAllCatalog?: () => void
}

function getOptions(
  filterType: FilterType,
  filters: AvailableFilters | undefined
): { key: string; value: string; label: string }[] {
  if (filters === undefined) {
    return []
  }
  if (filterType === 'tag') {
    return filters.tags.map((tag) => ({ key: tag, value: tag, label: tag }))
  }
  return filters.collections.map((coll) => ({ key: coll.id, value: coll.id, label: coll.name }))
}

function TagInfo({
  filters,
}: {
  filters: AvailableFilters | undefined
}): React.ReactElement | null {
  if (filters === undefined) {
    return null
  }
  const tagCount = filters.tags.length
  const sourceLabel = filters.source === 'catalog' ? 'catalogue complet' : 'produits vendus'
  return (
    <span className="text-xs text-gray-400">
      ({tagCount} tags - {sourceLabel})
    </span>
  )
}

function AllCatalogCheckbox({
  showAllCatalog,
  onToggle,
}: {
  showAllCatalog: boolean
  onToggle: () => void
}): React.ReactElement {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
      <input
        checked={showAllCatalog}
        className="rounded border-gray-300 text-burgundy focus:ring-burgundy"
        type="checkbox"
        onChange={onToggle}
      />
      Afficher tous les tags du catalogue (pas seulement les vendus)
    </label>
  )
}

export function FilterDropdown({
  filterType,
  selectedTag,
  selectedCollection,
  filters,
  filtersLoading,
  onChange,
  showAllCatalog = false,
  onToggleAllCatalog,
}: FilterDropdownProps): React.ReactElement {
  if (filtersLoading) {
    return <div className="h-10 w-64 animate-pulse rounded bg-gray-200" />
  }

  const currentValue = filterType === 'tag' ? (selectedTag ?? '') : (selectedCollection ?? '')
  const placeholder = filterType === 'tag' ? 'un tag' : 'une collection'
  const options = getOptions(filterType, filters)
  const isTag = filterType === 'tag'
  const showCheckbox = isTag && onToggleAllCatalog !== undefined

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <select
          className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm focus:border-burgundy focus:outline-none focus:ring-1 focus:ring-burgundy"
          value={currentValue}
          onChange={(e) => {
            onChange(e.target.value)
          }}
        >
          <option value="">-- Sélectionnez {placeholder} --</option>
          {options.map((opt) => (
            <option key={opt.key} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {isTag ? <TagInfo filters={filters} /> : null}
      </div>
      {showCheckbox ? (
        <AllCatalogCheckbox showAllCatalog={showAllCatalog} onToggle={onToggleAllCatalog} />
      ) : null}
    </div>
  )
}
