/**
 * useProducts Hook - ISCIACUS Monitoring Dashboard
 * =================================================
 * React Query hooks for fetching product data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { DEFAULT_PAGE_SIZE } from '../constants'
import { fetchProducts, fetchFilters, reloadData } from '../services/api'
import { useAppStore } from '../stores/useAppStore'
import type { Product, SortDirection, SortField } from '../types/product'

const QUERY_KEYS = {
  products: 'products',
  filters: 'filters',
} as const

function compareValues(aVal: unknown, bVal: unknown): number {
  if (typeof aVal === 'string' && typeof bVal === 'string') {
    return aVal.toLowerCase().localeCompare(bVal.toLowerCase())
  }
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return aVal - bVal
  }
  return 0
}

function sortProducts(
  products: Product[],
  field: SortField | null,
  direction: SortDirection
): Product[] {
  if (field === null) {
    return products
  }

  return [...products].sort((a, b) => {
    const aVal = a[field]
    const bVal = b[field]
    const comparison = compareValues(aVal, bVal)
    return direction === 'asc' ? comparison : -comparison
  })
}

export function useProducts(): {
  products: Product[]
  total: number
  totalProducts: number
  isLoading: boolean
  isError: boolean
  error: Error | null
} {
  const { filters, currentPageIndex, sortField, sortDirection } = useAppStore()

  const query = useQuery({
    queryKey: [QUERY_KEYS.products, filters, currentPageIndex],
    queryFn: () => fetchProducts(filters, currentPageIndex, DEFAULT_PAGE_SIZE),
  })

  const sortedProducts = sortProducts(query.data?.products ?? [], sortField, sortDirection)

  return {
    products: sortedProducts,
    total: query.data?.total ?? 0,
    totalProducts: query.data?.total_products ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export function useFilters(): {
  tags: string[]
  channels: string[]
  collections: string[]
  stockLevels: string[]
  statuts: string[]
  totalProducts: number
  totalVariants: number
  isLoading: boolean
} {
  const query = useQuery({
    queryKey: [QUERY_KEYS.filters],
    queryFn: fetchFilters,
  })

  return {
    tags: query.data?.tags ?? [],
    channels: query.data?.channels ?? [],
    collections: query.data?.collections ?? [],
    stockLevels: query.data?.stock_levels ?? [],
    statuts: query.data?.statuts ?? [],
    totalProducts: query.data?.total_products ?? 0,
    totalVariants: query.data?.total_variants ?? 0,
    isLoading: query.isLoading,
  }
}

export function useReloadData(): {
  reload: () => void
  isReloading: boolean
} {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: reloadData,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.products] })
      await queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.filters] })
    },
  })

  return {
    reload: () => {
      mutation.mutate()
    },
    isReloading: mutation.isPending,
  }
}
