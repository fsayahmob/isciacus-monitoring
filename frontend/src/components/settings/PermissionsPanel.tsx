/**
 * Permissions Panel Component - Shows Shopify API permissions status
 */

import { useQuery } from '@tanstack/react-query'

import { fetchShopifyPermissions, type PermissionResult } from '../../services/api'

const PERMISSIONS_CHECK_INTERVAL = 60000 // 1 minute

function getStatusColor(status: PermissionResult['status']): string {
  switch (status) {
    case 'granted':
      return 'bg-green-500'
    case 'denied':
      return 'bg-red-500'
    case 'not_configured':
      return 'bg-gray-400'
    default:
      return 'bg-amber-500'
  }
}

function getStatusBgColor(status: PermissionResult['status']): string {
  switch (status) {
    case 'granted':
      return 'bg-green-50 border-green-200'
    case 'denied':
      return 'bg-red-50 border-red-200'
    case 'not_configured':
      return 'bg-gray-50 border-gray-200'
    default:
      return 'bg-amber-50 border-amber-200'
  }
}

function getStatusLabel(status: PermissionResult['status']): string {
  switch (status) {
    case 'granted':
      return 'Accordé'
    case 'denied':
      return 'Refusé'
    case 'not_configured':
      return 'Non configuré'
    default:
      return 'Inconnu'
  }
}

function getStatusTagColor(status: PermissionResult['status']): string {
  switch (status) {
    case 'granted':
      return 'bg-green-100 text-green-800'
    case 'denied':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function getSeverityBadge(severity: PermissionResult['severity']): React.ReactElement {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-blue-100 text-blue-800',
  }

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${colors[severity] ?? colors.medium}`}
    >
      {severity}
    </span>
  )
}

function PermissionRow({ permission }: { permission: PermissionResult }): React.ReactElement {
  const isError = permission.status === 'denied'

  return (
    <div className={`rounded-lg border px-4 py-3 ${getStatusBgColor(permission.status)}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${getStatusColor(permission.status)}`} />
          <div>
            <span className="font-medium text-gray-900">{permission.name}</span>
            <span className="ml-2 text-sm text-gray-600">({permission.id})</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getSeverityBadge(permission.severity)}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusTagColor(permission.status)}`}
          >
            {getStatusLabel(permission.status)}
          </span>
        </div>
      </div>
      {isError && permission.error_message !== null && (
        <div className="mt-2 text-sm text-red-700">{permission.error_message}</div>
      )}
      {isError && permission.how_to_grant !== '' && (
        <div className="mt-2 rounded bg-red-100 p-2 text-xs text-red-800">
          <strong>Comment corriger:</strong> {permission.how_to_grant}
        </div>
      )}
    </div>
  )
}

function PermissionsLoading(): React.ReactElement {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-burgundy border-t-transparent" />
        <span className="text-sm text-gray-600">Vérification des permissions Shopify...</span>
      </div>
    </div>
  )
}

function PermissionsError(): React.ReactElement {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-amber-500" />
        <span className="text-sm text-amber-700">
          Impossible de vérifier les permissions (Shopify non configuré?)
        </span>
      </div>
    </div>
  )
}

function PermissionsWarning(): React.ReactElement {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm text-amber-800">
        <strong>Action requise:</strong> Certaines permissions sont manquantes. Les actions de
        correction nécessitent la permission{' '}
        <code className="rounded bg-amber-100 px-1">write_themes</code>.
      </p>
    </div>
  )
}

export function PermissionsPanel(): React.ReactElement {
  const {
    data: permissions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['shopify-permissions'],
    queryFn: fetchShopifyPermissions,
    refetchInterval: PERMISSIONS_CHECK_INTERVAL,
    staleTime: PERMISSIONS_CHECK_INTERVAL,
  })

  if (isLoading) {
    return <PermissionsLoading />
  }
  if (error !== null || permissions === undefined) {
    return <PermissionsError />
  }

  const deniedCount = permissions.results.filter((p) => p.status === 'denied').length
  const grantedCount = permissions.results.filter((p) => p.status === 'granted').length
  const statusLabel = permissions.all_granted
    ? 'Toutes accordées'
    : `${String(deniedCount)} permission${deniedCount > 1 ? 's' : ''} manquante${deniedCount > 1 ? 's' : ''}`
  const statusClass = permissions.all_granted
    ? 'bg-green-100 text-green-800'
    : 'bg-red-100 text-red-800'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Permissions Shopify</h3>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
          <button
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Rafraîchir"
            type="button"
            onClick={() => {
              void refetch()
            }}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="mb-2 text-xs text-gray-500">
        {String(grantedCount)}/{String(permissions.results.length)} permissions vérifiées
      </div>
      <div className="space-y-2">
        {permissions.results.map((permission) => (
          <PermissionRow key={permission.id} permission={permission} />
        ))}
      </div>
      {!permissions.all_granted && <PermissionsWarning />}
    </div>
  )
}
