/**
 * Audit Pipeline - Issue Card Components - Modern Dark Theme
 */

import React from 'react'

import type { AuditIssue, AuditStepStatus } from '../../services/api'
import { LoadingSpinner } from './StatusIcons'
import { DETAILS_LIMIT } from './utils'

function IssueDetails({ details }: { details: string[] }): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const visibleDetails = expanded ? details : details.slice(0, DETAILS_LIMIT)
  const remainingCount = details.length - DETAILS_LIMIT
  const hasMore = remainingCount > 0

  return (
    <div className="mt-2">
      <ul className="space-y-1">
        {visibleDetails.map((detail, i) => (
          <li key={i} className="flex items-start gap-1 text-xs text-text-tertiary">
            <span className="mt-1.5 h-1 w-1 rounded-full bg-text-muted" />
            {detail}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          className="mt-2 flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
          type="button"
          onClick={() => {
            setExpanded(!expanded)
          }}
        >
          {expanded ? (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
              Voir moins
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
              Voir {String(remainingCount)} de plus
            </>
          )}
        </button>
      )}
    </div>
  )
}

function getActionButtonLabel(
  actionStatus: string,
  actionLabel: string,
  actionPending: boolean
): React.ReactElement | string {
  if (actionStatus === 'running' || actionPending) {
    return (
      <span className="flex items-center gap-1">
        <LoadingSpinner size="sm" />
        En cours...
      </span>
    )
  }
  if (actionStatus === 'completed') {
    return 'Corrigé'
  }
  if (actionStatus === 'failed') {
    return 'Échec'
  }
  return actionLabel
}

function ActionButton({
  actionStatus,
  actionLabel,
  actionPending,
  actionUrl,
  onExecuteAction,
}: {
  actionStatus: string
  actionLabel: string
  actionPending: boolean
  actionUrl: string | null
  onExecuteAction: () => void
}): React.ReactElement {
  const actionStatusColors: Record<string, string> = {
    available: 'bg-brand text-white hover:bg-brand-light',
    running: 'bg-info text-white',
    completed: 'bg-success text-white',
    failed: 'bg-error text-white',
    not_available: 'bg-bg-tertiary text-text-muted cursor-not-allowed',
  }

  const buttonLabel = getActionButtonLabel(actionStatus, actionLabel, actionPending)

  // If action_url is provided, render as external link
  if (actionUrl !== null && actionUrl !== '' && actionStatus === 'available') {
    return (
      <a
        href={actionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex flex-shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${actionStatusColors[actionStatus]}`}
      >
        {actionLabel}
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    )
  }

  return (
    <button
      className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${actionStatusColors[actionStatus]}`}
      disabled={actionStatus !== 'available' || actionPending}
      onClick={onExecuteAction}
      type="button"
    >
      {buttonLabel}
    </button>
  )
}

export function IssueCard({
  issue,
  onExecuteAction,
  actionPending,
}: {
  issue: AuditIssue
  onExecuteAction: () => void
  actionPending: boolean
}): React.ReactElement {
  const severityColors: Record<string, string> = {
    critical: 'border-l-error bg-error/10',
    high: 'border-l-orange-500 bg-orange-500/10',
    medium: 'border-l-warning bg-warning/10',
    low: 'border-l-info bg-info/10',
    warning: 'border-l-warning bg-warning/10',
    info: 'border-l-success bg-success/10',
  }

  const severityBadge: Record<string, string> = {
    critical: 'bg-error/20 text-error',
    high: 'bg-orange-500/20 text-orange-400',
    medium: 'bg-warning/20 text-warning',
    low: 'bg-info/20 text-info',
    warning: 'bg-warning/20 text-warning',
    info: 'bg-success/20 text-success',
  }

  return (
    <div
      id={`issue-${issue.id}`}
      className={`rounded-lg border-l-4 p-4 transition-all ${severityColors[issue.severity]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-text-primary">{issue.title}</h4>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityBadge[issue.severity]}`}
            >
              {issue.severity}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{issue.description}</p>

          {issue.details !== null && issue.details.length > 0 && (
            <IssueDetails details={issue.details} />
          )}
        </div>

        {issue.action_available && issue.action_label !== null && (
          <ActionButton
            actionStatus={issue.action_status}
            actionLabel={issue.action_label}
            actionPending={actionPending}
            actionUrl={issue.action_url ?? null}
            onExecuteAction={onExecuteAction}
          />
        )}
      </div>
    </div>
  )
}

function SuccessPanel(): React.ReactElement {
  return (
    <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center">
      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
        <svg
          className="h-6 w-6 text-success"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="font-medium text-success">Aucun problème détecté</p>
      <p className="text-sm text-success/80">Votre tracking est correctement configuré</p>
    </div>
  )
}

export function IssuesPanel({
  issues,
  auditType,
  status,
  onExecuteAction,
  actionPending,
}: {
  issues: AuditIssue[]
  auditType: string
  status: AuditStepStatus
  onExecuteAction: (auditType: string, actionId: string) => void
  actionPending: boolean
}): React.ReactElement | null {
  if (issues.length > 0) {
    return (
      <div className="card-elevated p-6">
        <h2 className="mb-4 font-medium text-text-primary">
          Problèmes détectés ({String(issues.length)})
        </h2>

        <div className="space-y-3">
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onExecuteAction={() => {
                // Only call backend action if there's no external URL
                const hasNoUrl = issue.action_url === null || issue.action_url === ''
                if (issue.action_id !== null && hasNoUrl) {
                  onExecuteAction(auditType, issue.action_id)
                }
              }}
              actionPending={actionPending}
            />
          ))}
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return <SuccessPanel />
  }

  return null
}
