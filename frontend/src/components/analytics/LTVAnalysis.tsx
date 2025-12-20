/**
 * LTV Analysis Component
 * Customer Lifetime Value by segment
 */

import React from 'react'

interface LTVData {
  segment: string
  ltv: number
  cac: number
  ratio: number
  status: 'good' | 'ok' | 'bad'
  color: string
}

const MOCK_LTV_DATA: LTVData[] = [
  { segment: 'Champions', ltv: 3750, cac: 450, ratio: 8.3, status: 'good', color: 'text-success' },
  { segment: 'Loyal', ltv: 2550, cac: 380, ratio: 6.7, status: 'good', color: 'text-info' },
  { segment: 'At Risk', ltv: 1860, cac: 420, ratio: 4.4, status: 'ok', color: 'text-warning' },
  { segment: 'Lost', ltv: 960, cac: 520, ratio: 1.8, status: 'bad', color: 'text-error' },
]

function getRatioStatus(ratio: number): { label: string; color: string } {
  if (ratio >= 5) {
    return { label: 'Excellent', color: 'bg-success text-white' }
  }
  if (ratio >= 3) {
    return { label: 'Bon', color: 'bg-info text-white' }
  }
  if (ratio >= 2) {
    return { label: 'Moyen', color: 'bg-warning text-black' }
  }
  return { label: 'Faible', color: 'bg-error text-white' }
}

export function LTVAnalysisSection(): React.ReactElement {
  return (
    <div className="mb-8">
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-text-primary">
          LTV vs CAC par Segment
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Customer Lifetime Value vs Customer Acquisition Cost - Ratio idéal: LTV/CAC {'>'}= 3
        </p>
      </div>

      <div className="card-elevated overflow-hidden rounded-xl">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle bg-bg-tertiary">
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Segment
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                LTV
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                CAC
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Ratio
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {MOCK_LTV_DATA.map((data) => {
              const status = getRatioStatus(data.ratio)
              return (
                <tr key={data.segment} className="border-b border-border-subtle hover:bg-bg-secondary">
                  <td className="px-6 py-4">
                    <span className={`font-medium ${data.color}`}>{data.segment}</span>
                  </td>
                  <td className="px-6 py-4 text-right text-text-primary">
                    {data.ltv.toLocaleString()}€
                  </td>
                  <td className="px-6 py-4 text-right text-text-primary">
                    {data.cac.toLocaleString()}€
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-lg font-bold text-text-primary">
                      {data.ratio.toFixed(1)}x
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card-elevated mt-4 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <svg
            className="h-5 w-5 flex-shrink-0 text-brand"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
          <div>
            <p className="text-sm font-medium text-text-primary">
              Recommandation Budget
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Concentrez vos budgets sur Champions et Loyal (ratio {'>'} 5x).
              Réduisez les budgets Lost (ratio {'<'} 2x) ou améliorez le CAC.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
