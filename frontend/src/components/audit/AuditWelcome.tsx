/**
 * Audit Welcome Screen - Landing page before starting audit
 */

interface AuditWelcomeProps {
  lastAudit: string | null | undefined
  hasIssues: boolean | undefined
  onStart: () => void
}

export function AuditWelcome({ lastAudit, hasIssues, onStart }: AuditWelcomeProps): React.ReactElement {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-cream-dark p-6">
      <div className="mx-auto max-w-2xl">
        <AuditHeader />
        <StatusCard lastAudit={lastAudit} hasIssues={hasIssues} />
        <InfoCard />
        <WarningCard />
        <StartButton onStart={onStart} />
      </div>
    </div>
  )
}

function AuditHeader(): React.ReactElement {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-burgundy/10">
        <svg className="h-8 w-8 text-burgundy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 className="font-serif text-3xl text-burgundy">Audit Tracking</h1>
      <p className="mt-2 text-gray-600">Vérifiez la conformité entre vos données GA4 et Shopify</p>
    </div>
  )
}

function StatusCard({ lastAudit, hasIssues }: { lastAudit: string | null | undefined; hasIssues: boolean | undefined }): React.ReactElement {
  return (
    <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-medium text-gray-900">Statut actuel</h3>
      {lastAudit !== null && lastAudit !== undefined ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Dernier audit</span>
            <span className="text-sm font-medium text-gray-900">
              {new Date(lastAudit).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">État</span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${hasIssues === true ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
              {hasIssues === true ? 'Problèmes détectés' : 'Tout est OK'}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Aucun audit n'a encore été effectué</p>
      )}
    </div>
  )
}

function InfoCard(): React.ReactElement {
  return (
    <div className="mb-8 rounded-2xl border border-blue-200 bg-blue-50 p-6">
      <h3 className="mb-3 flex items-center gap-2 font-medium text-blue-900">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Ce que l'audit vérifie
      </h3>
      <ul className="space-y-2 text-sm text-blue-800">
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
          Correspondance des transactions entre Shopify et GA4
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
          Couverture du tracking sur vos collections
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
          Configuration des événements e-commerce
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-400" />
          Qualité des données collectées
        </li>
      </ul>
    </div>
  )
}

function WarningCard(): React.ReactElement {
  return (
    <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm text-amber-800">
        <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        L'audit peut prendre 30-60 secondes selon le volume de données.
      </p>
    </div>
  )
}

function StartButton({ onStart }: { onStart: () => void }): React.ReactElement {
  return (
    <button
      className="w-full rounded-xl bg-burgundy py-4 text-lg font-medium text-white shadow-lg transition-all hover:bg-burgundy/90 hover:shadow-xl active:scale-[0.98]"
      type="button"
      onClick={onStart}
    >
      Lancer l'audit
    </button>
  )
}
