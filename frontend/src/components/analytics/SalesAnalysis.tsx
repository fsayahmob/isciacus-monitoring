/**
 * SalesAnalysis Component - ISCIACUS Monitoring Dashboard
 * ========================================================
 * Analyse des ventes par Tag ou Collection avec sélecteur déroulant
 */

import { useState } from 'react'

import {
  useAvailableSalesFilters,
  useSalesByCollection,
  useSalesByTag,
} from '../../hooks/useAnalytics'
import type { FilteredSalesAnalysis, ProductSales } from '../../types/analytics'

import { FilterDropdown } from './sales'

const DEFAULT_PERIOD = 30
const SKELETON_ROWS = 3

type FilterType = 'tag' | 'collection'

interface ProductRowProps {
  product: ProductSales
  rank: number
  showViews: boolean
}

function ProductRow({ product, rank, showViews }: ProductRowProps): React.ReactElement {
  const hasViews = product.views !== undefined && product.views > 0
  const hasCVR = product.cvr !== undefined && product.cvr > 0

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 text-center text-gray-400">{rank}</td>
      <td className="py-2">
        <a
          className="text-burgundy hover:underline"
          href={`https://www.isciacusstore.com/products/${product.product_handle}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {product.product_title}
        </a>
      </td>
      <td className="py-2 text-center font-mono">{product.quantity_sold}</td>
      <td className="py-2 text-center text-gray-500">{product.order_count}</td>
      {showViews ? (
        <>
          <td className="py-2 text-center font-mono text-gray-600">
            {hasViews ? product.views : '-'}
          </td>
          <td className="py-2 text-center font-mono">
            {hasCVR ? (
              <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">
                {product.cvr?.toFixed(1)}%
              </span>
            ) : (
              '-'
            )}
          </td>
        </>
      ) : null}
    </tr>
  )
}

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-6 w-32 rounded bg-gray-200" />
      <div className="h-4 w-48 rounded bg-gray-200" />
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="h-10 rounded bg-gray-200" />
      ))}
    </div>
  )
}

function SalesResultsSummary({ data }: { data: FilteredSalesAnalysis }): React.ReactElement {
  const hasViews = data.ga4_available === true && data.total_views !== undefined

  return (
    <div className={`mb-4 grid ${hasViews ? 'grid-cols-5' : 'grid-cols-3'} gap-4`}>
      <div className="rounded border border-gray-200 p-3 text-center">
        <div className="font-mono text-2xl font-bold text-burgundy">
          {data.total_quantity.toLocaleString('fr-FR')}
        </div>
        <div className="text-xs text-gray-500">Unités vendues</div>
      </div>
      <div className="rounded border border-gray-200 p-3 text-center">
        <div className="font-mono text-2xl font-bold text-burgundy">
          {data.unique_orders.toLocaleString('fr-FR')}
        </div>
        <div className="text-xs text-gray-500">Commandes</div>
      </div>
      <div className="rounded border border-gray-200 p-3 text-center">
        <div className="font-mono text-2xl font-bold text-burgundy">
          {data.products.length.toLocaleString('fr-FR')}
        </div>
        <div className="text-xs text-gray-500">Produits</div>
      </div>
      {hasViews ? (
        <>
          <div className="rounded border border-blue-200 bg-blue-50 p-3 text-center">
            <div className="font-mono text-2xl font-bold text-blue-700">
              {data.total_views?.toLocaleString('fr-FR') ?? '-'}
            </div>
            <div className="text-xs text-blue-600">Vues (GA4)</div>
          </div>
          <div className="rounded border border-green-200 bg-green-50 p-3 text-center">
            <div className="font-mono text-2xl font-bold text-green-700">
              {data.overall_cvr !== undefined ? `${data.overall_cvr.toFixed(1)}%` : '-'}
            </div>
            <div className="text-xs text-green-600">CVR Global</div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function SalesResultsTable({
  products,
  showViews,
}: {
  products: ProductSales[]
  showViews: boolean
}): React.ReactElement {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b-2 border-burgundy text-left">
          <th className="pb-2 text-center font-medium text-gray-600">#</th>
          <th className="pb-2 font-medium text-gray-600">Produit</th>
          <th className="pb-2 text-center font-medium text-gray-600">Qté</th>
          <th className="pb-2 text-center font-medium text-gray-600">Commandes</th>
          {showViews ? (
            <>
              <th className="pb-2 text-center font-medium text-blue-600">Vues</th>
              <th className="pb-2 text-center font-medium text-green-600">CVR</th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {products.map((product, index) => (
          <ProductRow
            key={product.product_id}
            product={product}
            rank={index + 1}
            showViews={showViews}
          />
        ))}
      </tbody>
    </table>
  )
}

function SalesResults({
  data,
  isLoading,
}: {
  data: FilteredSalesAnalysis | undefined
  isLoading: boolean
}): React.ReactElement | null {
  if (isLoading) {
    return <LoadingSkeleton />
  }
  if (data === undefined) {
    return null
  }
  if (data.products.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500">
        Aucun produit vendu avec ce filtre sur la période.
      </div>
    )
  }

  const filterLabel = data.filter_type === 'tag' ? 'Tag' : 'Collection'
  const hasViews = data.ga4_available === true && data.total_views !== undefined

  return (
    <div>
      <SalesResultsSummary data={data} />
      <SalesResultsTable products={data.products} showViews={hasViews} />
      <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
        <span>
          Données: {filterLabel} &quot;{data.filter_value}&quot; • Période: {data.period}
        </span>
        <span>Sources: Shopify{hasViews ? ' + GA4' : ''}</span>
      </div>
      {!hasViews ? (
        <div className="mt-2 text-xs text-amber-600">
          Note: Les colonnes Vues et CVR apparaîtront quand GA4 sera disponible.
        </div>
      ) : null}
    </div>
  )
}

function FilterTypeSelector({
  filterType,
  onChange,
}: {
  filterType: FilterType
  onChange: (type: FilterType) => void
}): React.ReactElement {
  const getButtonClass = (type: FilterType): string =>
    `px-4 py-2 text-sm ${filterType === type ? 'bg-burgundy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`

  return (
    <div className="mb-4 flex items-center gap-4">
      <span className="text-sm text-gray-600">Filtrer par:</span>
      <div className="flex rounded border border-gray-300">
        <button
          className={getButtonClass('collection')}
          type="button"
          onClick={() => {
            onChange('collection')
          }}
        >
          Collection
        </button>
        <button
          className={getButtonClass('tag')}
          type="button"
          onClick={() => {
            onChange('tag')
          }}
        >
          Tag
        </button>
      </div>
    </div>
  )
}

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
        <h3 className="font-serif text-xl text-burgundy">Analyse des Ventes</h3>
        <p className="mt-1 text-xs text-gray-500">
          Sélectionnez un tag ou une collection pour voir les produits vendus • Source: Shopify
        </p>
      </div>

      <div className="border-2 border-burgundy bg-white p-6">
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
          <div className="py-8 text-center text-gray-400">
            Sélectionnez {placeholder} pour voir l&apos;analyse
          </div>
        )}
      </div>
    </div>
  )
}
