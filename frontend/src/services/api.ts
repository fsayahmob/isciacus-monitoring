/**
 * API Service - ISCIACUS Monitoring Dashboard
 * ============================================
 * HTTP client for communicating with FastAPI backend
 */

import axios from 'axios'

import { API_BASE_URL, DEFAULT_PAGE_SIZE } from '../constants'
import type { FiltersResponse, ProductFilters, ProductsResponse } from '../types/product'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export async function fetchProducts(
  filters: ProductFilters = {},
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<ProductsResponse> {
  const params = new URLSearchParams()
  params.append('limit', String(pageSize))
  params.append('offset', String(page * pageSize))

  if (filters.search !== undefined && filters.search !== '') {
    params.append('search', filters.search)
  }
  if (filters.tag !== undefined && filters.tag !== '') {
    params.append('tag', filters.tag)
  }
  if (filters.stock_level !== undefined && filters.stock_level !== '') {
    params.append('stock_level', filters.stock_level)
  }
  if (filters.publie !== undefined && filters.publie !== '') {
    params.append('publie', String(filters.publie))
  }
  if (filters.channel !== undefined && filters.channel !== '') {
    params.append('channel', filters.channel)
  }
  if (filters.collection !== undefined && filters.collection !== '') {
    params.append('collection', filters.collection)
  }
  if (filters.statut !== undefined && filters.statut !== '') {
    params.append('statut', filters.statut)
  }

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

export { apiClient }
