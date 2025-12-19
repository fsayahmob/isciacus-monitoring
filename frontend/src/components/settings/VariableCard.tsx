/**
 * Variable Card Component - Individual config variable editor
 */

import { useState } from 'react'

import type { ConfigVariable } from '../../services/api'
import {
  SecretToggleButton,
  VariableBadges,
  VariableHelpSection,
  VariableInput,
} from './VariableCardParts'

export function VariableCard({
  variable,
  editedValue,
  onValueChange,
}: {
  variable: ConfigVariable
  editedValue: string | undefined
  onValueChange: (key: string, value: string) => void
}): React.ReactElement {
  const [showHelp, setShowHelp] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const currentValue = editedValue ?? variable.value ?? ''
  const hasChanges = editedValue !== undefined && editedValue !== (variable.value ?? '')

  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        hasChanges
          ? 'border-warning/50 bg-warning/5'
          : 'border-border-default bg-bg-secondary hover:border-brand/30'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-text-primary">{variable.label}</h4>
            <VariableBadges
              hasChanges={hasChanges}
              isRequired={variable.required}
              isSecret={variable.is_secret}
            />
          </div>
          <p className="mt-1 text-sm text-text-tertiary">{variable.description}</p>
          <code className="mt-2 inline-block rounded bg-bg-tertiary px-2 py-1 text-xs text-text-secondary">
            {variable.key}
          </code>
        </div>
      </div>

      <div className="mt-4">
        <div className="relative">
          <VariableInput
            currentValue={currentValue}
            hasChanges={hasChanges}
            isSecret={variable.is_secret}
            isSet={variable.is_set}
            showSecret={showSecret}
            onChange={(value) => {
              onValueChange(variable.key, value)
            }}
          />
          {variable.is_secret && (
            <SecretToggleButton
              showSecret={showSecret}
              onToggle={() => {
                setShowSecret(!showSecret)
              }}
            />
          )}
        </div>
      </div>

      <VariableHelpSection
        howToGet={variable.how_to_get}
        showHelp={showHelp}
        onToggle={() => {
          setShowHelp(!showHelp)
        }}
      />
    </div>
  )
}
