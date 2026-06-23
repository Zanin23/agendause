/* Use Sistemas — Push notifications service worker
 * Dedicated messaging worker (Web Push). Not an app-shell cache.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: "Use Sistemas", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Use Sistemas";
  const options = {
    body: data.body || "Você tem uma nova notificação.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "use-sistemas",
    data: { url: data.url || "/cobrar" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});