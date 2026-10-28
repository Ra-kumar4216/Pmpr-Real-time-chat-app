import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useRequiredProfile } from '../auth/ProfileContext'
import { Avatar } from '../components/Avatar'
import { isOnline, listStamp } from '../lib/time'
import { previewText } from '../lib/text'
import { useChatData, type ChatEntry } from './ChatDataContext'

export function sortChatEntries(entries: ChatEntry[]): ChatEntry[] {
  return [...entries].sort((a, b) => {
    const ta = a.summary ? Date.parse(a.summary.last_at) : 0
    const tb = b.summary ? Date.parse(b.summary.last_at) : 0
    if (ta !== tb) return tb - ta
    return a.person.display_name.localeCompare(b.person.display_name)
  })
}

export function matchesQuery(e: ChatEntry, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return e.person.display_name.toLowerCase().includes(needle) || e.person.user_id.toLowerCase().includes(needle)
}

/** Compact conversation switcher shown beside an open chat on wide screens. */
export function ConversationList({ activeId }: { activeId: string }) {
  const me = useRequiredProfile()
  const chat = useChatData()
  const [query, setQuery] = useState('')
  const rows = useMemo(() => sortChatEntries(chat.entries).filter((e) => matchesQuery(e, query)), [chat.entries, query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Chats</h2>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <label htmlFor="conversation-search" className="sr-only">
            Search chats
          </label>
          <input
            id="conversation-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm outline-none focus:border-fuchsia-400 focus:bg-white focus:ring-4 focus:ring-fuchsia-100"
          />
        </div>
      </div>
      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{query ? 'No matches.' : 'No chats yet.'}</p>
        ) : (
          rows.map((e) => {
            const active = e.person.id === activeId
            const unread = e.summary?.unread_count ?? 0
            return (
              <Link
                key={e.person.id}
                to={`/app/chat/${e.person.id}`}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-fuchsia-50/60 ${active ? 'bg-bg-active bg-brand-soft' : ''}`}
              >
                <Avatar name={e.person.display_name} path={e.person.avatar_path} online={isOnline(e.person.last_seen_at, chat.now)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{e.person.display_name}</span>
                    {e.summary && <span className="shrink-0 text-[11px] text-slate-400">{listStamp(e.summary.last_at)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">
                      {(e.summary && previewText(e.summary, me.id)) || (e.isContact ? `@${e.person.user_id}` : 'Not in your contacts')}
                    </span>
                    {unread > 0 && (
                      <span aria-label={`${unread} unread`} className="grid min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                        {unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            )
          })
        )}
      </nav>
    </div>
  )
}
