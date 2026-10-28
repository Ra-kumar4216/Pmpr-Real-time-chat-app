import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ensureProfile, heartbeat, updateProfile } from '../lib/api'
import type { Profile, ProfilePatch } from '../lib/types'
import { useAuth } from './AuthContext'

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface ProfileState {
  profile: Profile | null
  status: Status
  error: string | null
  reload: () => Promise<void>
  save: (patch: ProfilePatch) => Promise<Profile>
}

const ProfileContext = createContext<ProfileState | null>(null)

export const HEARTBEAT_MS = 30_000

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [profile, setProfile] = useState<Profile | null>(null)
  const [state, setState] = useState<{ status: Exclude<Status, 'idle'>; error: string | null }>({ status: 'loading', error: null })
  const [attempt, setAttempt] = useState(0)

  // Load (or create, on first login) the profile for the signed-in user. Creating it is what generates the User ID.
  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }
    let active = true
    setProfile(null)
    setState({ status: 'loading', error: null })
    ensureProfile()
      .then((p) => {
        if (!active) return
        setProfile(p)
        setState({ status: 'ready', error: null })
      })
      .catch((e: unknown) => {
        if (!active) return
        setState({ status: 'error', error: e instanceof Error ? e.message : 'Could not load your profile.' })
      })
    return () => {
      active = false
    }
  }, [userId, attempt])

  // "Online" is a server-side timestamp refreshed while the tab is visible.
  useEffect(() => {
    if (state.status !== 'ready') return
    const beat = () => {
      if (document.visibilityState === 'visible') void heartbeat()
    }
    beat()
    const timer = window.setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', beat)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [state.status])

  const reload = useCallback(async () => setAttempt((n) => n + 1), [])

  const save = useCallback(async (patch: ProfilePatch) => {
    const next = await updateProfile(patch)
    setProfile(next)
    return next
  }, [])

  const value = useMemo<ProfileState>(
    () => ({ profile, status: userId ? state.status : 'idle', error: state.error, reload, save }),
    [profile, userId, state, reload, save],
  )
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>')
  return ctx
}

/** For screens that only render once the profile exists. */
export function useRequiredProfile(): Profile {
  const { profile } = useProfile()
  if (!profile) throw new Error('Profile is not loaded')
  return profile
}
