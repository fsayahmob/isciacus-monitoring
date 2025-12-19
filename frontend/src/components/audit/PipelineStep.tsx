/**
 * Audit Pipeline - Modern Vertical Stepper with Animations
 *
 * Uses Framer Motion for smooth step status transitions.
 * Steps animate when their status changes (pending → running → success/error).
 */

import { motion, AnimatePresence } from 'framer-motion'
import React from 'react'

import type { AuditStep, ExecutionMode } from '../../services/api'
import { StepIcon } from './StepIcon'
import { STATUS_CONFIG, ANIMATION, isStepCompleted } from './stepperConfig'
import { formatDuration } from './utils'

function VerticalConnector({ isCompleted, isLast }: { isCompleted: boolean; isLast: boolean }): React.ReactElement | null {
  if (isLast) {
    return null
  }

  return (
    <div className="absolute left-5 top-12 h-full w-0.5 -translate-x-1/2">
      <motion.div
        className={`h-full w-full ${isCompleted ? 'bg-emerald-400' : 'bg-gray-200'}`}
        initial={{ scaleY: 0, originY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      />
    </div>
  )
}

function VerticalPipelineStep({ step, index, isLast }: { step: AuditStep; index: number; isLast: boolean }): React.ReactElement {
  const config = STATUS_CONFIG[step.status]
  const completed = isStepCompleted(step.status)

  return (
    <motion.div
      className="relative flex gap-4 pb-8 last:pb-0"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * ANIMATION.STAGGER_DELAY }}
    >
      <VerticalConnector isCompleted={completed} isLast={isLast} />

      <div className="relative z-10 flex-shrink-0">
        <StepIcon status={step.status} />
      </div>

      <div className="flex-1 pt-1">
        <div className="flex items-center gap-3">
          <h4 className={`font-medium ${config.text}`}>{step.name}</h4>
          <AnimatePresence>
            {step.duration_ms !== null && (
              <motion.span
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                {formatDuration(step.duration_ms)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-0.5 text-sm text-gray-500">{step.description}</p>

        <AnimatePresence>
          {step.error_message !== null && (
            <motion.div
              className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              {step.error_message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function ExecutionModeBadge({ mode }: { mode: ExecutionMode | undefined }): React.ReactElement {
  if (mode === 'inngest') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Async
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" />
      </svg>
      Sync
    </span>
  )
}

function RunningBadge(): React.ReactElement {
  return (
    <motion.div
      className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <motion.span
        className="h-2 w-2 rounded-full bg-blue-500"
        animate={{ opacity: [1, ANIMATION.OPACITY_FADED, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      <span className="text-sm font-medium text-blue-700">En cours...</span>
    </motion.div>
  )
}

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
    <motion.div
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">Pipeline d'audit</h2>
            <ExecutionModeBadge mode={executionMode} />
          </div>
          <AnimatePresence>{isRunning && <RunningBadge />}</AnimatePresence>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${String(progressPercent)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          {completedSteps} / {steps.length} étapes complétées
        </p>
      </div>

      <div className="p-6">
        {steps.map((step, index) => (
          <VerticalPipelineStep key={step.id} step={step} index={index} isLast={index === steps.length - 1} />
        ))}
      </div>
    </motion.div>
  )
}

export function PipelineStep({ step, isLast }: { step: AuditStep; isLast: boolean }): React.ReactElement {
  return <VerticalPipelineStep step={step} index={0} isLast={isLast} />
}
