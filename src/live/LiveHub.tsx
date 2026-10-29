import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useProfile } from "../auth/ProfileContext";
import { useChatData } from "../chat/ChatDataContext";
import { openPairChannel, type PairChannel } from "../lib/liveChannel";

export type LiveListener = (
  from: string,
  event: string,
  payload: unknown,
) => void;

interface LiveHubState {
  /** True once the private channel with this contact is connected. */
  ready: (contactId: string) => boolean;
  send: (contactId: string, event: string, payload?: unknown) => boolean;
  subscribe: (listener: LiveListener) => () => void;
  isTyping: (contactId: string) => boolean;
}

const LiveHubContext = createContext<LiveHubState | null>(null);

/** A "typing" signal that is not refreshed within this time is treated as stopped (the sender may have lost connection). */
export const TYPING_EXPIRES_MS = 6000;

const withToggle = (set: Set<string>, id: string, on: boolean) => {
  if (set.has(id) === on) return set;
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
};

/**
 * Keeps one private channel open per saved contact. Typing indicators and call signalling both travel over it.
 * Needs to live inside ChatDataProvider.
 */
export function LiveHubProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const chat = useChatData();
  const meId = profile?.id ?? null;
  const contactKey = useMemo(
    () =>
      chat.contacts
        .map((c) => c.id)
        .sort()
        .join(","),
    [chat.contacts],
  );

  const channels = useRef(new Map<string, PairChannel>());
  const listeners = useRef(new Set<LiveListener>());
  const typingTimers = useRef(new Map<string, number>());
  const [readyIds, setReadyIds] = useState<Set<string>>(() => new Set());
  const [typing, setTyping] = useState<Set<string>>(() => new Set());

  const setTypingFor = useCallback((id: string, on: boolean) => {
    window.clearTimeout(typingTimers.current.get(id));
    typingTimers.current.delete(id);
    if (on)
      typingTimers.current.set(
        id,
        window.setTimeout(
          () => setTyping((p) => withToggle(p, id, false)),
          TYPING_EXPIRES_MS,
        ),
      );
    setTyping((p) => withToggle(p, id, on));
  }, []);

  // Open channels for new contacts, close them for removed ones.
  useEffect(() => {
    if (!meId) return;
    const wanted = new Set(contactKey ? contactKey.split(",") : []);
    for (const [id, ch] of channels.current) {
      if (wanted.has(id)) continue;
      ch.close();
      channels.current.delete(id);
      setReadyIds((p) => withToggle(p, id, false));
      setTypingFor(id, false);
    }
    for (const id of wanted) {
      if (channels.current.has(id)) continue;
      channels.current.set(
        id,
        openPairChannel(
          meId,
          id,
          (event, payload) => {
            if (event === "typing")
              setTypingFor(
                id,
                Boolean((payload as { on?: boolean } | null)?.on),
              );
            listeners.current.forEach((l) => l(id, event, payload));
          },
          (ready) => setReadyIds((p) => withToggle(p, id, ready)),
        ),
      );
    }
  }, [meId, contactKey, setTypingFor]);

  // Close everything when the user changes or the app unmounts.
  useEffect(() => {
    const open = channels.current;
    const timers = typingTimers.current;
    return () => {
      open.forEach((c) => c.close());
      open.clear();
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      setReadyIds(new Set());
      setTyping(new Set());
    };
  }, [meId]);

  // A message from someone who was "typing" means they have stopped.
  const { subscribe: subscribeMessages } = chat;
  useEffect(
    () =>
      subscribeMessages((e) => {
        if (e.type === "INSERT") setTypingFor(e.message.sender_id, false);
      }),
    [subscribeMessages, setTypingFor],
  );

  const send = useCallback(
    (contactId: string, event: string, payload?: unknown) =>
      channels.current.get(contactId)?.send(event, payload ?? {}) ?? false,
    [],
  );
  const subscribe = useCallback((l: LiveListener) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  const value = useMemo<LiveHubState>(
    () => ({
      ready: (id) => readyIds.has(id),
      send,
      subscribe,
      isTyping: (id) => typing.has(id),
    }),
    [readyIds, typing, send, subscribe],
  );
  return (
    <LiveHubContext.Provider value={value}>{children}</LiveHubContext.Provider>
  );
}

export function useLiveHub(): LiveHubState {
  const ctx = useContext(LiveHubContext);
  if (!ctx) throw new Error("useLiveHub must be used inside <LiveHubProvider>");
  return ctx;
}
