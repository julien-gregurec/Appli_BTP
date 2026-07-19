/* Liria Gestion Pro — service worker.
   Objectif : hors-ligne LÉGER sans jamais mettre en cache de données métier privées.
   - Ressources statiques versionnées (JS/CSS/polices/icônes) : cache-first (sûres, fingerprintées, non personnelles).
   - Navigation : réseau d'abord, page « /offline » en secours si pas de réseau.
   - Tout le reste (API, Supabase, Stripe, données privées) : réseau uniquement, aucun cache. */

const VERSION = "liria-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PRECACHE = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/liria-gestion-pro-v3-192.png",
  "/icons/liria-gestion-pro-v3-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Jamais interférer avec les mutations (POST/PUT/DELETE…) ni le cross-origin (Supabase, Stripe).
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord, secours hors-ligne. On ne met JAMAIS en cache une page privée.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline"))
    );
    return;
  }

  // Ressources statiques versionnées : cache-first (accélère le chargement, sûr car non personnel).
  const estStatique =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|ico)$/.test(url.pathname);

  if (estStatique) {
    event.respondWith(
      caches.match(request).then((enCache) =>
        enCache ||
        fetch(request).then((reponse) => {
          if (reponse.ok) {
            const copie = reponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copie));
          }
          return reponse;
        })
      )
    );
    return;
  }

  // Tout le reste (routes de données, API) : réseau uniquement.
});
