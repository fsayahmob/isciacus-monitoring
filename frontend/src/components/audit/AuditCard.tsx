/**
 * Audit Pipeline - Audit Card Components
 */

import React from 'react'

import type { AuditStepStatus, AvailableAudit } from '../../services/api'
import { AuditIcon, LoadingSpinner, StatusBadge } from './StatusIcons'
import { formatRelativeTime } from './utils'

function getBorderColor(isSelected: boolean, status: AuditStepStatus | null): string {
  if (isSelected) {
    return 'ring-2 ring-burgundy'
  }

  const statusColors: Record<string, string> = {
    success: 'border-green-300 bg-green-50',
    warning: 'border-amber-300 bg-amber-50',
    error: 'border-red-300 bg-red-50',
    running: 'border-blue-300 bg-blue-50',
  }

  return status !== null
    ? (statusColors[status] ?? 'border-gray-200 bg-white')
    : 'border-gray-200 bg-white'
}

function LastRunLabel({ lastRun }: { lastRun: string | null }): React.ReactElement {
  return (
    <span className="text-xs text-gray-400">
      {lastRun !== null ? `Dernier: ${formatRelativeTime(lastRun)}` : 'Jamais lancé'}
    </span>
  )
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
  const buttonClass = available
    ? 'bg-burgundy text-white hover:bg-burgundy/90'
    : 'cursor-not-allowed bg-gray-200 text-gray-400'

  return (
    <button
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${buttonClass}`}
      disabled={!available || isRunning}
      onClick={(e) => {
        e.stopPropagation()
        onRun()
      }}
      type="button"
    >
      {isRunning ? (
        <span className="flex items-center gap-1">
          <LoadingSpinner size="sm" />
          En cours...
        </span>
      ) : (
        'Lancer'
      )}
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
  const borderColor = getBorderColor(isSelected, audit.last_status)

  return (
    <div
      className={`cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md ${borderColor}`}
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
          <AuditIcon icon={audit.icon} status={audit.last_status} />
          <div>
            <h3 className="font-medium text-gray-900">{audit.name}</h3>
            <p className="text-xs text-gray-500">{audit.description}</p>
          </div>
        </div>
        {audit.last_status !== null && (
          <StatusBadge status={audit.last_status} issuesCount={audit.issues_count} />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <LastRunLabel lastRun={audit.last_run} />
        <RunButton available={audit.available} isRunning={isRunning} onRun={onRun} />
      </div>
    </div>
  )
}

// Extended audit type with is_primary flag
interface ExtendedAudit extends AvailableAudit {
  is_primary?: boolean
}

function getOnboardingBorderColor(isSelected: boolean, lastStatus: string | null): string {
  if (isSelected) {
    return 'ring-2 ring-burgundy'
  }
  if (lastStatus === 'success') {
    return 'border-green-400 bg-gradient-to-r from-green-50 to-emerald-50'
  }
  if (lastStatus === 'warning') {
    return 'border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50'
  }
  return 'border-burgundy bg-gradient-to-r from-burgundy/5 to-rose-50'
}

function OnboardingCard({
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
  const borderColor = getOnboardingBorderColor(isSelected, audit.last_status)

  return (
    <div
      className={`cursor-pointer rounded-xl border-2 p-6 transition-all hover:shadow-lg ${borderColor}`}
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
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-burgundy/10 text-3xl">
            🚀
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{audit.name}</h3>
            <p className="mt-1 text-sm text-gray-600">{audit.description}</p>
          </div>
        </div>
        {audit.last_status !== null && (
          <StatusBadge status={audit.last_status} issuesCount={audit.issues_count} />
        )}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {audit.last_run !== null
            ? `Dernière vérification: ${formatRelativeTime(audit.last_run)}`
            : 'Commencez ici pour vérifier votre configuration'}
        </span>
        <button
          className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
            isRunning ? 'bg-blue-500 text-white' : 'bg-burgundy text-white hover:bg-burgundy/90'
          }`}
          disabled={isRunning}
          onClick={(e) => {
            e.stopPropagation()
            onRun()
          }}
          type="button"
        >
          {isRunning && (
            <span className="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              Analyse en cours...
            </span>
          )}
          {!isRunning && audit.last_status !== null && 'Relancer le diagnostic'}
          {!isRunning && audit.last_status === null && 'Lancer le diagnostic'}
        </button>
      </div>
    </div>
  )
}

export function AuditCardsGrid({
  audits,
  selectedAudit,
  isRunning,
  onRun,
  onSelect,
}: {
  audits: ExtendedAudit[]
  selectedAudit: string | null
  isRunning: boolean
  onRun: (auditType: string) => void
  onSelect: (auditType: string) => void
}): React.ReactElement {
  // Separate onboarding audit from others
  const onboardingAudit = audits.find((a) => a.type === 'onboarding')
  const otherAudits = audits.filter((a) => a.type !== 'onboarding')

  return (
    <div className="mb-8 space-y-6">
      {/* Onboarding audit - full width, prominent */}
      {onboardingAudit !== undefined && (
        <OnboardingCard
          audit={onboardingAudit}
          isRunning={isRunning && selectedAudit === 'onboarding'}
          isSelected={selectedAudit === 'onboarding'}
          onRun={() => {
            onRun('onboarding')
          }}
          onSelect={() => {
            onSelect('onboarding')
          }}
        />
      )}

      {/* Other audits in grid */}
      {otherAudits.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-sm font-medium text-gray-500">Audits détaillés</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {otherAudits.map((audit) => (
              <AuditCard
                key={audit.type}
                audit={audit}
                isRunning={isRunning && selectedAudit === audit.type}
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
