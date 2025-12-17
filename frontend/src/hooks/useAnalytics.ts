/**
 * Analytics Hooks - ISCIACUS Monitoring Dashboard
 * ================================================
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchAuditStatus,
  fetchAvailableSalesFilters,
  fetchBenchmarks,
  fetchCollectionCVR,
  fetchConversionFunnel,
  fetchCustomerStats,
  fetchIndustries,
  fetchSalesByCollection,
  fetchSalesByTag,
  setIndustry,
} from '../services/api'
import type {
  AvailableFilters,
  BenchmarkConfig,
  CollectionCVRResponse,
  ConversionFunnel,
  CustomerStats,
  FilteredSalesAnalysis,
  IndustriesResponse,
} from '../types/analytics'

// Constants for cache timing
const MINUTES_5 = 5
const SECONDS_60 = 60
const MS_1000 = 1000
const STALE_TIME = MINUTES_5 * SECONDS_60 * MS_1000

// Default period in days
const DEFAULT_PERIOD = 30

export function useCustomerStats(): {
  data: CustomerStats | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['customerStats'],
    queryFn: () => fetchCustomerStats(),
    staleTime: STALE_TIME,
  })

  const refetch = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['customerStats'] })
    void fetchCustomerStats(true).then((data) => {
      queryClient.setQueryData(['customerStats'], data)
    })
  }

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch,
  }
}

export function useConversionFunnel(period = DEFAULT_PERIOD): {
  data: ConversionFunnel | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['conversionFunnel', period],
    queryFn: () => fetchConversionFunnel(period),
    staleTime: STALE_TIME,
  })

  const refetch = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['conversionFunnel', period] })
    void fetchConversionFunnel(period, true).then((data) => {
      queryClient.setQueryData(['conversionFunnel', period], data)
    })
  }

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch,
  }
}

export function useCollectionCVR(period = DEFAULT_PERIOD): {
  data: CollectionCVRResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: ['collectionCVR', period],
    queryFn: () => fetchCollectionCVR(period),
    staleTime: STALE_TIME,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

const STALE_TIME_LONG = 2
export function useBenchmarks(): {
  data: BenchmarkConfig | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['benchmarks'],
    queryFn: fetchBenchmarks,
    staleTime: STALE_TIME * STALE_TIME_LONG,
  })

  const refetch = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['benchmarks'] })
  }

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch,
  }
}

export function useIndustries(): {
  data: IndustriesResponse | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: ['industries'],
    queryFn: fetchIndustries,
    staleTime: STALE_TIME * STALE_TIME_LONG,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useSetIndustry(): {
  setIndustry: (industryId: string) => Promise<void>
  isLoading: boolean
} {
  const queryClient = useQueryClient()

  const changeIndustry = async (industryId: string): Promise<void> => {
    await setIndustry(industryId)
    await queryClient.invalidateQueries({ queryKey: ['benchmarks'] })
  }

  return {
    setIndustry: changeIndustry,
    isLoading: false,
  }
}

// Sales Analysis Hooks
export function useAvailableSalesFilters(
  period = DEFAULT_PERIOD,
  allCatalog = false
): {
  data: AvailableFilters | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: ['salesFilters', period, allCatalog],
    queryFn: () => fetchAvailableSalesFilters(period, allCatalog),
    staleTime: STALE_TIME,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useSalesByTag(
  tag: string | null,
  period = DEFAULT_PERIOD
): {
  data: FilteredSalesAnalysis | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: ['salesByTag', tag, period],
    queryFn: () => (tag !== null ? fetchSalesByTag(tag, period) : Promise.resolve(undefined)),
    enabled: tag !== null,
    staleTime: STALE_TIME,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useSalesByCollection(
  collectionId: string | null,
  period = DEFAULT_PERIOD
): {
  data: FilteredSalesAnalysis | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: ['salesByCollection', collectionId, period],
    queryFn: () =>
      collectionId !== null
        ? fetchSalesByCollection(collectionId, period)
        : Promise.resolve(undefined),
    enabled: collectionId !== null,
    staleTime: STALE_TIME,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

// Audit Hook
export function useAuditStatus(): {
  data: { has_issues: boolean; last_audit: string | null } | undefined
  isLoading: boolean
  error: Error | null
} {
  const query = useQuery({
    queryKey: ['auditStatus'],
    queryFn: fetchAuditStatus,
    staleTime: STALE_TIME,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
