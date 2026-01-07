/**
 * Sidebar Component - Modern Dark Theme
 * Inspired by Linear, Vercel, Raycast
 */

import { PAGES } from '../constants'
import type { PageKey } from '../constants'
import { useFilters } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'

const NAV_ITEMS: { page: PageKey; label: string; icon: React.ReactElement; kbd?: string }[] = [
  {
    page: PAGES.PRODUCTS,
    label: 'Produits',
    kbd: '1',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    kbd: '2',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    kbd: '3',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    kbd: '4',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    kbd: '5',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

// Environment badge colors
const ENV_BADGE_STYLES: Record<string, string> = {
  production: 'bg-success/20 text-success',
  staging: 'bg-warning/20 text-warning',
  dev: 'bg-accent-primary/20 text-accent-primary',
  local: 'bg-text-tertiary/20 text-text-tertiary',
}

function getEnvironment(): string {
  const env = import.meta.env.VITE_ENVIRONMENT as string | undefined
  return env !== undefined && env !== '' ? env : 'local'
}

function getVersion(): string {
  const version = import.meta.env.VITE_APP_VERSION as string | undefined
  return version !== undefined && version !== '' ? version : 'dev'
}

function Logo(): React.ReactElement {
  const env = getEnvironment()
  const version = getVersion()
  const badgeStyle = ENV_BADGE_STYLES[env] ?? ENV_BADGE_STYLES.local

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
        <span className="text-sm font-bold text-white">MD</span>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold tracking-wide text-text-primary">Merchant</h1>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${badgeStyle}`}>
            {env}
          </span>
        </div>
        <span className="text-[11px] text-text-tertiary">v{version}</span>
      </div>
    </div>
  )
}

function NavItem({
  page,
  label,
  icon,
  kbd,
  isActive,
  onClick,
}: {
  page: PageKey
  label: string
  icon: React.ReactElement
  kbd?: string
  isActive: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      key={page}
      className={`group relative mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-all ${
        isActive
          ? 'bg-bg-elevated text-text-primary'
          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
      type="button"
      onClick={onClick}
    >
      {isActive && (
        <div className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
      )}
      <span
        className={isActive ? 'text-brand' : 'text-text-tertiary group-hover:text-text-secondary'}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {kbd !== undefined && (
        <span className="kbd opacity-0 transition-opacity group-hover:opacity-100">{kbd}</span>
      )}
    </button>
  )
}

function StatsFooter({
  totalProducts,
  totalVariants,
}: {
  totalProducts: number
  totalVariants: number
}): React.ReactElement {
  return (
    <div className="space-y-3 rounded-lg bg-bg-tertiary p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Catalogue
        </span>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-lg font-semibold text-text-primary">{totalProducts}</div>
          <div className="text-[11px] text-text-tertiary">produits</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-text-primary">{totalVariants}</div>
          <div className="text-[11px] text-text-tertiary">variantes</div>
        </div>
      </div>
    </div>
  )
}

export function Sidebar(): React.ReactElement {
  const { currentPage, setCurrentPage } = useAppStore()
  const { totalProducts, totalVariants } = useFilters()

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-56 flex-col border-r border-border-subtle bg-bg-secondary">
      {/* Logo */}
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          Navigation
        </div>
        {NAV_ITEMS.map(({ page, label, icon, kbd }) => (
          <NavItem
            key={page}
            page={page}
            label={label}
            icon={icon}
            kbd={kbd}
            isActive={currentPage === page}
            onClick={() => {
              setCurrentPage(page)
            }}
          />
        ))}
      </nav>

      {/* Footer Stats */}
      <div className="border-t border-border-subtle p-3">
        <StatsFooter totalProducts={totalProducts} totalVariants={totalVariants} />
      </div>
    </aside>
  )
}
