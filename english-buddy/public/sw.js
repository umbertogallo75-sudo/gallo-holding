const CACHE = "english-buddy-shell-v1";
const SHELL = ["/", "/home", "/buddy", "/progress", "/manifest.webmanifest"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).catch(() => undefined)));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(r => r || caches.match("/"))));
});
