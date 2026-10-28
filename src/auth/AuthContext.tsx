import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from './errors'

type Result = { error: string | null }
type SignUpResult = Result & { needsConfirmation: boolean }

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<Result>
  signUp: (fullName: string, email: string, password: string) => Promise<SignUpResult>
  signInWithGoogle: () => Promise<Result>
  resendConfirmation: (email: string) => Promise<Result>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })

    // Only set state in this callback. Calling other supabase methods here can deadlock.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback<AuthState['signIn']>(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: friendlyAuthError(error) }
      setSession(data.session)
      return { error: null }
    } catch {
      return { error: friendlyAuthError(null) }
    }
  }, [])

  const signUp = useCallback<AuthState['signUp']>(async (fullName, email, password) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, name: fullName }, emailRedirectTo: window.location.origin },
      })
      if (error) return { error: friendlyAuthError(error), needsConfirmation: false }
      // With email confirmation on, Supabase hides "already registered" by returning a user with no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: friendlyAuthError({ code: 'user_already_exists' }), needsConfirmation: false }
      }
      if (data.session) setSession(data.session)
      return { error: null, needsConfirmation: !data.session }
    } catch {
      return { error: friendlyAuthError(null), needsConfirmation: false }
    }
  }, [])

  const signInWithGoogle = useCallback<AuthState['signInWithGoogle']>(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      return { error: error ? friendlyAuthError(error) : null }
    } catch {
      return { error: friendlyAuthError(null) }
    }
  }, [])

  const resendConfirmation = useCallback<AuthState['resendConfirmation']>(async (email) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      return { error: error ? friendlyAuthError(error) : null }
    } catch {
      return { error: friendlyAuthError(null) }
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading, signIn, signUp, signInWithGoogle, resendConfirmation, signOut }),
    [session, loading, signIn, signUp, signInWithGoogle, resendConfirmation, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
