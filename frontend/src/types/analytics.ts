/**
 * Analytics Types - ISCIACUS Monitoring Dashboard
 * ================================================
 */

// Benchmark Types
export type BenchmarkStatus = 'bad' | 'ok' | 'good' | 'unknown'

export interface BenchmarkColor {
  bg: string
  icon: string
  label: string
}

export interface ThresholdRange {
  min?: number
  max?: number
}

export interface Threshold {
  label: string
  unit: string
  bad: ThresholdRange
  ok: ThresholdRange
  good: ThresholdRange
  description: string
}

export interface BenchmarkSource {
  name: string
  url: string
  metric: string
}

export interface BenchmarkConfig {
  industry: string
  version: string
  last_updated: string
  sources: BenchmarkSource[]
  thresholds: Record<string, Threshold>
}

export interface BenchmarkEvaluation {
  status: BenchmarkStatus
  color: BenchmarkColor
  threshold?: {
    bad: ThresholdRange
    ok: ThresholdRange
    good: ThresholdRange
  }
}

// Customer Stats Types
export interface CustomerStats {
  total_customers: number
  // Email stats
  email_available: number
  email_available_rate: number
  email_subscribers: number
  email_optin_rate: number // Opt-in rate vs available emails
  // Phone stats
  phone_count: number
  phone_rate: number
  // SMS stats
  sms_optin: number
  sms_optin_rate: number // Opt-in rate vs phone available
  last_updated: string
  benchmarks: {
    email_optin: BenchmarkEvaluation
    sms_optin: BenchmarkEvaluation
    phone_rate: BenchmarkEvaluation
  }
}

// Conversion Funnel Types
export interface FunnelStage {
  name: string
  value: number
  rate: number
  rate_label?: string
  benchmark_key?: string | null
  benchmark_status?: string
  benchmark?: BenchmarkEvaluation
}

export interface CVRByEntry {
  entry_point: string
  cvr: number
  min_cvr: number
  max_cvr: number
  mean_cvr: number
  benchmark_status: string
}

export interface CVRStats {
  mean: number
  min: number
  max: number
  median: number
  count: number
}

// Shopify business metrics (source of truth for revenue)
export interface ShopifyBusinessMetrics {
  orders: number
  checkout_started: number
  revenue?: number
  aov?: number
}

// Tracking coverage comparison (GA4 vs Shopify)
export interface TrackingCoverage {
  ga4_purchases: number
  shopify_orders: number
  coverage_rate: number
  note: string
}

export interface ConversionFunnel {
  period: string
  // GA4 funnel metrics (consistent source for CVR)
  visitors: number
  product_views: number
  add_to_cart: number
  checkout: number
  purchases: number
  stages: FunnelStage[]
  cvr_by_entry: CVRByEntry[]
  cvr_stats: CVRStats
  global_cvr: number
  last_updated: string
  ga4_available?: boolean
  ga4_error?: string | null
  // Shopify business metrics (separate from funnel)
  shopify?: ShopifyBusinessMetrics
  // Tracking coverage info
  tracking_coverage?: TrackingCoverage
  benchmarks: {
    global_cvr: BenchmarkEvaluation
  }
}

export interface CollectionCVR {
  collection_id: string
  collection_name: string
  visitors: number
  purchases: number
  cvr: number
  benchmark_status: string
  ga4_available?: boolean
}

export interface CollectionCVRResponse {
  period: string
  ga4_available?: boolean
  collections: CollectionCVR[]
}

// Sales Analysis Types
export interface ProductSales {
  product_id: string
  product_title: string
  product_handle: string
  quantity_sold: number
  order_count: number
  views?: number
  cvr?: number
  ga4_available?: boolean
}

export interface FilteredSalesAnalysis {
  filter_type: 'tag' | 'collection'
  filter_value: string
  period: string
  total_quantity: number
  order_count: number
  unique_orders: number
  products: ProductSales[]
  last_updated: string
  total_views?: number
  overall_cvr?: number
  ga4_available?: boolean
}

export interface CollectionFilter {
  id: string
  name: string
  handle: string
}

export interface AvailableFilters {
  tags: string[]
  collections: CollectionFilter[]
  source?: 'catalog' | 'sold_products'
  period?: string | null
}

// Industry Types
export interface Industry {
  id: string
  name: string
  description: string
}

export interface IndustriesResponse {
  industries: Industry[]
}
