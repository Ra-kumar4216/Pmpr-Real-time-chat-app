import { supabase } from './supabase'
import type { Message } from './types'

export type MessageEvent = { type: 'INSERT' | 'UPDATE'; message: Message }

let counter = 0

/**
 * Live message feed for one user. Realtime applies the table's RLS, so a client only ever receives rows
 * where it is the sender or the receiver. Each filter is its own listener because Realtime allows one per listener.
 * Returns an unsubscribe function.
 */
export function subscribeToMessages(
  userId: string,
  onEvent: (e: MessageEvent) => void,
  onStatus?: (status: string) => void,
): () => void {
  const table = { schema: 'public', table: 'pc_messages' } as const
  const handle = (type: MessageEvent['type']) => (payload: { new: unknown }) => {
    const message = payload.new as Message | null
    if (message?.id) onEvent({ type, message })
  }

  // Unique topic per subscription so React StrictMode's mount/unmount/mount never races on one channel.
  const channel = supabase
    .channel(`pc-messages-${userId}-${++counter}`)
    .on('postgres_changes', { event: 'INSERT', ...table, filter: `receiver_id=eq.${userId}` }, handle('INSERT'))
    .on('postgres_changes', { event: 'INSERT', ...table, filter: `sender_id=eq.${userId}` }, handle('INSERT'))
    .on('postgres_changes', { event: 'UPDATE', ...table, filter: `sender_id=eq.${userId}` }, handle('UPDATE'))
    .on('postgres_changes', { event: 'UPDATE', ...table, filter: `receiver_id=eq.${userId}` }, handle('UPDATE'))
    .subscribe((status) => onStatus?.(status))

  return () => {
    void supabase.removeChannel(channel)
  }
}
