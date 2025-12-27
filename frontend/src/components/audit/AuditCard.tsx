/**
 * Audit Cards - Row Layout with Accordion
 */

import React from 'react'

import type { AuditStepStatus, AvailableAudit } from '../../services/api'
import { formatLastRunDate } from './dateUtils'
import { OnboardingCard } from './OnboardingCard'
import { AuditIcon, LoadingSpinner, StatusBadge } from './StatusIcons'
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
    return statusColors[status] ?? 'border-border-subtle hover:border-border-default'
  }
  return 'border-border-subtle hover:border-border-default'
}

function RowRunButton({
  available,
  isRunning,
  onRun,
}: {
  available: boolean
  isRunning: boolean
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
      <div className="flex items-center gap-2" data-testid="audit-running-indicator">
        <LoadingSpinner size="sm" />
        <span className="text-xs text-info">En cours...</span>
      </div>
    )
  }
  if (isPending) {
    return (
      <div className="flex items-center gap-2" data-testid="audit-pending-indicator">
        <LoadingSpinner size="sm" />
        <span className="text-xs text-text-muted">Démarrage...</span>
      </div>
    )
  }
  if (!available) {
    return <span className="text-xs text-text-muted">Indisponible</span>
  }
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
      Lancer
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

function AuditRowItem({
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
  const borderColor = getRowBorderColor(isSelected, isRunning, audit.last_status)
  const iconStatus = isRunning ? 'running' : audit.last_status

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
        <AuditIcon icon={audit.icon} status={iconStatus} />
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
              <span className="text-xs text-text-muted">• {formatLastRunDate(audit.last_run)}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <RowRunButton available={audit.available} isRunning={isRunning} onRun={onRun} />
        <ChevronIcon isOpen={isSelected} />
      </div>
    </div>
  )
}

function SectionDivider(): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border-subtle" />
      <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
        Audits détaillés
      </span>
      <div className="h-px flex-1 bg-border-subtle" />
    </div>
  )
}

function AuditAccordionContent({ content }: { content: React.ReactNode }): React.ReactElement {
  return (
    <div className="animate-slide-up rounded-b-lg border-x border-b border-brand/30 bg-bg-secondary p-4">
      {content}
    </div>
  )
}

export function AuditCardsGrid({
  audits,
  selectedAudit,
  isAuditRunning,
  onRun,
  onSelect,
  accordionContent,
}: {
  audits: ExtendedAudit[]
  selectedAudit: string | null
  isAuditRunning: (auditType: string) => boolean
  onRun: (auditType: string) => void
  onSelect: (auditType: string) => void
  accordionContent?: React.ReactNode
}): React.ReactElement {
  const onboardingAudit = audits.find((a) => a.type === 'onboarding')
  const otherAudits = audits.filter((a) => a.type !== 'onboarding')

  return (
    <div className="mb-8 space-y-2">
      {onboardingAudit !== undefined && (
        <>
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
          {selectedAudit === 'onboarding' && accordionContent !== undefined && (
            <AuditAccordionContent content={accordionContent} />
          )}
        </>
      )}

      {otherAudits.length > 0 && (
        <>
          <SectionDivider />
          {otherAudits.map((audit) => (
            <React.Fragment key={audit.type}>
              <AuditRowItem
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
              {selectedAudit === audit.type && accordionContent !== undefined && (
                <AuditAccordionContent content={accordionContent} />
              )}
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  )
}
