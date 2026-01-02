/**
 * useAuth Hook - Authentication State Access
 * ==========================================
 * Provides easy access to the AuthContext.
 */

import { useContext } from 'react'

import { AuthContext, type AuthContextType } from '../contexts/AuthContext'

/**
 * Hook to access authentication state and methods.
 *
 * @returns AuthContextType with user state and auth methods
 */
export function useAuth(): AuthContextType {
  return useContext(AuthContext)
}
