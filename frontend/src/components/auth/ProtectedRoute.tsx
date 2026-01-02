/**
 * Protected Route - Authentication Guard
 * ======================================
 * Wraps content that requires authentication.
 * Shows loading spinner or redirects to login.
 */

import { useAuth } from '../../hooks/useAuth'
import { LoginPage } from '../../pages/LoginPage'

function LoadingScreen(): React.ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-border-secondary border-t-accent-primary" />
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    </div>
  )
}

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps): React.ReactElement {
  const { isLoading, isAuthenticated, isAdmin } = useAuth()

  // Show loading while checking auth state
  if (isLoading) {
    return <LoadingScreen />
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />
  }

  // Check admin requirement
  if (requireAdmin && !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
        <div className="max-w-md rounded-xl border border-border-primary bg-bg-secondary p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-6 w-6 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-medium text-text-primary">Access Denied</h2>
          <p className="text-sm text-text-secondary">
            This section requires administrator privileges.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
