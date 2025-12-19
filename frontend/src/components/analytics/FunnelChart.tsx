/**
 * FunnelChart Component - Modern Dark Theme
 */

import { useState } from 'react'

import { useCollectionCVR, useConversionFunnel } from '../../hooks/useAnalytics'
import type { CollectionCVRResponse, ConversionFunnel } from '../../types/analytics'

import {
  CollectionAccordion,
  EntryPointTable,
  FunnelBar,
  FunnelHeader,
  FunnelMetrics,
} from './funnel'

const DEFAULT_PERIOD = 30
const SKELETON_COUNT = 5

function FunnelLoading(): React.ReactElement {
  return (
    <div className="animate-pulse space-y-4">
      {Array.from({ length: SKELETON_COUNT }, (_, i) => i).map((i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-8 flex-1" />
          <div className="skeleton h-4 w-20" />
        </div>
      ))}
    </div>
  )
}

interface FunnelContentProps {
  funnel: ConversionFunnel
  collectionData: CollectionCVRResponse | undefined
  collectionsOpen: boolean
  onToggleCollections: () => void
}

function FunnelContent({
  funnel,
  collectionData,
  collectionsOpen,
  onToggleCollections,
}: FunnelContentProps): React.ReactElement {
  const hasCollections = collectionData !== undefined && collectionData.collections.length > 0
  const ga4Available = funnel.ga4_available === true
  const maxValue = funnel.stages.length > 0 ? funnel.stages[0].value : 1

  return (
    <>
      {/* Full Funnel Visualization */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <h4 className="text-sm font-medium text-text-primary">Tunnel de conversion</h4>
          {ga4Available ? (
            <span className="badge badge-info">100% GA4 - CVR fiable</span>
          ) : (
            <span className="badge badge-warning">GA4 requis</span>
          )}
        </div>
        <div className="space-y-3">
          {funnel.stages.map((stage, index) => (
            <FunnelBar key={stage.name} index={index} maxValue={maxValue} stage={stage} />
          ))}
        </div>
      </div>

      <FunnelMetrics funnel={funnel} ga4Available={ga4Available} />

      {/* GA4 Error Notice */}
      {funnel.ga4_error !== null && funnel.ga4_error !== undefined ? (
        <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="text-xs text-warning">
            <strong>GA4 :</strong> {funnel.ga4_error}
          </p>
        </div>
      ) : null}

      <EntryPointTable entries={funnel.cvr_by_entry} />

      {hasCollections ? (
        <CollectionAccordion
          collections={collectionData.collections}
          ga4Available={collectionData.ga4_available}
          isOpen={collectionsOpen}
          onToggle={onToggleCollections}
        />
      ) : null}
    </>
  )
}

export function FunnelChartSection(): React.ReactElement {
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [collectionsOpen, setCollectionsOpen] = useState(false)

  const { data: funnel, isLoading, error, refetch } = useConversionFunnel(period)
  const { data: collectionData } = useCollectionCVR(period)

  if (error !== null) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 p-4 text-error">
        Erreur lors du chargement du tunnel de conversion: {error.message}
      </div>
    )
  }

  const lastUpdated = funnel?.last_updated

  return (
    <div className="mb-8">
      <FunnelHeader
        ga4Available={funnel?.ga4_available}
        isLoading={isLoading}
        period={period}
        onPeriodChange={setPeriod}
        onRefetch={refetch}
      />
      <div className="card-elevated overflow-hidden p-6">
        {isLoading ? <FunnelLoading /> : null}
        {!isLoading && funnel !== undefined ? (
          <FunnelContent
            collectionData={collectionData}
            collectionsOpen={collectionsOpen}
            funnel={funnel}
            onToggleCollections={() => {
              setCollectionsOpen(!collectionsOpen)
            }}
          />
        ) : null}
      </div>
      {lastUpdated !== undefined && lastUpdated !== '' ? (
        <div className="mt-2 text-right text-xs text-text-muted">
          Dernière mise à jour: {new Date(lastUpdated).toLocaleString('fr-FR')}
        </div>
      ) : null}
    </div>
  )
}
