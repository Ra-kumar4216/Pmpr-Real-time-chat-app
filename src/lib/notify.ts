export type NotifyState = "unsupported" | "default" | "granted" | "denied";

export function notifyState(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window))
    return "unsupported";
  return Notification.permission;
}

let worker: Promise<ServiceWorkerRegistration | null> | null = null;

/** Android Chrome only shows notifications through a service worker, so register one (public/sw.js). */
function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!worker) {
    worker =
      typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? navigator.serviceWorker
            .register("/sw.js")
            .then(() => navigator.serviceWorker.ready)
            .catch(() => null)
        : Promise.resolve(null);
  }
  return worker;
}

/** Must be called from a click: browsers only show the permission prompt after a user gesture. */
export async function enableNotifications(): Promise<NotifyState> {
  if (notifyState() === "unsupported") return "unsupported";
  try {
    await Notification.requestPermission();
  } catch {
    /* some browsers throw instead of answering; the state below tells the truth */
  }
  if (notifyState() === "granted") void registerWorker();
  return notifyState();
}

/**
 * Shows a system notification, but only when the person is not looking at the app (hidden tab or another window).
 * It works while PrivateChat is open, even in the background. It cannot wake a closed app: that needs Web Push and a server.
 */
export async function showNotification(
  title: string,
  body: string,
  tag: string,
): Promise<void> {
  if (notifyState() !== "granted") return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const reg = await registerWorker();
    if (reg) {
      await reg.showNotification(title, {
        body,
        tag,
        icon: "/icon.png",
        badge: "/icon.png",
        renotify: true,
      } as NotificationOptions);
      return;
    }
    const n = new Notification(title, { body, tag, icon: "/icon.png" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* a notification is a nicety; never break the app over it */
  }
}
