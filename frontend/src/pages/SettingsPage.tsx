/**
 * Settings Page - ISCIACUS Monitoring Dashboard
 * ==============================================
 * Professional configuration page for managing API credentials
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ConfigSectionCard, HealthIndicator, LoadingSkeleton, PermissionsPanel } from '../components/settings'
import {
  ErrorDisplay,
  ProgressBar,
  RefreshButton,
  SaveBar,
  StatusMessage,
} from '../components/settings/SettingsHelpers'
import { useConnectionTest } from '../components/settings/useConnectionTest'
import { fetchConfig, updateConfig } from '../services/api'

const CONFIG_STALE_TIME = 30000 // 30 seconds

export function SettingsPage(): React.ReactElement {
  const queryClient = useQueryClient()
  const { testLoading, testResults, handleTestConnection } = useConnectionTest()
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const { data: config, isLoading, error, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: CONFIG_STALE_TIME,
  })

  const handleRefreshAll = (): void => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['health-check'] })
    void queryClient.invalidateQueries({ queryKey: ['shopify-permissions'] })
  }

  const saveMutation = useMutation({
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
      setSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde' })
    },
  })

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

  if (error) {
    return <ErrorDisplay error={error instanceof Error ? error : null} />
  }

  const configuredCount = config?.sections.filter((s) => s.is_configured).length ?? 0
  const totalCount = config?.sections.length ?? 0
  const changeCount = Object.keys(editedValues).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-cream-dark p-6 pb-24">
      <SettingsHeader onRefresh={handleRefreshAll} />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <HealthIndicator />
        <PermissionsPanel />
      </div>
      {!isLoading && config !== undefined && (
        <ProgressBar configured={configuredCount} total={totalCount} />
      )}
      <StatusMessage status={saveStatus} />
      <SettingsContent
        config={config}
        editedValues={editedValues}
        handleTestConnection={handleTestConnection}
        isLoading={isLoading}
        testLoading={testLoading}
        testResults={testResults}
        onValueChange={handleValueChange}
      />
      <SaveBar
        changeCount={changeCount}
        hasChanges={changeCount > 0}
        isSaving={saveMutation.isPending}
        onCancel={handleCancel}
        onSave={handleSave}
      />
    </div>
  )
}

function SettingsHeader({ onRefresh }: { onRefresh: () => void }): React.ReactElement {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-3xl text-burgundy">Configuration</h2>
          <p className="mt-2 text-gray-600">
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
  config: { sections: { id: string; name: string; description: string; is_configured: boolean; variables: { key: string; label: string; description: string; how_to_get: string; value: string | null; is_set: boolean; is_secret: boolean; required: boolean }[] }[] } | undefined
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
