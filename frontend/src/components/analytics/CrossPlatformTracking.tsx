/**
 * Cross-Platform Tracking Component
 * Consistency check between Shopify, GA4, and Meta
 */

import React from 'react'

interface TrackingMetric {
  metric: string
  shopify: number
  ga4: number
  meta: number
  status: 'good' | 'warning' | 'error'
}

const MOCK_TRACKING_DATA: TrackingMetric[] = [
  {
    metric: 'Transactions (7j)',
    shopify: 156,
    ga4: 149,
    meta: 142,
    status: 'good',
  },
  {
    metric: 'Revenue (7j)',
    shopify: 24350,
    ga4: 23180,
    meta: 22450,
    status: 'good',
  },
  {
    metric: 'Add to Cart (7j)',
    shopify: 892,
    ga4: 847,
    meta: 823,
    status: 'warning',
  },
  {
    metric: 'Page Views (7j)',
    shopify: 0,
    ga4: 12450,
    meta: 11980,
    status: 'good',
  },
]

function calculateDiscrepancy(shopify: number, platform: number, metric: string): number {
  // For Page Views, Shopify doesn't track, so compare GA4 vs Meta
  if (metric === 'Page Views (7j)') {
    const ga4 = shopify !== 0 ? shopify : platform
    return Math.abs((platform - ga4) / ga4 * 100)
  }
  if (shopify === 0) {
    return 0
  }
  return Math.abs((platform - shopify) / shopify * 100)
}

function getStatusBadge(status: string): { label: string; color: string } {
  if (status === 'good') {
    return { label: 'OK', color: 'bg-success/20 text-success' }
  }
  if (status === 'warning') {
    return { label: 'Attention', color: 'bg-warning/20 text-warning' }
  }
  return { label: 'Problème', color: 'bg-error/20 text-error' }
}

function TrackingTable(): React.ReactElement {
  return (
    <div className="card-elevated overflow-hidden rounded-xl">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border-subtle bg-bg-tertiary">
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Métrique
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Shopify
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              GA4
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Meta
            </th>
            <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {MOCK_TRACKING_DATA.map((data) => {
            const badge = getStatusBadge(data.status)
            const ga4Discrepancy = calculateDiscrepancy(data.shopify, data.ga4, data.metric)
            const metaDiscrepancy = calculateDiscrepancy(data.shopify, data.meta, data.metric)

            return (
              <tr key={data.metric} className="border-b border-border-subtle hover:bg-bg-secondary">
                <td className="px-6 py-4 font-medium text-text-primary">{data.metric}</td>
                <td className="px-6 py-4 text-right text-text-primary">
                  {data.shopify > 0 ? data.shopify.toLocaleString() : '-'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex flex-col items-end">
                    <span className="text-text-primary">{data.ga4.toLocaleString()}</span>
                    {data.shopify > 0 && (
                      <span className="text-xs text-text-muted">
                        {ga4Discrepancy.toFixed(1)}% écart
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex flex-col items-end">
                    <span className="text-text-primary">{data.meta.toLocaleString()}</span>
                    {data.shopify > 0 && (
                      <span className="text-xs text-text-muted">
                        {metaDiscrepancy.toFixed(1)}% écart
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TrackingInfoCards(): React.ReactElement {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      <div className="card-elevated rounded-xl p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-success" />
          <p className="text-sm font-medium text-text-primary">Écart {'<'} 5%</p>
        </div>
        <p className="text-xs text-text-tertiary">
          Tracking excellent. Données fiables pour optimisation.
        </p>
      </div>
      <div className="card-elevated rounded-xl p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-warning" />
          <p className="text-sm font-medium text-text-primary">Écart 5-10%</p>
        </div>
        <p className="text-xs text-text-tertiary">
          Tracking correct. Vérifier la déduplication CAPI.
        </p>
      </div>
      <div className="card-elevated rounded-xl p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-error" />
          <p className="text-sm font-medium text-text-primary">Écart {'>'} 10%</p>
        </div>
        <p className="text-xs text-text-tertiary">
          Problème de tracking. Vérifier event_id et pixels.
        </p>
      </div>
    </div>
  )
}

export function CrossPlatformTrackingSection(): React.ReactElement {
  return (
    <div className="mb-8">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-text-primary">
          Cohérence Cross-Platform
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Comparaison Shopify ↔ GA4 ↔ Meta • Écart idéal {'<'} 10%
        </p>
      </div>
      <TrackingTable />
      <TrackingInfoCards />
    </div>
  )
}
