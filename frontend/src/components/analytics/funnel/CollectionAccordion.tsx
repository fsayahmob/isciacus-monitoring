/**
 * CollectionAccordion Component - Expandable collection purchases list with CVR
 */

import type { CollectionCVR } from '../../../types/analytics'

interface CollectionAccordionProps {
  collections: CollectionCVR[]
  isOpen: boolean
  onToggle: () => void
  ga4Available?: boolean
}

const BENCHMARK_COLORS: Record<string, string> = {
  good: 'bg-success/20 text-success',
  ok: 'bg-warning/20 text-warning',
  bad: 'bg-error/20 text-error',
}

function getBenchmarkColor(status: string): string {
  return BENCHMARK_COLORS[status] ?? 'bg-bg-tertiary text-text-muted'
}

interface CollectionRowProps {
  collection: CollectionCVR
  ga4Available: boolean
}

function CollectionRow({ collection, ga4Available }: CollectionRowProps): React.ReactElement {
  const hasVisitors = collection.visitors > 0
  const hasCVR = collection.cvr > 0

  return (
    <tr className="border-b border-border-subtle">
      <td className="py-2 text-text-primary">{collection.collection_name}</td>
      {ga4Available ? (
        <td className="py-2 text-right font-mono text-info">
          {hasVisitors ? collection.visitors.toLocaleString('fr-FR') : '-'}
        </td>
      ) : null}
      <td className="py-2 text-right font-mono text-text-primary">{collection.purchases.toLocaleString('fr-FR')}</td>
      {ga4Available ? (
        <td className="py-2 text-right">
          {hasCVR ? (
            <span
              className={`rounded px-2 py-0.5 font-mono ${getBenchmarkColor(collection.benchmark_status)}`}
            >
              {collection.cvr.toFixed(2)}%
            </span>
          ) : (
            <span className="text-text-muted">-</span>
          )}
        </td>
      ) : null}
    </tr>
  )
}

export function CollectionAccordion({
  collections,
  isOpen,
  onToggle,
  ga4Available = false,
}: CollectionAccordionProps): React.ReactElement {
  const totalVisitors = collections.reduce((sum, c) => sum + c.visitors, 0)
  const totalPurchases = collections.reduce((sum, c) => sum + c.purchases, 0)
  const globalCVR = totalVisitors > 0 ? (totalPurchases / totalVisitors) * 100 : 0
  const showGlobalCVR = ga4Available && totalVisitors > 0

  return (
    <div className="border-t border-border-subtle pt-4">
      <button
        className="flex w-full items-center justify-between text-left"
        type="button"
        onClick={onToggle}
      >
        <span className="text-sm font-medium text-brand">
          CVR par collection ({collections.length})
          <span className="ml-2 text-xs font-normal text-text-tertiary">
            (Sources: Shopify{ga4Available ? ' + GA4' : ''})
          </span>
          {showGlobalCVR ? (
            <span className="ml-2 rounded bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">
              CVR Global: {globalCVR.toFixed(2)}%
            </span>
          ) : null}
        </span>
        <svg
          className={`h-5 w-5 text-brand transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </button>

      {isOpen ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left">
                <th className="pb-2 font-medium text-text-secondary">Collection</th>
                {ga4Available ? (
                  <th className="pb-2 text-right font-medium text-info">Visiteurs</th>
                ) : null}
                <th className="pb-2 text-right font-medium text-text-secondary">Achats</th>
                {ga4Available ? (
                  <th className="pb-2 text-right font-medium text-success">CVR</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {collections.map((collection) => (
                <CollectionRow
                  key={collection.collection_id}
                  collection={collection}
                  ga4Available={ga4Available}
                />
              ))}
            </tbody>
          </table>
          {!ga4Available ? (
            <p className="mt-3 text-xs text-warning italic">
              Note: Le CVR par collection requiert l&apos;intégration GA4 pour les visiteurs.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
