import { supabase } from "./supabase";
import { pairTopic } from "./topic";

export interface PairChannel {
  /** Returns false (and sends nothing) while the channel is not connected yet. */
  send: (event: string, payload: unknown) => boolean;
  close: () => void;
}

/**
 * Opens the private broadcast channel shared with one contact. Realtime applies the policies from
 * 002_live_channels.sql, so only the two of you can join, and anything received came from the other person.
 */
export function openPairChannel(
  me: string,
  other: string,
  onEvent: (event: string, payload: unknown) => void,
  onReady: (ready: boolean) => void,
): PairChannel {
  const channel = supabase.channel(pairTopic(me, other), {
    config: { private: true, broadcast: { self: false } },
  });
  let ready = false;

  channel.on(
    "broadcast",
    { event: "*" },
    (msg: { event: string; payload?: unknown }) =>
      onEvent(msg.event, msg.payload),
  );
  channel.subscribe((status) => {
    const now = status === "SUBSCRIBED";
    if (now !== ready) {
      ready = now;
      onReady(now);
    }
  });

  return {
    send(event, payload) {
      if (!ready) return false;
      void channel.send({ type: "broadcast", event, payload });
      return true;
    },
    close() {
      void supabase.removeChannel(channel);
    },
  };
}
