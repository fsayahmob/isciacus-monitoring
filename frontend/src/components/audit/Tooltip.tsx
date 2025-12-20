/**
 * Tooltip Component - Info tooltips for audits
 */

import React, { useState } from 'react'

import { AUDIT_TOOLTIPS, type AuditTooltipData } from './auditTooltips'

function InfoIcon(): React.ReactElement {
  return (
    <svg
      className="h-4 w-4 text-text-muted hover:text-brand transition-colors"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

export function AuditTooltip({ auditType }: { auditType: string }): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(false)

  // Check if audit type has tooltip data
  if (!(auditType in AUDIT_TOOLTIPS)) {
    return null
  }

  const tooltipData = AUDIT_TOOLTIPS[auditType]

  return (
    <div className="relative">
      <button
        className="flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        onMouseEnter={() => {
          setIsOpen(true)
        }}
        onMouseLeave={() => {
          setIsOpen(false)
        }}
        type="button"
      >
        <InfoIcon />
      </button>

      {isOpen && <TooltipContent data={tooltipData} />}
    </div>
  )
}

function TooltipContent({ data }: { data: AuditTooltipData }): React.ReactElement {
  return (
    <div
      className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border border-border-default bg-bg-elevated p-4 shadow-lg"
      onClick={(e) => {
        e.stopPropagation()
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
      }}
      role="tooltip"
    >
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-brand">
            Qu'est-ce que c'est ?
          </h4>
          <p className="mt-1 text-sm text-text-secondary">{data.what}</p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-brand">
            Pourquoi c'est important ?
          </h4>
          <p className="mt-1 text-sm text-text-secondary">{data.why}</p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-brand">
            Points vérifiés
          </h4>
          <ul className="mt-1 space-y-1">
            {data.checks.map((check) => (
              <li key={check} className="flex items-start gap-2 text-xs text-text-secondary">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-brand" />
                {check}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-border-subtle pt-2">
          <p className="text-xs font-medium text-text-muted">
            Impact: <span className="text-brand">{data.impact}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
