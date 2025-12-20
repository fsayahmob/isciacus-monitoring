/**
 * Onboarding Card - Primary audit card with special styling
 * Modern Dark Theme
 */

import React from 'react'

import type { AuditStepStatus, AvailableAudit } from '../../services/api'
import { LoadingSpinner, StatusBadge } from './StatusIcons'
import { AuditTooltip } from './Tooltip'
import { formatRelativeTime } from './utils'

interface ExtendedAudit extends AvailableAudit {
  is_primary?: boolean
}

function getOnboardingBorderColor(
  isSelected: boolean,
  isRunning: boolean,
  lastStatus: string | null
): string {
  if (isRunning) {
    return 'ring-1 ring-info border-info/50 bg-gradient-to-r from-info/10 to-info/5'
  }
  if (isSelected) {
    return 'ring-1 ring-brand border-brand/50'
  }
  if (lastStatus === 'success') {
    return 'border-success/30 bg-gradient-to-r from-success/10 to-success/5'
  }
  if (lastStatus === 'warning') {
    return 'border-warning/30 bg-gradient-to-r from-warning/10 to-warning/5'
  }
  if (lastStatus === 'error') {
    return 'border-error/30 bg-gradient-to-r from-error/10 to-error/5'
  }
  return 'border-brand/30 bg-gradient-to-r from-brand/10 to-brand/5'
}

function getOnboardingButtonText(isRunning: boolean, lastStatus: string | null): string {
  if (isRunning) {
    return ''
  }
  if (lastStatus !== null) {
    return 'Relancer le diagnostic'
  }
  return 'Lancer le diagnostic'
}

function getOnboardingHelpText(isRunning: boolean, lastRun: string | null): string {
  if (isRunning) {
    return 'Analyse en cours...'
  }
  if (lastRun !== null) {
    return `Dernière vérification: ${formatRelativeTime(lastRun)}`
  }
  return 'Commencez ici pour vérifier votre configuration'
}

function OnboardingIcon({ isRunning }: { isRunning: boolean }): React.ReactElement {
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
        isRunning ? 'animate-pulse bg-info/20' : 'bg-brand/20'
      }`}
    >
      {isRunning ? (
        <svg className="h-6 w-6 animate-spin text-info" fill="none" viewBox="0 0 24 24">
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
        <svg className="h-6 w-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

function OnboardingStatus({
  isRunning,
  lastStatus,
  issuesCount,
}: {
  isRunning: boolean
  lastStatus: AuditStepStatus | null
  issuesCount: number
}): React.ReactElement | null {
  if (isRunning) {
    return (
      <span className="badge badge-info">
        <LoadingSpinner size="sm" />
        Analyse en cours
      </span>
    )
  }
  if (lastStatus !== null) {
    return <StatusBadge status={lastStatus} issuesCount={issuesCount} />
  }
  return null
}

function OnboardingButton({
  isRunning,
  buttonText,
  onClick,
}: {
  isRunning: boolean
  buttonText: string
  onClick: (e: React.MouseEvent) => void
}): React.ReactElement {
  if (isRunning) {
    return (
      <button className="btn btn-secondary cursor-not-allowed opacity-50" disabled type="button">
        <LoadingSpinner size="sm" />
        Analyse en cours...
      </button>
    )
  }

  return (
    <button className="btn btn-primary" onClick={onClick} type="button">
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
      {buttonText}
    </button>
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
  const borderColor = getOnboardingBorderColor(isSelected, isRunning, audit.last_status)
  const buttonText = getOnboardingButtonText(isRunning, audit.last_status)
  const helpText = getOnboardingHelpText(isRunning, audit.last_run)

  const handleButtonClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (!isRunning) {
      onRun()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      onSelect()
    }
  }

  return (
    <div
      className={`card-elevated cursor-pointer rounded-xl border p-6 transition-all ${borderColor}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <OnboardingIcon isRunning={isRunning} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-text-primary">{audit.name}</h3>
              <AuditTooltip auditType={audit.type} />
            </div>
            <p className="mt-1 text-sm text-text-secondary">{audit.description}</p>
          </div>
        </div>
        <OnboardingStatus
          isRunning={isRunning}
          lastStatus={audit.last_status}
          issuesCount={audit.issues_count}
        />
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-4">
        <span className="text-sm text-text-tertiary">{helpText}</span>
        <OnboardingButton
          isRunning={isRunning}
          buttonText={buttonText}
          onClick={handleButtonClick}
        />
      </div>
    </div>
  )
}
