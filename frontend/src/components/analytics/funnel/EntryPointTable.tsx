/**
 * EntryPointTable Component - Distribution of purchases by entry point
 */

import type { ConversionFunnel } from '../../../types/analytics'

interface EntryPointTableProps {
  entries: ConversionFunnel['cvr_by_entry']
}

export function EntryPointTable({ entries }: EntryPointTableProps): React.ReactElement | null {
  if (entries.length === 0) {
    return null
  }

  return (
    <div className="mt-6 border-t border-border-subtle pt-4">
      <h4 className="mb-3 text-sm font-medium text-text-primary">
        Distribution des achats par point d&apos;entrée
        <span className="ml-2 text-xs font-normal text-text-tertiary">(Source: Shopify)</span>
      </h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-default text-left">
            <th className="pb-2 font-medium text-text-secondary">Point d&apos;entrée</th>
            <th className="pb-2 text-right font-medium text-text-secondary">% des achats</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.entry_point} className="border-b border-border-subtle">
              <td className="py-2 text-text-primary">{entry.entry_point}</td>
              <td className="py-2 text-right font-mono text-text-primary">{entry.cvr}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-text-muted italic">
        Note: Le CVR par point d&apos;entrée requiert l&apos;intégration GA4 pour les données de
        visiteurs.
      </p>
    </div>
  )
}
