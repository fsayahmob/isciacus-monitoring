/**
 * Auth Context - Type Definitions and Context Creation
 * =====================================================
 * Provides authentication types and React Context.
 * The provider is in a separate file to satisfy react-refresh.
 */

import type { User as FirebaseUser } from 'firebase/auth'
import { createContext } from 'react'

// User type from backend
export interface AppUser {
  id: string
  email: string
  name: string
  picture: string | null
  role: 'user' | 'admin'
  created_at: string
  last_login: string | null
}

// Auth context state
export interface AuthState {
  firebaseUser: FirebaseUser | null
  appUser: AppUser | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  error: string | null
}

// Auth context methods
export interface AuthActions {
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  getIdToken: () => Promise<string | null>
  clearError: () => void
}

export type AuthContextType = AuthState & AuthActions

// Default context value
const defaultAuthContext: AuthContextType = {
  firebaseUser: null,
  appUser: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  error: null,
  signInWithGoogle: (): Promise<void> => Promise.resolve(),
  signOut: (): Promise<void> => Promise.resolve(),
  getIdToken: (): Promise<string | null> => Promise.resolve(null),
  clearError: (): void => {
    // Default implementation - does nothing
  },
}

export const AuthContext = createContext<AuthContextType>(defaultAuthContext)
