/**
 * Header Component - ISCIACUS Monitoring Dashboard
 * =================================================
 */

import { useState, useEffect, useCallback } from 'react'

import { SEARCH_DEBOUNCE_MS, VIEW_MODES } from '../constants'
import type { ViewMode } from '../constants'
import { useProducts, useReloadData } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'

function SearchIcon(): React.ReactElement {
  return (
    <svg
      className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function GridIcon(): React.ReactElement {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function ListIcon(): React.ReactElement {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        d="M4 6h16M4 10h16M4 14h16M4 18h16"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function RefreshIcon(): React.ReactElement {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  )
}

function ViewToggle({
  viewMode,
  onViewChange,
}: {
  viewMode: ViewMode
  onViewChange: (mode: ViewMode) => void
}): React.ReactElement {
  return (
    <div className="view-toggle flex overflow-hidden rounded border border-burgundy">
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${viewMode === VIEW_MODES.GRID ? 'bg-burgundy text-white' : ''}`}
        type="button"
        onClick={() => {
          onViewChange(VIEW_MODES.GRID)
        }}
      >
        <GridIcon />
        Grille
      </button>
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${viewMode === VIEW_MODES.LIST ? 'bg-burgundy text-white' : ''}`}
        type="button"
        onClick={() => {
          onViewChange(VIEW_MODES.LIST)
        }}
      >
        <ListIcon />
        Liste
      </button>
    </div>
  )
}

function ReloadButton({
  isReloading,
  onReload,
}: {
  isReloading: boolean
  onReload: () => void
}): React.ReactElement {
  return (
    <button
      className="flex items-center gap-2 rounded border border-burgundy px-3 py-1.5 text-sm text-burgundy transition-colors hover:bg-burgundy hover:text-white disabled:opacity-50"
      disabled={isReloading}
      type="button"
      onClick={onReload}
    >
      {isReloading ? (
        <>
          <span className="spinner" />
          Chargement...
        </>
      ) : (
        <>
          <RefreshIcon />
          Recharger
        </>
      )}
    </button>
  )
}

export function Header(): React.ReactElement {
  const { viewMode, setViewMode, updateFilter, isLoading } = useAppStore()
  const { total, totalProducts } = useProducts()
  const { reload, isReloading } = useReloadData()
  const [searchValue, setSearchValue] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilter('search', searchValue)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [searchValue, updateFilter])

  const handleReload = useCallback((): void => {
    reload()
  }, [reload])

  const handleViewChange = useCallback(
    (mode: ViewMode): void => {
      setViewMode(mode)
    },
    [setViewMode]
  )

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b-2 border-burgundy bg-cream p-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <SearchIcon />
          <input
            className="w-72 rounded border border-gray-300 py-2 pl-10 pr-4 transition-all focus:border-burgundy focus:outline-none focus:ring-1 focus:ring-burgundy"
            placeholder="Rechercher produit, SKU..."
            type="text"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value)
            }}
          />
        </div>
        <ViewToggle viewMode={viewMode} onViewChange={handleViewChange} />
      </div>
      <div className="flex items-center gap-4">
        {isLoading && <span className="spinner" />}
        <span className="text-sm font-medium text-gray-600">{total} variantes</span>
        <span className="text-xs text-gray-400">({totalProducts} produits)</span>
        <ReloadButton isReloading={isReloading} onReload={handleReload} />
      </div>
    </header>
  )
}
