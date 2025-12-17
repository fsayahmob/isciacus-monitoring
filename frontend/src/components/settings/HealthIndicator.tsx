/**
 * Health Indicator Component - Shows backend and Inngest status
 */

import { useQuery } from '@tanstack/react-query'

import { fetchHealthCheck, type ServiceHealth } from '../../services/api'

const HEALTH_CHECK_INTERVAL = 30000 // 30 seconds

function getStatusColor(status: ServiceHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-500'
    case 'configured':
      return 'bg-blue-500'
    case 'degraded':
      return 'bg-amber-500'
    case 'not_configured':
    case 'disabled':
      return 'bg-gray-400'
    default:
      return 'bg-gray-300'
  }
}

function getStatusBgColor(status: ServiceHealth['status']): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-50 border-green-200'
    case 'configured':
      return 'bg-blue-50 border-blue-200'
    case 'degraded':
      return 'bg-amber-50 border-amber-200'
    case 'not_configured':
    case 'disabled':
      return 'bg-gray-50 border-gray-200'
    default:
      return 'bg-gray-50 border-gray-200'
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
        <span className="font-medium text-gray-900">{name}</span>
        <span className="ml-2 text-sm text-gray-600">{service.message}</span>
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
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-burgundy border-t-transparent" />
          <span className="text-sm text-gray-600">Vérification des services...</span>
        </div>
      </div>
    )
  }

  if (error !== null || health === undefined) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm text-red-700">Impossible de vérifier les services</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">État des services</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            health.overall_status === 'healthy'
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
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
