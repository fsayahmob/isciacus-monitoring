/**
 * Configuration Wizard - Main Component
 * Visual checklist for audit readiness
 */

import React from 'react'

import { WizardCheckRow } from './WizardComponents'
import { RefreshIcon } from './WizardIcons'
import {
  getOverallIconBg,
  OVERALL_BADGE_COLORS,
  OVERALL_COLORS,
  OVERALL_LABELS,
} from './WizardHelpers'
import { getOverallIcon } from './iconHelpers'
import { useWizardChecks } from './useWizardChecks'

function calculateOverallStatus(
  checks: { status: string }[],
  isLoading: boolean
): 'ready' | 'partial' | 'not_ready' | 'loading' {
  if (isLoading) {
    return 'loading'
  }

  const allSuccess = checks.every((c) => c.status === 'success')
  if (allSuccess) {
    return 'ready'
  }

  const hasErrors = checks.some((c) => c.status === 'error')
  if (hasErrors) {
    return 'not_ready'
  }

  const hasWarnings = checks.some((c) => c.status === 'warning')
  if (hasWarnings) {
    return 'partial'
  }

  return 'not_ready'
}

export function ConfigurationWizard(): React.ReactElement {
  const { checks, isLoading, refresh } = useWizardChecks()

  const overallStatus = calculateOverallStatus(checks, isLoading)

  return (
    <div className={`rounded-xl border p-6 ${OVERALL_COLORS[overallStatus]}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${getOverallIconBg(overallStatus)}`}
          >
            {getOverallIcon(overallStatus)}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Préparation aux audits</h3>
            <p className="text-sm text-text-secondary">
              Vérifiez que tous les services sont configurés
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            onClick={refresh}
            title="Actualiser les vérifications"
            type="button"
          >
            <RefreshIcon isSpinning={isLoading} />
          </button>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${OVERALL_BADGE_COLORS[overallStatus]}`}
          >
            {OVERALL_LABELS[overallStatus]}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {checks.map((check) => (
          <WizardCheckRow key={check.id} check={check} />
        ))}
      </div>
    </div>
  )
}
