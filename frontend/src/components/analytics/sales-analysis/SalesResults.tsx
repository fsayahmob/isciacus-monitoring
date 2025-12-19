import type { FilteredSalesAnalysis } from '../../../types/analytics'

import { LoadingSkeleton } from './LoadingSkeleton'
import { SalesResultsSummary } from './SalesResultsSummary'
import { SalesResultsTable } from './SalesResultsTable'

export function SalesResults({
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
      <div className="py-8 text-center text-text-tertiary">
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
      <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
        <span>
          Données: {filterLabel} &quot;{data.filter_value}&quot; • Période: {data.period}
        </span>
        <span>Sources: Shopify{hasViews ? ' + GA4' : ''}</span>
      </div>
      {!hasViews ? (
        <div className="mt-2 text-xs text-warning">
          Note: Les colonnes Vues et CVR apparaîtront quand GA4 sera disponible.
        </div>
      ) : null}
    </div>
  )
}
