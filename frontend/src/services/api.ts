/**
 * API Service - ISCIACUS Monitoring Dashboard
 * ============================================
 * HTTP client for communicating with FastAPI backend
 */

import axios from 'axios'

import { API_BASE_URL, DEFAULT_PAGE_SIZE } from '../constants'
import type {
  AvailableFilters,
  BenchmarkConfig,
  CollectionCVRResponse,
  ConversionFunnel,
  CustomerStats,
  FilteredSalesAnalysis,
  IndustriesResponse,
} from '../types/analytics'
import type { FiltersResponse, ProductFilters, ProductsResponse } from '../types/product'
import type {
  AuditResult,
  AuditSession,
  AvailableAudit,
  ConfigData,
  ConnectionTestResult,
  HealthCheckResult,
  PermissionsReport,
  TrackingAuditData,
} from './apiTypes'

// Re-export types for consumers
export type {
  AuditCheck,
  AuditIssue,
  AuditResult,
  AuditSession,
  AuditStep,
  AuditStepStatus,
  ActionStatus,
  AvailableAudit,
  ConfigData,
  ConfigSection,
  ConfigVariable,
  ConnectionTestResult,
  ExecutionMode,
  HealthCheckResult,
  PermissionResult,
  PermissionsReport,
  ServiceHealth,
  TrackingAuditData,
  TrackingCoverage,
  TrackingCoverageItem,
  TrackingCoverageSection,
} from './apiTypes'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

function appendFilterParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value !== '') {
    params.append(key, value)
  }
}

export async function fetchProducts(
  filters: ProductFilters = {},
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<ProductsResponse> {
  const params = new URLSearchParams()
  params.append('limit', String(pageSize))
  params.append('offset', String(page * pageSize))
  appendFilterParam(params, 'search', filters.search)
  appendFilterParam(params, 'tag', filters.tag)
  appendFilterParam(params, 'stock_level', filters.stock_level)
  appendFilterParam(params, 'publie', filters.publie)
  appendFilterParam(params, 'channel', filters.channel)
  appendFilterParam(params, 'collection', filters.collection)
  appendFilterParam(params, 'statut', filters.statut)
  appendFilterParam(params, 'has_image', filters.has_image)
  appendFilterParam(params, 'has_price', filters.has_price)
  appendFilterParam(params, 'has_description', filters.has_description)
  const response = await apiClient.get<ProductsResponse>(`/api/products?${params.toString()}`)
  return response.data
}

export async function fetchFilters(): Promise<FiltersResponse> {
  const response = await apiClient.get<FiltersResponse>('/api/filters')
  return response.data
}

export async function reloadData(): Promise<{ status: string; count: number }> {
  const response = await apiClient.get<{ status: string; count: number }>('/api/reload')
  return response.data
}

// Analytics API
export async function fetchCustomerStats(refresh = false): Promise<CustomerStats> {
  const response = await apiClient.get<CustomerStats>(
    `/api/analytics/customers${refresh ? '?refresh=true' : ''}`
  )
  return response.data
}

export async function fetchConversionFunnel(
  period = 30,
  refresh = false
): Promise<ConversionFunnel> {
  const params = new URLSearchParams()
  params.append('period', String(period))
  if (refresh) {
    params.append('refresh', 'true')
  }
  const response = await apiClient.get<ConversionFunnel>(
    `/api/analytics/funnel?${params.toString()}`
  )
  return response.data
}

export async function fetchCollectionCVR(period = 30): Promise<CollectionCVRResponse> {
  const response = await apiClient.get<CollectionCVRResponse>(
    `/api/analytics/funnel/by-collection?period=${String(period)}`
  )
  return response.data
}

export async function fetchBenchmarks(): Promise<BenchmarkConfig> {
  const response = await apiClient.get<BenchmarkConfig>('/api/benchmarks')
  return response.data
}

export async function updateBenchmarks(config: BenchmarkConfig): Promise<BenchmarkConfig> {
  const response = await apiClient.put<BenchmarkConfig>('/api/benchmarks', config)
  return response.data
}

export async function fetchIndustries(): Promise<IndustriesResponse> {
  const response = await apiClient.get<IndustriesResponse>('/api/benchmarks/industries')
  return response.data
}

export async function setIndustry(industryId: string): Promise<BenchmarkConfig> {
  const response = await apiClient.put<BenchmarkConfig>(
    `/api/benchmarks/industry/${encodeURIComponent(industryId)}`
  )
  return response.data
}

// Sales Analysis API
export async function fetchAvailableSalesFilters(
  period = 30,
  allCatalog = false
): Promise<AvailableFilters> {
  const params = new URLSearchParams()
  params.append('period', String(period))
  if (allCatalog) {
    params.append('all_catalog', 'true')
  }
  const response = await apiClient.get<AvailableFilters>(`/api/analytics/sales/filters?${params}`)
  return response.data
}

export async function fetchSalesByTag(tag: string, period = 30): Promise<FilteredSalesAnalysis> {
  const response = await apiClient.get<FilteredSalesAnalysis>(
    `/api/analytics/sales/by-tag/${encodeURIComponent(tag)}?period=${String(period)}`
  )
  return response.data
}

export async function fetchSalesByCollection(
  collectionId: string,
  period = 30
): Promise<FilteredSalesAnalysis> {
  const response = await apiClient.get<FilteredSalesAnalysis>(
    `/api/analytics/sales/by-collection/${encodeURIComponent(collectionId)}?period=${String(period)}`
  )
  return response.data
}

// Audit API
export async function fetchTrackingAudit(): Promise<TrackingAuditData> {
  const response = await apiClient.get<TrackingAuditData>('/api/audit/tracking')
  return response.data
}

export async function fetchAuditStatus(): Promise<{
  has_issues: boolean
  last_audit: string | null
}> {
  const response = await apiClient.get<{ has_issues: boolean; last_audit: string | null }>(
    '/api/audit/status'
  )
  return response.data
}

export async function fetchAvailableAudits(): Promise<{ audits: AvailableAudit[] }> {
  const response = await apiClient.get<{ audits: AvailableAudit[] }>('/api/audits')
  return response.data
}

export async function fetchLatestAuditSession(): Promise<{ session: AuditSession | null }> {
  const response = await apiClient.get<{ session: AuditSession | null }>('/api/audits/session')
  return response.data
}

// Response types for runAudit
interface SyncAuditResponse {
  result: AuditResult
}

interface AsyncAuditResponse {
  async: true
  run_id: string
  audit_type: string
  status: 'triggered'
  message: string
}

type RunAuditResponse = SyncAuditResponse | AsyncAuditResponse

export async function runAudit(
  auditType: string,
  period = 30
): Promise<{ result: AuditResult } | { async: true; run_id: string; audit_type: string }> {
  const response = await apiClient.post<RunAuditResponse>(
    `/api/audits/run/${auditType}?period=${String(period)}`
  )

  const { data } = response

  // If async response, return the run_id for polling
  if ('async' in data) {
    return {
      async: true,
      run_id: data.run_id,
      audit_type: data.audit_type,
    }
  }

  // Sync response - return result directly
  return { result: data.result }
}

// Types for async action responses
interface AsyncActionResponse {
  async: true
  task_id: string
  status: 'pending' | 'running'
}

interface SyncActionResponse {
  success: boolean
  message?: string
  error?: string
}

interface ActionStatusResponse {
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: { success: boolean; message?: string; error?: string }
}

type ActionResponse = AsyncActionResponse | SyncActionResponse

const POLL_INTERVAL_MS = 1000
const MAX_POLL_ATTEMPTS = 120 // 2 minutes max

async function pollActionStatus(taskId: string): Promise<SyncActionResponse> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await apiClient.get<ActionStatusResponse>(
      `/api/audits/action/status?task_id=${taskId}`
    )
    const { data } = response

    if (data.status === 'completed' || data.status === 'failed') {
      return data.result ?? { success: data.status === 'completed' }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return { success: false, error: 'Action timed out after 2 minutes' }
}

export async function executeAuditAction(
  auditType: string,
  actionId: string,
  asyncMode = true
): Promise<{ success: boolean; message?: string; error?: string }> {
  const asyncParam = asyncMode ? '&async_mode=true' : ''
  const response = await apiClient.post<ActionResponse>(
    `/api/audits/action?audit_type=${auditType}&action_id=${actionId}${asyncParam}`
  )

  const { data } = response

  // If async response, poll for result
  if ('async' in data) {
    return pollActionStatus(data.task_id)
  }

  // Sync response
  return data
}

// Permissions API
export async function fetchShopifyPermissions(): Promise<PermissionsReport> {
  const response = await apiClient.get<PermissionsReport>('/api/permissions/shopify')
  return response.data
}

// Configuration API
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

export { apiClient }
