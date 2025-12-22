/**
 * useRealtimeCollection - Firestore-like realtime collection hook for PocketBase
 *
 * Provides automatic synchronization with PocketBase collections via WebSocket.
 * Similar to Firestore's onSnapshot, this hook:
 * - Fetches initial data on mount
 * - Subscribes to realtime updates (create, update, delete)
 * - Automatically reconnects on connection loss
 * - Cleans up subscription on unmount
 *
 * @example
 * ```tsx
 * const { records, isLoading, error } = useRealtimeCollection<AuditRun>(
 *   'audit_runs',
 *   { filter: `session_id="${sessionId}"` }
 * )
 * ```
 */
import React from 'react'
import type { RecordSubscription, UnsubscribeFunc } from 'pocketbase'

import { getPocketBase } from '../services/pocketbase'

export interface UseRealtimeCollectionOptions {
  filter?: string
  sort?: string
  enabled?: boolean
}

export interface UseRealtimeCollectionResult<T> {
  records: Map<string, T>
  recordsArray: T[]
  isLoading: boolean
  isConnected: boolean
  error: Error | null
  refetch: () => Promise<void>
}

interface RecordWithId {
  id: string
}

interface CollectionState<T> {
  records: Map<string, T>
  isLoading: boolean
  isConnected: boolean
  error: Error | null
}

const FILTER_PATTERN = /(\w+)\s*=\s*"([^"]+)"/g

function checkFilterMatch(record: Record<string, unknown>, filter: string): boolean {
  const patterns = Array.from(filter.matchAll(FILTER_PATTERN))
  if (patterns.length === 0) {
    return true
  }

  for (const patternMatch of patterns) {
    if (record[patternMatch[1]] !== patternMatch[2]) {
      return false
    }
  }

  return true
}

function createSubscriptionHandler<T extends RecordWithId>(
  filter: string | undefined,
  setRecords: React.Dispatch<React.SetStateAction<Map<string, T>>>
): (e: RecordSubscription<T>) => void {
  return (e: RecordSubscription<T>): void => {
    const { record } = e

    if (filter !== undefined && filter !== '') {
      if (!checkFilterMatch(record as unknown as Record<string, unknown>, filter)) {
        return
      }
    }

    setRecords((prev) => {
      const next = new Map(prev)
      if (e.action === 'delete') {
        next.delete(record.id)
      } else {
        next.set(record.id, record)
      }
      return next
    })
  }
}

interface UseFetchAndSubscribeParams<T> {
  collectionName: string
  filter: string | undefined
  sort: string
  enabled: boolean
  setState: React.Dispatch<React.SetStateAction<CollectionState<T>>>
  setRecords: React.Dispatch<React.SetStateAction<Map<string, T>>>
}

function useFetchAndSubscribe<T extends RecordWithId>(
  params: UseFetchAndSubscribeParams<T>
): { fetchRecords: () => Promise<void>; subscribe: () => Promise<void> } {
  const { collectionName, filter, sort, enabled, setState, setRecords } = params
  const unsubscribeFnRef = React.useRef<UnsubscribeFunc | null>(null)

  const fetchRecords = React.useCallback(async () => {
    if (!enabled) {
      setState((prev) => ({ ...prev, isLoading: false }))
      return
    }

    try {
      const pb = getPocketBase()
      const fetchOptions: { sort: string; filter?: string } = { sort }
      if (filter !== undefined && filter !== '') {
        fetchOptions.filter = filter
      }

      const items = await pb.collection(collectionName).getFullList<T>(fetchOptions)
      const recordsMap = new Map<string, T>()
      for (const item of items) {
        recordsMap.set(item.id, item)
      }

      setState({ records: recordsMap, isLoading: false, isConnected: true, error: null })
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch records')
      setState((prev) => ({ ...prev, isLoading: false, isConnected: false, error }))
    }
  }, [collectionName, filter, sort, enabled, setState])

  const subscribe = React.useCallback(async () => {
    if (!enabled) {
      return
    }

    try {
      const pb = getPocketBase()
      const handler = createSubscriptionHandler(filter, setRecords)
      unsubscribeFnRef.current = await pb.collection(collectionName).subscribe('*', handler)
      setState((prev) => ({ ...prev, isConnected: true, error: null }))
    } catch (err) {
      console.error('PocketBase subscription error:', err)
      const error = err instanceof Error ? err : new Error('Subscription failed')
      setState((prev) => ({ ...prev, isConnected: false, error }))
    }
  }, [collectionName, filter, enabled, setRecords, setState])

  React.useEffect(() => {
    return () => {
      if (unsubscribeFnRef.current !== null) {
        void unsubscribeFnRef.current()
        unsubscribeFnRef.current = null
      }
    }
  }, [])

  return { fetchRecords, subscribe }
}

export function useRealtimeCollection<T extends RecordWithId>(
  collectionName: string,
  options: UseRealtimeCollectionOptions = {}
): UseRealtimeCollectionResult<T> {
  const { filter, sort = '-created', enabled = true } = options

  const [state, setState] = React.useState<CollectionState<T>>({
    records: new Map(),
    isLoading: true,
    isConnected: false,
    error: null,
  })

  const setRecords = React.useCallback((updater: React.SetStateAction<Map<string, T>>) => {
    setState((prev) => ({
      ...prev,
      records: typeof updater === 'function' ? updater(prev.records) : updater,
    }))
  }, [])

  const { fetchRecords, subscribe } = useFetchAndSubscribe({
    collectionName,
    filter,
    sort,
    enabled,
    setState,
    setRecords,
  })

  // Track if initial fetch has been done to prevent infinite loops
  const hasFetchedRef = React.useRef(false)
  const currentFilterRef = React.useRef(filter)
  const currentSortRef = React.useRef(sort)

  React.useEffect(() => {
    // Reset fetch flag if filter/sort changed
    if (currentFilterRef.current !== filter || currentSortRef.current !== sort) {
      hasFetchedRef.current = false
      currentFilterRef.current = filter
      currentSortRef.current = sort
    }

    if (!enabled) {
      setState({ records: new Map(), isLoading: false, isConnected: false, error: null })
      hasFetchedRef.current = false
      return
    }

    // Skip if already fetched with same params
    if (hasFetchedRef.current) {
      return
    }
    hasFetchedRef.current = true

    void (async (): Promise<void> => {
      await fetchRecords()
      await subscribe()
    })()
  }, [enabled, filter, sort, fetchRecords, subscribe])

  const recordsArray = React.useMemo(() => Array.from(state.records.values()), [state.records])

  const refetch = React.useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }))
    await fetchRecords()
  }, [fetchRecords])

  return {
    records: state.records,
    recordsArray,
    isLoading: state.isLoading,
    isConnected: state.isConnected,
    error: state.error,
    refetch,
  }
}
