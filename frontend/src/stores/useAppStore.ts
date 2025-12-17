/**
 * App Store - ISCIACUS Monitoring Dashboard
 * ==========================================
 * Global state management with Zustand
 */

import { create } from 'zustand'

import { PAGES, VIEW_MODES } from '../constants'
import type { PageKey, ViewMode } from '../constants'
import type { ProductFilters, SortDirection, SortField } from '../types/product'

interface AppState {
  // Navigation
  currentPage: PageKey
  setCurrentPage: (page: PageKey) => void

  // View mode
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // Filters
  filters: ProductFilters
  setFilters: (filters: ProductFilters) => void
  updateFilter: <K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) => void
  clearFilters: () => void

  // Pagination
  currentPageIndex: number
  setCurrentPageIndex: (page: number) => void

  // Sorting
  sortField: SortField | null
  sortDirection: SortDirection
  setSorting: (field: SortField) => void

  // Loading
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Selected product (for modal)
  selectedProductId: string | null
  setSelectedProductId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation
  currentPage: PAGES.PRODUCTS,
  setCurrentPage: (page) => {
    set({ currentPage: page })
  },

  // View mode
  viewMode: VIEW_MODES.LIST,
  setViewMode: (mode) => {
    set({ viewMode: mode })
  },

  // Filters
  filters: {},
  setFilters: (filters) => {
    set({ filters, currentPageIndex: 0 })
  },
  updateFilter: (key, value) => {
    const newFilters = { ...get().filters, [key]: value }
    set({ filters: newFilters, currentPageIndex: 0 })
  },
  clearFilters: () => {
    set({ filters: {}, currentPageIndex: 0 })
  },

  // Pagination
  currentPageIndex: 0,
  setCurrentPageIndex: (page) => {
    set({ currentPageIndex: page })
  },

  // Sorting
  sortField: null,
  sortDirection: 'asc',
  setSorting: (field) => {
    const state = get()
    if (state.sortField === field) {
      set({ sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' })
    } else {
      set({ sortField: field, sortDirection: 'asc' })
    }
  },

  // Loading
  isLoading: false,
  setIsLoading: (loading) => {
    set({ isLoading: loading })
  },

  // Selected product
  selectedProductId: null,
  setSelectedProductId: (id) => {
    set({ selectedProductId: id })
  },
}))
