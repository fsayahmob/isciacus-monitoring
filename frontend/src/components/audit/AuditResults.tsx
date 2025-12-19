/**
 * Audit Results - Display audit results with progressive checklist
 */

import type { TrackingAuditData, TrackingCoverage } from '../../services/api'
import {
  ChecksSection,
  ConnectionStatus,
  CoverageChart,
  MissingCollections,
  ResultsHeader,
  SummaryCards,
} from './AuditCards'
import { CoverageChecklistSection } from './CoverageComponents'
import { CollectionsIcon, EventsIcon, PagesIcon, ProductsIcon } from './AuditIcons'

export function AuditResults({
  audit,
  onRefresh,
}: {
  audit: TrackingAuditData
  onRefresh: () => void
}): React.ReactElement {
  return (
    <div className="min-h-screen bg-bg-primary p-6">
      <ResultsHeader onRefresh={onRefresh} />
      <ConnectionStatus connected={audit.ga4_connected} />
      <SummaryCards summary={audit.summary} />
      {audit.tracking_coverage !== null && (
        <TrackingCoverageChecklist coverage={audit.tracking_coverage} />
      )}
      {audit.tracking_coverage === null && <CoverageSection audit={audit} />}
      {audit.collections_coverage.missing.length > 0 && audit.tracking_coverage === null && (
        <MissingCollections collections={audit.collections_coverage.missing} />
      )}
      <ChecksSection checks={audit.checks} />
    </div>
  )
}

function TrackingCoverageChecklist({
  coverage,
}: {
  coverage: TrackingCoverage
}): React.ReactElement {
  return (
    <div className="mb-8 space-y-4">
      <h2 className="text-xl font-semibold text-text-primary">Couverture du Tracking</h2>
      <CoverageChecklistSection
        title="Événements E-commerce"
        icon={<EventsIcon />}
        section={coverage.events}
        showAll
      />
      <CoverageChecklistSection
        title="Collections"
        icon={<CollectionsIcon />}
        section={coverage.collections}
      />
      <CoverageChecklistSection
        title="Produits"
        icon={<ProductsIcon />}
        section={coverage.products}
        useSample
      />
      {coverage.pages !== undefined && (
        <CoverageChecklistSection
          title="Pages Shopify"
          icon={<PagesIcon />}
          section={coverage.pages}
        />
      )}
    </div>
  )
}

function CoverageSection({ audit }: { audit: TrackingAuditData }): React.ReactElement {
  return (
    <div className="mb-8 grid gap-4 md:grid-cols-2">
      <CoverageChart
        label="Collections trackées"
        total={audit.collections_coverage.shopify_total}
        tracked={audit.collections_coverage.ga4_tracked}
      />
      <CoverageChart
        label="Transactions matchées"
        total={audit.transactions_match.shopify_orders}
        tracked={Math.round(
          audit.transactions_match.shopify_orders * audit.transactions_match.match_rate
        )}
      />
    </div>
  )
}
