/**
 * Login Page - Google Sign-In
 * ===========================
 * Authentication page with Google Sign-In button.
 * Displays error messages for unauthorized users.
 */

import { useAuth } from '../hooks/useAuth'

function GoogleIcon(): React.ReactElement {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function LoadingSpinner(): React.ReactElement {
  return (
    <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
      />
    </svg>
  )
}

function ErrorMessage({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}): React.ReactElement {
  return (
    <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400"
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
        <div className="flex-1">
          <p className="text-sm text-red-200">{message}</p>
          <p className="mt-1 text-xs text-red-300/70">
            Contact an administrator to request access.
          </p>
        </div>
        <button
          className="text-red-400 transition-colors hover:text-red-300"
          onClick={onDismiss}
          type="button"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export function LoginPage(): React.ReactElement {
  const { signInWithGoogle, isLoading, error, clearError } = useAuth()

  const handleSignIn = (): void => {
    void signInWithGoogle()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-primary">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">ISCIACUS Monitoring</h1>
          <p className="mt-2 text-text-secondary">Product Analytics Dashboard</p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl border border-border-primary bg-bg-secondary p-8">
          <h2 className="mb-2 text-center text-xl font-medium text-text-primary">
            Sign in to continue
          </h2>
          <p className="mb-6 text-center text-sm text-text-secondary">
            Use your Google account to access the dashboard
          </p>

          {/* Error Display */}
          {error !== null && <ErrorMessage message={error} onDismiss={clearError} />}

          {/* Google Sign-In Button */}
          <button
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-medium text-gray-800 transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            onClick={handleSignIn}
            type="button"
          >
            {isLoading ? (
              <>
                <LoadingSpinner />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <GoogleIcon />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Info Note */}
          <p className="mt-6 text-center text-xs text-text-tertiary">
            Access is restricted to invited users only.
            <br />
            Contact your administrator for an invitation.
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-text-tertiary">
          Protected by Google Cloud Identity Platform
        </p>
      </div>
    </div>
  )
}
