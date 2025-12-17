/**
 * FunnelChart Component - ISCIACUS Monitoring Dashboard
 * ======================================================
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
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-8 flex-1 rounded bg-gray-200" />
          <div className="h-4 w-20 rounded bg-gray-200" />
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
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-medium text-gray-700">Tunnel de conversion</h4>
          {ga4Available ? (
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
              100% GA4 - CVR fiable
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
              GA4 requis
            </span>
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
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">
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
      <div className="border border-red-200 bg-red-50 p-4 text-red-700">
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
      <div className="border-2 border-burgundy bg-white p-6 overflow-hidden">
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
        <div className="mt-2 text-right text-xs text-gray-400">
          Dernière mise à jour: {new Date(lastUpdated).toLocaleString('fr-FR')}
        </div>
      ) : null}
    </div>
  )
}
