/**
 * Analytics Data Page - Modern Dark Theme
 */

import {
  CustomerStatsSection,
  FunnelChartSection,
  SalesAnalysisSection,
} from '../components/analytics'

export function AnalyticsDataPage(): React.ReactElement {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary">Analytics</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Données clients et conversions • Source: Shopify GraphQL API
        </p>
      </div>

      <CustomerStatsSection />
      <FunnelChartSection />
      <SalesAnalysisSection />
    </div>
  )
}
