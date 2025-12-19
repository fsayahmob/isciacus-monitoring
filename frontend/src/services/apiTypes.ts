/**
 * API Types - ISCIACUS Monitoring Dashboard
 * ==========================================
 * TypeScript interfaces for API responses
 */

// Audit Types
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
  summary: { total_checks: number; passed: number; warnings: number; errors: number }
  tracking_coverage: TrackingCoverage | null
  collections_coverage: { shopify_total: number; ga4_tracked: number; missing: string[] }
  transactions_match: { shopify_orders: number; ga4_transactions: number; match_rate: number }
  last_audit?: string
}

// Audit Orchestrator Types
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
  severity: 'critical' | 'high' | 'medium' | 'low' | 'warning' | 'info'
  title: string
  description: string
  details: string[] | null
  action_available: boolean
  action_id: string | null
  action_label: string | null
  action_status: ActionStatus
  action_url: string | null // External URL for link-type actions
}

export type ExecutionMode = 'sync' | 'inngest'

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
  execution_mode?: ExecutionMode // "sync" or "inngest" - indicates how audit was executed
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

// Permissions Types
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

// Configuration Types
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

// Health Check Types
export interface ServiceHealth {
  status: 'healthy' | 'configured' | 'degraded' | 'not_configured' | 'disabled' | 'unknown'
  message: string
  url?: string
}

export interface HealthCheckResult {
  overall_status: 'healthy' | 'degraded'
  services: { backend: ServiceHealth; inngest: ServiceHealth }
  timestamp: string
}
