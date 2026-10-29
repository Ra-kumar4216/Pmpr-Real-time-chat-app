/**
 * Name of the private Realtime channel two people share. Both sides must derive the same string, and it must match
 * what supabase/migrations/002_live_channels.sql accepts: lower-case uuids, the smaller one first.
 */
export function pairTopic(a: string, b: string): string {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `pc-chat:${x}:${y}`;
}
