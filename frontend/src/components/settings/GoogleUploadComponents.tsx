/**
 * UI Components for Google Service Account Upload
 * ================================================
 * Extracted components to keep file size manageable
 */

import type { UploadStatus } from './useGoogleCredentials'

export function ConfiguredCredentials({
  projectId,
  serviceAccountEmail,
  onDelete,
  isDeleting,
}: {
  projectId?: string
  serviceAccountEmail?: string
  onDelete: () => void
  isDeleting: boolean
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-success/30 bg-success/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-success" fill="currentColor" viewBox="0 0 20 20">
              <path
                clipRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                fillRule="evenodd"
              />
            </svg>
            <h4 className="font-medium text-success">Credentials configurées</h4>
          </div>
          {projectId !== undefined && (
            <p className="mt-2 text-sm text-text-secondary">
              <span className="font-medium">Project ID:</span>{' '}
              <code className="rounded bg-bg-tertiary px-2 py-1 text-xs">{projectId}</code>
            </p>
          )}
          {serviceAccountEmail !== undefined && (
            <p className="mt-1 text-sm text-text-secondary">
              <span className="font-medium">Service Account:</span>{' '}
              <code className="rounded bg-bg-tertiary px-2 py-1 text-xs">
                {serviceAccountEmail}
              </code>
            </p>
          )}
        </div>
        <button
          className="rounded-lg border border-error/30 px-4 py-2 text-sm font-medium text-error transition-all hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isDeleting}
          type="button"
          onClick={onDelete}
        >
          {isDeleting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-error border-t-transparent" />
              Suppression...
            </span>
          ) : (
            'Supprimer'
          )}
        </button>
      </div>
    </div>
  )
}

export function UploadDropzone({
  isDragging,
  isUploading,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
}: {
  isDragging: boolean
  isUploading: boolean
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}): React.ReactElement {
  return (
    <div
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-all ${
        isDragging
          ? 'border-brand bg-brand/5'
          : 'border-border-default bg-bg-secondary hover:border-brand/50'
      }`}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        accept=".json"
        className="hidden"
        id="google-credentials-upload"
        type="file"
        onChange={onFileSelect}
      />
      <label
        className="flex cursor-pointer flex-col items-center gap-3"
        htmlFor="google-credentials-upload"
      >
        <svg className="h-12 w-12 text-text-tertiary" fill="none" viewBox="0 0 24 24">
          <path
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
        <div>
          <p className="font-medium text-text-primary">Glissez-déposez votre fichier JSON ici</p>
          <p className="mt-1 text-sm text-text-tertiary">ou cliquez pour sélectionner</p>
        </div>
        <div className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-all hover:bg-brand/90">
          Choisir un fichier
        </div>
      </label>
      {isUploading && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-text-secondary">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Téléchargement en cours...
        </div>
      )}
    </div>
  )
}

export function SecurityInfo(): React.ReactElement {
  return (
    <div className="rounded-lg border border-border-default bg-bg-tertiary p-4">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-text-tertiary"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            clipRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            fillRule="evenodd"
          />
        </svg>
        <div className="flex-1 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">Sécurité</p>
          <ul className="mt-2 space-y-1">
            <li>• Le fichier est validé avant d&apos;être sauvegardé</li>
            <li>• Stockage sécurisé avec permissions restrictives (600)</li>
            <li>• Utilisé automatiquement pour GA4, GMC et GSC</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.ReactElement | null {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-primary p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-text-primary">Confirmer la suppression</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Êtes-vous sûr de vouloir supprimer les credentials Google ?
        </p>
        <div className="mt-6 flex gap-3">
          <button
            className="flex-1 rounded-lg border border-border-default bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-all hover:bg-bg-tertiary"
            type="button"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            className="flex-1 rounded-lg bg-error px-4 py-2 text-sm font-medium text-white transition-all hover:bg-error/90"
            type="button"
            onClick={onConfirm}
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

export function UploadStatusAlert({ status }: { status: UploadStatus }): React.ReactElement {
  return (
    <div
      className={`rounded-lg p-4 ${
        status.type === 'success' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
      }`}
    >
      <div className="flex items-center gap-2">
        <span>{status.type === 'success' ? '✓' : '✗'}</span>
        <span className="text-sm font-medium">{status.message}</span>
      </div>
    </div>
  )
}
