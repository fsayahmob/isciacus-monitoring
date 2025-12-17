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

export { apiClient }
