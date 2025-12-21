/**
 * Configuration Wizard Types
 */

export type CheckStatus = 'success' | 'warning' | 'error' | 'pending' | 'loading'

export interface WizardCheck {
  id: string
  name: string
  description: string
  status: CheckStatus
  details?: string
}
