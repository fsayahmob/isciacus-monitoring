/**
 * useAuthState Hook - Firebase Auth State Management
 * ===================================================
 * Internal hook for managing auth state in AuthProvider.
 */

import type { User as FirebaseUser } from 'firebase/auth'
import { getRedirectResult, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { AppUser } from './AuthContext'
import { fetchAppUser, getFirebaseConfig, initializeFirebase } from './authUtils'

interface AuthState {
  firebaseUser: FirebaseUser | null
  appUser: AppUser | null
  isLoading: boolean
  error: string | null
}

interface AuthStateActions {
  setFirebaseUser: (user: FirebaseUser | null) => void
  setAppUser: (user: AppUser | null) => void
  setIsLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

// Check if Firebase is configured at module load time
const isFirebaseConfigured = getFirebaseConfig() !== null

export function useAuthState(): AuthState & AuthStateActions {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  // Start as not loading if Firebase is not configured
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured)
  const [error, setError] = useState<string | null>(null)

  // Track if component is mounted to avoid setState after unmount
  const isMounted = useRef(true)

  // Callback for handling user profile fetch
  const handleUserProfile = useCallback(async (user: FirebaseUser): Promise<void> => {
    try {
      const token = await user.getIdToken()
      const profile = await fetchAppUser(token)
      if (isMounted.current) {
        setAppUser(profile)
        setError(null)
      }
    } catch (err) {
      if (isMounted.current) {
        const message = err instanceof Error ? err.message : 'Authentication failed'
        setError(message)
        setAppUser(null)
        // Sign out if backend rejected
        const auth = initializeFirebase()
        if (auth !== null) {
          await firebaseSignOut(auth)
        }
        setFirebaseUser(null)
      }
    }
  }, [])

  // Listen to Firebase auth state changes
  useEffect(() => {
    isMounted.current = true
    const auth = initializeFirebase()

    // If Firebase is not configured, we already initialized isLoading as false
    if (auth === null) {
      return undefined
    }

    // Handle redirect result (for signInWithRedirect)
    void getRedirectResult(auth).catch((err: unknown) => {
      if (isMounted.current) {
        const message = err instanceof Error ? err.message : 'Redirect auth failed'
        setError(message)
      }
    })

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted.current) {
        return
      }

      setFirebaseUser(user)

      if (user !== null) {
        void handleUserProfile(user).finally(() => {
          if (isMounted.current) {
            setIsLoading(false)
          }
        })
      } else {
        setAppUser(null)
        setIsLoading(false)
      }
    })

    return (): void => {
      isMounted.current = false
      unsubscribe()
    }
  }, [handleUserProfile])

  return {
    firebaseUser,
    appUser,
    isLoading,
    error,
    setFirebaseUser,
    setAppUser,
    setIsLoading,
    setError,
  }
}
