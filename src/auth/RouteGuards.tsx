import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { FullScreenSpinner } from '../components/ui'
import { useAuth } from './AuthContext'
import { useProfile } from './ProfileContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (session) return <Navigate to="/app" replace />
  return <>{children}</>
}

/**
 * Waits for the profile. People who have not finished profile setup are sent to /setup;
 * the setup page itself passes `allowIncomplete`.
 */
export function ProfileGate({ children, allowIncomplete = false }: { children: ReactNode; allowIncomplete?: boolean }) {
  const { profile, status, error, reload } = useProfile()
  const { signOut } = useAuth()

  if (status === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center bg-surface px-4">
        <div role="alert" className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-card">
          <h1 className="text-lg font-semibold text-slate-900">We could not load your profile</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => void reload()} className="h-11 flex-1 rounded-xl bg-brand text-sm font-semibold text-white shadow-cta">
              Retry
            </button>
            <button type="button" onClick={() => void signOut()} className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-surface">
              Log out
            </button>
          </div>
        </div>
      </main>
    )
  }
  if (!profile) return <FullScreenSpinner />
  if (!allowIncomplete && !profile.onboarded_at) return <Navigate to="/setup" replace />
  return <>{children}</>
}
