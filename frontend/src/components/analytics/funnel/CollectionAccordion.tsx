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
  good: 'bg-green-100 text-green-700',
  ok: 'bg-yellow-100 text-yellow-700',
  bad: 'bg-red-100 text-red-700',
}

function getBenchmarkColor(status: string): string {
  return BENCHMARK_COLORS[status] ?? 'bg-gray-100 text-gray-500'
}

interface CollectionRowProps {
  collection: CollectionCVR
  ga4Available: boolean
}

function CollectionRow({ collection, ga4Available }: CollectionRowProps): React.ReactElement {
  const hasVisitors = collection.visitors > 0
  const hasCVR = collection.cvr > 0

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2">{collection.collection_name}</td>
      {ga4Available ? (
        <td className="py-2 text-right font-mono text-blue-600">
          {hasVisitors ? collection.visitors.toLocaleString('fr-FR') : '-'}
        </td>
      ) : null}
      <td className="py-2 text-right font-mono">
        {collection.purchases.toLocaleString('fr-FR')}
      </td>
      {ga4Available ? (
        <td className="py-2 text-right">
          {hasCVR ? (
            <span className={`rounded px-2 py-0.5 font-mono ${getBenchmarkColor(collection.benchmark_status)}`}>
              {collection.cvr.toFixed(2)}%
            </span>
          ) : (
            <span className="text-gray-400">-</span>
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
    <div className="border-t border-gray-200 pt-4">
      <button
        className="flex w-full items-center justify-between text-left"
        type="button"
        onClick={onToggle}
      >
        <span className="text-sm font-medium text-burgundy">
          CVR par collection ({collections.length})
          <span className="ml-2 text-xs font-normal text-gray-500">
            (Sources: Shopify{ga4Available ? ' + GA4' : ''})
          </span>
          {showGlobalCVR ? (
            <span className="ml-2 rounded bg-burgundy/10 px-2 py-0.5 text-xs font-bold text-burgundy">
              CVR Global: {globalCVR.toFixed(2)}%
            </span>
          ) : null}
        </span>
        <svg
          className={`h-5 w-5 text-burgundy transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-2 font-medium text-gray-600">Collection</th>
                {ga4Available ? <th className="pb-2 text-right font-medium text-blue-600">Visiteurs</th> : null}
                <th className="pb-2 text-right font-medium text-gray-600">Achats</th>
                {ga4Available ? <th className="pb-2 text-right font-medium text-green-600">CVR</th> : null}
              </tr>
            </thead>
            <tbody>
              {collections.map((collection) => (
                <CollectionRow key={collection.collection_id} collection={collection} ga4Available={ga4Available} />
              ))}
            </tbody>
          </table>
          {!ga4Available ? (
            <p className="mt-3 text-xs text-amber-600 italic">
              Note: Le CVR par collection requiert l&apos;intégration GA4 pour les visiteurs.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
