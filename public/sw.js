/* Liria Gestion Pro — service worker.
   Objectif : hors-ligne LÉGER sans jamais mettre en cache de données métier privées.
   - Ressources statiques versionnées (JS/CSS/polices/icônes) : cache-first (sûres, fingerprintées, non personnelles).
   - Navigation : réseau d'abord, page « /offline » en secours si pas de réseau.
   - Tout le reste (API, Supabase, Stripe, données privées) : réseau uniquement, aucun cache. */

const VERSION = "liria-v3";
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

// Notifications push : le payload JSON vient de src/lib/push.ts (envoyerNotificationPush).
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const options = {
    body: payload.message || "",
    icon: "/icons/liria-gestion-pro-v3-192.png",
    badge: "/icons/liria-gestion-pro-v3-192.png",
    data: { lien: payload.lien || "/dashboard" },
    tag: payload.lien || undefined,
  };
  event.waitUntil(self.registration.showNotification(payload.titre || "Liria Gestion Pro", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const lien = event.notification.data?.lien || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(lien) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(lien);
    })
  );
});
