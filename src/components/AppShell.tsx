import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, MessageCircle, Settings, Users, type LucideIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useRequiredProfile } from '../auth/ProfileContext'
import { ChatDataProvider, useChatData } from '../chat/ChatDataContext'
import { Avatar } from './Avatar'
import { Horizon } from './AuthLayout'
import { Logo, Wordmark } from './ui'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/app', label: 'Chats', icon: MessageCircle, end: true },
  { to: '/app/contacts', label: 'Contacts', icon: Users },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span aria-label={`${count} unread`} className="ml-auto grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function Shell() {
  const me = useRequiredProfile()
  const { signOut } = useAuth()
  const chat = useChatData()
  const { pathname } = useLocation()
  const inChat = pathname.startsWith('/app/chat/')

  useEffect(() => {
    document.title = chat.unreadTotal > 0 ? `(${chat.unreadTotal}) PrivateChat` : 'PrivateChat'
    return () => {
      document.title = 'PrivateChat'
    }
  }, [chat.unreadTotal])

  return (
    <div className="flex h-dvh bg-surface">
      <aside className="relative hidden w-64 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-4">
          <Logo className="size-9" />
          <Wordmark />
        </div>
        <div className="mx-4 flex items-center gap-3 rounded-2xl bg-brand-soft p-3">
          <Avatar name={me.display_name} path={me.avatar_path} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{me.display_name}</p>
            <p className="truncate font-mono text-[11px] text-slate-500">@{me.user_id}</p>
          </div>
        </div>
        <nav aria-label="Main" className="mt-4 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand text-white shadow-cta' : 'text-slate-600 hover:bg-fuchsia-50 hover:text-fuchsia-700'}`
              }
            >
              <Icon aria-hidden className="size-4.5" />
              {label}
              {to === '/app' && <UnreadBadge count={chat.unreadTotal} />}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mx-3 mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
        >
          <LogOut aria-hidden className="size-4.5" />
          Log out
        </button>
        <div aria-hidden className="mt-auto bg-sunset">
          <Horizon className="h-28 w-full" />
        </div>
        <p className="bg-[#1e1b4b] px-4 pb-3 text-center text-xs text-white/80">Good vibes only</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {chat.realtime === 'down' && (
          <p role="status" className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
            Live updates are reconnecting. Messages will still arrive shortly.
          </p>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        {!inChat && (
          <nav aria-label="Main" className="grid grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-fuchsia-700' : 'text-slate-500'}`}
              >
                <Icon aria-hidden className="size-5" />
                {label}
                {to === '/app' && chat.unreadTotal > 0 && (
                  <span aria-label={`${chat.unreadTotal} unread`} className="absolute top-1.5 left-1/2 ml-2 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                    {chat.unreadTotal > 99 ? '99+' : chat.unreadTotal}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}

export default function AppShell() {
  return (
    <ChatDataProvider>
      <Shell />
    </ChatDataProvider>
  )
}
