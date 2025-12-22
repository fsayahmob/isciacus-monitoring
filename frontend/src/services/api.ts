/**
 * API Service - ISCIACUS Monitoring Dashboard
 * ============================================
 * Central export point for all API functions
 */

import { apiClient } from './apiClient'
import { DEFAULT_PAGE_SIZE } from '../constants'
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

// Re-export all types
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

// Re-export audit functions
export {
  fetchTrackingAudit,
  fetchAuditStatus,
  fetchAvailableAudits,
  fetchLatestAuditSession,
  runAudit,
  runAllAudits,
  executeAuditAction,
  fetchShopifyPermissions,
  clearAuditCache,
  stopAudit,
} from './auditApi'

// Re-export config functions
export {
  fetchConfig,
  testShopifyConnection,
  testGA4Connection,
  testInngestConnection,
  testMetaConnection,
  testSearchConsoleConnection,
  testSerpAPIConnection,
  testMerchantCenterConnection,
  updateConfig,
  fetchHealthCheck,
} from './configApi'

// Re-export apiClient
export { apiClient }

// Product API
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
