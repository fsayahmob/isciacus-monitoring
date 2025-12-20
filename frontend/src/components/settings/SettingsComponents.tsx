/**
 * Settings Components - ISCIACUS Monitoring Dashboard
 * ====================================================
 * Reusable components for the settings page
 */

import type { ConfigSection, ConnectionTestResult } from '../../services/api'
import { GoogleServiceAccountUpload } from './GoogleServiceAccountUpload'
import { SectionIcon } from './SectionIcons'
import { VariableCard } from './VariableCard'

export function StatusIndicator({ isConfigured }: { isConfigured: boolean }): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        isConfigured ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${isConfigured ? 'bg-success' : 'bg-warning'}`} />
      {isConfigured ? 'Configuré' : 'Non configuré'}
    </div>
  )
}

export function ConnectionTestButton({
  onTest,
  isLoading,
  result,
}: {
  onTest: () => void
  isLoading: boolean
  result: ConnectionTestResult | null
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3">
      <button
        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
          isLoading
            ? 'cursor-not-allowed bg-bg-tertiary text-text-muted'
            : 'bg-brand text-white hover:bg-brand/90 active:scale-95'
        }`}
        disabled={isLoading}
        type="button"
        onClick={onTest}
      >
        {isLoading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Test en cours...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Tester la connexion
          </>
        )}
      </button>

      {result !== null && !isLoading && (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            result.success ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          }`}
        >
          <span>{result.success ? '✓' : '✗'}</span>
          <span>{result.message}</span>
        </div>
      )}
    </div>
  )
}

export function ConfigSectionCard({
  section,
  onTestConnection,
  testLoading,
  testResult,
  editedValues,
  onValueChange,
}: {
  section: ConfigSection
  onTestConnection: (sectionId: string) => void
  testLoading: string | null
  testResult: Record<string, ConnectionTestResult>
  editedValues: Record<string, string>
  onValueChange: (key: string, value: string) => void
}): React.ReactElement {
  // Special handling for Google Service Account section
  const isGoogleServiceAccount = section.id === 'google_service_account'

  // Extract project_id and service_account_email from variables if present
  const projectId = section.variables.find((v) => v.key === 'GOOGLE_PROJECT_ID')?.value
  const serviceAccountEmail = section.variables.find(
    (v) => v.key === 'GOOGLE_SERVICE_ACCOUNT_EMAIL'
  )?.value

  return (
    <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-secondary shadow-sm transition-all hover:shadow-md">
      <ConfigSectionHeader
        section={section}
        testLoading={testLoading}
        testResult={testResult}
        onTestConnection={onTestConnection}
      />
      <div className="space-y-4 p-6">
        {isGoogleServiceAccount ? (
          <GoogleServiceAccountUpload
            isConfigured={section.is_configured}
            projectId={projectId}
            serviceAccountEmail={serviceAccountEmail}
          />
        ) : (
          section.variables.map((variable) => (
            <VariableCard
              key={variable.key}
              editedValue={editedValues[variable.key]}
              variable={variable}
              onValueChange={onValueChange}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ConfigSectionHeader({
  section,
  testLoading,
  testResult,
  onTestConnection,
}: {
  section: ConfigSection
  testLoading: string | null
  testResult: Record<string, ConnectionTestResult>
  onTestConnection: (sectionId: string) => void
}): React.ReactElement {
  return (
    <div className="border-b border-border-subtle bg-bg-tertiary px-6 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`rounded-xl p-3 ${
              section.is_configured
                ? 'bg-gradient-to-br from-brand to-brand/80 text-white'
                : 'bg-bg-secondary text-text-muted'
            }`}
          >
            <SectionIcon sectionId={section.id} />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-text-primary">{section.name}</h3>
            <p className="mt-0.5 text-sm text-text-tertiary">{section.description}</p>
          </div>
        </div>
        <StatusIndicator isConfigured={section.is_configured} />
      </div>
      <div className="mt-4">
        <ConnectionTestButton
          isLoading={testLoading === section.id}
          result={testResult[section.id] ?? null}
          onTest={() => {
            onTestConnection(section.id)
          }}
        />
      </div>
    </div>
  )
}

const SKELETON_COUNT = 3
const SKELETON_ITEMS = Array.from({ length: SKELETON_COUNT }, (_, i) => i + 1)

export function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="space-y-6">
      {SKELETON_ITEMS.map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-border-default bg-bg-secondary p-6"
        >
          <div className="flex items-center gap-4">
            <div className="skeleton h-12 w-12 rounded-xl" />
            <div className="flex-1">
              <div className="skeleton h-6 w-48 rounded" />
              <div className="skeleton mt-2 h-4 w-72 rounded" />
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-24 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EnvFileInfo(): React.ReactElement {
  return (
    <div className="rounded-xl border border-info/30 bg-info/10 p-5">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-info"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h4 className="font-medium text-info">Configuration via fichier .env</h4>
          <p className="mt-1 text-sm text-text-secondary">
            Les variables sont configurées dans le fichier{' '}
            <code className="rounded bg-info/20 px-1.5 py-0.5 text-xs text-info">.env</code> du
            backend. Modifiez ce fichier puis redémarrez les containers Docker pour appliquer les
            changements.
          </p>
          <div className="mt-3 rounded-lg bg-bg-tertiary p-3">
            <code className="text-xs text-text-secondary">
              docker-compose down && docker-compose up --build -d
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}

// Re-export VariableCard for backwards compatibility
export { VariableCard } from './VariableCard'
