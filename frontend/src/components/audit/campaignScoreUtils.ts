/**
 * Campaign Score Utilities
 *
 * Functions for calculating campaign readiness scores and recommendations.
 */

import type { AuditResult } from '../../services/api'

// Score weights by audit type (importance for campaign readiness)
const AUDIT_WEIGHTS: Record<string, number> = {
  merchant_center: 25, // Critical for Shopping campaigns
  meta_pixel: 20, // Critical for Meta campaigns
  ga4: 20, // Critical for measurement
  capi: 15, // Important for Meta optimization
  search_console: 10, // Important for organic visibility
  onboarding: 10, // General setup validation
}

// Default weight for unknown audit types
const DEFAULT_WEIGHT = 10

// Score multipliers by status
const STATUS_SCORES: Record<string, number> = {
  success: 1.0,
  warning: 0.7,
  error: 0.0,
  skipped: 0.5,
  running: 0.0,
  pending: 0.0,
}

// Score thresholds
const SCORE_THRESHOLD_READY = 80
const SCORE_THRESHOLD_PARTIAL = 50

// Issue penalties
const MAX_ISSUE_PENALTY = 0.5
const CRITICAL_ISSUE_PENALTY = 0.3
const HIGH_ISSUE_PENALTY = 0.15

// Recommendations limits
const READY_MAX_RECOMMENDATIONS = 3
const PARTIAL_MAX_RECOMMENDATIONS = 5

export interface AuditProgress {
  auditType: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'error'
  result: AuditResult | null
  error: string | null
}

export interface CampaignScore {
  total: number // 0-100
  breakdown: {
    auditType: string
    name: string
    weight: number
    score: number // 0-1
    weightedScore: number
    status: string
    issuesCount: number
  }[]
}

export interface CampaignReadiness {
  level: 'ready' | 'partial' | 'not_ready'
  label: string
  description: string
  recommendations: string[]
}

function calculateIssuePenalty(result: AuditResult): number {
  if (result.issues.length === 0) {
    return 0
  }

  const criticalIssues = result.issues.filter((i) => i.severity === 'critical').length
  const highIssues = result.issues.filter((i) => i.severity === 'high').length

  return Math.min(
    MAX_ISSUE_PENALTY,
    criticalIssues * CRITICAL_ISSUE_PENALTY + highIssues * HIGH_ISSUE_PENALTY
  )
}

function buildBreakdownEntry(progress: AuditProgress): CampaignScore['breakdown'][number] | null {
  if (progress.result === null) {
    return null
  }

  const { result } = progress
  const weight = AUDIT_WEIGHTS[progress.auditType] ?? DEFAULT_WEIGHT
  const statusScore = STATUS_SCORES[result.status] ?? 0
  const issuesPenalty = calculateIssuePenalty(result)
  const adjustedScore = Math.max(0, statusScore - issuesPenalty)

  return {
    auditType: progress.auditType,
    name: progress.name,
    weight,
    score: adjustedScore,
    weightedScore: adjustedScore * weight,
    status: result.status,
    issuesCount: result.issues.length,
  }
}

export function calculateCampaignScore(progress: AuditProgress[]): CampaignScore {
  const completedAudits = progress.filter((p) => p.status === 'completed' && p.result !== null)

  if (completedAudits.length === 0) {
    return { total: 0, breakdown: [] }
  }

  const breakdown = completedAudits
    .map(buildBreakdownEntry)
    .filter((entry): entry is CampaignScore['breakdown'][number] => entry !== null)

  const totalWeight = breakdown.reduce((sum, b) => sum + b.weight, 0)
  const totalWeightedScore = breakdown.reduce((sum, b) => sum + b.weightedScore, 0)
  const total = totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) : 0

  return { total, breakdown }
}

function collectRecommendations(progress: AuditProgress[]): string[] {
  const recommendations: string[] = []

  const failedAudits = progress.filter(
    (p) => p.status === 'completed' && p.result?.status === 'error'
  )
  const warningAudits = progress.filter(
    (p) => p.status === 'completed' && p.result?.status === 'warning'
  )
  const erroredAudits = progress.filter((p) => p.status === 'error')

  failedAudits.forEach((audit) => {
    const criticalIssues =
      audit.result?.issues.filter((i) => i.severity === 'critical' || i.severity === 'high') ?? []
    if (criticalIssues.length > 0) {
      recommendations.push(`${audit.name}: ${criticalIssues[0].title}`)
    }
  })

  warningAudits.forEach((audit) => {
    const issues = audit.result?.issues.slice(0, 1) ?? []
    if (issues.length > 0) {
      recommendations.push(`${audit.name}: ${issues[0].title}`)
    }
  })

  erroredAudits.forEach((audit) => {
    recommendations.push(`${audit.name}: Échec de l'audit - ${audit.error ?? 'erreur inconnue'}`)
  })

  return recommendations
}

export function determineCampaignReadiness(
  score: CampaignScore,
  progress: AuditProgress[]
): CampaignReadiness {
  const recommendations = collectRecommendations(progress)
  const failedAudits = progress.filter(
    (p) => p.status === 'completed' && p.result?.status === 'error'
  )

  if (score.total >= SCORE_THRESHOLD_READY && failedAudits.length === 0) {
    return {
      level: 'ready',
      label: 'Prêt pour la campagne',
      description:
        'Votre configuration est optimale. Tous les services critiques sont correctement configurés.',
      recommendations: recommendations.slice(0, READY_MAX_RECOMMENDATIONS),
    }
  }

  if (score.total >= SCORE_THRESHOLD_PARTIAL) {
    return {
      level: 'partial',
      label: 'Partiellement prêt',
      description:
        'Certains éléments nécessitent votre attention avant de lancer une campagne optimale.',
      recommendations: recommendations.slice(0, PARTIAL_MAX_RECOMMENDATIONS),
    }
  }

  return {
    level: 'not_ready',
    label: 'Non prêt',
    description:
      'Des problèmes critiques doivent être résolus avant de lancer une campagne publicitaire.',
    recommendations: recommendations.slice(0, PARTIAL_MAX_RECOMMENDATIONS),
  }
}
