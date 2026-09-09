/* Service worker: renders match alerts and focuses the app when tapped. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "bet365", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "bet365";
  // The odds line is appended under the score so it is visible on the
  // lock screen without opening the app.
  const body = data.odds ? `${data.body}\n${data.odds}` : data.body || "";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: data.tag || "bet365",
      renotify: true,
      badge: "/icon-badge.png",
      icon: "/icon-192.png",
      vibrate: [80, 40, 80],
      timestamp: Date.now(),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
