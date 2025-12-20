/**
 * Custom hook for Google Service Account credentials management
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

interface UploadResponse {
  success: boolean
  message: string
  project_id?: string
  service_account_email?: string
}

interface UploadError {
  detail?: string
  message?: string
}

export interface UploadStatus {
  type: 'success' | 'error'
  message: string
}

export function useGoogleCredentials(): {
  uploadMutation: ReturnType<
    typeof useMutation<UploadResponse, Error, File, unknown>
  >
  deleteMutation: ReturnType<
    typeof useMutation<{ success: boolean; message: string }, Error, void, unknown>
  >
  uploadStatus: UploadStatus | null
  setUploadStatus: (status: UploadStatus | null) => void
} {
  const queryClient = useQueryClient()
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('http://localhost:8080/api/credentials/google/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = (await response.json()) as UploadError
        throw new Error(errorData.detail ?? errorData.message ?? 'Upload failed')
      }

      return (await response.json()) as UploadResponse
    },
    onSuccess: (data) => {
      setUploadStatus({
        type: 'success',
        message: `Credentials uploaded! Project: ${data.project_id ?? 'unknown'}`,
      })
      void queryClient.invalidateQueries({ queryKey: ['config'] })
      void queryClient.invalidateQueries({ queryKey: ['credentials-status'] })
    },
    onError: (error: Error) => {
      setUploadStatus({
        type: 'error',
        message: error.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('http://localhost:8080/api/credentials/google', {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = (await response.json()) as UploadError
        throw new Error(errorData.detail ?? errorData.message ?? 'Delete failed')
      }

      return (await response.json()) as { success: boolean; message: string }
    },
    onSuccess: () => {
      setUploadStatus({
        type: 'success',
        message: 'Credentials supprimées avec succès',
      })
      void queryClient.invalidateQueries({ queryKey: ['config'] })
      void queryClient.invalidateQueries({ queryKey: ['credentials-status'] })
    },
    onError: (error: Error) => {
      setUploadStatus({
        type: 'error',
        message: error.message,
      })
    },
  })

  return {
    uploadMutation,
    deleteMutation,
    uploadStatus,
    setUploadStatus,
  }
}
