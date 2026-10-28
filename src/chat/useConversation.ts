import { useCallback, useEffect, useRef, useState } from 'react'
import { MESSAGE_PAGE_SIZE, getMessages, markRead, sendMessage, uploadChatImage } from '../lib/api'
import { CHAT_IMAGE_EDGE, resizeImage } from '../lib/image'
import type { Message } from '../lib/types'
import { useChatData } from './ChatDataContext'
import { mergeMessages } from './mergeMessages'

export interface PendingMessage {
  tempId: string
  body: string
  file: File | null
  previewUrl: string | null
  status: 'sending' | 'failed'
  error?: string
}

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

/** History, live updates, optimistic sending and read receipts for one conversation. */
export function useConversation(partnerId: string, meId: string) {
  const { subscribe, clearUnread, applyMessage, resyncTick } = useChatData()

  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [markTick, setMarkTick] = useState(0)

  const pendingRef = useRef<PendingMessage[]>([])
  pendingRef.current = pending
  const markBusy = useRef(false)

  // Initial history. Cancelled if you switch conversations while it is loading.
  useEffect(() => {
    let cancelled = false
    setMessages([])
    setPending([])
    setHasMore(false)
    setLoading(true)
    setError(null)
    getMessages(partnerId)
      .then((rows) => {
        if (cancelled) return
        setMessages(mergeMessages([], [...rows].reverse()))
        setHasMore(rows.length === MESSAGE_PAGE_SIZE)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(errMsg(e, 'Could not load messages.'))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [partnerId, reloadKey])

  // After a realtime reconnect, fetch whatever arrived while the socket was down.
  const firstResync = useRef(resyncTick)
  useEffect(() => {
    if (resyncTick === firstResync.current) return
    let cancelled = false
    getMessages(partnerId)
      .then((rows) => {
        if (!cancelled) setMessages((prev) => mergeMessages(prev, [...rows].reverse()))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [resyncTick, partnerId])

  // Live inserts (including your own echo) and read-receipt updates.
  useEffect(
    () =>
      subscribe((e) => {
        const m = e.message
        const involvesThisChat =
          (m.sender_id === partnerId && m.receiver_id === meId) || (m.sender_id === meId && m.receiver_id === partnerId)
        if (involvesThisChat) setMessages((prev) => mergeMessages(prev, [m]))
      }),
    [subscribe, partnerId, meId],
  )

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Mark incoming messages read while the chat is open and the tab is visible.
  useEffect(() => {
    if (!visible || markBusy.current) return
    const ids = messages.filter((m) => m.receiver_id === meId && !m.read_at).map((m) => m.id)
    if (ids.length === 0) return
    markBusy.current = true
    markRead(partnerId)
      .then(() => {
        const marked = new Set(ids)
        const stamp = new Date().toISOString()
        setMessages((prev) => prev.map((m) => (marked.has(m.id) ? { ...m, read_at: stamp } : m)))
        clearUnread(partnerId)
      })
      .catch(() => {})
      .finally(() => {
        markBusy.current = false
        setMarkTick((t) => t + 1) // check again in case more arrived meanwhile
      })
  }, [messages, visible, markTick, partnerId, meId, clearUnread])

  const loadOlder = useCallback(async () => {
    const oldest = messages[0]
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    try {
      const rows = await getMessages(partnerId, oldest.created_at)
      setMessages((prev) => mergeMessages(prev, [...rows].reverse()))
      setHasMore(rows.length === MESSAGE_PAGE_SIZE)
    } catch (e) {
      setError(errMsg(e, 'Could not load earlier messages.'))
    } finally {
      setLoadingOlder(false)
    }
  }, [messages, loadingOlder, partnerId])

  const run = useCallback(
    async (item: PendingMessage) => {
      try {
        let imagePath: string | null = null
        if (item.file) {
          const blob = await resizeImage(item.file, { maxEdge: CHAT_IMAGE_EDGE, quality: 0.85 })
          imagePath = await uploadChatImage(meId, blob)
        }
        const message = await sendMessage(partnerId, { body: item.body, imagePath })
        setMessages((prev) => mergeMessages(prev, [message]))
        applyMessage(message)
        setPending((prev) => prev.filter((p) => p.tempId !== item.tempId))
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      } catch (e) {
        setPending((prev) =>
          prev.map((p) => (p.tempId === item.tempId ? { ...p, status: 'failed', error: errMsg(e, 'Could not send.') } : p)),
        )
      }
    },
    [partnerId, meId, applyMessage],
  )

  const send = useCallback(
    (body: string, file: File | null) => {
      const item: PendingMessage = {
        tempId: crypto.randomUUID(),
        body,
        file,
        previewUrl: file ? URL.createObjectURL(file) : null,
        status: 'sending',
      }
      setPending((prev) => [...prev, item])
      return run(item)
    },
    [run],
  )

  const retry = useCallback(
    (tempId: string) => {
      const item = pendingRef.current.find((p) => p.tempId === tempId)
      if (!item) return Promise.resolve()
      const next: PendingMessage = { ...item, status: 'sending', error: undefined }
      setPending((prev) => prev.map((p) => (p.tempId === tempId ? next : p)))
      return run(next)
    },
    [run],
  )

  const discard = useCallback((tempId: string) => {
    const item = pendingRef.current.find((p) => p.tempId === tempId)
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
    setPending((prev) => prev.filter((p) => p.tempId !== tempId))
  }, [])

  useEffect(
    () => () => {
      pendingRef.current.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl))
    },
    [],
  )

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { messages, pending, loading, loadingOlder, hasMore, error, loadOlder, send, retry, discard, reload }
}
