/**
 * Benchmarks Page - ISCIACUS Monitoring Dashboard
 * ================================================
 */

import { useState } from 'react'

import { useBenchmarks, useIndustries, useSetIndustry } from '../hooks/useAnalytics'
import type { Industry, Threshold } from '../types/analytics'

const SKELETON_COUNT = 5

interface ThresholdRowProps {
  metricKey: string
  threshold: Threshold
}

function ThresholdRow({ metricKey, threshold }: ThresholdRowProps): React.ReactElement {
  return (
    <tr className="border-b border-border-subtle">
      <td className="py-3">
        <div className="font-medium text-text-primary">{threshold.label}</div>
        <div className="text-xs text-text-tertiary">{threshold.description}</div>
        <div className="text-xs text-text-muted font-mono">{metricKey}</div>
      </td>
      <td className="py-3 text-center">
        <span className="inline-flex items-center rounded bg-error/20 px-2 py-1 text-sm text-error">
          &lt; {threshold.bad.max ?? threshold.bad.min}
          {threshold.unit}
        </span>
      </td>
      <td className="py-3 text-center">
        <span className="inline-flex items-center rounded bg-warning/20 px-2 py-1 text-sm text-warning">
          {threshold.ok.min}-{threshold.ok.max}
          {threshold.unit}
        </span>
      </td>
      <td className="py-3 text-center">
        <span className="inline-flex items-center rounded bg-success/20 px-2 py-1 text-sm text-success">
          &gt; {threshold.good.min ?? threshold.good.max}
          {threshold.unit}
        </span>
      </td>
    </tr>
  )
}

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="animate-pulse space-y-4">
      {Array.from({ length: SKELETON_COUNT }, (_, i) => i).map((i) => (
        <div key={i} className="skeleton h-12 rounded" />
      ))}
    </div>
  )
}

function IndustrySelector({
  industries,
  currentIndustry,
  onSelect,
  isChanging,
}: {
  industries: Industry[]
  currentIndustry: string
  onSelect: (id: string) => void
  isChanging: boolean
}): React.ReactElement {
  return (
    <div className="mb-6 rounded-lg border border-brand/30 bg-brand/5 p-4">
      <label className="block text-sm font-medium text-brand mb-2" htmlFor="industry-select">
        Secteur d&apos;activité
      </label>
      <div className="flex items-center gap-4">
        <select
          className="input flex-1"
          disabled={isChanging}
          id="industry-select"
          value={currentIndustry}
          onChange={(e) => {
            onSelect(e.target.value)
          }}
        >
          {industries.map((ind) => (
            <option key={ind.id} value={ind.id}>
              {ind.name} - {ind.description}
            </option>
          ))}
        </select>
        {isChanging ? <span className="text-sm text-text-tertiary">Mise à jour...</span> : null}
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        Les seuils de performance seront adaptés à votre secteur d&apos;activité.
      </p>
    </div>
  )
}

function BenchmarksTable({
  data,
}: {
  data: ReturnType<typeof useBenchmarks>['data']
}): React.ReactElement | null {
  if (data === undefined) {
    return null
  }

  return (
    <>
      <table className="w-full">
        <thead>
          <tr className="border-b-2 border-brand text-left">
            <th className="pb-3 font-medium text-brand">Métrique</th>
            <th className="pb-3 text-center font-medium text-error">Insuffisant</th>
            <th className="pb-3 text-center font-medium text-warning">Acceptable</th>
            <th className="pb-3 text-center font-medium text-success">Bon</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data.thresholds).map(([key, threshold]) => (
            <ThresholdRow key={key} metricKey={key} threshold={threshold} />
          ))}
        </tbody>
      </table>

      <div className="mt-8 border-t border-border-subtle pt-4">
        <h4 className="mb-3 text-sm font-medium text-text-secondary">Sources</h4>
        <div className="flex flex-wrap gap-4">
          {data.sources.map((source) => (
            <a
              key={source.name}
              className="text-sm text-brand hover:underline"
              href={source.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {source.name}
            </a>
          ))}
        </div>
      </div>
    </>
  )
}

export function BenchmarksPage(): React.ReactElement {
  const { data, isLoading, error, refetch } = useBenchmarks()
  const { data: industriesData, isLoading: industriesLoading } = useIndustries()
  const { setIndustry } = useSetIndustry()
  const [isChanging, setIsChanging] = useState(false)

  const handleIndustryChange = async (industryId: string): Promise<void> => {
    setIsChanging(true)
    try {
      await setIndustry(industryId)
      refetch()
    } finally {
      setIsChanging(false)
    }
  }

  if (error !== null) {
    return (
      <div className="p-4">
        <div className="border border-error/30 bg-error/10 p-4 text-error rounded-lg">
          Erreur lors du chargement des benchmarks: {error.message}
        </div>
      </div>
    )
  }

  const industries = industriesData?.industries ?? []
  const currentIndustry = data?.industry ?? ''

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">Configuration des Benchmarks</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            Seuils de performance adaptés à votre secteur d&apos;activité
          </p>
        </div>
        {data !== undefined ? (
          <div className="text-right text-xs text-text-muted">
            <div>Version: {data.version}</div>
            <div>Dernière MAJ: {data.last_updated}</div>
          </div>
        ) : null}
      </div>

      {/* Industry Selector */}
      {!industriesLoading && industries.length > 0 ? (
        <IndustrySelector
          currentIndustry={currentIndustry}
          industries={industries}
          isChanging={isChanging}
          onSelect={(id) => {
            void handleIndustryChange(id)
          }}
        />
      ) : null}

      <div className="card-elevated p-6">
        {isLoading ? <LoadingSkeleton /> : <BenchmarksTable data={data} />}
      </div>

      <div className="mt-4 text-sm text-text-tertiary">
        <p>
          Ces benchmarks sont basés sur les moyennes du secteur pour 2025. Les seuils sont
          automatiquement ajustés en fonction du secteur sélectionné.
        </p>
      </div>
    </div>
  )
}
