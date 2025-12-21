/**
 * Configuration Wizard UI Components
 */

import React from 'react'

import type { WizardCheck } from './types'
import { getStatusBg } from './WizardHelpers'
import { getStatusIcon } from './iconHelpers'

export function WizardCheckRow({ check }: { check: WizardCheck }): React.ReactElement {
  return (
    <div className={`rounded-lg border p-4 ${getStatusBg(check.status)}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{getStatusIcon(check.status)}</div>
        <div className="flex-1">
          <h4 className="font-medium text-text-primary">{check.name}</h4>
          <p className="mt-0.5 text-sm text-text-secondary">{check.description}</p>
          {check.details !== undefined && (
            <p className="mt-1 text-xs text-text-tertiary">{check.details}</p>
          )}
        </div>
      </div>
    </div>
  )
}
