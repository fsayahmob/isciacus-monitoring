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
      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-500" />
        GA4 connecté
      </span>
    )
  }
  if (available === false) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
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

  if (auditStatus === undefined || auditStatus.last_audit === null) {
    return (
      <button
        className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
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
        className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-200"
        type="button"
        onClick={handleClick}
        title="Problèmes de tracking détectés - Cliquez pour voir"
      >
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-red-500" />
        Audit: problèmes
      </button>
    )
  }

  return (
    <button
      className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-200"
      type="button"
      onClick={handleClick}
      title="Tracking conforme - Cliquez pour détails"
    >
      <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-500" />
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
        <h3 className="font-serif text-xl text-burgundy">Tunnel de Conversion</h3>
        <GA4StatusBadge available={ga4Available} />
        <AuditStatusBadge />
      </div>
      <div className="flex items-center gap-4">
        <select
          className="rounded border border-gray-300 px-3 py-1.5 text-sm"
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
          className="flex items-center gap-2 rounded border border-burgundy px-3 py-1.5 text-sm text-burgundy hover:bg-burgundy hover:text-white"
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
