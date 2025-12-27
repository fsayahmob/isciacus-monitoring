/**
 * AuditCampaignSummary - Campaign readiness summary component
 *
 * Displays the overall score, audit breakdown, and recommendations
 * after running all audits sequentially.
 */

import React from 'react'

import type { AuditProgress, CampaignReadiness, CampaignScore } from './campaignScoreUtils'

// ============================================================================
// Constants
// ============================================================================

const SCORE_THRESHOLD_HIGH = 80
const SCORE_THRESHOLD_MEDIUM = 50
const FULL_CIRCLE_DEGREES = 100

const READINESS_COLORS: Record<CampaignReadiness['level'], string> = {
  ready: 'bg-success/10 border-success/30 text-success',
  partial: 'bg-warning/10 border-warning/30 text-warning',
  not_ready: 'bg-error/10 border-error/30 text-error',
}

const READINESS_BG: Record<CampaignReadiness['level'], string> = {
  ready: 'bg-success',
  partial: 'bg-warning',
  not_ready: 'bg-error',
}

const SCORE_COLORS: Record<string, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  skipped: 'text-text-muted',
}

// ============================================================================
// Props
// ============================================================================

interface AuditCampaignSummaryProps {
  score: CampaignScore
  readiness: CampaignReadiness
  progress: AuditProgress[]
  onDismiss: () => void
}

// ============================================================================
// Sub-components
// ============================================================================

function ScoreCircle({ score }: { score: number }): React.ReactElement {
  const radius = 45
  const circumference = 2 * Math.PI * radius
  const progressValue = (score / FULL_CIRCLE_DEGREES) * circumference
  const remaining = circumference - progressValue

  let colorClass = 'text-error'
  if (score >= SCORE_THRESHOLD_HIGH) {
    colorClass = 'text-success'
  } else if (score >= SCORE_THRESHOLD_MEDIUM) {
    colorClass = 'text-warning'
  }

  return (
    <div className="relative h-32 w-32">
      <svg className="h-32 w-32 -rotate-90 transform" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-bg-tertiary"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={`${String(progressValue)} ${String(remaining)}`}
          strokeLinecap="round"
          className={colorClass}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${colorClass}`}>{score}</span>
        <span className="text-xs text-text-secondary">/100</span>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }): React.ReactElement {
  if (status === 'success') {
    return (
      <svg className="h-5 w-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    )
  }

  if (status === 'warning') {
    return (
      <svg className="h-5 w-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    )
  }

  return (
    <svg className="h-5 w-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function AuditBreakdownRow({
  name,
  status,
  issuesCount,
  weightedScore,
  weight,
}: {
  name: string
  status: string
  issuesCount: number
  weightedScore: number
  weight: number
}): React.ReactElement {
  const percentage = Math.round((weightedScore / weight) * FULL_CIRCLE_DEGREES)

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <StatusIcon status={status} />
        <span className="text-sm text-text-primary">{name}</span>
      </div>
      <div className="flex items-center gap-4">
        {issuesCount > 0 && (
          <span className="text-xs text-text-muted">
            {issuesCount} {issuesCount === 1 ? 'problème' : 'problèmes'}
          </span>
        )}
        <div className="flex w-16 items-center justify-end">
          <span className={`text-sm font-medium ${SCORE_COLORS[status] ?? 'text-text-primary'}`}>
            {percentage}%
          </span>
        </div>
      </div>
    </div>
  )
}

function RecommendationsList({
  recommendations,
}: {
  recommendations: string[]
}): React.ReactElement | null {
  if (recommendations.length === 0) {
    return null
  }

  return (
    <div className="mt-4 rounded-lg bg-bg-tertiary p-4">
      <h4 className="mb-3 text-sm font-medium text-text-primary">Actions recommandées</h4>
      <ul className="space-y-2">
        {recommendations.map((rec, index) => (
          <li key={index} className="flex items-start gap-2 text-sm text-text-secondary">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            {rec}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SummaryHeader({
  completedCount,
  erroredCount,
  onDismiss,
}: {
  completedCount: number
  erroredCount: number
  onDismiss: () => void
}): React.ReactElement {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Résumé de campagne</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {completedCount} audits terminés
          {erroredCount > 0 && `, ${String(erroredCount)} en erreur`}
        </p>
      </div>
      <button
        className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        onClick={onDismiss}
        type="button"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}

function ScoreAndReadiness({
  score,
  readiness,
}: {
  score: number
  readiness: CampaignReadiness
}): React.ReactElement {
  return (
    <div className="mb-6 flex items-center gap-6">
      <div data-testid="campaign-score-circle">
        <ScoreCircle score={score} />
      </div>
      <div className="flex-1">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 ${READINESS_COLORS[readiness.level]}`}
          data-testid="campaign-readiness-badge"
        >
          <span className={`h-2 w-2 rounded-full ${READINESS_BG[readiness.level]}`} />
          <span className="font-medium">{readiness.label}</span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">{readiness.description}</p>
      </div>
    </div>
  )
}

function AuditBreakdownSection({
  breakdown,
}: {
  breakdown: CampaignScore['breakdown']
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-primary p-4">
      <h3 className="mb-3 text-sm font-medium text-text-primary">Détail par audit</h3>
      <div className="divide-y divide-border-subtle">
        {breakdown.map((item) => (
          <AuditBreakdownRow
            key={item.auditType}
            name={item.name}
            status={item.status}
            issuesCount={item.issuesCount}
            weightedScore={item.weightedScore}
            weight={item.weight}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function AuditCampaignSummary({
  score,
  readiness,
  progress,
  onDismiss,
}: AuditCampaignSummaryProps): React.ReactElement {
  const completedCount = progress.filter((p) => p.status === 'completed').length
  const erroredCount = progress.filter((p) => p.status === 'error').length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      data-testid="campaign-summary-modal"
    >
      <div className="mx-4 w-full max-w-2xl animate-slide-up rounded-2xl bg-bg-secondary p-6 shadow-2xl">
        <SummaryHeader
          completedCount={completedCount}
          erroredCount={erroredCount}
          onDismiss={onDismiss}
        />
        <ScoreAndReadiness score={score.total} readiness={readiness} />
        <AuditBreakdownSection breakdown={score.breakdown} />
        <RecommendationsList recommendations={readiness.recommendations} />
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="btn btn-secondary"
            data-testid="campaign-summary-close"
            onClick={onDismiss}
            type="button"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
