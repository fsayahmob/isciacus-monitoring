import type { FilteredSalesAnalysis } from '../../../types/analytics'

export function SalesResultsSummary({
  data,
}: {
  data: FilteredSalesAnalysis
}): React.ReactElement {
  const hasViews = data.ga4_available === true && data.total_views !== undefined

  return (
    <div className={`mb-6 grid ${hasViews ? 'grid-cols-5' : 'grid-cols-3'} gap-4`}>
      <div className="card p-4 text-center">
        <div className="font-mono text-2xl font-bold text-text-primary">
          {data.total_quantity.toLocaleString('fr-FR')}
        </div>
        <div className="text-xs text-text-tertiary">Unités vendues</div>
      </div>
      <div className="card p-4 text-center">
        <div className="font-mono text-2xl font-bold text-text-primary">
          {data.unique_orders.toLocaleString('fr-FR')}
        </div>
        <div className="text-xs text-text-tertiary">Commandes</div>
      </div>
      <div className="card p-4 text-center">
        <div className="font-mono text-2xl font-bold text-text-primary">
          {data.products.length.toLocaleString('fr-FR')}
        </div>
        <div className="text-xs text-text-tertiary">Produits</div>
      </div>
      {hasViews ? (
        <>
          <div className="card border-info/30 bg-info/10 p-4 text-center">
            <div className="font-mono text-2xl font-bold text-info">
              {data.total_views?.toLocaleString('fr-FR') ?? '-'}
            </div>
            <div className="text-xs text-info/80">Vues (GA4)</div>
          </div>
          <div className="card border-success/30 bg-success/10 p-4 text-center">
            <div className="font-mono text-2xl font-bold text-success">
              {data.overall_cvr !== undefined ? `${data.overall_cvr.toFixed(1)}%` : '-'}
            </div>
            <div className="text-xs text-success/80">CVR Global</div>
          </div>
        </>
      ) : null}
    </div>
  )
}
