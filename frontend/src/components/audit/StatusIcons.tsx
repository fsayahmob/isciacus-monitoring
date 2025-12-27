/**
 * Audit Pipeline - Status Icons and Badges
 * Modern Dark Theme
 */

import React from 'react'

import type { AuditStepStatus } from '../../services/api'

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' }): React.ReactElement {
  const sizeClass = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <div
      className={`${sizeClass} animate-spin rounded-full border-2 border-current border-t-transparent`}
    />
  )
}

export function PendingIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-bg-tertiary">
      <div className="h-2 w-2 rounded-full bg-text-muted" />
    </div>
  )
}

export function RunningIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-info/50 bg-info/10">
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-info border-t-transparent" />
    </div>
  )
}

export function SuccessIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success">
      <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  )
}

export function WarningIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-warning">
      <svg className="h-4 w-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01" />
      </svg>
    </div>
  )
}

export function ErrorIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-error">
      <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </div>
  )
}

export function SkippedIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-bg-tertiary">
      <svg
        className="h-4 w-4 text-text-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
      </svg>
    </div>
  )
}

export function StepStatusIcon({ status }: { status: AuditStepStatus }): React.ReactElement {
  const icons: Record<AuditStepStatus, React.ReactElement> = {
    pending: <PendingIcon />,
    running: <RunningIcon />,
    success: <SuccessIcon />,
    warning: <WarningIcon />,
    error: <ErrorIcon />,
    skipped: <SkippedIcon />,
  }

  return icons[status]
}

function getStatusLabel(status: AuditStepStatus, issuesCount: number): string {
  if (status === 'success') {
    return 'OK'
  }
  if (status === 'warning' || status === 'error') {
    return issuesCount > 0 ? `${String(issuesCount)} pb` : status
  }
  return status
}

export function StatusBadge({
  status,
  issuesCount,
  compact = false,
}: {
  status: AuditStepStatus
  issuesCount: number
  compact?: boolean
}): React.ReactElement {
  const colors: Record<AuditStepStatus, string> = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    running: 'badge-info',
    pending: 'badge-neutral',
    skipped: 'badge-neutral',
  }

  if (compact) {
    const compactColors: Record<AuditStepStatus, string> = {
      success: 'bg-success',
      warning: 'bg-warning',
      error: 'bg-error',
      running: 'bg-info',
      pending: 'bg-text-muted',
      skipped: 'bg-text-muted',
    }
    // Only show count for warning/error statuses, not for success
    const showCount = issuesCount > 0 && (status === 'warning' || status === 'error')
    return (
      <div className="flex items-center gap-0.5">
        <span className={`h-2 w-2 rounded-full ${compactColors[status]}`} />
        {showCount && (
          <span className="text-[10px] font-medium text-text-muted">{issuesCount}</span>
        )}
      </div>
    )
  }

  const label = getStatusLabel(status, issuesCount)

  return (
    <span className={`badge ${colors[status]}`} data-testid="audit-status-badge">
      {label}
    </span>
  )
}

function getIconBgColor(status: AuditStepStatus | null): string {
  if (status === 'success') {
    return 'bg-success/20 text-success'
  }
  if (status === 'warning') {
    return 'bg-warning/20 text-warning'
  }
  if (status === 'error') {
    return 'bg-error/20 text-error'
  }
  if (status === 'running') {
    return 'bg-info/20 text-info'
  }
  return 'bg-bg-tertiary text-text-tertiary'
}

function getIconPath(icon: string): string {
  const iconPaths: Record<string, string> = {
    'chart-bar':
      'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    facebook: 'M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z',
    'shopping-cart':
      'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
    search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    rocket:
      'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122',
    server:
      'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-8-5h.01M12 16h.01',
    users:
      'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    'shopping-bag': 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
    target: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  }

  return iconPaths[icon] ?? iconPaths['chart-bar']
}

export function AuditIcon({
  icon,
  status,
}: {
  icon: string
  status: AuditStepStatus | null
}): React.ReactElement {
  const bgColor = getIconBgColor(status)
  const iconPath = getIconPath(icon)

  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bgColor}`}>
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
      </svg>
    </div>
  )
}
