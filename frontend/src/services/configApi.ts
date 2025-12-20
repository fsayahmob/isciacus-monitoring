/**
 * Configuration API - ISCIACUS Monitoring Dashboard
 * ==================================================
 * Configuration and connection testing endpoints
 */

import { apiClient } from './apiClient'
import type { ConfigData, ConnectionTestResult, HealthCheckResult } from './apiTypes'

export async function fetchConfig(): Promise<ConfigData> {
  const response = await apiClient.get<ConfigData>('/api/config')
  return response.data
}

export async function testShopifyConnection(): Promise<ConnectionTestResult> {
  const response = await apiClient.post<ConnectionTestResult>('/api/config/test/shopify')
  return response.data
}

export async function testGA4Connection(): Promise<ConnectionTestResult> {
  const response = await apiClient.post<ConnectionTestResult>('/api/config/test/ga4')
  return response.data
}

export async function testInngestConnection(): Promise<ConnectionTestResult> {
  const response = await apiClient.post<ConnectionTestResult>('/api/config/test/inngest')
  return response.data
}

export async function testMetaConnection(): Promise<ConnectionTestResult> {
  const response = await apiClient.post<ConnectionTestResult>('/api/config/test/meta')
  return response.data
}

export async function testSearchConsoleConnection(): Promise<ConnectionTestResult> {
  const response = await apiClient.post<ConnectionTestResult>('/api/config/test/search_console')
  return response.data
}

export async function testSerpAPIConnection(): Promise<ConnectionTestResult> {
  const response = await apiClient.post<ConnectionTestResult>('/api/config/test/serpapi')
  return response.data
}

export async function testMerchantCenterConnection(): Promise<ConnectionTestResult> {
  const response = await apiClient.post<ConnectionTestResult>('/api/config/test/merchant_center')
  return response.data
}

export async function updateConfig(
  updates: Record<string, string>
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.put<{ success: boolean; message: string }>(
    '/api/config',
    updates
  )
  return response.data
}

// Health Check API
export async function fetchHealthCheck(): Promise<HealthCheckResult> {
  const response = await apiClient.get<HealthCheckResult>('/api/health/services')
  return response.data
}
