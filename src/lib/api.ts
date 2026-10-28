import { supabase } from './supabase'
import { friendlyDataError, type DataErrorContext } from './dataErrors'
import type { ChatSummary, Contact, FoundUser, Message, Person, Profile, ProfilePatch } from './types'

export const AVATAR_BUCKET = 'pc-avatars'
export const MEDIA_BUCKET = 'pc-chat-media'
export const MESSAGE_PAGE_SIZE = 50

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function assertUuid(value: string) {
  if (!UUID_RE.test(value)) throw new ApiError('Invalid id.')
}

async function rpc<T>(fn: string, args: Record<string, unknown> | undefined, ctx: DataErrorContext): Promise<T> {
  let res
  try {
    res = await supabase.rpc(fn, args)
  } catch (e) {
    throw new ApiError(friendlyDataError(e, ctx))
  }
  if (res.error) throw new ApiError(friendlyDataError(res.error, ctx), res.error.code)
  return res.data as T
}

const one = <T>(data: T | T[] | null): T | null => (Array.isArray(data) ? (data[0] ?? null) : (data ?? null))

// ------------------------------------------------------------------ profile
export async function ensureProfile(): Promise<Profile> {
  const p = one(await rpc<Profile | Profile[]>('pc_ensure_profile', undefined, 'profile'))
  if (!p) throw new ApiError('Could not load your profile.')
  return p
}

export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const args: Record<string, unknown> = {}
  if (patch.displayName !== undefined) args.p_display_name = patch.displayName
  if (patch.avatarPath !== undefined) args.p_avatar_path = patch.avatarPath
  if (patch.clearAvatar) args.p_clear_avatar = true
  if (patch.finishOnboarding) args.p_finish_onboarding = true
  const p = one(await rpc<Profile | Profile[]>('pc_update_profile', args, 'profile'))
  if (!p) throw new ApiError('Could not save your profile.')
  return p
}

/** Best effort. A missed heartbeat only makes you look offline a little early, so it never throws. */
export async function heartbeat(): Promise<void> {
  try {
    await supabase.rpc('pc_heartbeat')
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------- search + contacts
export async function findUser(userId: string): Promise<FoundUser | null> {
  const rows = await rpc<FoundUser[]>('pc_find_user', { p_user_id: userId }, 'search')
  return rows?.[0] ?? null
}

export async function addContact(contactId: string): Promise<Contact> {
  assertUuid(contactId)
  const c = one(await rpc<Contact[]>('pc_add_contact', { p_contact_id: contactId }, 'contacts'))
  if (!c) throw new ApiError('Could not add this contact.')
  return c
}

export async function removeContact(contactId: string): Promise<void> {
  assertUuid(contactId)
  await rpc<null>('pc_remove_contact', { p_contact_id: contactId }, 'contacts')
}

export async function listContacts(): Promise<Contact[]> {
  return (await rpc<Contact[]>('pc_list_contacts', undefined, 'contacts')) ?? []
}

export async function getProfile(id: string): Promise<Person | null> {
  assertUuid(id)
  const rows = await rpc<Person[]>('pc_get_profile', { p_id: id }, 'contacts')
  return rows?.[0] ?? null
}

// ---------------------------------------------------------------- messages
export async function getChatSummaries(): Promise<ChatSummary[]> {
  const rows = (await rpc<ChatSummary[]>('pc_chat_summaries', undefined, 'messages')) ?? []
  return rows.map((r) => ({ ...r, unread_count: Number(r.unread_count) }))
}

/** Newest first. Pass `before` (a created_at) to page backwards. */
export async function getMessages(partnerId: string, before?: string | null, limit = MESSAGE_PAGE_SIZE): Promise<Message[]> {
  assertUuid(partnerId)
  const args: Record<string, unknown> = { p_partner: partnerId, p_limit: limit }
  if (before) args.p_before = before
  return (await rpc<Message[]>('pc_get_messages', args, 'messages')) ?? []
}

export async function sendMessage(receiverId: string, content: { body?: string | null; imagePath?: string | null }): Promise<Message> {
  assertUuid(receiverId)
  const args: Record<string, unknown> = { p_receiver: receiverId }
  if (content.body) args.p_body = content.body
  if (content.imagePath) args.p_image_path = content.imagePath
  const m = one(await rpc<Message | Message[]>('pc_send_message', args, 'messages'))
  if (!m) throw new ApiError('Message could not be sent.')
  return m
}

export async function markRead(partnerId: string): Promise<number> {
  assertUuid(partnerId)
  return Number((await rpc<number>('pc_mark_read', { p_partner: partnerId }, 'messages')) ?? 0)
}

// ----------------------------------------------------------------- storage
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

async function upload(bucket: string, userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  let res
  try {
    res = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  } catch (e) {
    throw new ApiError(friendlyDataError(e, 'upload'))
  }
  if (res.error) throw new ApiError(friendlyDataError(res.error, 'upload'))
  return path
}

export const uploadAvatar = (userId: string, blob: Blob) => upload(AVATAR_BUCKET, userId, blob)
export const uploadChatImage = (userId: string, blob: Blob) => upload(MEDIA_BUCKET, userId, blob)

/** Best effort cleanup of a replaced profile photo. */
export async function removeAvatar(path: string): Promise<void> {
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([path])
  } catch {
    /* ignore */
  }
}

const signed = new Map<string, { url: string; expiresAt: number }>()
const inflight = new Map<string, Promise<string>>()
const SIGNED_TTL_SECONDS = 3600

/** Private chat photos are served through short-lived signed URLs, cached until shortly before they expire. */
export async function getSignedImageUrl(path: string): Promise<string> {
  const hit = signed.get(path)
  if (hit && hit.expiresAt - Date.now() > 60_000) return hit.url
  const pending = inflight.get(path)
  if (pending) return pending

  const p = (async () => {
    let res
    try {
      res = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, SIGNED_TTL_SECONDS)
    } catch (e) {
      throw new ApiError(friendlyDataError(e, 'upload'))
    }
    if (res.error || !res.data?.signedUrl) throw new ApiError(friendlyDataError(res.error, 'upload'))
    signed.set(path, { url: res.data.signedUrl, expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000 })
    return res.data.signedUrl
  })().finally(() => inflight.delete(path))

  inflight.set(path, p)
  return p
}

export function clearSignedUrlCache() {
  signed.clear()
}
