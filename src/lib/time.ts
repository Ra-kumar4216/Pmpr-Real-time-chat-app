/** A contact counts as online if their last heartbeat (sent every 30s) is newer than this. */
export const ONLINE_WINDOW_MS = 70_000

export function isOnline(lastSeen: string | null | undefined, now: number = Date.now()): boolean {
  if (!lastSeen) return false
  const t = new Date(lastSeen).getTime()
  return Number.isFinite(t) && now - t < ONLINE_WINDOW_MS
}

export function formatLastSeen(lastSeen: string | null | undefined, now: number = Date.now()): string {
  if (!lastSeen) return 'Offline'
  const t = new Date(lastSeen).getTime()
  if (!Number.isFinite(t)) return 'Offline'
  if (now - t < ONLINE_WINDOW_MS) return 'Online'
  const mins = Math.floor((now - t) / 60_000)
  if (mins < 1) return 'Last seen just now'
  if (mins < 60) return `Last seen ${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Last seen ${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Last seen yesterday'
  if (days < 7) return `Last seen ${days}d ago`
  return `Last seen ${new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

/** Short stamp for conversation lists: clock time today, otherwise a short date. */
export function listStamp(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return formatClock(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}
