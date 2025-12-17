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

export function AuditCardsGrid({
  audits,
  selectedAudit,
  isRunning,
  onRun,
  onSelect,
}: {
  audits: AvailableAudit[]
  selectedAudit: string | null
  isRunning: boolean
  onRun: (auditType: string) => void
  onSelect: (auditType: string) => void
}): React.ReactElement {
  return (
    <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {audits.map((audit) => (
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
  )
}
