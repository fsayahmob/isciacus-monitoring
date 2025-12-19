/**
 * CustomerStats Component - Modern Dark Theme
 */

import { useCustomerStats } from '../../hooks/useAnalytics'

import { BenchmarkIndicator } from './BenchmarkIndicator'

interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  benchmark?: React.ReactNode
}

function StatCard({ title, value, subtitle, benchmark }: StatCardProps): React.ReactElement {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-3xl font-bold text-brand">{value}</div>
          <div className="text-sm text-text-secondary">{title}</div>
          {subtitle !== undefined && subtitle !== '' ? (
            <div className="mt-1 text-xs text-text-tertiary">{subtitle}</div>
          ) : null}
        </div>
        {benchmark !== undefined ? <div>{benchmark}</div> : null}
      </div>
    </div>
  )
}

function LoadingCard(): React.ReactElement {
  return (
    <div className="card animate-pulse p-4">
      <div className="skeleton h-8 w-16" />
      <div className="skeleton mt-2 h-4 w-24" />
    </div>
  )
}

function LoadingCards(): React.ReactElement {
  return (
    <>
      <LoadingCard />
      <LoadingCard />
      <LoadingCard />
      <LoadingCard />
    </>
  )
}

function StatsCards({
  data,
}: {
  data: ReturnType<typeof useCustomerStats>['data']
}): React.ReactElement | null {
  if (data === undefined) {
    return null
  }

  return (
    <>
      <StatCard
        subtitle="Clients dans la base Shopify"
        title="Base Clients"
        value={data.total_customers.toLocaleString('fr-FR')}
      />
      <StatCard
        benchmark={<BenchmarkIndicator evaluation={data.benchmarks.email_optin} />}
        subtitle={`${data.email_available.toLocaleString('fr-FR')} emails dispo → ${String(data.email_optin_rate)}% opt-in`}
        title="Abonnés Email"
        value={data.email_subscribers.toLocaleString('fr-FR')}
      />
      <StatCard
        benchmark={<BenchmarkIndicator evaluation={data.benchmarks.phone_rate} />}
        subtitle={`${String(data.phone_rate)}% de la base`}
        title="Numéros de Téléphone"
        value={data.phone_count.toLocaleString('fr-FR')}
      />
      <StatCard
        benchmark={<BenchmarkIndicator evaluation={data.benchmarks.sms_optin} />}
        subtitle={`${String(data.sms_optin_rate)}% opt-in sur ${data.phone_count.toLocaleString('fr-FR')} téléphones`}
        title="Opt-in SMS (RGPD)"
        value={data.sms_optin.toLocaleString('fr-FR')}
      />
    </>
  )
}

export function CustomerStatsSection(): React.ReactElement {
  const { data, isLoading, error, refetch } = useCustomerStats()

  if (error !== null) {
    return (
      <div className="rounded-lg border border-error/30 bg-error/10 p-4 text-error">
        Erreur lors du chargement des statistiques clients: {error.message}
      </div>
    )
  }

  const lastUpdated = data?.last_updated

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Analytics DATA - Clients</h3>
        <button
          className="btn btn-secondary"
          disabled={isLoading}
          type="button"
          onClick={refetch}
        >
          <svg
            className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
          Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {isLoading ? <LoadingCards /> : <StatsCards data={data} />}
      </div>

      {lastUpdated !== undefined && lastUpdated !== '' ? (
        <div className="mt-2 text-right text-xs text-text-muted">
          Dernière mise à jour: {new Date(lastUpdated).toLocaleString('fr-FR')}
        </div>
      ) : null}
    </div>
  )
}
