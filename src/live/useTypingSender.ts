import { useCallback, useEffect, useRef } from "react";
import { useLiveHub } from "./LiveHub";

/** How often "I'm typing" is repeated while keys keep being pressed. Must stay well under TYPING_EXPIRES_MS. */
export const TYPING_REPEAT_MS = 2500;
/** No key for this long counts as having stopped. */
export const TYPING_IDLE_MS = 4000;

/**
 * Tells one contact whether you are typing. Call `report(true)` on every keystroke (it throttles itself)
 * and `report(false)` when the box is emptied or the message is sent.
 */
export function useTypingSender(partnerId: string) {
  const hub = useLiveHub();
  const hubRef = useRef(hub);
  hubRef.current = hub;
  const lastSent = useRef(0);
  const active = useRef(false);
  const idle = useRef<number>(undefined);

  const stop = useCallback(() => {
    window.clearTimeout(idle.current);
    if (active.current) hubRef.current.send(partnerId, "typing", { on: false });
    active.current = false;
    lastSent.current = 0;
  }, [partnerId]);

  const report = useCallback(
    (typing: boolean) => {
      if (!typing) return stop();
      const now = Date.now();
      if (!active.current || now - lastSent.current >= TYPING_REPEAT_MS) {
        hubRef.current.send(partnerId, "typing", { on: true });
        lastSent.current = now;
        active.current = true;
      }
      window.clearTimeout(idle.current);
      idle.current = window.setTimeout(stop, TYPING_IDLE_MS);
    },
    [partnerId, stop],
  );

  // Leaving the chat (or closing the page) must not leave the other side stuck on "typing…".
  useEffect(() => {
    const onHide = () => stop();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      stop();
    };
  }, [stop]);

  return report;
}
