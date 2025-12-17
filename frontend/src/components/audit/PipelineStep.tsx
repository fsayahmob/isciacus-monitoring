/**
 * Audit Pipeline - Pipeline Step Components
 */

import React from 'react'

import type { AuditStep, AuditStepStatus } from '../../services/api'
import { StepStatusIcon } from './StatusIcons'
import { formatDuration } from './utils'

function getStepLineColor(status: AuditStepStatus): string {
  if (status === 'success' || status === 'warning') {
    return 'bg-green-300'
  }
  if (status === 'error') {
    return 'bg-red-300'
  }
  return 'bg-gray-200'
}

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

export function PipelineStepsPanel({
  steps,
  isRunning,
}: {
  steps: AuditStep[]
  isRunning: boolean
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 font-medium text-gray-900">
        Pipeline d'audit
        {isRunning && <span className="ml-2 text-sm font-normal text-blue-600">En cours...</span>}
      </h2>

      <div className="space-y-2">
        {steps.map((step, index) => (
          <PipelineStep key={step.id} step={step} isLast={index === steps.length - 1} />
        ))}
      </div>
    </div>
  )
}
