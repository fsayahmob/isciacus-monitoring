/**
 * Step Icon Component - Audit Pipeline Status Icons
 * Uses CSS animations for reliable spinner (no Framer Motion re-render issues)
 */

import React from 'react'

import type { AuditStepStatus } from '../../services/api'
import { STATUS_CONFIG } from './stepperConfig'

interface StatusConfig {
  bg: string
  border: string
}

function RunningIcon({ config }: { config: StatusConfig }): React.ReactElement {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${config.bg} ${config.border}`}
    >
      <svg className="h-5 w-5 animate-spin text-info" viewBox="0 0 24 24" fill="none">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  )
}

function SuccessIcon({ config }: { config: StatusConfig }): React.ReactElement {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${config.bg} ${config.border}`}
    >
      <svg className="h-5 w-5 text-success" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 13l4 4L19 7"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function ErrorIcon({ config }: { config: StatusConfig }): React.ReactElement {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${config.bg} ${config.border}`}
    >
      <svg className="h-5 w-5 text-error" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 18L18 6M6 6l12 12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function WarningIcon({ config }: { config: StatusConfig }): React.ReactElement {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${config.bg} ${config.border}`}
    >
      <svg className="h-5 w-5 text-warning" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function SkippedIcon({ config }: { config: StatusConfig }): React.ReactElement {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed ${config.bg} ${config.border}`}
    >
      <svg className="h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none">
        <path d="M20 12H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function PendingIcon({ config }: { config: StatusConfig }): React.ReactElement {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed ${config.bg} ${config.border}`}
    >
      <div className="h-2 w-2 rounded-full bg-text-muted" />
    </div>
  )
}

export const StepIcon = React.memo(function StepIcon({
  status,
}: {
  status: AuditStepStatus
}): React.ReactElement {
  const config = STATUS_CONFIG[status]

  switch (status) {
    case 'running':
      return <RunningIcon config={config} />
    case 'success':
      return <SuccessIcon config={config} />
    case 'error':
      return <ErrorIcon config={config} />
    case 'warning':
      return <WarningIcon config={config} />
    case 'skipped':
      return <SkippedIcon config={config} />
    default:
      return <PendingIcon config={config} />
  }
})
