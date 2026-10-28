import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useProfile } from '../auth/ProfileContext'
import * as api from '../lib/api'
import { subscribeToMessages, type MessageEvent } from '../lib/realtime'
import type { ChatSummary, Contact, Message, Person } from '../lib/types'

export interface ChatEntry {
  person: Person
  isContact: boolean
  summary: ChatSummary | null
}

type RealtimeState = 'connecting' | 'live' | 'down'

interface ChatDataState {
  loading: boolean
  error: string | null
  contacts: Contact[]
  /** Saved contacts plus people who messaged you but are not saved. */
  entries: ChatEntry[]
  unreadTotal: number
  /** Ticks every few seconds so "Online / Last seen" text stays fresh. */
  now: number
  realtime: RealtimeState
  /** Increments after a realtime reconnect, so open chats can fetch anything they missed. */
  resyncTick: number
  refresh: () => Promise<void>
  addContact: (personId: string) => Promise<Contact>
  removeContact: (personId: string) => Promise<void>
  getPerson: (id: string) => Person | null
  loadPerson: (id: string) => Promise<Person | null>
  setActivePartner: (id: string | null) => void
  clearUnread: (partnerId: string) => void
  /** Folds one message (from realtime or from your own send) into the conversation list. Idempotent. */
  applyMessage: (m: Message) => void
  subscribe: (listener: (e: MessageEvent) => void) => () => void
}

const ChatDataContext = createContext<ChatDataState | null>(null)

export const POLL_MS = 30_000
export const TICK_MS = 15_000

export function ChatDataProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile()
  const meId = profile?.id ?? null

  const [contacts, setContacts] = useState<Contact[]>([])
  const [summaries, setSummaries] = useState<Record<string, ChatSummary>>({})
  const [strangers, setStrangers] = useState<Record<string, Person>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [realtime, setRealtime] = useState<RealtimeState>('connecting')
  const [resyncTick, setResyncTick] = useState(0)

  const active = useRef<string | null>(null)
  const listeners = useRef(new Set<(e: MessageEvent) => void>())
  const seen = useRef(new Set<string>())
  const known = useRef(new Set<string>())
  const refreshTimer = useRef<number>(undefined)

  useEffect(() => {
    known.current = new Set([...contacts.map((c) => c.id), ...Object.keys(strangers)])
  }, [contacts, strangers])

  const refresh = useCallback(async () => {
    if (!meId) return
    try {
      const [cs, sums] = await Promise.all([api.listContacts(), api.getChatSummaries()])
      const saved = new Set(cs.map((c) => c.id))
      const strangerIds = sums.map((s) => s.partner_id).filter((id) => !saved.has(id))
      const people = await Promise.all(strangerIds.map((id) => api.getProfile(id).catch(() => null)))
      setContacts(cs)
      setSummaries(Object.fromEntries(sums.map((s) => [s.partner_id, s])))
      setStrangers(Object.fromEntries(people.filter((p): p is Person => Boolean(p)).map((p) => [p.id, p])))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your chats.')
    } finally {
      setLoading(false)
    }
  }, [meId])

  const loadPerson = useCallback(async (id: string): Promise<Person | null> => {
    try {
      const p = await api.getProfile(id)
      if (p) setStrangers((prev) => (prev[p.id] ? prev : { ...prev, [p.id]: p }))
      return p
    } catch {
      return null
    }
  }, [])

  const applyMessage = useCallback(
    (m: Message) => {
      if (!meId || seen.current.has(m.id)) return
      seen.current.add(m.id)
      if (seen.current.size > 1000) seen.current = new Set([...seen.current].slice(-500))

      const incoming = m.receiver_id === meId
      const partner = incoming ? m.sender_id : m.receiver_id
      const viewing = active.current === partner && document.visibilityState === 'visible'

      setSummaries((prev) => {
        const old = prev[partner]
        const isNewest = !old || Date.parse(m.created_at) >= Date.parse(old.last_at)
        return {
          ...prev,
          [partner]: {
            partner_id: partner,
            last_message_id: isNewest ? m.id : old.last_message_id,
            last_body: isNewest ? m.body : old.last_body,
            last_has_image: isNewest ? Boolean(m.image_path) : old.last_has_image,
            last_sender_id: isNewest ? m.sender_id : old.last_sender_id,
            last_at: isNewest ? m.created_at : old.last_at,
            unread_count: (old?.unread_count ?? 0) + (incoming && !viewing ? 1 : 0),
          },
        }
      })
      if (!known.current.has(partner)) void loadPerson(partner)
    },
    [meId, loadPerson],
  )

  const handleEvent = useCallback(
    (e: MessageEvent) => {
      if (e.type === 'INSERT') {
        applyMessage(e.message)
      } else if (e.message.receiver_id === meId) {
        // Read state changed (maybe from another tab): re-pull the unread counts shortly.
        window.clearTimeout(refreshTimer.current)
        refreshTimer.current = window.setTimeout(() => void refresh(), 400)
      }
      listeners.current.forEach((l) => l(e))
    },
    [applyMessage, meId, refresh],
  )

  // Initial load, polling for presence, and a clock tick.
  useEffect(() => {
    if (!meId) return
    setLoading(true)
    void refresh()
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(tick)
      window.clearTimeout(refreshTimer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [meId, refresh])

  // Live messages.
  useEffect(() => {
    if (!meId) return
    let wasLive = false
    setRealtime('connecting')
    const unsubscribe = subscribeToMessages(meId, handleEvent, (status) => {
      if (status === 'SUBSCRIBED') {
        setRealtime('live')
        if (wasLive) {
          // Reconnected after a drop: catch up on anything missed meanwhile.
          setResyncTick((n) => n + 1)
          void refresh()
        }
        wasLive = true
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setRealtime('down')
      }
    })
    return unsubscribe
  }, [meId, handleEvent, refresh])

  const addContact = useCallback(async (personId: string) => {
    const c = await api.addContact(personId)
    setContacts((prev) => [...prev.filter((x) => x.id !== c.id), c].sort((a, b) => a.display_name.localeCompare(b.display_name)))
    setStrangers((prev) => {
      if (!prev[c.id]) return prev
      const next = { ...prev }
      delete next[c.id]
      return next
    })
    return c
  }, [])

  const removeContact = useCallback(
    async (personId: string) => {
      const existing = contacts.find((c) => c.id === personId)
      await api.removeContact(personId)
      setContacts((prev) => prev.filter((c) => c.id !== personId))
      // Past messages remain, so the person stays visible as an unsaved conversation.
      if (existing && summaries[personId]) setStrangers((prev) => ({ ...prev, [personId]: existing }))
    },
    [contacts, summaries],
  )

  const getPerson = useCallback(
    (id: string): Person | null => contacts.find((c) => c.id === id) ?? strangers[id] ?? null,
    [contacts, strangers],
  )

  const setActivePartner = useCallback((id: string | null) => {
    active.current = id
  }, [])

  const clearUnread = useCallback((partnerId: string) => {
    setSummaries((prev) => (prev[partnerId] && prev[partnerId].unread_count ? { ...prev, [partnerId]: { ...prev[partnerId], unread_count: 0 } } : prev))
  }, [])

  const subscribe = useCallback((listener: (e: MessageEvent) => void) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const entries = useMemo<ChatEntry[]>(() => {
    const list: ChatEntry[] = contacts.map((c) => ({ person: c, isContact: true, summary: summaries[c.id] ?? null }))
    const saved = new Set(contacts.map((c) => c.id))
    for (const p of Object.values(strangers)) {
      // A message can arrive before the contact list has loaded, which files the sender as a stranger; saved contacts win.
      if (!saved.has(p.id) && summaries[p.id]) list.push({ person: p, isContact: false, summary: summaries[p.id] })
    }
    return list
  }, [contacts, strangers, summaries])

  const unreadTotal = useMemo(() => entries.reduce((n, e) => n + (e.summary?.unread_count ?? 0), 0), [entries])

  const value = useMemo<ChatDataState>(
    () => ({
      loading,
      error,
      contacts,
      entries,
      unreadTotal,
      now,
      realtime,
      resyncTick,
      refresh,
      addContact,
      removeContact,
      getPerson,
      loadPerson,
      setActivePartner,
      clearUnread,
      applyMessage,
      subscribe,
    }),
    [loading, error, contacts, entries, unreadTotal, now, realtime, resyncTick, refresh, addContact, removeContact, getPerson, loadPerson, setActivePartner, clearUnread, applyMessage, subscribe],
  )

  return <ChatDataContext.Provider value={value}>{children}</ChatDataContext.Provider>
}

export function useChatData(): ChatDataState {
  const ctx = useContext(ChatDataContext)
  if (!ctx) throw new Error('useChatData must be used inside <ChatDataProvider>')
  return ctx
}
