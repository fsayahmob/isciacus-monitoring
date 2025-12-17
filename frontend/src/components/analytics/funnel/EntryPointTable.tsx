/**
 * EntryPointTable Component - Distribution of purchases by entry point
 */

import type { ConversionFunnel } from '../../../types/analytics'

interface EntryPointTableProps {
  entries: ConversionFunnel['cvr_by_entry']
}

export function EntryPointTable({ entries }: EntryPointTableProps): React.ReactElement | null {
  if (entries == null || entries.length === 0) {
    return null
  }

  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <h4 className="mb-3 text-sm font-medium text-gray-700">
        Distribution des achats par point d&apos;entrée
        <span className="ml-2 text-xs font-normal text-gray-500">(Source: Shopify)</span>
      </h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="pb-2 font-medium text-gray-600">Point d&apos;entrée</th>
            <th className="pb-2 text-right font-medium text-gray-600">% des achats</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.entry_point} className="border-b border-gray-100">
              <td className="py-2">{entry.entry_point}</td>
              <td className="py-2 text-right font-mono">{entry.cvr}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-gray-400 italic">
        Note: Le CVR par point d&apos;entrée requiert l&apos;intégration GA4 pour les données de visiteurs.
      </p>
    </div>
  )
}
