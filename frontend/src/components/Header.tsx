/**
 * Header Component - Modern Dark Theme
 */

import { useState, useEffect, useCallback } from 'react'

import { SEARCH_DEBOUNCE_MS, VIEW_MODES } from '../constants'
import type { ViewMode } from '../constants'
import { useProducts, useReloadData } from '../hooks/useProducts'
import { useAppStore } from '../stores/useAppStore'

function SearchIcon(): React.ReactElement {
  return (
    <svg
      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
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
        strokeWidth="1.5"
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
        strokeWidth="1.5"
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
        strokeWidth="1.5"
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
    <div className="flex overflow-hidden rounded-lg border border-border-subtle bg-bg-tertiary">
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all ${
          viewMode === VIEW_MODES.GRID
            ? 'bg-bg-elevated text-text-primary'
            : 'text-text-secondary hover:text-text-primary'
        }`}
        type="button"
        onClick={() => {
          onViewChange(VIEW_MODES.GRID)
        }}
      >
        <GridIcon />
        <span className="hidden sm:inline">Grille</span>
      </button>
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-all ${
          viewMode === VIEW_MODES.LIST
            ? 'bg-bg-elevated text-text-primary'
            : 'text-text-secondary hover:text-text-primary'
        }`}
        type="button"
        onClick={() => {
          onViewChange(VIEW_MODES.LIST)
        }}
      >
        <ListIcon />
        <span className="hidden sm:inline">Liste</span>
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
      className="btn btn-secondary btn-sm"
      disabled={isReloading}
      type="button"
      onClick={onReload}
    >
      {isReloading ? (
        <>
          <span className="spinner" />
          <span className="hidden sm:inline">Chargement...</span>
        </>
      ) : (
        <>
          <RefreshIcon />
          <span className="hidden sm:inline">Actualiser</span>
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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-subtle bg-bg-secondary/80 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <SearchIcon />
          <input
            className="input w-64 py-1.5 pl-9 pr-3 text-sm"
            placeholder="Rechercher..."
            type="text"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value)
            }}
          />
          <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
            <span className="kbd">/</span>
          </div>
        </div>

        <ViewToggle viewMode={viewMode} onViewChange={handleViewChange} />
      </div>

      <div className="flex items-center gap-4">
        {isLoading && <span className="spinner" />}

        {/* Stats */}
        <div className="hidden items-center gap-2 text-sm sm:flex">
          <span className="font-medium text-text-primary">{total}</span>
          <span className="text-text-tertiary">variantes</span>
          <span className="text-text-muted">•</span>
          <span className="text-text-tertiary">{totalProducts} produits</span>
        </div>

        <ReloadButton isReloading={isReloading} onReload={handleReload} />
      </div>
    </header>
  )
}
