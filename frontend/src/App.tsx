/**
 * App Component - ISCIACUS Monitoring Dashboard
 * ==============================================
 * Main application component with layout structure
 */

import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'

import { FilterBar, Header, ProductGrid, ProductTable, Sidebar } from './components'
import { PAGES, VIEW_MODES } from './constants'
import { queryClient, setupQueryPersistence } from './lib/queryClient'
import { AnalyticsDataPage, AuditPage, BenchmarksPage, SettingsPage } from './pages'
import { useAppStore } from './stores/useAppStore'

import './index.css'

function ProductsPage(): React.ReactElement {
  const { viewMode } = useAppStore()

  return (
    <div className="p-4">{viewMode === VIEW_MODES.LIST ? <ProductTable /> : <ProductGrid />}</div>
  )
}


function MainContent(): React.ReactElement {
  const { currentPage } = useAppStore()

  return (
    <main className="ml-60 min-h-screen bg-cream">
      <Header />
      {/* FilterBar uniquement sur la page Produits */}
      {currentPage === PAGES.PRODUCTS ? <FilterBar /> : null}

      {currentPage === PAGES.PRODUCTS && <ProductsPage />}
      {currentPage === PAGES.ANALYTICS && <AnalyticsDataPage />}
      {currentPage === PAGES.BENCHMARKS && <BenchmarksPage />}
      {currentPage === PAGES.AUDIT && <AuditPage />}
      {currentPage === PAGES.SETTINGS && <SettingsPage />}

      <footer className="border-t border-burgundy p-4 text-center text-xs text-gray-500">
        ISCIACUS Monitoring - Données actualisées au chargement
      </footer>
    </main>
  )
}

export default function App(): React.ReactElement {
  useEffect(() => {
    setupQueryPersistence()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-cream font-sans">
        <Sidebar />
        <MainContent />
      </div>
    </QueryClientProvider>
  )
}
