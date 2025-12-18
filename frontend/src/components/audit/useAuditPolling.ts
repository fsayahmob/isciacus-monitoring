/**
 * Custom hook for audit polling - Handles async audit result polling
 */

import React from 'react'
import { type QueryClient } from '@tanstack/react-query'

import { fetchLatestAuditSession, type AuditResult } from '../../services/api'

const POLL_INTERVAL_MS = 1000

export interface UseAuditPollingReturn {
  isPolling: boolean
  startPolling: (auditType: string) => void
  stopPolling: () => void
  pollingIntervalRef: React.RefObject<ReturnType<typeof setInterval> | null>
}

export function useAuditPolling(
  setRunningResult: React.Dispatch<React.SetStateAction<AuditResult | null>>,
  queryClient: QueryClient
): UseAuditPollingReturn {
  const [isPolling, setIsPolling] = React.useState(false)
  const pollingIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  const stopPolling = (): void => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
  }

  const startPolling = (auditType: string): void => {
    setIsPolling(true)

    pollingIntervalRef.current = setInterval(() => {
      void (async () => {
        const sessionResponse = await fetchLatestAuditSession()
        const auditResult = sessionResponse.session?.audits[auditType]

        if (auditResult && auditResult.status !== 'running') {
          stopPolling()
          setRunningResult(auditResult)
          void queryClient.invalidateQueries({ queryKey: ['audit-session'] })
          void queryClient.invalidateQueries({ queryKey: ['available-audits'] })
        } else if (auditResult) {
          setRunningResult(auditResult)
        }
      })()
    }, POLL_INTERVAL_MS)
  }

  return { isPolling, startPolling, stopPolling, pollingIntervalRef }
}
