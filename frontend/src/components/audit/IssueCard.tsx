/**
 * Audit Pipeline - Issue Card Components
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
          <li key={i} className="flex items-start gap-1 text-xs text-gray-500">
            <span className="mt-1.5 h-1 w-1 rounded-full bg-gray-400" />
            {detail}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          type="button"
          onClick={() => {
            setExpanded(!expanded)
          }}
        >
          {expanded ? (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Voir moins
            </>
          ) : (
            <>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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
  onExecuteAction,
}: {
  actionStatus: string
  actionLabel: string
  actionPending: boolean
  onExecuteAction: () => void
}): React.ReactElement {
  const actionStatusColors: Record<string, string> = {
    available: 'bg-burgundy text-white hover:bg-burgundy/90',
    running: 'bg-blue-500 text-white',
    completed: 'bg-green-500 text-white',
    failed: 'bg-red-500 text-white',
    not_available: 'bg-gray-200 text-gray-400 cursor-not-allowed',
  }

  const buttonLabel = getActionButtonLabel(actionStatus, actionLabel, actionPending)

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
    critical: 'border-l-red-500 bg-red-50',
    high: 'border-l-orange-500 bg-orange-50',
    medium: 'border-l-amber-500 bg-amber-50',
    low: 'border-l-blue-500 bg-blue-50',
  }

  const severityBadge: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-blue-100 text-blue-800',
  }

  return (
    <div className={`rounded-lg border-l-4 p-4 ${severityColors[issue.severity]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900">{issue.title}</h4>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityBadge[issue.severity]}`}
            >
              {issue.severity}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{issue.description}</p>

          {issue.details !== null && issue.details.length > 0 && (
            <IssueDetails details={issue.details} />
          )}
        </div>

        {issue.action_available && issue.action_label !== null && (
          <ActionButton
            actionStatus={issue.action_status}
            actionLabel={issue.action_label}
            actionPending={actionPending}
            onExecuteAction={onExecuteAction}
          />
        )}
      </div>
    </div>
  )
}

function SuccessPanel(): React.ReactElement {
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
      <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-6 w-6 text-green-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="font-medium text-green-800">Aucun problème détecté</p>
      <p className="text-sm text-green-600">Votre tracking est correctement configuré</p>
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
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 font-medium text-gray-900">
          Problèmes détectés ({String(issues.length)})
        </h2>

        <div className="space-y-3">
          {issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              onExecuteAction={() => {
                if (issue.action_id !== null) {
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
