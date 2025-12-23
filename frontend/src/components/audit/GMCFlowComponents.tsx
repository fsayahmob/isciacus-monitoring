/**
 * GMC Flow Components - Reusable components for the GMC pipeline visualization
 */

import React from 'react'

export interface FlowStageProps {
  icon: React.ReactNode
  label: string
  count: number
  sublabel?: string
  color: string
  onClick?: () => void
}

export function FlowStage({
  icon,
  label,
  count,
  sublabel,
  color,
  onClick,
}: FlowStageProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center rounded-xl border-2 bg-bg-secondary p-4 transition-all hover:bg-bg-tertiary ${onClick ? 'cursor-pointer' : 'cursor-default'} ${color}`}
    >
      <div className="mb-2 text-3xl">{icon}</div>
      <div className="text-2xl font-bold text-text-primary">{count.toLocaleString()}</div>
      <div className="text-sm font-medium text-text-secondary">{label}</div>
      {sublabel !== undefined && sublabel !== '' && (
        <div className="mt-1 text-xs text-text-tertiary">{sublabel}</div>
      )}
    </button>
  )
}

export interface FlowArrowProps {
  loss: number
  lossLabel: string
  issueId?: string
  onNavigateToIssue?: (issueId: string) => void
}

export function FlowArrow({
  loss,
  lossLabel,
  issueId,
  onNavigateToIssue,
}: FlowArrowProps): React.ReactElement {
  const hasLoss = loss > 0

  return (
    <div className="flex flex-col items-center justify-center px-2">
      {/* Arrow */}
      <div className="flex items-center">
        <div className={`h-1 w-8 ${hasLoss ? 'bg-error/50' : 'bg-success/50'}`} />
        <svg
          className={`h-4 w-4 ${hasLoss ? 'text-error' : 'text-success'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Loss indicator */}
      {hasLoss && (
        <button
          type="button"
          onClick={() => {
            if (issueId !== undefined && issueId !== '' && onNavigateToIssue !== undefined) {
              onNavigateToIssue(issueId)
            }
          }}
          className={`mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            issueId !== undefined && issueId !== '' && onNavigateToIssue !== undefined
              ? 'cursor-pointer bg-error/20 text-error hover:bg-error/30'
              : 'bg-error/10 text-error/80'
          }`}
        >
          -{loss.toLocaleString()} {lossLabel}
        </button>
      )}
    </div>
  )
}
