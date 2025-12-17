/**
 * Settings Helper Components - Progress bar, save bar, and other UI helpers
 */

import { getProgressBarColor, getProgressWidth } from './settingsUtils'

export function ProgressBar({
  configured,
  total,
}: {
  configured: number
  total: number
}): React.ReactElement {
  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">Progression de la configuration</span>
        <span className="text-gray-500">
          {configured} / {total} services configurés
        </span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
        <div
          className={`h-2 rounded-full transition-all ${getProgressBarColor(configured, total)}`}
          style={{ width: `${String(getProgressWidth(configured, total))}%` }}
        />
      </div>
    </div>
  )
}

export function SaveBar({
  hasChanges,
  changeCount,
  onSave,
  onCancel,
  isSaving,
}: {
  hasChanges: boolean
  changeCount: number
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
}): React.ReactElement | null {
  if (!hasChanges) {
    return null
  }

  return (
    <div className="fixed bottom-0 left-60 right-0 z-50 border-t border-gray-200 bg-white px-6 py-4 shadow-lg">
      <div className="flex items-center justify-between">
        <SaveBarStatus changeCount={changeCount} />
        <SaveBarActions isSaving={isSaving} onCancel={onCancel} onSave={onSave} />
      </div>
    </div>
  )
}

function SaveBarStatus({ changeCount }: { changeCount: number }): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        {changeCount}
      </span>
      <span className="text-sm text-gray-600">
        {changeCount === 1 ? 'modification non sauvegardée' : 'modifications non sauvegardées'}
      </span>
    </div>
  )
}

function SaveBarActions({
  isSaving,
  onCancel,
  onSave,
}: {
  isSaving: boolean
  onCancel: () => void
  onSave: () => void
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <button
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        disabled={isSaving}
        type="button"
        onClick={onCancel}
      >
        Annuler
      </button>
      <button
        className="flex items-center gap-2 rounded-lg bg-burgundy px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-burgundy/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isSaving}
        type="button"
        onClick={onSave}
      >
        {isSaving ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Sauvegarde...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Sauvegarder
          </>
        )}
      </button>
    </div>
  )
}

export function StatusMessage({
  status,
}: {
  status: { type: 'success' | 'error'; message: string } | null
}): React.ReactElement | null {
  if (status === null) {
    return null
  }

  return (
    <div
      className={`mb-6 rounded-xl border p-4 ${
        status.type === 'success'
          ? 'border-green-200 bg-green-50 text-green-700'
          : 'border-red-200 bg-red-50 text-red-700'
      }`}
    >
      <div className="flex items-center gap-2">
        {status.type === 'success' ? <SuccessIcon /> : <ErrorIcon />}
        <span>{status.message}</span>
        {status.type === 'success' && (
          <span className="text-sm text-green-600">
            Redémarrez Docker pour appliquer les changements.
          </span>
        )}
      </div>
    </div>
  )
}

function SuccessIcon(): React.ReactElement {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ErrorIcon(): React.ReactElement {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

export function ErrorDisplay({ error }: { error: Error | null }): React.ReactElement {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            Erreur lors du chargement: {error instanceof Error ? error.message : 'Erreur inconnue'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function RefreshButton({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <button
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 shadow-sm transition-all hover:border-burgundy hover:text-burgundy"
      type="button"
      onClick={onRefresh}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      Actualiser
    </button>
  )
}
