/**
 * SalesAnalysis Component - Modern Dark Theme
 */

import { useState } from 'react'

import {
  useAvailableSalesFilters,
  useSalesByCollection,
  useSalesByTag,
} from '../../hooks/useAnalytics'

import { FilterDropdown } from './sales'
import { FilterTypeSelector, type FilterType } from './sales-analysis/FilterTypeSelector'
import { SalesResults } from './sales-analysis/SalesResults'

const DEFAULT_PERIOD = 30

export function SalesAnalysisSection(): React.ReactElement {
  const [period] = useState(DEFAULT_PERIOD)
  const [filterType, setFilterType] = useState<FilterType>('collection')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [showAllCatalogTags, setShowAllCatalogTags] = useState(false)

  const { data: filters, isLoading: filtersLoading } = useAvailableSalesFilters(
    period,
    filterType === 'tag' && showAllCatalogTags
  )
  const { data: tagData, isLoading: tagLoading } = useSalesByTag(selectedTag, period)
  const { data: collectionData, isLoading: collectionLoading } = useSalesByCollection(
    selectedCollection,
    period
  )

  const handleFilterTypeChange = (type: FilterType): void => {
    setFilterType(type)
    setSelectedTag(null)
    setSelectedCollection(null)
  }

  const handleSelectionChange = (value: string): void => {
    if (value === '') {
      setSelectedTag(null)
      setSelectedCollection(null)
    } else if (filterType === 'tag') {
      setSelectedTag(value)
      setSelectedCollection(null)
    } else {
      setSelectedCollection(value)
      setSelectedTag(null)
    }
  }

  const currentData = filterType === 'tag' ? tagData : collectionData
  const isLoading = filterType === 'tag' ? tagLoading : collectionLoading
  const hasSelection = filterType === 'tag' ? selectedTag !== null : selectedCollection !== null
  const placeholder = filterType === 'tag' ? 'un tag' : 'une collection'

  return (
    <div className="mb-8">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-text-primary">Analyse des Ventes</h3>
        <p className="mt-1 text-xs text-text-tertiary">
          Sélectionnez un tag ou une collection pour voir les produits vendus
        </p>
      </div>

      <div className="card-elevated p-6">
        <FilterTypeSelector filterType={filterType} onChange={handleFilterTypeChange} />
        <div className="mb-6">
          <FilterDropdown
            filterType={filterType}
            filters={filters}
            filtersLoading={filtersLoading}
            selectedCollection={selectedCollection}
            selectedTag={selectedTag}
            showAllCatalog={showAllCatalogTags}
            onChange={handleSelectionChange}
            onToggleAllCatalog={() => {
              setShowAllCatalogTags(!showAllCatalogTags)
              setSelectedTag(null)
            }}
          />
        </div>

        {hasSelection ? (
          <SalesResults data={currentData} isLoading={isLoading} />
        ) : (
          <div className="py-8 text-center text-text-muted">
            Sélectionnez {placeholder} pour voir l&apos;analyse
          </div>
        )}
      </div>
    </div>
  )
}
