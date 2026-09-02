const CACHE_COLORS = "elsatia-colors-shell-v1";
const RESSOURCES_SHELL = ["/login", "/icons/colors-icon.svg", "/icons/colors-maskable.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_COLORS).then((cache) => cache.addAll(RESSOURCES_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cles) => Promise.all(
      cles.filter((cle) => cle.startsWith("elsatia-colors-") && cle !== CACHE_COLORS).map((cle) => caches.delete(cle)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((reponse) => reponse || caches.match("/login"))));
});
