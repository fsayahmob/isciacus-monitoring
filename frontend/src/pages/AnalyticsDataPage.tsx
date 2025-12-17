/**
 * Analytics Data Page - ISCIACUS Monitoring Dashboard
 * ====================================================
 */

import {
  CustomerStatsSection,
  FunnelChartSection,
  SalesAnalysisSection,
} from '../components/analytics'

export function AnalyticsDataPage(): React.ReactElement {
  return (
    <div className="p-4">
      <h2 className="mb-6 font-serif text-2xl text-burgundy">Analytics DATA</h2>
      <p className="mb-6 text-sm text-gray-500">
        Données clients et conversions • Source: Shopify GraphQL API (e-commerce uniquement, hors
        POS)
      </p>

      {/* Customer Stats Section */}
      <CustomerStatsSection />

      {/* Conversion Funnel Section */}
      <FunnelChartSection />

      {/* Sales Analysis by Tag/Collection */}
      <SalesAnalysisSection />
    </div>
  )
}
