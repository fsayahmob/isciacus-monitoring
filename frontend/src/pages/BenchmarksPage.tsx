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
    <tr className="border-b border-gray-100">
      <td className="py-3">
        <div className="font-medium">{threshold.label}</div>
        <div className="text-xs text-gray-500">{threshold.description}</div>
        <div className="text-xs text-gray-400 font-mono">{metricKey}</div>
      </td>
      <td className="py-3 text-center">
        <span className="inline-flex items-center rounded bg-red-100 px-2 py-1 text-sm text-red-800">
          &lt; {threshold.bad.max ?? threshold.bad.min}
          {threshold.unit}
        </span>
      </td>
      <td className="py-3 text-center">
        <span className="inline-flex items-center rounded bg-yellow-100 px-2 py-1 text-sm text-yellow-800">
          {threshold.ok.min}-{threshold.ok.max}
          {threshold.unit}
        </span>
      </td>
      <td className="py-3 text-center">
        <span className="inline-flex items-center rounded bg-green-100 px-2 py-1 text-sm text-green-800">
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
        <div key={i} className="h-12 rounded bg-gray-200" />
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
    <div className="mb-6 rounded border border-burgundy/30 bg-burgundy/5 p-4">
      <label className="block text-sm font-medium text-burgundy mb-2" htmlFor="industry-select">
        Secteur d&apos;activité
      </label>
      <div className="flex items-center gap-4">
        <select
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-burgundy focus:outline-none focus:ring-1 focus:ring-burgundy disabled:bg-gray-100"
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
        {isChanging ? <span className="text-sm text-gray-500">Mise à jour...</span> : null}
      </div>
      <p className="mt-2 text-xs text-gray-500">
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
          <tr className="border-b-2 border-burgundy text-left">
            <th className="pb-3 font-medium text-burgundy">Métrique</th>
            <th className="pb-3 text-center font-medium text-red-700">Insuffisant</th>
            <th className="pb-3 text-center font-medium text-yellow-700">Acceptable</th>
            <th className="pb-3 text-center font-medium text-green-700">Bon</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data.thresholds).map(([key, threshold]) => (
            <ThresholdRow key={key} metricKey={key} threshold={threshold} />
          ))}
        </tbody>
      </table>

      <div className="mt-8 border-t border-gray-200 pt-4">
        <h4 className="mb-3 text-sm font-medium text-gray-700">Sources</h4>
        <div className="flex flex-wrap gap-4">
          {data.sources.map((source) => (
            <a
              key={source.name}
              className="text-sm text-burgundy hover:underline"
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
        <div className="border border-red-200 bg-red-50 p-4 text-red-700">
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
          <h2 className="font-serif text-2xl text-burgundy">Configuration des Benchmarks</h2>
          <p className="mt-1 text-sm text-gray-500">
            Seuils de performance adaptés à votre secteur d&apos;activité
          </p>
        </div>
        {data !== undefined ? (
          <div className="text-right text-xs text-gray-400">
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

      <div className="border-2 border-burgundy bg-white p-6">
        {isLoading ? <LoadingSkeleton /> : <BenchmarksTable data={data} />}
      </div>

      <div className="mt-4 text-sm text-gray-500">
        <p>
          Ces benchmarks sont basés sur les moyennes du secteur pour 2025. Les seuils sont
          automatiquement ajustés en fonction du secteur sélectionné.
        </p>
      </div>
    </div>
  )
}
