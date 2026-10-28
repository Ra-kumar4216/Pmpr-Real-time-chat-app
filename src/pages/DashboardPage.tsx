import { useMemo, useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MessageCircle, MoreVertical, Search, UserMinus, UserPlus, Users } from 'lucide-react'
import { useRequiredProfile } from '../auth/ProfileContext'
import { AddUserIdCard } from '../components/AddUserIdCard'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { matchesQuery, sortChatEntries } from '../chat/ConversationList'
import { useChatData, type ChatEntry } from '../chat/ChatDataContext'
import { formatLastSeen, isOnline, listStamp } from '../lib/time'
import { previewText } from '../lib/text'

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <label htmlFor="list-search" className="sr-only">
        {label}
      </label>
      <input
        id="list-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-sm outline-none focus:border-fuchsia-400 focus:ring-4 focus:ring-fuchsia-100"
      />
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
      <Users aria-hidden className="mx-auto mb-2 size-8 text-fuchsia-300" />
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  )
}

function ContactRow({ entry, onRemove }: { entry: ChatEntry; onRemove: (e: ChatEntry) => void }) {
  const chat = useChatData()
  const [menu, setMenu] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const p = entry.person
  const online = isOnline(p.last_seen_at, chat.now)

  useEffect(() => {
    if (!menu) return
    const down = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenu(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [menu])

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-xs">
      <Avatar name={p.display_name} path={p.avatar_path} online={online} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{p.display_name}</p>
        <p className="font-mono text-xs break-all text-slate-500">@{p.user_id}</p>
        <p className={`text-xs ${online ? 'text-emerald-600' : 'text-slate-400'}`}>{formatLastSeen(p.last_seen_at, chat.now)}</p>
      </div>
      <Link
        to={`/app/chat/${p.id}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-white shadow-cta hover:brightness-110"
      >
        <MessageCircle aria-hidden className="size-4" />
        Message
      </Link>
      <div ref={box} className="relative">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-label={`More options for ${p.display_name}`}
          aria-expanded={menu}
          className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <MoreVertical aria-hidden className="size-4.5" />
        </button>
        {menu && (
          <div className="absolute right-0 z-10 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-card">
            <button
              type="button"
              onClick={() => {
                setMenu(false)
                onRemove(entry)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
            >
              <UserMinus aria-hidden className="size-4" />
              Remove contact
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

function ChatRow({ entry }: { entry: ChatEntry }) {
  const me = useRequiredProfile()
  const chat = useChatData()
  const p = entry.person
  const unread = entry.summary?.unread_count ?? 0
  return (
    <li>
      <Link to={`/app/chat/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-xs transition hover:border-fuchsia-200">
        <Avatar name={p.display_name} path={p.avatar_path} online={isOnline(p.last_seen_at, chat.now)} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold text-slate-900">{p.display_name}</span>
            {entry.summary && <span className="shrink-0 text-xs text-slate-400">{listStamp(entry.summary.last_at)}</span>}
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-slate-500">{(entry.summary && previewText(entry.summary, me.id)) || `@${p.user_id}`}</span>
            {unread > 0 && (
              <span aria-label={`${unread} unread`} className="grid min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
                {unread}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}

export default function DashboardPage({ view }: { view: 'chats' | 'contacts' }) {
  const chat = useChatData()
  const toast = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [removing, setRemoving] = useState<ChatEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)

  const contactEntries = useMemo(() => sortChatEntries(chat.entries.filter((e) => e.isContact)), [chat.entries])
  const alphaContacts = useMemo(
    () => [...contactEntries].sort((a, b) => a.person.display_name.localeCompare(b.person.display_name)).filter((e) => matchesQuery(e, query)),
    [contactEntries, query],
  )
  const chatRows = useMemo(() => contactEntries.filter((e) => e.summary).filter((e) => matchesQuery(e, query)), [contactEntries, query])
  const requests = useMemo(() => chat.entries.filter((e) => !e.isContact && e.summary), [chat.entries])

  async function confirmRemove() {
    if (!removing) return
    setBusy(true)
    try {
      await chat.removeContact(removing.person.id)
      toast.show({ title: 'Contact removed', message: `${removing.person.display_name} was removed from your contacts.` })
      setRemoving(null)
    } catch (e) {
      toast.show({ tone: 'error', title: 'Could not remove contact', message: e instanceof Error ? e.message : 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  async function addRequest(e: ChatEntry) {
    setAddingId(e.person.id)
    try {
      await chat.addContact(e.person.id)
      toast.show({ title: 'Friend added successfully!', message: `${e.person.display_name} has been added to your contacts.` })
    } catch (err) {
      toast.show({ tone: 'error', title: 'Could not add contact', message: err instanceof Error ? err.message : 'Please try again.' })
    } finally {
      setAddingId(null)
    }
  }

  const isContacts = view === 'contacts'
  const list = isContacts ? alphaContacts : chatRows

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-8">
      <AddUserIdCard />

      {chat.error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{chat.error}</span>
          <button type="button" onClick={() => void chat.refresh()} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {!isContacts && requests.length > 0 && (
        <section aria-labelledby="requests-title">
          <h2 id="requests-title" className="mb-2 text-sm font-semibold text-slate-700">
            Messages from people you have not added
          </h2>
          <ul className="space-y-2">
            {requests.map((e) => (
              <li key={e.person.id} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <Avatar name={e.person.display_name} path={e.person.avatar_path} size="md" />
                <button type="button" onClick={() => navigate(`/app/chat/${e.person.id}`)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-semibold text-slate-900">{e.person.display_name}</span>
                  <span className="block truncate text-sm text-slate-600">{e.summary ? previewText(e.summary, '') : ''}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void addRequest(e)}
                  disabled={addingId === e.person.id}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <UserPlus aria-hidden className="size-4" />
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="list-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h1 id="list-title" className="text-lg font-semibold whitespace-nowrap text-slate-900">
            {isContacts ? `Saved Contacts${alphaContacts.length ? ` (${contactEntries.length})` : ''}` : 'Chats'}
          </h1>
          <div className="w-full sm:w-64">
            <SearchBox value={query} onChange={setQuery} label={isContacts ? 'Search contacts' : 'Search chats'} />
          </div>
        </div>

        {chat.loading ? (
          <div role="status" className="py-10 text-center text-sm text-slate-500">
            Loading…
          </div>
        ) : list.length === 0 ? (
          query ? (
            <Empty title="No matches" text="Try a different name or User ID." />
          ) : isContacts ? (
            <Empty title="No saved contacts yet" text="Enter a friend's User ID above to add your first contact." />
          ) : (
            <Empty title="No chats yet" text="Add a friend with their User ID, then tap Message to start chatting." />
          )
        ) : (
          <ul className="space-y-2">
            {list.map((e) => (isContacts ? <ContactRow key={e.person.id} entry={e} onRemove={setRemoving} /> : <ChatRow key={e.person.id} entry={e} />))}
          </ul>
        )}
      </section>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} title="Remove contact?">
        <p className="text-sm text-slate-600">
          {removing?.person.display_name} will be removed from your saved contacts. Your past messages stay, but you cannot send new ones until you add them again.
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={() => setRemoving(null)} className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button type="button" onClick={() => void confirmRemove()} disabled={busy} className="h-10 flex-1 rounded-xl bg-rose-600 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
            Remove
          </button>
        </div>
      </Modal>
    </div>
  )
}
