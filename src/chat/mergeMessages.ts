import { mergeById } from '../lib/text'
import type { Message } from '../lib/types'

const byTime = (a: Message, b: Message) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** Union by id, oldest first. A later copy of the same message wins (that is how read receipts arrive). */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  return mergeById(existing, incoming, byTime)
}
