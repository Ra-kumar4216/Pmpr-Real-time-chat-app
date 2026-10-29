// Minimal service worker: lets the app show notifications (needed on Android) and focuses the app when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) if ("focus" in client) return client.focus();
        return self.clients.openWindow("/app");
      }),
  );
});
