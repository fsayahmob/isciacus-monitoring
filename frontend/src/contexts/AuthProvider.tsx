/**
 * Auth Provider - Firebase Authentication Provider Component
 * ==========================================================
 * Provides authentication state and methods to the app.
 */

import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth'
import { useCallback, useMemo } from 'react'

import { AuthContext, type AuthContextType } from './AuthContext'
import { initializeFirebase } from './authUtils'
import { useAuthState } from './useAuthState'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const { firebaseUser, appUser, isLoading, error, setIsLoading, setError } = useAuthState()

  // Sign in with Google popup
  const signInWithGoogle = useCallback(async (): Promise<void> => {
    const auth = initializeFirebase()
    if (auth === null) {
      setError('Firebase not configured')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
      // onAuthStateChanged will handle the rest
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed'
      setError(message)
      setIsLoading(false)
    }
  }, [setError, setIsLoading])

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    const auth = initializeFirebase()
    if (auth === null) {
      return
    }

    try {
      await firebaseSignOut(auth)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed'
      setError(message)
    }
  }, [setError])

  // Get current ID token for API calls
  const getIdToken = useCallback(
    async (): Promise<string | null> => {
      if (firebaseUser === null) {
        return null
      }
      try {
        return await firebaseUser.getIdToken()
      } catch {
        return null
      }
    },
    [firebaseUser]
  )

  // Clear error
  const clearError = useCallback((): void => {
    setError(null)
  }, [setError])

  // Memoize context value
  const contextValue = useMemo<AuthContextType>(
    () => ({
      firebaseUser,
      appUser,
      isLoading,
      isAuthenticated: appUser !== null,
      isAdmin: appUser?.role === 'admin',
      error,
      signInWithGoogle,
      signOut,
      getIdToken,
      clearError,
    }),
    [firebaseUser, appUser, isLoading, error, signInWithGoogle, signOut, getIdToken, clearError]
  )

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}
