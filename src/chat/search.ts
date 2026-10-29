import type { Message } from "../lib/types";

/** Ids of messages whose text contains `query` (case-insensitive), oldest first. */
export function findMatches(messages: Message[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return messages
    .filter((m) => m.body?.toLowerCase().includes(q))
    .map((m) => m.id);
}

export interface Segment {
  text: string;
  hit: boolean;
}

/** Splits `text` into plain and matching parts so matches can be highlighted. No regular expressions, so any query is safe. */
export function splitHighlight(text: string, query: string): Segment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const out: Segment[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(q, from);
    if (at === -1) break;
    if (at > from) out.push({ text: text.slice(from, at), hit: false });
    out.push({ text: text.slice(at, at + q.length), hit: true });
    from = at + q.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out.length ? out : [{ text, hit: false }];
}
