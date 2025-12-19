/**
 * FunnelHeader Component - Header with title, status badges, and controls
 */

import { useAuditStatus } from '../../../hooks/useAnalytics'
import { PAGES } from '../../../constants'
import { useAppStore } from '../../../stores/useAppStore'

interface FunnelHeaderProps {
  period: number
  onPeriodChange: (p: number) => void
  isLoading: boolean
  onRefetch: () => void
  ga4Available?: boolean
}

function GA4StatusBadge({ available }: { available?: boolean }): React.ReactElement | null {
  if (available === true) {
    return (
      <span className="inline-flex items-center rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success" />
        GA4 connecté
      </span>
    )
  }
  if (available === false) {
    return (
      <span className="inline-flex items-center rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-warning" />
        Shopify uniquement
      </span>
    )
  }
  return null
}

function AuditStatusBadge(): React.ReactElement | null {
  const { data: auditStatus, isLoading } = useAuditStatus()
  const { setCurrentPage } = useAppStore()

  if (isLoading) {
    return null
  }

  const handleClick = (): void => {
    setCurrentPage(PAGES.AUDIT)
  }

  if (auditStatus === undefined) {
    return null
  }

  if (auditStatus.last_audit === null) {
    return (
      <button
        className="inline-flex items-center rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary"
        type="button"
        onClick={handleClick}
        title="Aucun audit effectué - Cliquez pour lancer"
      >
        <span className="mr-1">?</span>
        Audit requis
      </button>
    )
  }

  if (auditStatus.has_issues) {
    return (
      <button
        className="inline-flex items-center rounded-full bg-error/20 px-2 py-0.5 text-xs font-medium text-error hover:bg-error/30"
        type="button"
        onClick={handleClick}
        title="Problèmes de tracking détectés - Cliquez pour voir"
      >
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-error" />
        Audit: problèmes
      </button>
    )
  }

  return (
    <button
      className="inline-flex items-center rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-success hover:bg-success/30"
      type="button"
      onClick={handleClick}
      title="Tracking conforme - Cliquez pour détails"
    >
      <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success" />
      Audit OK
    </button>
  )
}

const PERIOD_OPTIONS = [
  { value: 7, label: '7 derniers jours' },
  { value: 30, label: '30 derniers jours' },
  { value: 90, label: '90 derniers jours' },
]

export function FunnelHeader({
  period,
  onPeriodChange,
  isLoading,
  onRefetch,
  ga4Available,
}: FunnelHeaderProps): React.ReactElement {
  return (
    <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <h3 className="text-xl font-semibold text-text-primary">Tunnel de Conversion</h3>
        <GA4StatusBadge available={ga4Available} />
        <AuditStatusBadge />
      </div>
      <div className="flex items-center gap-4">
        <select
          className="input"
          value={period}
          onChange={(e) => {
            onPeriodChange(Number(e.target.value))
          }}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary"
          disabled={isLoading}
          type="button"
          onClick={onRefetch}
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
    </div>
  )
}
