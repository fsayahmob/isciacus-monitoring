/**
 * Analytics Data Page - Modern Dark Theme
 */

import {
  BudgetRecommendationsSection,
  CrossPlatformTrackingSection,
  CustomerStatsSection,
  FunnelChartSection,
  LTVAnalysisSection,
  RFMSegmentationSection,
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

      {/* Existing Sections */}
      <CustomerStatsSection />
      <FunnelChartSection />
      <SalesAnalysisSection />

      {/* Ads Strategy Sections */}
      <div className="my-8 border-t border-border-subtle pt-8">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-text-primary">Stratégie Ads</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Segmentation, LTV, Budget et Cross-Platform Tracking
          </p>
        </div>

        <RFMSegmentationSection />
        <LTVAnalysisSection />
        <BudgetRecommendationsSection />
        <CrossPlatformTrackingSection />
      </div>
    </div>
  )
}
