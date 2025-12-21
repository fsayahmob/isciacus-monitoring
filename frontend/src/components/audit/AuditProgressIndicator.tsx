/**
 * AuditProgressIndicator - Shows progress during sequential audit execution
 */

import React from 'react'

import type { AuditProgress } from './campaignScoreUtils'

interface AuditProgressIndicatorProps {
  progress: AuditProgress[]
  currentIndex: number
  totalAudits: number
  completedCount: number
}

function ProgressChip({ p }: { p: AuditProgress }): React.ReactElement {
  const getChipClass = (): string => {
    if (p.status === 'completed') {
      return 'bg-success/10 text-success'
    }
    if (p.status === 'running') {
      return 'bg-info/10 text-info'
    }
    if (p.status === 'error') {
      return 'bg-error/10 text-error'
    }
    return 'bg-bg-tertiary text-text-muted'
  }

  return (
    <div className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${getChipClass()}`}>
      {p.status === 'completed' && (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {p.status === 'running' && (
        <svg className="h-3 w-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth={4} />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {p.status === 'error' && (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      )}
      {p.status === 'pending' && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      <span>{p.name}</span>
    </div>
  )
}

export function AuditProgressIndicator({
  progress,
  currentIndex,
  totalAudits,
  completedCount,
}: AuditProgressIndicatorProps): React.ReactElement {
  const percentage = totalAudits > 0 ? Math.round((completedCount / totalAudits) * 100) : 0
  const currentAudit = currentIndex >= 0 ? progress[currentIndex] : null

  return (
    <div className="rounded-xl border border-info/30 bg-info/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg
            className="h-5 w-5 animate-spin text-info"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth={4} />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="font-medium text-text-primary">Exécution des audits...</span>
        </div>
        <span className="text-sm text-text-secondary">
          {completedCount}/{totalAudits}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-info transition-all duration-300"
          style={{ width: `${String(percentage)}%` }}
        />
      </div>

      {/* Current audit name */}
      {currentAudit !== null && (
        <p className="text-sm text-text-secondary">
          En cours: <span className="text-text-primary">{currentAudit.name}</span>
        </p>
      )}

      {/* Mini progress list */}
      <div className="mt-3 flex flex-wrap gap-2">
        {progress.map((p) => (
          <ProgressChip key={p.auditType} p={p} />
        ))}
      </div>
    </div>
  )
}
