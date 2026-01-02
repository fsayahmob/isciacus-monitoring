/**
 * App Component - ISCIACUS Monitoring Dashboard
 * Modern dark theme inspired by Linear, Vercel, Raycast
 */

import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'

import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { FilterBar, Header, ProductGrid, ProductTable, Sidebar } from './components'
import { PAGES, VIEW_MODES } from './constants'
import { AuthProvider } from './contexts/AuthProvider'
import { queryClient, setupQueryPersistence } from './lib/queryClient'
import { AnalyticsDataPage, AuditPage, BenchmarksPage, SettingsPage } from './pages'
import { useAppStore } from './stores/useAppStore'

import './index.css'

function ProductsPage(): React.ReactElement {
  const { viewMode } = useAppStore()

  return (
    <div className="p-6">{viewMode === VIEW_MODES.LIST ? <ProductTable /> : <ProductGrid />}</div>
  )
}

function MainContent(): React.ReactElement {
  const { currentPage } = useAppStore()

  return (
    <main className="ml-56 min-h-screen bg-bg-primary">
      <Header />
      {currentPage === PAGES.PRODUCTS ? <FilterBar /> : null}

      <div className="animate-fade-in">
        {currentPage === PAGES.PRODUCTS && <ProductsPage />}
        {currentPage === PAGES.ANALYTICS && <AnalyticsDataPage />}
        {currentPage === PAGES.BENCHMARKS && <BenchmarksPage />}
        {currentPage === PAGES.AUDIT && <AuditPage />}
        {currentPage === PAGES.SETTINGS && <SettingsPage />}
      </div>
    </main>
  )
}

export default function App(): React.ReactElement {
  useEffect(() => {
    setupQueryPersistence()
  }, [])

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ProtectedRoute>
          <div className="min-h-screen bg-bg-primary font-sans text-text-primary">
            <Sidebar />
            <MainContent />
          </div>
        </ProtectedRoute>
      </QueryClientProvider>
    </AuthProvider>
  )
}
