/**
 * GMC Flow KPI - Modern Dark Theme
 * Shows the pipeline: Shopify → Google Channel → GMC → Approved
 */

import React from 'react'

import { FlowStage, FlowArrow } from './GMCFlowComponents'
import { getApprovalRateColor, PERCENTAGE_MULTIPLIER } from './GMCFlowConstants'
import { ShopifyIcon, GoogleChannelIcon, GMCIcon, ApprovedIcon } from './GMCFlowIcons'

export interface GMCFlowData {
  shopify_total: number
  google_channel_published: number
  google_channel_not_published: number
  gmc_received: number
  gmc_approved: number
  gmc_pending: number
  gmc_disapproved: number
}

interface GMCFlowKPIProps {
  data: GMCFlowData
  onNavigateToIssue?: (issueId: string) => void
}

function GMCFlowHeader({ approvalRate }: { approvalRate: number }): React.ReactElement {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Flux Produits Google Shopping</h2>
        <p className="text-sm text-text-tertiary">
          Suivez vos produits de Shopify jusqu'à Google Shopping
        </p>
      </div>
      <div
        className={`rounded-full px-4 py-2 text-lg font-bold ${getApprovalRateColor(approvalRate)}`}
      >
        {approvalRate}% approuvé
      </div>
    </div>
  )
}

interface FlowVisualizationProps {
  data: GMCFlowData
  losses: { shopifyToChannel: number; channelToGMC: number; gmcToApproved: number }
  onNavigateToIssue?: (issueId: string) => void
}

function FlowVisualization({
  data,
  losses,
  onNavigateToIssue,
}: FlowVisualizationProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between overflow-x-auto pb-4">
      <FlowStage
        icon={<ShopifyIcon />}
        label="Shopify"
        count={data.shopify_total}
        sublabel="produits"
        color="border-[#96bf48]"
      />
      <FlowArrow
        loss={losses.shopifyToChannel}
        lossLabel="non publiés"
        issueId="gmc_not_published_google"
        onNavigateToIssue={onNavigateToIssue}
      />
      <FlowStage
        icon={<GoogleChannelIcon />}
        label="Canal Google"
        count={data.google_channel_published}
        sublabel="publiés"
        color="border-info"
      />
      <FlowArrow
        loss={losses.channelToGMC > 0 ? losses.channelToGMC : 0}
        lossLabel="non sync"
        issueId="gmc_quality_gap_analysis"
        onNavigateToIssue={onNavigateToIssue}
      />
      <FlowStage
        icon={<GMCIcon />}
        label="GMC"
        count={data.gmc_received}
        sublabel="variantes reçues"
        color="border-info"
      />
      <FlowArrow
        loss={losses.gmcToApproved}
        lossLabel="rejetés/en attente"
        issueId="gmc_issues_summary"
        onNavigateToIssue={onNavigateToIssue}
      />
      <FlowStage
        icon={<ApprovedIcon />}
        label="Approuvés"
        count={data.gmc_approved}
        sublabel="sur Google Shopping"
        color="border-success"
      />
    </div>
  )
}

interface FlowLegendProps {
  data: GMCFlowData
  onNavigateToIssue?: (issueId: string) => void
}

function FlowLegend({ data, onNavigateToIssue }: FlowLegendProps): React.ReactElement {
  return (
    <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border-subtle pt-4">
      {data.gmc_pending > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2">
          <span className="text-xl">⏳</span>
          <div>
            <div className="text-sm font-medium text-warning">
              {data.gmc_pending.toLocaleString()} en attente
            </div>
            <div className="text-xs text-warning/70">En cours de validation GMC</div>
          </div>
        </div>
      )}
      {data.gmc_disapproved > 0 && (
        <button
          type="button"
          onClick={() => onNavigateToIssue?.('gmc_issues_summary')}
          className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 text-left transition-colors hover:bg-error/20"
        >
          <span className="text-xl">❌</span>
          <div>
            <div className="text-sm font-medium text-error">
              {data.gmc_disapproved.toLocaleString()} rejetés
            </div>
            <div className="text-xs text-error/70">Voir les raisons →</div>
          </div>
        </button>
      )}
      {data.google_channel_not_published > 0 && (
        <button
          type="button"
          onClick={() => onNavigateToIssue?.('gmc_not_published_google')}
          className="flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-2 text-left transition-colors hover:bg-orange-500/20"
        >
          <span className="text-xl">🛍️</span>
          <div>
            <div className="text-sm font-medium text-orange-400">
              {data.google_channel_not_published.toLocaleString()} non publiés
            </div>
            <div className="text-xs text-orange-400/70">Non envoyés au canal →</div>
          </div>
        </button>
      )}
    </div>
  )
}

function FlowInfoNote(): React.ReactElement {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-xs text-info">
      <span className="text-sm">ℹ️</span>
      <div>
        <strong>Note:</strong> GMC compte les variantes (taille, couleur...) tandis que Shopify
        compte les produits parents. C&apos;est normal que le nombre GMC soit plus élevé.
      </div>
    </div>
  )
}

export function GMCFlowKPI({ data, onNavigateToIssue }: GMCFlowKPIProps): React.ReactElement {
  const approvalRate =
    data.gmc_received > 0
      ? Math.round((data.gmc_approved / data.gmc_received) * PERCENTAGE_MULTIPLIER)
      : 0

  const losses = {
    shopifyToChannel: data.google_channel_not_published,
    channelToGMC: data.google_channel_published - data.gmc_received,
    gmcToApproved: data.gmc_disapproved + data.gmc_pending,
  }

  return (
    <div className="card-elevated p-6">
      <GMCFlowHeader approvalRate={approvalRate} />
      <FlowVisualization data={data} losses={losses} onNavigateToIssue={onNavigateToIssue} />
      <FlowLegend data={data} onNavigateToIssue={onNavigateToIssue} />
      <FlowInfoNote />
    </div>
  )
}
