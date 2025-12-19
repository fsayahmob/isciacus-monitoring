/**
 * Permissions Panel Component - Shows Shopify API permissions status
 */

import { useQuery } from '@tanstack/react-query'

import { fetchShopifyPermissions, type PermissionResult } from '../../services/api'

const PERMISSIONS_CHECK_INTERVAL = 60000 // 1 minute

function getStatusColor(status: PermissionResult['status']): string {
  switch (status) {
    case 'granted':
      return 'bg-success'
    case 'denied':
      return 'bg-error'
    case 'not_configured':
      return 'bg-text-muted'
    default:
      return 'bg-warning'
  }
}

function getStatusBgColor(status: PermissionResult['status']): string {
  switch (status) {
    case 'granted':
      return 'bg-success/10 border-success/30'
    case 'denied':
      return 'bg-error/10 border-error/30'
    case 'not_configured':
      return 'bg-bg-tertiary border-border-subtle'
    default:
      return 'bg-warning/10 border-warning/30'
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
      return 'bg-success/20 text-success'
    case 'denied':
      return 'bg-error/20 text-error'
    default:
      return 'bg-bg-tertiary text-text-muted'
  }
}

function getSeverityBadge(severity: PermissionResult['severity']): React.ReactElement {
  const colors: Record<string, string> = {
    critical: 'bg-error/20 text-error',
    high: 'bg-orange-500/20 text-orange-400',
    medium: 'bg-warning/20 text-warning',
    low: 'bg-info/20 text-info',
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
            <span className="font-medium text-text-primary">{permission.name}</span>
            <span className="ml-2 text-sm text-text-secondary">({permission.id})</span>
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
        <div className="mt-2 text-sm text-error">{permission.error_message}</div>
      )}
      {isError && permission.how_to_grant !== '' && (
        <div className="mt-2 rounded bg-error/20 p-2 text-xs text-error">
          <strong>Comment corriger:</strong> {permission.how_to_grant}
        </div>
      )}
    </div>
  )
}

function PermissionsLoading(): React.ReactElement {
  return (
    <div className="rounded-xl border border-border-default bg-bg-secondary p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        <span className="text-sm text-text-secondary">Vérification des permissions Shopify...</span>
      </div>
    </div>
  )
}

function PermissionsError(): React.ReactElement {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-warning" />
        <span className="text-sm text-warning">
          Impossible de vérifier les permissions (Shopify non configuré?)
        </span>
      </div>
    </div>
  )
}

function PermissionsWarning(): React.ReactElement {
  return (
    <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
      <p className="text-sm text-warning">
        <strong>Action requise:</strong> Certaines permissions sont manquantes. Les actions de
        correction nécessitent la permission{' '}
        <code className="rounded bg-warning/20 px-1">write_themes</code>.
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
    ? 'bg-success/20 text-success'
    : 'bg-error/20 text-error'

  return (
    <div className="rounded-xl border border-border-default bg-bg-secondary p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-text-primary">Permissions Shopify</h3>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
          <button
            className="rounded p-1 text-text-muted hover:bg-bg-tertiary hover:text-text-secondary"
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
      <div className="mb-2 text-xs text-text-tertiary">
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
