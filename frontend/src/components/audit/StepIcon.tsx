/**
 * Step Icon Component - Animated status icons for pipeline steps
 */

import { motion } from 'framer-motion'
import React from 'react'

import type { AuditStepStatus } from '../../services/api'
import { STATUS_CONFIG, ANIMATION } from './stepperConfig'

function RunningIcon({ config }: { config: (typeof STATUS_CONFIG)[AuditStepStatus] }): React.ReactElement {
  return (
    <motion.div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${config.bg} ${config.border}`}
      animate={{ scale: [1, ANIMATION.SCALE_PULSE, 1] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      <motion.svg
        className="h-5 w-5 text-blue-600"
        viewBox="0 0 24 24"
        fill="none"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </motion.svg>
    </motion.div>
  )
}

function SuccessIcon({ config }: { config: (typeof STATUS_CONFIG)[AuditStepStatus] }): React.ReactElement {
  return (
    <motion.div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${config.bg} ${config.border}`}
      initial={{ scale: 0.8 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.div>
  )
}

function ErrorIcon({ config }: { config: (typeof STATUS_CONFIG)[AuditStepStatus] }): React.ReactElement {
  return (
    <motion.div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${config.bg} ${config.border}`}
      initial={{ scale: 0.8 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <svg className="h-5 w-5 text-red-600" viewBox="0 0 24 24" fill="none">
        <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.div>
  )
}

function WarningIcon({ config }: { config: (typeof STATUS_CONFIG)[AuditStepStatus] }): React.ReactElement {
  return (
    <motion.div
      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${config.bg} ${config.border}`}
      initial={{ scale: 0.8 }}
      animate={{ scale: 1 }}
    >
      <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 9v4m0 4h.01M12 2L2 22h20L12 2z" />
      </svg>
    </motion.div>
  )
}

function PendingIcon({ config }: { config: (typeof STATUS_CONFIG)[AuditStepStatus]; isSkipped: boolean }): React.ReactElement {
  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed ${config.bg} ${config.border}`}>
      <span className={`text-lg ${config.text}`} />
    </div>
  )
}

export function StepIcon({ status }: { status: AuditStepStatus }): React.ReactElement {
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
    default:
      return <PendingIcon config={config} isSkipped={status === 'skipped'} />
  }
}
