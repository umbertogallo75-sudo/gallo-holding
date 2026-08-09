const CACHE = "english-buddy-shell-v3";
const SHELL = ["/", "/home", "/buddy", "/progress", "/profile", "/rescue", "/voice", "/manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(r => r || caches.match("/"))));
});

self.addEventListener("push", event => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch { payload = { body: event.data.text() }; }
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: payload.data || {},
  };
  // Encouragement banner (shown where the platform supports big images).
  if (payload.image) options.image = payload.image;
  event.waitUntil(self.registration.showNotification(payload.title || "English Buddy", options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || "/home";
  event.waitUntil((async () => {
    if (data.nid) {
      try {
        await fetch("/api/push/opened", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nid: data.nid }),
          credentials: "include",
        });
      } catch { /* best-effort */ }
    }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
