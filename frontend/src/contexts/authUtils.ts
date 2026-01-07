/**
 * Auth Utilities - Firebase Configuration and API Helpers
 * ========================================================
 * Shared utilities for authentication.
 */

import type { FirebaseApp } from 'firebase/app'
import { initializeApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import { getAuth } from 'firebase/auth'

import type { AppUser } from './AuthContext'

const HTTP_FORBIDDEN = 403

// Firebase singleton
let firebaseApp: FirebaseApp | null = null
let authInstance: Auth | null = null

interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
}

// Check if auth should be bypassed (no Firebase config = dev/test mode)
export function isAuthBypassed(): boolean {
  return getFirebaseConfig() === null
}

export function getFirebaseConfig(): FirebaseConfig | null {
  const apiKey = import.meta.env.VITE_GCP_API_KEY as string | undefined
  const projectId = import.meta.env.VITE_GCP_PROJECT_ID as string | undefined

  if (apiKey === undefined || projectId === undefined) {
    return null
  }
  if (apiKey === '' || projectId === '') {
    return null
  }

  // Use current domain as authDomain for Cloud Run deployments
  // This avoids the "unauthorized domain" error with signInWithRedirect
  const currentHost = typeof window !== 'undefined' ? window.location.host : ''
  const isCloudRun = currentHost.includes('.run.app')
  const authDomain = isCloudRun ? currentHost : `${projectId}.firebaseapp.com`

  return { apiKey, authDomain, projectId }
}

export function initializeFirebase(): Auth | null {
  if (authInstance !== null) {
    return authInstance
  }

  const config = getFirebaseConfig()
  if (config === null) {
    console.warn('Firebase config missing. Auth features disabled.')
    return null
  }

  try {
    firebaseApp = initializeApp(config)
    authInstance = getAuth(firebaseApp)
    return authInstance
  } catch (err) {
    console.error('Failed to initialize Firebase:', err)
    return null
  }
}

function getApiBaseUrl(): string {
  const envUrl: string | undefined = import.meta.env.VITE_API_BASE_URL
  return envUrl ?? 'http://localhost:8080'
}

export async function fetchAppUser(token: string): Promise<AppUser> {
  const apiBaseUrl = getApiBaseUrl()

  const response = await fetch(`${apiBaseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (response.status === HTTP_FORBIDDEN) {
    const data = (await response.json()) as { detail?: string }
    throw new Error(data.detail ?? 'Access denied. You may need an invitation.')
  }

  if (!response.ok) {
    throw new Error('Failed to fetch user profile')
  }

  return (await response.json()) as AppUser
}
