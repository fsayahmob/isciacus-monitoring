/**
 * API Client - ISCIACUS Monitoring Dashboard
 * ===========================================
 * Shared Axios client configuration
 */

import axios from 'axios'

import { API_BASE_URL } from '../constants'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})
