/**
 * useConnectionTest - Custom hook for testing service connections
 */

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import {
  testShopifyConnection,
  testGA4Connection,
  testInngestConnection,
  testMetaConnection,
  testSearchConsoleConnection,
  testSerpAPIConnection,
  testMerchantCenterConnection,
  type ConnectionTestResult,
} from '../../services/api'

export interface ConnectionTestHook {
  testLoading: string | null
  testResults: Record<string, ConnectionTestResult>
  handleTestConnection: (sectionId: string) => void
}

export function useConnectionTest(): ConnectionTestHook {
  const [testLoading, setTestLoading] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({})

  const testConnectionMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      switch (sectionId) {
        case 'shopify':
          return testShopifyConnection()
        case 'ga4':
          return testGA4Connection()
        case 'inngest':
          return testInngestConnection()
        case 'meta':
          return testMetaConnection()
        case 'search_console':
          return testSearchConsoleConnection()
        case 'serpapi':
          return testSerpAPIConnection()
        case 'merchant_center':
          return testMerchantCenterConnection()
        default:
          return { success: true, message: 'Test non disponible pour cette section' }
      }
    },
    onMutate: (sectionId) => {
      setTestLoading(sectionId)
    },
    onSuccess: (result, sectionId) => {
      setTestResults((prev) => ({ ...prev, [sectionId]: result }))
    },
    onError: (err, sectionId) => {
      setTestResults((prev) => ({
        ...prev,
        [sectionId]: {
          success: false,
          message: err instanceof Error ? err.message : 'Erreur inconnue',
        },
      }))
    },
    onSettled: () => {
      setTestLoading(null)
    },
  })

  const handleTestConnection = (sectionId: string): void => {
    testConnectionMutation.mutate(sectionId)
  }

  return { testLoading, testResults, handleTestConnection }
}
