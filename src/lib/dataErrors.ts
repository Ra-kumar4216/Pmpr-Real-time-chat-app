export type DataErrorContext = 'profile' | 'search' | 'contacts' | 'messages' | 'upload' | 'generic'

type ErrLike = { code?: string; message?: string; status?: number; statusCode?: string | number; error?: string } | null | undefined

/** Turns Postgres / PostgREST / Storage errors into messages a person can act on. Never leaks raw SQL text. */
export function friendlyDataError(err: unknown, ctx: DataErrorContext = 'generic'): string {
  const e = err as ErrLike
  const code = String(e?.code ?? '')
  const msg = String(e?.message ?? '').toLowerCase()
  const status = String(e?.statusCode ?? e?.status ?? '')

  if (/failed to fetch|networkerror|network request failed|load failed/.test(msg)) {
    return 'Cannot reach the server. Check your connection and try again.'
  }
  // The most likely first-run mistake: the SQL file was never run in the Supabase SQL editor.
  if (code === 'PGRST202' || code === '42883' || code === '42P01' || msg.includes('could not find the function') || msg.includes('schema cache')) {
    return 'The database is not set up yet. Run supabase/migrations/001_privatechat.sql in the Supabase SQL editor, then reload.'
  }
  if (code === '28000' || msg.includes('not authenticated') || msg.includes('jwt expired') || msg.includes('invalid jwt')) {
    return 'Your session expired. Please log in again.'
  }
  if (code === 'P0002' || msg.includes('user not found')) return 'No user found with that ID.'
  if (code === '22023' || msg.includes('cannot add yourself')) return "That's your own User ID."

  if (msg.includes('mime type') || msg.includes('invalid_mime_type')) return 'Only JPEG, PNG or WebP images are allowed.'
  if (msg.includes('exceeded the maximum allowed size') || msg.includes('payload too large') || status === '413') {
    return 'That image is too large.'
  }

  if (code === '23514') {
    if (msg.includes('body_len')) return 'Messages can be up to 4000 characters.'
    if (msg.includes('has_content')) return 'Type a message or attach a photo.'
    if (msg.includes('display_name')) return 'Your name must be between 1 and 50 characters.'
  }
  if (code === '42501' || msg.includes('row-level security') || msg.includes('permission denied') || status === '403') {
    if (ctx === 'messages') return 'Add this person to your contacts before messaging them.'
    if (ctx === 'upload') return 'You are not allowed to upload that file.'
    return 'You are not allowed to do that.'
  }
  if (msg.includes('too many') || status === '429') return 'Too many requests. Please wait a moment and try again.'
  return 'Something went wrong. Please try again.'
}
