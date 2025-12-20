/**
 * RFM Segmentation Component
 * Displays customer segments: Champions, Loyal, At Risk, Lost
 */

import React from 'react'

interface RFMSegment {
  name: string
  count: number
  percentage: number
  avgRevenue: number
  description: string
  color: string
}

const MOCK_SEGMENTS: RFMSegment[] = [
  {
    name: 'Champions',
    count: 245,
    percentage: 12.3,
    avgRevenue: 1250,
    description: 'Achètent souvent et récemment, dépensent beaucoup',
    color: 'bg-success',
  },
  {
    name: 'Loyal',
    count: 523,
    percentage: 26.2,
    avgRevenue: 850,
    description: 'Achètent régulièrement, fidèles',
    color: 'bg-info',
  },
  {
    name: 'At Risk',
    count: 412,
    percentage: 20.6,
    avgRevenue: 620,
    description: 'Achetaient souvent, mais pas récemment',
    color: 'bg-warning',
  },
  {
    name: 'Lost',
    count: 820,
    percentage: 41.0,
    avgRevenue: 320,
    description: 'N\'ont pas acheté depuis longtemps',
    color: 'bg-error',
  },
]

function SegmentCard({ segment }: { segment: RFMSegment }): React.ReactElement {
  return (
    <div className="card-elevated rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${segment.color}`} />
          <h3 className="text-lg font-semibold text-text-primary">{segment.name}</h3>
        </div>
        <span className="text-2xl font-bold text-text-primary">{segment.percentage}%</span>
      </div>

      <p className="mb-4 text-sm text-text-secondary">{segment.description}</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-text-tertiary">Clients</p>
          <p className="text-lg font-semibold text-text-primary">{segment.count.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary">Rev. Moyen</p>
          <p className="text-lg font-semibold text-text-primary">
            {segment.avgRevenue.toLocaleString()}€
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div className={`h-2 rounded-full ${segment.color}`} style={{ width: `${segment.percentage}%` }} />
      </div>
    </div>
  )
}

export function RFMSegmentationSection(): React.ReactElement {
  return (
    <div className="mb-8">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-text-primary">Segmentation RFM</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Recency • Frequency • Monetary - Segmentation clients pour ciblage Ads
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {MOCK_SEGMENTS.map((segment) => (
          <SegmentCard key={segment.name} segment={segment} />
        ))}
      </div>

      <div className="card-elevated mt-4 rounded-xl p-4">
        <p className="text-xs text-text-tertiary">
          💡 Utilisez ces segments pour créer des audiences Lookalike Meta/Google et ajuster vos budgets par segment
        </p>
      </div>
    </div>
  )
}
