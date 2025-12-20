/**
 * Google Service Account Upload Component
 * ========================================
 * Handles secure upload of Google Service Account JSON credentials
 */

import { useState } from 'react'

import {
  ConfiguredCredentials,
  ConfirmDialog,
  SecurityInfo,
  UploadDropzone,
  UploadStatusAlert,
} from './GoogleUploadComponents'
import type { UploadStatus } from './useGoogleCredentials'
import { useGoogleCredentials } from './useGoogleCredentials'

interface FileUploadHandlers {
  handleFileSelect: (file: File) => void
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function useFileUploadHandlers(
  setUploadStatus: (status: UploadStatus) => void,
  setIsDragging: (dragging: boolean) => void,
  uploadMutation: { mutate: (file: File) => void }
): FileUploadHandlers {
  const handleFileSelect = (file: File): void => {
    if (!file.name.endsWith('.json')) {
      setUploadStatus({
        type: 'error',
        message: 'Le fichier doit être au format JSON',
      })
      return
    }
    uploadMutation.mutate(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(false)
    const { files } = e.dataTransfer
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file !== undefined) {
      handleFileSelect(file)
    }
  }

  return { handleFileSelect, handleDrop, handleDragOver, handleInputChange }
}

export function GoogleServiceAccountUpload({
  isConfigured,
  projectId,
  serviceAccountEmail,
}: {
  isConfigured: boolean
  projectId?: string
  serviceAccountEmail?: string
}): React.ReactElement {
  const { uploadMutation, deleteMutation, uploadStatus, setUploadStatus } = useGoogleCredentials()
  const [isDragging, setIsDragging] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const { handleDrop, handleDragOver, handleInputChange } = useFileUploadHandlers(
    setUploadStatus,
    setIsDragging,
    uploadMutation
  )

  const handleDeleteClick = (): void => {
    setShowConfirmDelete(true)
  }

  const handleConfirmDelete = (): void => {
    setShowConfirmDelete(false)
    deleteMutation.mutate()
  }

  return (
    <div className="space-y-4">
      {isConfigured ? (
        <ConfiguredCredentials
          isDeleting={deleteMutation.isPending}
          projectId={projectId}
          serviceAccountEmail={serviceAccountEmail}
          onDelete={handleDeleteClick}
        />
      ) : (
        <UploadDropzone
          isDragging={isDragging}
          isUploading={uploadMutation.isPending}
          onDragLeave={() => {
            setIsDragging(false)
          }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onFileSelect={handleInputChange}
        />
      )}
      {uploadStatus && <UploadStatusAlert status={uploadStatus} />}
      <SecurityInfo />
      <ConfirmDialog
        isOpen={showConfirmDelete}
        onCancel={() => {
          setShowConfirmDelete(false)
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
