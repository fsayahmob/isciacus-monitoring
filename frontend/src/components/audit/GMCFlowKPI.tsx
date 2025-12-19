/**
 * GMC Flow KPI - Modern Dark Theme
 * Shows the pipeline: Shopify → Google Channel → GMC → Approved
 */

import React from 'react'

export interface GMCFlowData {
  shopify_total: number
  google_channel_published: number
  google_channel_not_published: number
  gmc_received: number
  gmc_approved: number
  gmc_pending: number
  gmc_disapproved: number
}

interface FlowStageProps {
  icon: React.ReactNode
  label: string
  count: number
  sublabel?: string
  color: string
  onClick?: () => void
}

function FlowStage({
  icon,
  label,
  count,
  sublabel,
  color,
  onClick,
}: FlowStageProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center rounded-xl border-2 bg-bg-secondary p-4 transition-all hover:bg-bg-tertiary ${onClick ? 'cursor-pointer' : 'cursor-default'} ${color}`}
    >
      <div className="mb-2 text-3xl">{icon}</div>
      <div className="text-2xl font-bold text-text-primary">{count.toLocaleString()}</div>
      <div className="text-sm font-medium text-text-secondary">{label}</div>
      {sublabel !== undefined && sublabel !== '' && (
        <div className="mt-1 text-xs text-text-tertiary">{sublabel}</div>
      )}
    </button>
  )
}

interface FlowArrowProps {
  loss: number
  lossLabel: string
  issueId?: string
  onNavigateToIssue?: (issueId: string) => void
}

function FlowArrow({
  loss,
  lossLabel,
  issueId,
  onNavigateToIssue,
}: FlowArrowProps): React.ReactElement {
  const hasLoss = loss > 0

  return (
    <div className="flex flex-col items-center justify-center px-2">
      {/* Arrow */}
      <div className="flex items-center">
        <div className={`h-1 w-8 ${hasLoss ? 'bg-error/50' : 'bg-success/50'}`} />
        <svg
          className={`h-4 w-4 ${hasLoss ? 'text-error' : 'text-success'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Loss indicator */}
      {hasLoss && (
        <button
          type="button"
          onClick={() => {
            if (issueId !== undefined && issueId !== '' && onNavigateToIssue !== undefined) {
              onNavigateToIssue(issueId)
            }
          }}
          className={`mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            issueId !== undefined && issueId !== '' && onNavigateToIssue !== undefined
              ? 'cursor-pointer bg-error/20 text-error hover:bg-error/30'
              : 'bg-error/10 text-error/80'
          }`}
        >
          -{loss.toLocaleString()} {lossLabel}
        </button>
      )}
    </div>
  )
}

// SVG Icons for each stage
function ShopifyIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="#96bf48">
      <path d="M15.337 3.418c-.027 0-.053.003-.08.003-.133 0-.267-.003-.4.003-.147 0-.293.01-.44.016-.293.01-.587.023-.88.04a5.847 5.847 0 00-.68.08c-.173.03-.346.063-.52.1-.173.037-.346.077-.52.123-.173.047-.346.097-.52.153-.173.057-.346.117-.52.183-.173.067-.346.137-.52.213-.173.077-.346.157-.52.243-.133.067-.267.137-.4.21-.08.047-.16.093-.24.143-.107.067-.214.137-.32.21-.08.053-.16.11-.24.167a5.857 5.857 0 00-.56.443c-.08.067-.16.137-.24.21-.107.1-.214.2-.32.307-.08.08-.16.163-.24.247a5.93 5.93 0 00-.48.563c-.08.103-.16.207-.24.313-.08.107-.16.217-.24.327-.08.11-.16.223-.24.337-.053.08-.107.16-.16.243a8.113 8.113 0 00-.32.527c-.053.093-.107.187-.16.28-.08.147-.16.293-.24.443l-.16.313c-.08.157-.16.317-.24.48l-.12.267c-.08.173-.16.347-.24.523l-.08.2c-.08.187-.16.377-.24.567l-.04.107c-.08.2-.16.403-.24.607v.003c-.08.207-.16.417-.24.627v.017c-.027.077-.053.153-.08.23v.003l-.08.247v.003l-.08.25v.003c-.027.083-.053.167-.08.25v.003c-.027.083-.053.167-.08.25v.003c-.027.083-.053.167-.08.25v.003c-.027.083-.053.167-.08.25v.003c-.027.083-.053.167-.08.253v.003l-.08.253v.003c-.027.083-.053.167-.08.253v.003c-.027.083-.053.167-.08.253v.003c-.027.083-.053.17-.08.253v.003l-.08.257v.003c-.027.087-.053.173-.08.26v.003c-.027.087-.053.173-.08.26v.003c-.027.087-.053.177-.08.263v.007c-.027.087-.053.177-.08.267v.003c-.027.09-.053.18-.08.27v.003c-.027.09-.053.18-.08.27v.007c-.027.09-.053.183-.08.273v.003c-.027.093-.053.187-.08.28v.007c-.027.093-.053.187-.08.28v.007c-.027.093-.053.19-.08.283v.007c-.027.097-.053.193-.08.29v.007c-.027.097-.053.193-.08.29v.01c-.027.097-.053.197-.08.297v.01c-.027.1-.053.2-.08.3v.01c-.027.1-.053.2-.08.303v.01l-.08.307v.01c-.027.103-.053.207-.08.31v.013c-.027.103-.053.21-.08.313v.013c-.027.107-.053.213-.08.32v.013c-.027.107-.053.217-.08.327v.017c-.027.11-.053.22-.08.33v.017c-.027.11-.053.223-.08.337v.017c-.027.113-.053.227-.08.343v.02c-.027.117-.053.233-.08.35v.02c-.027.117-.053.237-.08.357v.02c-.027.12-.053.24-.08.363v.023c-.027.123-.053.247-.08.373v.023c-.027.127-.053.253-.08.38v.027c-.027.13-.053.26-.08.393v.027c-.027.133-.053.27-.08.403v.03c-.027.14-.053.28-.08.42v.033c-.027.147-.053.293-.08.443v.037c-.027.153-.053.307-.08.463v.043c-.027.163-.053.327-.08.493v.05c-.027.177-.053.357-.08.537v.063c-.027.197-.053.397-.08.597v.087c-.027.23-.053.463-.08.7v.147a21.72 21.72 0 00-.08.88v.43c-.027.42-.053.857-.08 1.303v13.003c0 .373.303.677.677.677h12.647c.373 0 .677-.303.677-.677V8.92l3.08-.543c.183-.033.357-.123.487-.26a.676.676 0 00.193-.483V4.967a.67.67 0 00-.537-.66l-2.143-.383c-.04-.277-.16-.537-.347-.747a1.347 1.347 0 00-.76-.447l-.003-.003a1.365 1.365 0 00-.537-.02c-.003-.033-.003-.067-.003-.1V2.58a.677.677 0 00-.677-.677H15.4a.677.677 0 00-.063.003V2.58z" />
    </svg>
  )
}

function GoogleChannelIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8">
      <path fill="#4285F4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
      <path fill="#fff" d="M12 6l-4 4h3v4H9l3 4 3-4h-2v-4h3z" />
    </svg>
  )
}

function GMCIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8">
      <rect x="2" y="4" width="20" height="16" rx="2" fill="#4285F4" />
      <rect x="4" y="6" width="16" height="8" fill="#fff" />
      <circle cx="12" cy="10" r="3" fill="#34A853" />
      <rect x="4" y="16" width="16" height="2" fill="#FBBC05" />
    </svg>
  )
}

function ApprovedIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8">
      <circle cx="12" cy="12" r="10" fill="#34A853" />
      <path fill="#fff" d="M10 15.17l-3.17-3.17-1.41 1.41L10 18l8-8-1.41-1.41z" />
    </svg>
  )
}

interface GMCFlowKPIProps {
  data: GMCFlowData
  onNavigateToIssue?: (issueId: string) => void
}

const HIGH_APPROVAL_THRESHOLD = 95
const MEDIUM_APPROVAL_THRESHOLD = 80

function getApprovalRateColor(rate: number): string {
  if (rate >= HIGH_APPROVAL_THRESHOLD) {
    return 'bg-success/20 text-success'
  }
  if (rate >= MEDIUM_APPROVAL_THRESHOLD) {
    return 'bg-warning/20 text-warning'
  }
  return 'bg-error/20 text-error'
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

const PERCENTAGE_MULTIPLIER = 100

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
