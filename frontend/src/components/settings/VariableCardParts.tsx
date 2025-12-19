/**
 * Variable Card Parts - Sub-components for the Variable Card
 */

export function VariableBadges({
  isRequired,
  isSecret,
  hasChanges,
}: {
  isRequired: boolean
  isSecret: boolean
  hasChanges: boolean
}): React.ReactElement {
  return (
    <>
      {isRequired && (
        <span className="rounded bg-error/20 px-1.5 py-0.5 text-xs font-medium text-error">
          Requis
        </span>
      )}
      {isSecret && (
        <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-xs font-medium text-violet-400">
          Secret
        </span>
      )}
      {hasChanges && (
        <span className="rounded bg-warning/20 px-1.5 py-0.5 text-xs font-medium text-warning">
          Modifié
        </span>
      )}
    </>
  )
}

export function VariableInput({
  currentValue,
  hasChanges,
  isSecret,
  isSet,
  showSecret,
  onChange,
}: {
  currentValue: string
  hasChanges: boolean
  isSecret: boolean
  isSet: boolean
  showSecret: boolean
  onChange: (value: string) => void
}): React.ReactElement {
  const inputClassName = hasChanges
    ? 'border-warning/50 bg-bg-secondary focus:border-warning focus:ring-warning'
    : 'border-border-default bg-bg-tertiary focus:border-brand focus:ring-brand'

  return (
    <input
      className={`w-full rounded-lg border px-4 py-2.5 text-sm font-mono text-text-primary transition-colors ${inputClassName} focus:outline-none focus:ring-1`}
      placeholder={isSet ? '••••••••' : 'Non défini - entrez une valeur'}
      type={isSecret && !showSecret ? 'password' : 'text'}
      value={currentValue}
      onChange={(e) => {
        onChange(e.target.value)
      }}
    />
  )
}

function EyeOpenIcon(): React.ReactElement {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  )
}

function EyeClosedIcon(): React.ReactElement {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  )
}

export function SecretToggleButton({
  showSecret,
  onToggle,
}: {
  showSecret: boolean
  onToggle: () => void
}): React.ReactElement {
  return (
    <button
      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
      type="button"
      onClick={onToggle}
    >
      {showSecret ? <EyeClosedIcon /> : <EyeOpenIcon />}
    </button>
  )
}

export function VariableHelpSection({
  howToGet,
  showHelp,
  onToggle,
}: {
  howToGet: string
  showHelp: boolean
  onToggle: () => void
}): React.ReactElement {
  return (
    <>
      <button
        className="mt-3 flex items-center gap-1 text-xs text-brand hover:underline"
        type="button"
        onClick={onToggle}
      >
        <svg
          className={`h-4 w-4 transition-transform ${showHelp ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {showHelp ? 'Masquer les instructions' : 'Comment obtenir cette valeur ?'}
      </button>

      {showHelp && (
        <div className="mt-3 rounded-lg bg-info/10 p-4">
          <p className="text-sm text-info whitespace-pre-line">{howToGet}</p>
        </div>
      )}
    </>
  )
}
