/**
 * Query Client Configuration with Persistence
 * ============================================
 * - Data survives page refresh (localStorage)
 * - Stale time prevents excessive API calls
 * - Garbage collection after 24h
 */

import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { persistQueryClient } from '@tanstack/react-query-persist-client'

// Cache duration constants (in milliseconds)
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

const ONE_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND
const ONE_HOUR = MINUTES_PER_HOUR * ONE_MINUTE
const ONE_DAY = HOURS_PER_DAY * ONE_HOUR

/**
 * Query Client with optimized defaults
 * - staleTime: 1 minute (prevents refetch if data is fresh)
 * - gcTime: 24 hours (keeps data in cache for persistence)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: ONE_MINUTE,
      gcTime: ONE_DAY,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * Async localStorage adapter for query persistence
 */
const asyncLocalStorage = {
  getItem: (key: string): Promise<string | null> => Promise.resolve(window.localStorage.getItem(key)),
  setItem: (key: string, value: string): Promise<void> => {
    window.localStorage.setItem(key, value)
    return Promise.resolve()
  },
  removeItem: (key: string): Promise<void> => {
    window.localStorage.removeItem(key)
    return Promise.resolve()
  },
}

/**
 * LocalStorage persister for query cache
 * - Saves all query data to localStorage
 * - Restores on page load
 */
const localStoragePersister = createAsyncStoragePersister({
  storage: asyncLocalStorage,
  key: 'isciacus-query-cache',
})

/**
 * Setup persistence
 * - maxAge: 24 hours (data expires after this)
 * - buster: version string to invalidate old cache
 */
export function setupQueryPersistence(): void {
  void persistQueryClient({
    queryClient,
    persister: localStoragePersister,
    maxAge: ONE_DAY,
    buster: 'v1.0.0',
  })
}

/**
 * Clear all cached data
 * Use when user logs out or wants fresh data
 */
export function clearQueryCache(): void {
  queryClient.clear()
  window.localStorage.removeItem('isciacus-query-cache')
}
