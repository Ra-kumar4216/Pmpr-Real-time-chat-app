import { useEffect, useState } from 'react'
import { avatarUrl } from '../lib/api'
import { initials } from '../lib/text'

const SIZES = {
  xs: 'size-7 text-[11px]',
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-24 text-2xl',
  '2xl': 'size-32 text-4xl',
} as const

const DOT_SIZES = { xs: 'size-2', sm: 'size-2.5', md: 'size-3', lg: 'size-3.5', xl: 'size-4', '2xl': 'size-5' } as const

const GRADIENTS = [
  'from-violet-500 to-fuchsia-500',
  'from-fuchsia-500 to-orange-400',
  'from-orange-400 to-rose-500',
  'from-indigo-500 to-violet-500',
  'from-rose-500 to-fuchsia-600',
  'from-amber-400 to-orange-500',
]

function pick(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

interface Props {
  name: string
  /** Object path in the avatars bucket. */
  path?: string | null
  /** Direct URL (e.g. a local preview); wins over `path`. */
  src?: string | null
  size?: keyof typeof SIZES
  /** When defined, shows a presence dot: green if true, grey if false. */
  online?: boolean
  className?: string
}

/** Profile photo with a coloured-initials fallback. Decorative: the person's name is always shown next to it. */
export function Avatar({ name, path, src, size = 'md', online, className = '' }: Props) {
  const url = src ?? avatarUrl(path)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])

  return (
    <span className={`relative inline-grid shrink-0 ${className}`}>
      {url && !failed ? (
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          className={`${SIZES[size]} rounded-full bg-slate-100 object-cover ring-2 ring-white`}
        />
      ) : (
        <span
          aria-hidden
          className={`${SIZES[size]} grid place-items-center rounded-full bg-linear-to-br ${pick(name)} font-semibold text-white ring-2 ring-white`}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          aria-hidden
          data-testid={online ? 'presence-online' : 'presence-offline'}
          className={`absolute right-0 bottom-0 ${DOT_SIZES[size]} rounded-full ring-2 ring-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`}
        />
      )}
    </span>
  )
}
