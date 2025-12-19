/**
 * Audit Pipeline - Pipeline Step Components (Horizontal layout)
 *
 * Uses Framer Motion for smooth step status transitions.
 * Steps animate when their status changes (pending → running → success/error).
 */

import { motion, AnimatePresence } from 'framer-motion'
import React from 'react'

import type { AuditStep, AuditStepStatus, ExecutionMode } from '../../services/api'
import { StepStatusIcon } from './StatusIcons'
import { formatDuration } from './utils'

// Animation constants
const SCALE_RUNNING = 1.1
const OPACITY_FADED = 0.4

// Animation variants for step status transitions
const stepVariants = {
  pending: { opacity: 0.5, scale: 0.95 },
  running: { opacity: 1, scale: 1 },
  success: { opacity: 1, scale: 1 },
  warning: { opacity: 1, scale: 1 },
  error: { opacity: 1, scale: 1 },
  skipped: { opacity: OPACITY_FADED, scale: 0.95 },
}

const lineVariants = {
  inactive: { scaleX: 0, opacity: 0.3 },
  active: { scaleX: 1, opacity: 1 },
}

function getStepLineColor(status: AuditStepStatus): string {
  if (status === 'success' || status === 'warning') {
    return 'bg-green-400'
  }
  if (status === 'error') {
    return 'bg-red-400'
  }
  return 'bg-gray-200'
}

/**
 * Execution mode badge - Shows whether audit runs via Inngest (async) or directly (sync)
 */
function ExecutionModeBadge({ mode }: { mode: ExecutionMode | undefined }): React.ReactElement {
  if (mode === 'inngest') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
        title="Exécution asynchrone via Inngest"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Async
      </span>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
      title="Exécution synchrone directe"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
      </svg>
      Sync
    </span>
  )
}

function HorizontalPipelineStep({
  step,
  isLast,
}: {
  step: AuditStep
  isLast: boolean
}): React.ReactElement {
  const lineColor = getStepLineColor(step.status)
  const isCompleted = step.status === 'success' || step.status === 'warning' || step.status === 'error'

  return (
    <div className="flex flex-1 items-center">
      {/* Step content with animation */}
      <motion.div
        className="flex flex-col items-center"
        initial="pending"
        animate={step.status}
        variants={stepVariants}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <motion.div
          animate={step.status === 'running' ? { scale: [1, SCALE_RUNNING, 1] } : {}}
          transition={{ duration: 1, repeat: step.status === 'running' ? Infinity : 0 }}
        >
          <StepStatusIcon status={step.status} />
        </motion.div>
        <div className="mt-1 text-center">
          <h4 className="text-xs font-medium text-gray-900">{step.name}</h4>
          <AnimatePresence>
            {step.duration_ms !== null && (
              <motion.span
                className="text-[10px] text-gray-400"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {formatDuration(step.duration_ms)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {step.error_message !== null && (
            <motion.p
              className="mt-0.5 max-w-[100px] truncate text-[10px] text-red-600"
              title={step.error_message}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              {step.error_message}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Connector line with animation */}
      {!isLast && (
        <motion.div
          className={`mx-2 h-0.5 flex-1 origin-left ${lineColor}`}
          initial="inactive"
          animate={isCompleted ? 'active' : 'inactive'}
          variants={lineVariants}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      )}
    </div>
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
  return (
    <motion.div
      className="rounded-xl border border-gray-200 bg-white px-6 py-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-gray-900">Pipeline d'audit</h2>
          <ExecutionModeBadge mode={executionMode} />
        </div>
        <AnimatePresence>
          {isRunning && (
            <motion.span
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-600"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-blue-500"
                animate={{ opacity: [1, OPACITY_FADED, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              En cours...
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="flex items-start"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: {
              staggerChildren: 0.05,
            },
          },
        }}
      >
        {steps.map((step, index) => (
          <HorizontalPipelineStep key={step.id} step={step} isLast={index === steps.length - 1} />
        ))}
      </motion.div>
    </motion.div>
  )
}

// Keep vertical version for potential future use (e.g., mobile)
export function PipelineStep({
  step,
  isLast,
}: {
  step: AuditStep
  isLast: boolean
}): React.ReactElement {
  const lineColor = getStepLineColor(step.status)

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <StepStatusIcon status={step.status} />
        {!isLast && <div className={`h-8 w-0.5 ${lineColor}`} />}
      </div>

      <div className="flex-1 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900">{step.name}</h4>
            <p className="text-sm text-gray-500">{step.description}</p>
          </div>
          {step.duration_ms !== null && (
            <span className="text-xs text-gray-400">{formatDuration(step.duration_ms)}</span>
          )}
        </div>

        {step.error_message !== null && (
          <p className="mt-1 text-sm text-red-600">{step.error_message}</p>
        )}
      </div>
    </div>
  )
}
