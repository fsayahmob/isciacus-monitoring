/**
 * Settings Components - ISCIACUS Monitoring Dashboard
 * ====================================================
 * Reusable components for the settings page
 */

import type { ConfigSection, ConnectionTestResult } from '../../services/api'
import { SectionIcon } from './SectionIcons'
import { VariableCard } from './VariableCard'

export function StatusIndicator({ isConfigured }: { isConfigured: boolean }): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        isConfigured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-amber-500'}`} />
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
            ? 'cursor-not-allowed bg-gray-100 text-gray-400'
            : 'bg-burgundy text-white hover:bg-burgundy/90 active:scale-95'
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
            result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
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
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-gray-200 bg-gradient-to-br from-white to-gray-50 shadow-sm transition-all hover:shadow-md">
      <ConfigSectionHeader
        section={section}
        testLoading={testLoading}
        testResult={testResult}
        onTestConnection={onTestConnection}
      />
      <div className="space-y-4 p-6">
        {section.variables.map((variable) => (
          <VariableCard
            key={variable.key}
            editedValue={editedValues[variable.key]}
            variable={variable}
            onValueChange={onValueChange}
          />
        ))}
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
    <div className="border-b border-gray-200 bg-white px-6 py-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`rounded-xl p-3 ${
              section.is_configured
                ? 'bg-gradient-to-br from-burgundy to-burgundy/80 text-white'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            <SectionIcon sectionId={section.id} />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{section.name}</h3>
            <p className="mt-0.5 text-sm text-gray-500">{section.description}</p>
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
        <div key={i} className="animate-pulse rounded-2xl border-2 border-gray-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gray-200" />
            <div className="flex-1">
              <div className="h-6 w-48 rounded bg-gray-200" />
              <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
            </div>
          </div>
          <div className="mt-6 space-y-4">
            <div className="h-24 rounded-xl bg-gray-100" />
            <div className="h-24 rounded-xl bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EnvFileInfo(): React.ReactElement {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600"
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
          <h4 className="font-medium text-blue-900">Configuration via fichier .env</h4>
          <p className="mt-1 text-sm text-blue-700">
            Les variables sont configurées dans le fichier{' '}
            <code className="rounded bg-blue-100 px-1.5 py-0.5 text-xs">.env</code> du backend.
            Modifiez ce fichier puis redémarrez les containers Docker pour appliquer les
            changements.
          </p>
          <div className="mt-3 rounded-lg bg-white/80 p-3">
            <code className="text-xs text-gray-700">
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
