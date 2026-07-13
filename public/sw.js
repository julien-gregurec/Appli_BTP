/* LIRIA BTP : service worker réseau uniquement. Les données métier privées ne sont jamais mises en cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
