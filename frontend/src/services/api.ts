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

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
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
  const params = refresh ? '?refresh=true' : ''
  const response = await apiClient.get<CustomerStats>(`/api/analytics/customers${params}`)
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
export interface AuditCheck {
  name: string
  status: 'ok' | 'warning' | 'error'
  message: string
  details?: string[]
  recommendation?: string
}

export interface TrackingCoverageItem {
  name: string
  tracked: boolean
  type: 'collection' | 'product' | 'event' | 'page'
  description?: string
}

export interface TrackingCoverageSection {
  total: number
  tracked: number
  missing: string[]
  rate: number
  status: 'ok' | 'warning' | 'error'
  items?: TrackingCoverageItem[]
  sample?: TrackingCoverageItem[]
}

export interface TrackingCoverage {
  collections: TrackingCoverageSection
  products: TrackingCoverageSection
  events: TrackingCoverageSection
  pages?: TrackingCoverageSection
}

export interface TrackingAuditData {
  ga4_connected: boolean
  checks: AuditCheck[]
  summary: {
    total_checks: number
    passed: number
    warnings: number
    errors: number
  }
  tracking_coverage: TrackingCoverage
  collections_coverage: {
    shopify_total: number
    ga4_tracked: number
    missing: string[]
  }
  transactions_match: {
    shopify_orders: number
    ga4_transactions: number
    match_rate: number
  }
  last_audit?: string
}

export async function fetchTrackingAudit(): Promise<TrackingAuditData> {
  const response = await apiClient.get<TrackingAuditData>('/api/audit/tracking')
  return response.data
}

export async function fetchAuditStatus(): Promise<{ has_issues: boolean; last_audit: string | null }> {
  const response = await apiClient.get<{ has_issues: boolean; last_audit: string | null }>(
    '/api/audit/status'
  )
  return response.data
}

// Audit Orchestrator API (Pipeline-style audits)

export type AuditStepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped'
export type ActionStatus = 'available' | 'running' | 'completed' | 'failed' | 'not_available'

export interface AuditStep {
  id: string
  name: string
  description: string
  status: AuditStepStatus
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  result: Record<string, unknown> | null
  error_message: string | null
}

export interface AuditIssue {
  id: string
  audit_type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  details: string[] | null
  action_available: boolean
  action_id: string | null
  action_label: string | null
  action_status: ActionStatus
}

export interface AuditResult {
  id: string
  audit_type: string
  status: AuditStepStatus
  started_at: string
  completed_at: string | null
  steps: AuditStep[]
  issues: AuditIssue[]
  summary: Record<string, unknown>
  raw_data: Record<string, unknown> | null
}

export interface AvailableAudit {
  type: string
  name: string
  description: string
  icon: string
  available: boolean
  last_run: string | null
  last_status: AuditStepStatus | null
  issues_count: number
}

export interface AuditSession {
  id: string
  created_at: string
  updated_at: string
  audits: Record<string, AuditResult>
}

export async function fetchAvailableAudits(): Promise<{ audits: AvailableAudit[] }> {
  const response = await apiClient.get<{ audits: AvailableAudit[] }>('/api/audits')
  return response.data
}

export async function fetchLatestAuditSession(): Promise<{ session: AuditSession | null }> {
  const response = await apiClient.get<{ session: AuditSession | null }>('/api/audits/session')
  return response.data
}

export async function runAudit(
  auditType: string,
  period = 30
): Promise<{ result: AuditResult }> {
  const response = await apiClient.post<{ result: AuditResult }>(
    `/api/audits/run/${auditType}?period=${period}`
  )
  return response.data
}

export async function executeAuditAction(
  auditType: string,
  actionId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await apiClient.post<{ success: boolean; message?: string; error?: string }>(
    `/api/audits/action?audit_type=${auditType}&action_id=${actionId}`
  )
  return response.data
}

// Permissions API

export interface PermissionResult {
  id: string
  name: string
  status: 'granted' | 'denied' | 'not_configured' | 'unknown'
  severity: 'critical' | 'high' | 'medium' | 'low'
  error_message: string | null
  how_to_grant: string
}

export interface PermissionsReport {
  all_granted: boolean
  results: PermissionResult[]
  checked_at: string
}

export async function fetchShopifyPermissions(): Promise<PermissionsReport> {
  const response = await apiClient.get<PermissionsReport>('/api/permissions/shopify')
  return response.data
}

// Configuration API

export interface ConfigVariable {
  key: string
  label: string
  description: string
  how_to_get: string
  value: string | null
  is_set: boolean
  is_secret: boolean
  required: boolean
}

export interface ConfigSection {
  id: string
  name: string
  description: string
  icon: string
  variables: ConfigVariable[]
  is_configured: boolean
}

export interface ConfigData {
  sections: ConfigSection[]
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  details?: Record<string, unknown>
}

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

export async function updateConfig(updates: Record<string, string>): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.put<{ success: boolean; message: string }>('/api/config', updates)
  return response.data
}

// Health Check API

export interface ServiceHealth {
  status: 'healthy' | 'configured' | 'degraded' | 'not_configured' | 'disabled' | 'unknown'
  message: string
  url?: string
}

export interface HealthCheckResult {
  overall_status: 'healthy' | 'degraded'
  services: {
    backend: ServiceHealth
    inngest: ServiceHealth
  }
  timestamp: string
}

export async function fetchHealthCheck(): Promise<HealthCheckResult> {
  const response = await apiClient.get<HealthCheckResult>('/api/health/services')
  return response.data
}

export { apiClient }
