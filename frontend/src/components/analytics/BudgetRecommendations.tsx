/**
 * Budget Recommendations Component
 * Strategic budget allocation based on LTV/CAC ratios
 */

import React from 'react'

interface BudgetRecommendation {
  channel: string
  currentBudget: number
  recommendedBudget: number
  change: number
  reason: string
  priority: 'high' | 'medium' | 'low'
}

const MOCK_RECOMMENDATIONS: BudgetRecommendation[] = [
  {
    channel: 'Meta Ads - Champions',
    currentBudget: 1500,
    recommendedBudget: 2500,
    change: 66.7,
    reason: 'LTV/CAC = 8.3x (excellent). Augmenter pour maximiser ROAS',
    priority: 'high',
  },
  {
    channel: 'Google Shopping - Loyal',
    currentBudget: 2000,
    recommendedBudget: 2800,
    change: 40.0,
    reason: 'LTV/CAC = 6.7x (très bon). Opportunité de scale',
    priority: 'high',
  },
  {
    channel: 'Meta Ads - At Risk',
    currentBudget: 1200,
    recommendedBudget: 1200,
    change: 0,
    reason: 'LTV/CAC = 4.4x (correct). Maintenir budget actuel',
    priority: 'medium',
  },
  {
    channel: 'Google Ads - Lost',
    currentBudget: 1800,
    recommendedBudget: 800,
    change: -55.6,
    reason: 'LTV/CAC = 1.8x (faible). Réduire ou améliorer targeting',
    priority: 'high',
  },
]

function getPriorityBadge(priority: string): { label: string; color: string } {
  if (priority === 'high') {
    return { label: 'Urgent', color: 'bg-error/20 text-error' }
  }
  if (priority === 'medium') {
    return { label: 'Moyen', color: 'bg-warning/20 text-warning' }
  }
  return { label: 'Faible', color: 'bg-text-muted/20 text-text-muted' }
}

function getChangeIndicator(change: number): React.ReactElement {
  if (change > 0) {
    return (
      <div className="flex items-center gap-1 text-success">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            d="M5 10l7-7m0 0l7 7m-7-7v18"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
        <span className="text-sm font-medium">+{change.toFixed(0)}%</span>
      </div>
    )
  }
  if (change < 0) {
    return (
      <div className="flex items-center gap-1 text-error">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
        <span className="text-sm font-medium">{change.toFixed(0)}%</span>
      </div>
    )
  }
  return <span className="text-sm text-text-muted">Maintenir</span>
}

export function BudgetRecommendationsSection(): React.ReactElement {
  const totalCurrent = MOCK_RECOMMENDATIONS.reduce((sum, r) => sum + r.currentBudget, 0)
  const totalRecommended = MOCK_RECOMMENDATIONS.reduce((sum, r) => sum + r.recommendedBudget, 0)

  return (
    <div className="mb-8">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-text-primary">Recommandations Budget Ads</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Optimisation basée sur LTV/CAC • Règle: CAC {'<'} LTV/3 pour rentabilité
        </p>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <div className="card-elevated rounded-xl p-4">
          <p className="text-sm text-text-tertiary">Budget Actuel Total</p>
          <p className="mt-1 text-3xl font-bold text-text-primary">
            {totalCurrent.toLocaleString()}€
          </p>
          <p className="mt-1 text-xs text-text-muted">par mois</p>
        </div>
        <div className="card-elevated rounded-xl p-4">
          <p className="text-sm text-text-tertiary">Budget Recommandé Total</p>
          <p className="mt-1 text-3xl font-bold text-brand">{totalRecommended.toLocaleString()}€</p>
          <p className="mt-1 text-xs text-text-muted">
            {totalRecommended > totalCurrent ? '+' : ''}
            {(((totalRecommended - totalCurrent) / totalCurrent) * 100).toFixed(1)}% vs actuel
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {MOCK_RECOMMENDATIONS.map((rec) => {
          const priority = getPriorityBadge(rec.priority)
          return (
            <div key={rec.channel} className="card-elevated rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <h4 className="font-semibold text-text-primary">{rec.channel}</h4>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${priority.color}`}
                    >
                      {priority.label}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary">{rec.reason}</p>
                  <div className="mt-3 flex items-center gap-6">
                    <div>
                      <p className="text-xs text-text-tertiary">Actuel</p>
                      <p className="text-lg font-semibold text-text-primary">
                        {rec.currentBudget.toLocaleString()}€
                      </p>
                    </div>
                    <div className="flex items-center">{getChangeIndicator(rec.change)}</div>
                    <div>
                      <p className="text-xs text-text-tertiary">Recommandé</p>
                      <p className="text-lg font-semibold text-brand">
                        {rec.recommendedBudget.toLocaleString()}€
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card-elevated mt-4 rounded-xl bg-brand/10 p-4">
        <p className="text-sm font-medium text-brand">
          💰 Impact Potentiel: +
          {(((totalRecommended - totalCurrent) / totalCurrent) * 100).toFixed(0)}% budget =
          Optimisation du ROAS en concentrant sur segments rentables
        </p>
      </div>
    </div>
  )
}
