/**
 * App Component - ISCIACUS Monitoring Dashboard
 * ==============================================
 * Main application component with layout structure
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { FilterBar, Header, ProductGrid, ProductTable, Sidebar } from './components'
import { PAGES, VIEW_MODES } from './constants'
import { useFilters } from './hooks/useProducts'
import { useAppStore } from './stores/useAppStore'

import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      retry: 1,
    },
  },
})

function ProductsPage(): JSX.Element {
  const { viewMode } = useAppStore()

  return (
    <div className="p-4">{viewMode === VIEW_MODES.LIST ? <ProductTable /> : <ProductGrid />}</div>
  )
}

function AnalyticsPage(): JSX.Element {
  const { totalProducts, totalVariants, tags, channels } = useFilters()

  return (
    <div className="p-4">
      <h2 className="mb-4 font-serif text-2xl text-burgundy">Analytics</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="border-2 border-burgundy bg-white p-4">
          <div className="font-serif text-3xl text-burgundy">{totalProducts}</div>
          <div className="text-sm text-gray-600">Produits</div>
        </div>
        <div className="border-2 border-burgundy bg-white p-4">
          <div className="font-serif text-3xl text-burgundy">{totalVariants}</div>
          <div className="text-sm text-gray-600">Variantes</div>
        </div>
        <div className="border-2 border-burgundy bg-white p-4">
          <div className="font-serif text-3xl text-burgundy">{tags.length}</div>
          <div className="text-sm text-gray-600">Tags</div>
        </div>
        <div className="border-2 border-burgundy bg-white p-4">
          <div className="font-serif text-3xl text-burgundy">{channels.length}</div>
          <div className="text-sm text-gray-600">Canaux</div>
        </div>
      </div>
    </div>
  )
}

function SettingsPage(): JSX.Element {
  return (
    <div className="p-4">
      <h2 className="mb-4 font-serif text-2xl text-burgundy">Configuration</h2>
      <div className="max-w-xl border border-burgundy bg-white p-6">
        <h3 className="mb-4 text-lg font-medium">Paramètres API</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600" htmlFor="api-url">
              URL API Backend
            </label>
            <input
              className="w-full rounded border border-gray-300 px-3 py-2"
              defaultValue="http://localhost:8080"
              disabled
              id="api-url"
              type="text"
            />
          </div>
          <p className="text-xs text-gray-500">
            Les paramètres sont configurés via variables d&apos;environnement.
          </p>
        </div>
      </div>
    </div>
  )
}

function MainContent(): JSX.Element {
  const { currentPage } = useAppStore()

  return (
    <main className="ml-60 min-h-screen bg-cream">
      <Header />
      <FilterBar />

      {currentPage === PAGES.PRODUCTS && <ProductsPage />}
      {currentPage === PAGES.ANALYTICS && <AnalyticsPage />}
      {currentPage === PAGES.SETTINGS && <SettingsPage />}

      <footer className="border-t border-burgundy p-4 text-center text-xs text-gray-500">
        ISCIACUS Monitoring - Données actualisées au chargement
      </footer>
    </main>
  )
}

export default function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-cream font-sans">
        <Sidebar />
        <MainContent />
      </div>
    </QueryClientProvider>
  )
}
