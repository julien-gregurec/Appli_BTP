const CACHE = "elsatia-tools-v5";
const SHELL = [
  "/", "/offline", "/icon.svg", "/outils/diagonale-rectangle", "/outils/angle-droit-3-4-5",
  "/outils/pythagore", "/outils/pente", "/outils/surface-rectangle", "/outils/cercle",
  "/outils/arc-corde-fleche-rayon", "/outils/repartition", "/outils/calcul-entraxes",
  "/outils/repartition-vitrages", "/outils/poids-vitrage", "/outils/calcul-plaques-panneaux",
  "/outils/quantite-peinture", "/outils/calcul-isolation-resistance-thermique",
  "/outils/calcul-fixations", "/outils/arche",
  "/outils/arche-avancee", "/outils/niche-cintree", "/outils/plafond-circulaire",
  "/outils/ovale-ellipse", "/outils/double-cercle-couronne", "/outils/fleur-4-petales",
  "/outils/fleur-5-petales", "/outils/fleur-6-petales", "/outils/fleur-8-petales",
  "/outils/rosace-radiale-simple",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith("elsatia-tools-") || key.startsWith("elsatia-calculs-")) && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === "navigate" ? caches.match("/offline") : Response.error())));
});
