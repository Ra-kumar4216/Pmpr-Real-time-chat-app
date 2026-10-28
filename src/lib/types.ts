/** Shapes returned by the pc_* database functions (see supabase/migrations/001_privatechat.sql). */

export interface Profile {
  id: string
  user_id: string
  display_name: string
  avatar_path: string | null
  onboarded_at: string | null
  last_seen_at: string
  created_at: string
}

/** Someone you are allowed to see: a contact, or a person who exchanged messages with you. */
export interface Person {
  id: string
  user_id: string
  display_name: string
  avatar_path: string | null
  last_seen_at?: string | null
}

export interface Contact extends Person {
  last_seen_at: string
  added_at: string
}

/** Result of an exact User ID lookup. Deliberately has no presence information. */
export type FoundUser = Pick<Person, 'id' | 'user_id' | 'display_name' | 'avatar_path'>

export interface Message {
  id: string
  sender_id: string
  receiver_id: string
  body: string | null
  image_path: string | null
  created_at: string
  read_at: string | null
}

export interface ChatSummary {
  partner_id: string
  last_message_id: string
  last_body: string | null
  last_has_image: boolean
  last_sender_id: string
  last_at: string
  unread_count: number
}

export interface ProfilePatch {
  displayName?: string
  avatarPath?: string
  clearAvatar?: boolean
  finishOnboarding?: boolean
}
