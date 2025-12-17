/**
 * Audit Pipeline - Status Icons and Badges
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
    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300 bg-white">
      <div className="h-2 w-2 rounded-full bg-gray-300" />
    </div>
  )
}

export function RunningIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-500 bg-blue-50">
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  )
}

export function SuccessIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
      <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  )
}

export function WarningIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500">
      <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01" />
      </svg>
    </div>
  )
}

export function ErrorIcon(): React.ReactElement {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500">
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
    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300 bg-gray-100">
      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  if (status === 'success' && issuesCount === 0) {
    return 'OK'
  }
  if (status === 'warning' || status === 'error') {
    return `${String(issuesCount)} pb`
  }
  return status
}

export function StatusBadge({
  status,
  issuesCount,
}: {
  status: AuditStepStatus
  issuesCount: number
}): React.ReactElement {
  const colors: Record<AuditStepStatus, string> = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-amber-100 text-amber-800',
    error: 'bg-red-100 text-red-800',
    running: 'bg-blue-100 text-blue-800',
    pending: 'bg-gray-100 text-gray-800',
    skipped: 'bg-gray-100 text-gray-500',
  }

  const label = getStatusLabel(status, issuesCount)

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {label}
    </span>
  )
}

function getIconBgColor(status: AuditStepStatus | null): string {
  if (status === 'success') {
    return 'bg-green-100 text-green-600'
  }
  if (status === 'warning') {
    return 'bg-amber-100 text-amber-600'
  }
  if (status === 'error') {
    return 'bg-red-100 text-red-600'
  }
  return 'bg-gray-100 text-gray-600'
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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
    </div>
  )
}
