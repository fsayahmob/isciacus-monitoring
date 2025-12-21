/**
 * Configuration Wizard Icon Helper Functions
 */

import React from 'react'

import type { CheckStatus } from './types'
import { CheckIcon, WarningIcon, ErrorIcon, LoadingIcon, PendingIcon } from './WizardIcons'

export function getStatusIcon(status: CheckStatus): React.ReactElement {
  switch (status) {
    case 'success':
      return <CheckIcon />
    case 'warning':
      return <WarningIcon />
    case 'error':
      return <ErrorIcon />
    case 'loading':
      return <LoadingIcon />
    default:
      return <PendingIcon />
  }
}

export function getOverallIcon(status: string): React.ReactElement {
  if (status === 'loading') {
    return <LoadingIcon />
  }
  if (status === 'ready') {
    return <CheckIcon />
  }
  if (status === 'partial') {
    return <WarningIcon />
  }
  return <ErrorIcon />
}
