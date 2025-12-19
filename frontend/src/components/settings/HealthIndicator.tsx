/**
 * Health Indicator Component - Shows backend and Inngest status
 */

import { useQuery } from '@tanstack/react-query'

import { fetchHealthCheck, type ServiceHealth } from '../../services/api'

const HEALTH_CHECK_INTERVAL = 30000 // 30 seconds

function getStatusColor(status: ServiceHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'bg-success'
    case 'configured':
      return 'bg-info'
    case 'degraded':
      return 'bg-warning'
    case 'not_configured':
    case 'disabled':
      return 'bg-text-muted'
    default:
      return 'bg-text-muted'
  }
}

function getStatusBgColor(status: ServiceHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'bg-success/10 border-success/30'
    case 'configured':
      return 'bg-info/10 border-info/30'
    case 'degraded':
      return 'bg-warning/10 border-warning/30'
    case 'not_configured':
    case 'disabled':
      return 'bg-bg-tertiary border-border-subtle'
    default:
      return 'bg-bg-tertiary border-border-subtle'
  }
}

function ServiceStatus({
  name,
  service,
}: {
  name: string
  service: ServiceHealth
}): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${getStatusBgColor(service.status)}`}
    >
      <span className={`h-3 w-3 rounded-full ${getStatusColor(service.status)} animate-pulse`} />
      <div>
        <span className="font-medium text-text-primary">{name}</span>
        <span className="ml-2 text-sm text-text-secondary">{service.message}</span>
      </div>
    </div>
  )
}

export function HealthIndicator(): React.ReactElement {
  const {
    data: health,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['health-check'],
    queryFn: fetchHealthCheck,
    refetchInterval: HEALTH_CHECK_INTERVAL,
    staleTime: HEALTH_CHECK_INTERVAL,
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border-default bg-bg-secondary p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span className="text-sm text-text-secondary">Vérification des services...</span>
        </div>
      </div>
    )
  }

  if (error !== null || health === undefined) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/10 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-error" />
          <span className="text-sm text-error">Impossible de vérifier les services</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border-default bg-bg-secondary p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-text-primary">État des services</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            health.overall_status === 'healthy'
              ? 'bg-success/20 text-success'
              : 'bg-warning/20 text-warning'
          }`}
        >
          {health.overall_status === 'healthy' ? 'Tous opérationnels' : 'Dégradé'}
        </span>
      </div>
      <div className="space-y-2">
        <ServiceStatus name="Backend API" service={health.services.backend} />
        <ServiceStatus name="Inngest (Jobs)" service={health.services.inngest} />
      </div>
    </div>
  )
}
