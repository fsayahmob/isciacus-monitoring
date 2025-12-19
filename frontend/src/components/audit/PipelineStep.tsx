/**
 * Audit Pipeline - Vertical Stepper Component
 * Clean implementation with proper z-index layering
 */

import { motion, AnimatePresence } from 'framer-motion'
import React from 'react'

import type { AuditStep, ExecutionMode } from '../../services/api'
import { StepIcon } from './StepIcon'
import { STATUS_CONFIG, isStepCompleted } from './stepperConfig'
import { formatDuration } from './utils'

/**
 * Vertical line connecting steps
 * z-index: 0 to go BEHIND the icons (z-10)
 */
function StepConnector({
  isCompleted,
}: {
  isCompleted: boolean
}): React.ReactElement {
  return (
    <div
      className="absolute left-5 top-10 -z-10 h-full w-0.5 -translate-x-1/2"
      style={{ height: 'calc(100% + 0.5rem)' }}
    >
      <div
        className={`h-full w-full transition-colors duration-300 ${
          isCompleted ? 'bg-success' : 'bg-border-subtle'
        }`}
      />
    </div>
  )
}

/**
 * Single step in the pipeline
 */
const PipelineStepItem = React.memo(function PipelineStepItem({
  step,
  isLast,
}: {
  step: AuditStep
  isLast: boolean
}): React.ReactElement {
  const config = STATUS_CONFIG[step.status]
  const completed = isStepCompleted(step.status)

  return (
    <div className="relative flex gap-4 pb-6">
      {/* Connector line - only if not last step */}
      {!isLast && <StepConnector isCompleted={completed} />}

      {/* Icon container - z-10 to be ABOVE the line */}
      <div className="relative z-10 flex-shrink-0">
        <StepIcon status={step.status} />
      </div>

      {/* Content */}
      <div className="flex-1 pt-2">
        <div className="flex items-center gap-3">
          <h4 className={`font-medium ${config.text}`}>{step.name}</h4>
          {step.duration_ms !== null && step.duration_ms > 0 && (
            <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-tertiary">
              {formatDuration(step.duration_ms)}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-text-tertiary">{step.description}</p>

        {/* Error message */}
        {step.error_message !== null && (
          <div className="mt-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
            {step.error_message}
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * Execution mode badge (Async/Sync)
 */
function ExecutionModeBadge({
  mode,
}: {
  mode: ExecutionMode | undefined
}): React.ReactElement {
  if (mode === 'inngest') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-400">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Async
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-tertiary px-2.5 py-1 text-xs font-medium text-text-secondary">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" />
      </svg>
      Sync
    </span>
  )
}

/**
 * Running indicator badge
 */
function RunningBadge(): React.ReactElement {
  return (
    <motion.div
      className="flex items-center gap-2 rounded-full bg-info/20 px-3 py-1.5"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-info" />
      <span className="text-sm font-medium text-info">En cours...</span>
    </motion.div>
  )
}

/**
 * Main Pipeline Steps Panel
 */
export function PipelineStepsPanel({
  steps,
  isRunning,
  executionMode,
}: {
  steps: AuditStep[]
  isRunning: boolean
  executionMode?: ExecutionMode
}): React.ReactElement {
  const completedSteps = steps.filter((s) => isStepCompleted(s.status)).length
  const progressPercent = steps.length > 0 ? (completedSteps / steps.length) * 100 : 0

  return (
    <div className="card-elevated overflow-hidden rounded-2xl">
      {/* Header */}
      <div className="border-b border-border-subtle bg-bg-tertiary/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-text-primary">Pipeline d'audit</h2>
            <ExecutionModeBadge mode={executionMode} />
          </div>
          <AnimatePresence>{isRunning && <RunningBadge />}</AnimatePresence>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-info to-success"
            initial={{ width: 0 }}
            animate={{ width: `${String(progressPercent)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <p className="mt-1.5 text-xs text-text-tertiary">
          {completedSteps} / {steps.length} étapes complétées
        </p>
      </div>

      {/* Steps list */}
      <div className="p-6">
        {steps.map((step, index) => (
          <PipelineStepItem
            key={step.id}
            step={step}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Single step export for external use
 */
export function PipelineStep({
  step,
  isLast,
}: {
  step: AuditStep
  isLast: boolean
}): React.ReactElement {
  return <PipelineStepItem step={step} isLast={isLast} />
}
