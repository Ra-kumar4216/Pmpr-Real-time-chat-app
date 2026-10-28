import type { ChatSummary } from './types'

export const USER_ID_RE = /^[a-z0-9_]{3,40}$/

/** "  @Ratan_Kumar_8F3K2 " -> "ratan_kumar_8f3k2" */
export function normalizeUserId(input: string): string {
  return input.trim().replace(/^@+/, '').trim().toLowerCase()
}

export function validateUserId(id: string): string | null {
  if (!id) return "Enter your friend's User ID"
  if (!USER_ID_RE.test(id)) return "That doesn't look like a User ID. It looks like ratan_kumar_8f3k2."
  return null
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = Array.from(parts[0])[0]
  if (parts.length === 1) return first.toUpperCase()
  return (first + Array.from(parts[parts.length - 1])[0]).toUpperCase()
}

/** One line for a conversation row. */
export function previewText(s: Pick<ChatSummary, 'last_body' | 'last_has_image' | 'last_sender_id'>, me: string): string {
  if (!s.last_body && !s.last_has_image) return ''
  const prefix = s.last_sender_id === me ? 'You: ' : ''
  return prefix + (s.last_body ?? 'Photo')
}

export function mergeById<T extends { id: string }>(existing: T[], incoming: T[], order: (a: T, b: T) => number): T[] {
  const map = new Map<string, T>()
  for (const item of existing) map.set(item.id, item)
  for (const item of incoming) map.set(item.id, { ...map.get(item.id), ...item })
  return [...map.values()].sort(order)
}
