/**
 * Settings Page - ISCIACUS Monitoring Dashboard
 * ==============================================
 * Professional configuration page for managing API credentials
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  ConfigSectionCard,
  ConfigurationWizard,
  HealthIndicator,
  LoadingSkeleton,
  PermissionsPanel,
} from '../components/settings'
import {
  ErrorDisplay,
  ProgressBar,
  RefreshButton,
  SaveBar,
  StatusMessage,
} from '../components/settings/SettingsHelpers'
import { useConnectionTest } from '../components/settings/useConnectionTest'
import { fetchConfig, updateConfig } from '../services/api'
import type { ConfigData } from '../services/api'

const CONFIG_STALE_TIME = 30000

interface SaveStatus {
  type: 'success' | 'error'
  message: string
}

function useSaveMutation(
  setEditedValues: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus | null>>
): ReturnType<
  typeof useMutation<{ success: boolean; message: string }, Error, Record<string, string>>
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateConfig,
    onSuccess: (result) => {
      if (result.success) {
        setSaveStatus({ type: 'success', message: 'Configuration sauvegardée avec succès!' })
        setEditedValues({})
        void queryClient.invalidateQueries({ queryKey: ['config'] })
      } else {
        setSaveStatus({ type: 'error', message: result.message })
      }
    },
    onError: (err) => {
      setSaveStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde',
      })
    },
  })
}

function useSettingsPage(): {
  config: ConfigData | undefined
  isLoading: boolean
  error: Error | null
  editedValues: Record<string, string>
  saveStatus: SaveStatus | null
  testLoading: string | null
  testResults: Record<string, { success: boolean; message: string }>
  configuredCount: number
  totalCount: number
  changeCount: number
  isSaving: boolean
  handlers: {
    handleRefreshAll: () => void
    handleValueChange: (key: string, value: string) => void
    handleSave: () => void
    handleCancel: () => void
    handleTestConnection: (sectionId: string) => void
  }
} {
  const queryClient = useQueryClient()
  const { testLoading, testResults, handleTestConnection } = useConnectionTest()
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null)

  const { data: config, isLoading, error, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: CONFIG_STALE_TIME,
  })

  const saveMutation = useSaveMutation(setEditedValues, setSaveStatus)

  const handleRefreshAll = (): void => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['health-check'] })
    void queryClient.invalidateQueries({ queryKey: ['shopify-permissions'] })
  }

  const handleValueChange = (key: string, value: string): void => {
    setEditedValues((prev) => ({ ...prev, [key]: value }))
    setSaveStatus(null)
  }

  const handleSave = (): void => {
    const updates: Record<string, string> = {}
    for (const [key, value] of Object.entries(editedValues)) {
      if (value.trim() !== '') {
        updates[key] = value
      }
    }
    if (Object.keys(updates).length > 0) {
      saveMutation.mutate(updates)
    }
  }

  const handleCancel = (): void => {
    setEditedValues({})
    setSaveStatus(null)
  }

  return {
    config,
    isLoading,
    error: error instanceof Error ? error : null,
    editedValues,
    saveStatus,
    testLoading,
    testResults,
    configuredCount: config?.sections.filter((s) => s.is_configured).length ?? 0,
    totalCount: config?.sections.length ?? 0,
    changeCount: Object.keys(editedValues).length,
    isSaving: saveMutation.isPending,
    handlers: { handleRefreshAll, handleValueChange, handleSave, handleCancel, handleTestConnection },
  }
}

export function SettingsPage(): React.ReactElement {
  const state = useSettingsPage()

  if (state.error !== null) {
    return <ErrorDisplay error={state.error} />
  }

  return (
    <div className="min-h-screen p-6 pb-24">
      <SettingsHeader onRefresh={state.handlers.handleRefreshAll} />
      <div className="mb-6">
        <ConfigurationWizard />
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <HealthIndicator />
        <PermissionsPanel />
      </div>
      {!state.isLoading && state.config !== undefined && (
        <ProgressBar configured={state.configuredCount} total={state.totalCount} />
      )}
      <StatusMessage status={state.saveStatus} />
      <SettingsContent
        config={state.config}
        editedValues={state.editedValues}
        handleTestConnection={state.handlers.handleTestConnection}
        isLoading={state.isLoading}
        testLoading={state.testLoading}
        testResults={state.testResults}
        onValueChange={state.handlers.handleValueChange}
      />
      <SaveBar
        changeCount={state.changeCount}
        hasChanges={state.changeCount > 0}
        isSaving={state.isSaving}
        onCancel={state.handlers.handleCancel}
        onSave={state.handlers.handleSave}
      />
    </div>
  )
}

function SettingsHeader({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-text-primary">Configuration</h2>
          <p className="mt-2 text-text-secondary">
            Gérez vos intégrations et paramètres de connexion aux services externes.
          </p>
        </div>
        <RefreshButton onRefresh={onRefresh} />
      </div>
    </div>
  )
}

function SettingsContent({
  config,
  isLoading,
  editedValues,
  testLoading,
  testResults,
  handleTestConnection,
  onValueChange,
}: {
  config: ConfigData | undefined
  isLoading: boolean
  editedValues: Record<string, string>
  testLoading: string | null
  testResults: Record<string, { success: boolean; message: string }>
  handleTestConnection: (sectionId: string) => void
  onValueChange: (key: string, value: string) => void
}): React.ReactElement {
  if (isLoading) {
    return <LoadingSkeleton />
  }
  return (
    <div className="space-y-8">
      {config?.sections.map((section) => (
        <ConfigSectionCard
          key={section.id}
          editedValues={editedValues}
          section={section}
          testLoading={testLoading}
          testResult={testResults}
          onTestConnection={handleTestConnection}
          onValueChange={onValueChange}
        />
      ))}
    </div>
  )
}
