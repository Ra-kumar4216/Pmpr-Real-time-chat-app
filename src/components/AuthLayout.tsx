import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Users, Zap, type LucideIcon } from 'lucide-react'
import { Logo, Wordmark } from './ui'

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Shield, title: 'Private by design', text: 'Only you and your contacts can read your chats.' },
  { icon: Zap, title: 'Real-time messaging', text: 'Messages arrive the moment they are sent.' },
  { icon: Users, title: 'Add friends by User ID', text: 'Share your unique ID. No phone number needed.' },
]

/** Layered ridgelines over a still lake, drawn in SVG so the sunset needs no image file. */
export function Horizon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 800 240" preserveAspectRatio="xMidYMax slice" className={className}>
      <path d="M0 150 L90 96 L150 128 L250 60 L340 126 L430 84 L520 134 L610 76 L710 122 L800 90 V240 H0Z" fill="#4c1d95" opacity="0.55" />
      <path d="M0 176 L110 124 L190 156 L300 104 L400 160 L500 118 L610 164 L710 132 L800 160 V240 H0Z" fill="#2e1065" opacity="0.8" />
      <path d="M0 206 L120 172 L230 196 L350 160 L470 200 L590 170 L700 198 L800 178 V240 H0Z" fill="#1e1b4b" />
      <rect y="206" width="800" height="34" fill="#1e1b4b" />
      <rect x="250" y="212" width="300" height="3" rx="1.5" fill="#fb923c" opacity="0.45" />
      <rect x="310" y="222" width="180" height="2.5" rx="1.25" fill="#f472b6" opacity="0.35" />
    </svg>
  )
}

function Blobs() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-fuchsia-200/60 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-24 size-96 rounded-full bg-orange-200/60 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 -left-32 size-72 rounded-full bg-violet-200/50 blur-3xl" />
    </>
  )
}

export function AuthTabs({ active }: { active: 'login' | 'signup' }) {
  const base = 'flex-1 rounded-full py-2 text-center text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-fuchsia-500'
  const on = 'bg-brand text-white shadow-cta'
  const off = 'text-slate-500 hover:text-slate-800'
  return (
    <nav aria-label="Account" className="flex rounded-full bg-violet-50 p-1 ring-1 ring-violet-100">
      <Link to="/login" aria-current={active === 'login' ? 'page' : undefined} className={`${base} ${active === 'login' ? on : off}`}>
        Login
      </Link>
      <Link to="/signup" aria-current={active === 'signup' ? 'page' : undefined} className={`${base} ${active === 'signup' ? on : off}`}>
        Sign Up
      </Link>
    </nav>
  )
}

/** split = sunset brand panel + form (login). centered = logo above form on a soft warm background (sign-up). */
export function AuthLayout({ variant, children }: { variant: 'split' | 'centered'; children: ReactNode }) {
  const card = (
    <div className="relative w-full max-w-md rounded-3xl border border-white/80 bg-white/95 p-6 shadow-card backdrop-blur motion-safe:animate-rise sm:p-9">
      {variant === 'centered' && (
        <Link to="/login" className="mb-6 flex flex-col items-center gap-2">
          <Logo />
          <Wordmark />
        </Link>
      )}
      {children}
    </div>
  )

  if (variant === 'centered') {
    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-4 py-10">
        <Blobs />
        {card}
      </main>
    )
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[5fr_6fr]">
      <aside className="relative hidden overflow-hidden bg-sunset text-white lg:flex lg:flex-col lg:justify-center lg:px-16">
        <Horizon className="absolute inset-x-0 bottom-0 h-72 w-full" />
        <div className="relative max-w-sm pb-24">
          <Logo className="size-16" />
          <h2 className="mt-6 text-4xl font-bold tracking-tight">PrivateChat</h2>
          <p className="mt-2 text-lg font-medium text-white/95">Your Privacy, Our Priority</p>
          <p className="text-sm text-white/75">Chat freely. Stay private.</p>
          <ul className="mt-12 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-sm">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-white/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Below lg the brand panel is hidden, so the form side carries the sunset instead. */}
      <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-sunset px-4 py-10 lg:bg-none lg:bg-surface">
        <div className="lg:hidden">
          <Horizon className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full opacity-90" />
        </div>
        <div className="hidden lg:block">
          <Blobs />
        </div>
        <div className="relative mb-6 flex items-center gap-2.5 lg:hidden">
          <Logo className="size-11" />
          <Wordmark light />
        </div>
        {card}
      </main>
    </div>
  )
}
