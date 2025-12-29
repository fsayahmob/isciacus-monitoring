/**
 * FunnelMetrics Component - Key metrics summary cards
 * Separates GA4 funnel metrics from Shopify business metrics
 */

import type {
  ConversionFunnel,
  ShopifyBusinessMetrics,
  TrackingCoverage,
} from '../../../types/analytics'

const PERCENT_100 = 100

function formatValue(value: number | string): string {
  if (typeof value === 'number') {
    return value.toLocaleString('fr-FR')
  }
  return value
}

function MetricCard({
  value,
  label,
  available,
  source,
}: {
  value: number | string
  label: string
  available: boolean
  source?: 'GA4' | 'Shopify'
}): React.ReactElement {
  const borderClass = available
    ? 'border-border-default bg-bg-secondary'
    : 'border-border-subtle bg-bg-tertiary'
  const valueClass = `font-mono text-xl font-bold ${available ? 'text-brand' : 'text-text-muted'}`
  const displayValue = available ? formatValue(value) : '—'
  return (
    <div className={`rounded border p-3 text-center ${borderClass}`}>
      <div className={valueClass}>{displayValue}</div>
      <div className="text-xs text-text-tertiary">{label}</div>
      {source !== undefined && (
        <div className={`text-xs ${source === 'GA4' ? 'text-info' : 'text-success'}`}>{source}</div>
      )}
    </div>
  )
}

function GA4FunnelSection({
  funnel,
  ga4Available,
}: {
  funnel: ConversionFunnel
  ga4Available: boolean
}): React.ReactElement {
  return (
    <div className="border-t border-border-subtle pt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-text-primary">Funnel GA4</span>
        <span className="text-xs px-2 py-0.5 bg-info/20 text-info rounded">Source cohérente</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard
          available={ga4Available}
          label="Visiteurs"
          source="GA4"
          value={funnel.visitors}
        />
        <MetricCard
          available={ga4Available}
          label="Vues Produit"
          source="GA4"
          value={funnel.product_views}
        />
        <MetricCard
          available={ga4Available}
          label="Ajout Panier"
          source="GA4"
          value={funnel.add_to_cart}
        />
        <MetricCard
          available={ga4Available}
          label="Checkout"
          source="GA4"
          value={funnel.checkout}
        />
        <MetricCard
          available={ga4Available}
          label="Achats trackés"
          source="GA4"
          value={funnel.purchases}
        />
      </div>
    </div>
  )
}

function CVRSection({
  globalCvr,
  checkoutToAchat,
}: {
  globalCvr: number
  checkoutToAchat: string
}): React.ReactElement {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4">
      <div className="rounded border border-success/30 bg-success/10 p-3 text-center">
        <div className="font-mono text-2xl font-bold text-success">{globalCvr.toFixed(2)}%</div>
        <div className="text-xs text-text-tertiary">CVR Global (GA4 uniquement)</div>
        <div className="text-xs text-success mt-1">Visiteurs GA4 → Achats GA4</div>
      </div>
      <div className="rounded border border-info/30 bg-info/10 p-3 text-center">
        <div className="font-mono text-2xl font-bold text-info">{checkoutToAchat}%</div>
        <div className="text-xs text-text-tertiary">Checkout → Achat</div>
      </div>
    </div>
  )
}

function ShopifyBusinessSection({
  shopifyData,
}: {
  shopifyData: ShopifyBusinessMetrics
}): React.ReactElement {
  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-text-primary">Métriques Business</span>
        <span className="text-xs px-2 py-0.5 bg-success/20 text-success rounded">
          Shopify (réel)
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          available
          label="Commandes réelles"
          source="Shopify"
          value={shopifyData.orders}
        />
        <MetricCard
          available
          label="Checkouts démarrés"
          source="Shopify"
          value={shopifyData.checkout_started}
        />
        <MetricCard
          available
          label="Chiffre d'affaires"
          source="Shopify"
          value={`${String(shopifyData.revenue ?? 0)} €`}
        />
        <MetricCard
          available
          label="Panier moyen"
          source="Shopify"
          value={`${String(shopifyData.aov?.toFixed(0) ?? 0)} €`}
        />
      </div>
    </div>
  )
}

function TrackingCoverageWarning({
  trackingCoverage,
}: {
  trackingCoverage: TrackingCoverage
}): React.ReactElement {
  return (
    <div className="mt-4 rounded border border-warning/30 bg-warning/10 p-3">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-sm font-medium text-warning">
          Couverture tracking : {trackingCoverage.coverage_rate.toFixed(0)}%
        </span>
      </div>
      <p className="mt-1 text-xs text-text-secondary">
        GA4 a tracké {String(trackingCoverage.ga4_purchases)} achats sur{' '}
        {String(trackingCoverage.shopify_orders)} commandes Shopify. {trackingCoverage.note}
      </p>
    </div>
  )
}

export function FunnelMetrics({
  funnel,
  ga4Available,
}: {
  funnel: ConversionFunnel
  ga4Available: boolean
}): React.ReactElement {
  const checkoutToAchat =
    funnel.checkout > 0 ? ((funnel.purchases / funnel.checkout) * PERCENT_100).toFixed(1) : '0'
  const shopifyData = funnel.shopify
  const trackingCoverage = funnel.tracking_coverage
  const showCoverageWarning =
    trackingCoverage !== undefined &&
    shopifyData !== undefined &&
    trackingCoverage.coverage_rate < PERCENT_100

  return (
    <>
      <GA4FunnelSection funnel={funnel} ga4Available={ga4Available} />
      <CVRSection globalCvr={funnel.global_cvr} checkoutToAchat={checkoutToAchat} />
      {shopifyData !== undefined && <ShopifyBusinessSection shopifyData={shopifyData} />}
      {showCoverageWarning && <TrackingCoverageWarning trackingCoverage={trackingCoverage} />}
    </>
  )
}
