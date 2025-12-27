/**
 * Onboarding Card - Row Layout with Accordion (same as other audits)
 */

import React from 'react'

import type { AuditStepStatus, AvailableAudit } from '../../services/api'
import { formatLastRunDate } from './dateUtils'
import { LoadingSpinner, StatusBadge } from './StatusIcons'
import { AuditTooltip } from './Tooltip'

interface ExtendedAudit extends AvailableAudit {
  is_primary?: boolean
}

function getRowBorderColor(
  isSelected: boolean,
  isRunning: boolean,
  status: AuditStepStatus | null
): string {
  if (isRunning) {
    return 'ring-1 ring-info border-info/50 bg-info/5'
  }
  if (isSelected) {
    return 'ring-1 ring-brand border-brand/50 bg-brand/5'
  }
  const statusColors: Record<string, string> = {
    success: 'border-success/20 hover:border-success/40',
    warning: 'border-warning/20 hover:border-warning/40',
    error: 'border-error/20 hover:border-error/40',
  }
  if (status !== null) {
    return statusColors[status] ?? 'border-brand/30 hover:border-brand/50'
  }
  return 'border-brand/30 hover:border-brand/50'
}

function OnboardingIcon({ isRunning }: { isRunning: boolean }): React.ReactElement {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
        isRunning ? 'bg-info/20 text-info' : 'bg-brand/20 text-brand'
      }`}
    >
      {isRunning ? (
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            d="M13 10V3L4 14h7v7l9-11h-7z"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      )}
    </div>
  )
}

function RowRunButton({
  isRunning,
  lastStatus,
  onRun,
}: {
  isRunning: boolean
  lastStatus: string | null
  onRun: () => void
}): React.ReactElement {
  const [isPending, setIsPending] = React.useState(false)

  // Reset pending state when audit starts running
  React.useEffect(() => {
    if (isRunning) {
      setIsPending(false)
    }
  }, [isRunning])

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 text-info" data-testid="audit-running-indicator">
        <LoadingSpinner size="sm" />
        <span className="text-xs">En cours...</span>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-text-muted" data-testid="audit-pending-indicator">
        <LoadingSpinner size="sm" />
        <span className="text-xs">Démarrage...</span>
      </div>
    )
  }

  const buttonText = lastStatus !== null ? 'Relancer' : 'Lancer'

  return (
    <button
      className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-light active:scale-95"
      data-testid="audit-launch-button"
      onClick={(e) => {
        e.stopPropagation()
        setIsPending(true)
        onRun()
      }}
      type="button"
    >
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
      {buttonText}
    </button>
  )
}

function ChevronIcon({ isOpen }: { isOpen: boolean }): React.ReactElement {
  return (
    <svg
      className={`h-4 w-4 text-text-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

export function OnboardingCard({
  audit,
  isRunning,
  isSelected,
  onRun,
  onSelect,
}: {
  audit: ExtendedAudit
  isRunning: boolean
  isSelected: boolean
  onRun: () => void
  onSelect: () => void
}): React.ReactElement {
  const borderColor = getRowBorderColor(isSelected, isRunning, audit.last_status)

  return (
    <div
      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${borderColor}`}
      data-audit-type={audit.type}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center gap-3">
        <OnboardingIcon isRunning={isRunning} />
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{audit.name}</span>
            <AuditTooltip auditType={audit.type} />
            {!isRunning && audit.last_status !== null && (
              <StatusBadge status={audit.last_status} issuesCount={audit.issues_count} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">{audit.description}</span>
            {!isRunning && audit.last_run !== null && (
              <span className="text-xs text-text-muted">
                • {formatLastRunDate(audit.last_run)}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <RowRunButton isRunning={isRunning} lastStatus={audit.last_status} onRun={onRun} />
        <ChevronIcon isOpen={isSelected} />
      </div>
    </div>
  )
}
