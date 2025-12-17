/**
 * Product Types - ISCIACUS Monitoring Dashboard
 * ==============================================
 * Types for Shopify product data from the API
 */

export type StockLevel = 'rupture' | 'faible' | 'moyen' | 'ok'

export interface Product {
  product_id: string
  variant_id: string
  titre: string
  variante: string
  sku: string
  stock: number
  stock_level: StockLevel
  prix_ttc: number
  prix_ht: number
  cout_ht: number
  marge_brute: number
  marge_pct: string
  statut: string
  publie: boolean
  channels: string[]
  collections: string[]
  url: string
  image_url: string | null
  shopify_tags: string[]
  tags: string[]
}

export interface ProductsResponse {
  total: number
  total_products: number
  limit: number
  offset: number
  products: Product[]
}

export interface FiltersResponse {
  tags: string[]
  channels: string[]
  collections: string[]
  stock_levels: StockLevel[]
  statuts: string[]
  total_products: number
  total_variants: number
}

export interface ProductFilters {
  search?: string
  tag?: string
  stock_level?: string
  publie?: string
  channel?: string
  collection?: string
  statut?: string
}

export type SortField = 'titre' | 'sku' | 'stock' | 'prix_ttc' | 'marge_brute'
export type SortDirection = 'asc' | 'desc'
