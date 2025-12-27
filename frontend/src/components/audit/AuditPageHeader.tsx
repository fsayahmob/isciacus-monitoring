/**
 * Audit Page Header Components
 */

import React from 'react'

function SpinnerIcon(): React.ReactElement {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        fill="currentColor"
      />
    </svg>
  )
}

function ClearCacheButton({
  onClick,
  disabled,
  isLoading,
}: {
  onClick: () => void
  disabled: boolean
  isLoading: boolean
}): React.ReactElement {
  return (
    <button
      className="btn btn-secondary flex items-center gap-2"
      disabled={disabled}
      onClick={onClick}
      title="Vider le cache pour forcer des audits frais"
      type="button"
    >
      {isLoading ? (
        <>
          <SpinnerIcon />
          <span>Suppression...</span>
        </>
      ) : (
        <>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <span>Vider le cache</span>
        </>
      )}
    </button>
  )
}

function RunAllButton({
  onClick,
  disabled,
  runningCount,
  totalCount,
}: {
  onClick: () => void
  disabled: boolean
  runningCount: number
  totalCount: number
}): React.ReactElement {
  const label =
    totalCount > 0 ? `${String(runningCount)}/${String(totalCount)}` : String(runningCount)
  return (
    <button
      className="btn btn-primary flex items-center gap-2"
      data-testid="run-all-audits-button"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {disabled ? (
        <>
          <SpinnerIcon />
          <span>{label} en cours...</span>
        </>
      ) : (
        <>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M13 10V3L4 14h7v7l9-11h-7z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          <span>Lancer tous les audits</span>
        </>
      )}
    </button>
  )
}

export function PageHeader({
  onRunAll,
  onClearCache,
  isRunning,
  isClearingCache,
  runningCount,
  totalCount,
}: {
  onRunAll: () => void
  onClearCache: () => void
  isRunning: boolean
  isClearingCache: boolean
  runningCount: number
  totalCount: number
}): React.ReactElement {
  return (
    <div className="mb-8 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Audits Tracking</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Vérifiez la configuration de vos outils de tracking
        </p>
      </div>
      <div className="flex items-center gap-3">
        <ClearCacheButton
          onClick={onClearCache}
          disabled={isRunning || isClearingCache}
          isLoading={isClearingCache}
        />
        <RunAllButton
          onClick={onRunAll}
          disabled={isRunning}
          runningCount={runningCount}
          totalCount={totalCount}
        />
      </div>
    </div>
  )
}
