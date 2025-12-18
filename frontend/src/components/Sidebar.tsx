/**
 * Sidebar Component - ISCIACUS Monitoring Dashboard
 * ==================================================
 */

import { PAGES } from '../constants'
import type { PageKey } from '../constants'
import { useFilters } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'

const NAV_ITEMS: { page: PageKey; label: string; icon: React.ReactElement }[] = [
  {
    page: PAGES.PRODUCTS,
    label: 'Produits',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    page: PAGES.ANALYTICS,
    label: 'Analytics',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    page: PAGES.AUDIT,
    label: 'Audit',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    page: PAGES.SETTINGS,
    label: 'Configuration',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
  {
    page: PAGES.BENCHMARKS,
    label: 'Benchmarks',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
]

export function Sidebar(): React.ReactElement {
  const { currentPage, setCurrentPage } = useAppStore()
  const { totalProducts, totalVariants } = useFilters()

  return (
    <aside className="sidebar fixed left-0 top-0 z-40 flex h-full w-60 flex-col border-r-2 border-burgundy bg-white">
      <div className="border-b border-burgundy p-4">
        <h1 className="font-serif text-lg tracking-widest text-burgundy">ISCIACUS</h1>
        <span className="text-xs text-gray-500">Monitoring v2</span>
      </div>

      <nav className="flex-1 p-4">
        {NAV_ITEMS.map(({ page, label, icon }) => (
          <button
            key={page}
            className={`nav-link mb-1 flex w-full items-center gap-3 rounded px-3 py-2.5 text-left transition-all ${
              currentPage === page
                ? 'bg-burgundy text-white'
                : 'text-gray-700 hover:bg-burgundy-light'
            }`}
            type="button"
            onClick={() => {
              setCurrentPage(page)
            }}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>

      <div className="border-t border-gray-200 p-4 text-xs text-gray-500">
        <div>
          {totalProducts} produits
          <br />
          {totalVariants} variantes
        </div>
      </div>

      <button
        className="block border-t border-burgundy"
        type="button"
        onClick={() => {
          setCurrentPage(PAGES.PRODUCTS)
        }}
      >
        <img
          alt="ISCIACUS"
          className="h-auto w-full object-cover opacity-60 transition-opacity hover:opacity-80"
          src="/static/SLIDE_2.jpeg"
        />
      </button>
    </aside>
  )
}
