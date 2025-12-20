/**
 * Audit Cards - Modern Dark Theme
 */

import React from 'react'

import type { AuditStepStatus, AvailableAudit } from '../../services/api'
import { OnboardingCard } from './OnboardingCard'
import { AuditIcon, LoadingSpinner, StatusBadge } from './StatusIcons'
import { AuditTooltip } from './Tooltip'
import { formatRelativeTime } from './utils'

interface ExtendedAudit extends AvailableAudit {
  is_primary?: boolean
}

function getBorderColor(
  isSelected: boolean,
  isRunning: boolean,
  status: AuditStepStatus | null
): string {
  if (isRunning) {
    return 'ring-1 ring-info border-info/50 bg-info/5'
  }
  if (isSelected) {
    return 'ring-1 ring-brand border-brand/50'
  }

  const statusColors: Record<string, string> = {
    success: 'border-success/30 bg-success/5',
    warning: 'border-warning/30 bg-warning/5',
    error: 'border-error/30 bg-error/5',
  }

  if (status !== null) {
    return statusColors[status] ?? 'border-border-subtle bg-bg-secondary'
  }
  return 'border-border-subtle bg-bg-secondary hover:border-border-default'
}

function LastRunLabel({ lastRun }: { lastRun: string | null }): React.ReactElement {
  const text = lastRun !== null ? formatRelativeTime(lastRun) : 'Jamais exécuté'
  return <span className="text-xs text-text-tertiary">{text}</span>
}

function RunButton({
  available,
  isRunning,
  onRun,
}: {
  available: boolean
  isRunning: boolean
  onRun: () => void
}): React.ReactElement {
  if (isRunning) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-info/20 px-3 py-1.5 text-xs font-medium text-info">
        <LoadingSpinner size="sm" />
        <span>En cours...</span>
      </div>
    )
  }

  if (!available) {
    return (
      <button
        className="cursor-not-allowed rounded-lg bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-muted"
        disabled
        type="button"
      >
        Indisponible
      </button>
    )
  }

  return (
    <button
      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-light"
      onClick={(e) => {
        e.stopPropagation()
        onRun()
      }}
      type="button"
    >
      Lancer
    </button>
  )
}

export function AuditCard({
  audit,
  isRunning,
  isSelected,
  onRun,
  onSelect,
}: {
  audit: AvailableAudit
  isRunning: boolean
  isSelected: boolean
  onRun: () => void
  onSelect: () => void
}): React.ReactElement {
  const borderColor = getBorderColor(isSelected, isRunning, audit.last_status)
  const iconStatus = isRunning ? 'running' : audit.last_status

  return (
    <div
      className={`card cursor-pointer rounded-xl border p-4 transition-all ${borderColor}`}
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
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <AuditIcon icon={audit.icon} status={iconStatus} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-text-primary">{audit.name}</h3>
              <AuditTooltip auditType={audit.type} />
            </div>
            <p className="mt-0.5 text-xs text-text-tertiary">{audit.description}</p>
          </div>
        </div>
        {!isRunning && audit.last_status !== null && (
          <StatusBadge status={audit.last_status} issuesCount={audit.issues_count} />
        )}
        {isRunning && <span className="badge badge-info">En cours</span>}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
        <LastRunLabel lastRun={audit.last_run} />
        <RunButton available={audit.available} isRunning={isRunning} onRun={onRun} />
      </div>
    </div>
  )
}

export function AuditCardsGrid({
  audits,
  selectedAudit,
  isAuditRunning,
  onRun,
  onSelect,
}: {
  audits: ExtendedAudit[]
  selectedAudit: string | null
  isAuditRunning: (auditType: string) => boolean
  onRun: (auditType: string) => void
  onSelect: (auditType: string) => void
}): React.ReactElement {
  const onboardingAudit = audits.find((a) => a.type === 'onboarding')
  const otherAudits = audits.filter((a) => a.type !== 'onboarding')

  return (
    <div className="mb-8 space-y-6">
      {onboardingAudit !== undefined && (
        <OnboardingCard
          audit={onboardingAudit}
          isRunning={isAuditRunning('onboarding')}
          isSelected={selectedAudit === 'onboarding'}
          onRun={() => {
            onRun('onboarding')
          }}
          onSelect={() => {
            onSelect('onboarding')
          }}
        />
      )}

      {otherAudits.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border-subtle" />
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Audits détaillés
            </span>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {otherAudits.map((audit) => (
              <AuditCard
                key={audit.type}
                audit={audit}
                isRunning={isAuditRunning(audit.type)}
                isSelected={selectedAudit === audit.type}
                onRun={() => {
                  onRun(audit.type)
                }}
                onSelect={() => {
                  onSelect(audit.type)
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
