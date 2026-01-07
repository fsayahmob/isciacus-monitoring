/**
 * API Client - ISCIACUS Monitoring Dashboard
 * ===========================================
 * Shared Axios client configuration with auth interceptor.
 */

import axios, { type InternalAxiosRequestConfig } from 'axios'

import { API_BASE_URL } from '../constants'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Auth interceptor - adds Firebase ID token to requests
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    try {
      // Dynamically import Firebase to avoid initialization issues
      const { getAuth } = await import('firebase/auth')
      const auth = getAuth()
      const user = auth.currentUser

      if (user !== null) {
        const token = await user.getIdToken()
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // Continue without auth header if Firebase not initialized or token retrieval fails
    }

    return config
  },
  (error: Error) => Promise.reject(error)
)
