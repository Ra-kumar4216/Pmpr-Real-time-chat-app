import { useLayoutEffect, useRef, useState } from 'react'
import { Check, CheckCheck, Loader2, MessageCircle } from 'lucide-react'
import { dayLabel, formatClock, sameDay } from '../lib/time'
import type { Message } from '../lib/types'
import { ChatImage, Lightbox } from './ChatImage'
import type { PendingMessage } from './useConversation'

interface Props {
  messages: Message[]
  pending: PendingMessage[]
  meId: string
  loading: boolean
  hasMore: boolean
  loadingOlder: boolean
  error: string | null
  onLoadOlder: () => Promise<void>
  onRetry: (tempId: string) => void
  onDiscard: (tempId: string) => void
  onReload: () => void
}

const mineCls = 'rounded-br-md bg-bubble-mine text-slate-900'
const theirsCls = 'rounded-bl-md border border-slate-200 bg-white text-slate-900'

function Meta({ iso, mine, read }: { iso: string; mine: boolean; read: boolean }) {
  return (
    <div className={`mt-1 flex items-center gap-1 text-[11px] text-slate-400 ${mine ? 'justify-end' : ''}`}>
      <time dateTime={iso}>{formatClock(iso)}</time>
      {mine && (
        <span role="img" aria-label={read ? 'Read' : 'Sent'} title={read ? 'Read' : 'Sent'}>
          {read ? <CheckCheck aria-hidden className="size-3.5 text-fuchsia-600" /> : <Check aria-hidden className="size-3.5" />}
        </span>
      )}
    </div>
  )
}

function Bubble({ m, mine, onOpen }: { m: Message; mine: boolean; onOpen: (url: string) => void }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid="message" data-mine={mine}>
      <div className="max-w-[82%] sm:max-w-[70%]">
        <div className={`rounded-2xl px-3.5 py-2 text-sm shadow-xs ${mine ? mineCls : theirsCls}`}>
          {m.image_path && (
            <div className={m.body ? 'mb-2' : ''}>
              <ChatImage path={m.image_path} onOpen={onOpen} />
            </div>
          )}
          {m.body && <p className="break-words whitespace-pre-wrap">{m.body}</p>}
        </div>
        <Meta iso={m.created_at} mine={mine} read={Boolean(m.read_at)} />
      </div>
    </div>
  )
}

function PendingBubble({ p, onRetry, onDiscard }: { p: PendingMessage; onRetry: () => void; onDiscard: () => void }) {
  const failed = p.status === 'failed'
  return (
    <div className="flex justify-end" data-testid="pending-message">
      <div className="max-w-[82%] sm:max-w-[70%]">
        <div className={`rounded-2xl rounded-br-md px-3.5 py-2 text-sm ${mineCls} ${failed ? 'opacity-90 ring-1 ring-rose-300' : 'opacity-70'}`}>
          {p.previewUrl && (
            <div className={`relative ${p.body ? 'mb-2' : ''}`}>
              <img src={p.previewUrl} alt="Photo being sent" className="max-h-72 max-w-full rounded-xl object-cover" />
              {!failed && (
                <span className="absolute inset-0 grid place-items-center rounded-xl bg-white/50">
                  <Loader2 aria-hidden className="size-6 animate-spin text-fuchsia-700" />
                </span>
              )}
            </div>
          )}
          {p.body && <p className="break-words whitespace-pre-wrap">{p.body}</p>}
        </div>
        {failed ? (
          <div role="alert" className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-rose-600">
            <span>{p.error ?? 'Not sent.'}</span>
            <button type="button" onClick={onRetry} className="font-semibold underline">
              Retry
            </button>
            <button type="button" onClick={onDiscard} className="font-semibold text-slate-500 underline">
              Discard
            </button>
          </div>
        ) : (
          <p className="mt-1 text-right text-[11px] text-slate-400">Sending…</p>
        )}
      </div>
    </div>
  )
}

export function MessageList({ messages, pending, meId, loading, hasMore, loadingOlder, error, onLoadOlder, onRetry, onDiscard, onReload }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Stay pinned to the newest message, unless the reader has scrolled up on purpose.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const last = messages[messages.length - 1]
    if (stick.current || last?.sender_id === meId || pending.length > 0) el.scrollTop = el.scrollHeight
  }, [messages.length, pending.length, loading, meId, messages])

  async function loadOlder() {
    const el = box.current
    const before = el?.scrollHeight ?? 0
    stick.current = false
    await onLoadOlder()
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - before
    })
  }

  const rows: React.ReactNode[] = []
  let lastDay: Date | null = null
  for (const m of messages) {
    const d = new Date(m.created_at)
    if (!lastDay || !sameDay(lastDay, d)) {
      rows.push(
        <div key={`day-${m.id}`} role="separator" className="my-3 flex justify-center">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">{dayLabel(m.created_at)}</span>
        </div>,
      )
      lastDay = d
    }
    rows.push(<Bubble key={m.id} m={m} mine={m.sender_id === meId} onOpen={setLightbox} />)
  }

  return (
    <div
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      }}
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-linear-to-b from-white to-fuchsia-50/40 px-3 py-4 sm:px-6"
      data-testid="message-list"
    >
      {loading ? (
        <div role="status" className="m-auto flex items-center gap-2 text-sm text-slate-500">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Loading messages…
        </div>
      ) : error && messages.length === 0 ? (
        <div role="alert" className="m-auto text-center text-sm text-slate-600">
          <p>{error}</p>
          <button type="button" onClick={onReload} className="mt-3 rounded-xl border border-fuchsia-200 px-4 py-2 font-medium text-fuchsia-700 hover:bg-fuchsia-50">
            Try again
          </button>
        </div>
      ) : (
        <>
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              className="mx-auto mb-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          )}
          {messages.length === 0 && pending.length === 0 && (
            <div className="m-auto text-center text-sm text-slate-500">
              <MessageCircle aria-hidden className="mx-auto mb-2 size-8 text-fuchsia-300" />
              No messages yet. Say hello!
            </div>
          )}
          {rows}
          {pending.map((p) => (
            <PendingBubble key={p.tempId} p={p} onRetry={() => onRetry(p.tempId)} onDiscard={() => onDiscard(p.tempId)} />
          ))}
        </>
      )}
      <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
