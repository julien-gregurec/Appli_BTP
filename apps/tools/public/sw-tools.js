const CACHE = "elsatia-tools-v6";
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
  "/outils/rosace-radiale-simple", "/projets",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => (key.startsWith("elsatia-tools-") || key.startsWith("elsatia-calculs-")) && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

// Le clone doit etre pris SYNCHRONEMENT, avant que la reponse ne soit rendue au client :
// differe (par exemple apres `caches.open`), `clone()` leve « Response body is already used »
// et la mise en cache d'execution n'a jamais lieu — le shell reste sans JS ni CSS hors ligne.
function cacheResponse(event, response) {
  const copy = response.clone();
  const written = caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
  try { event.waitUntil(written); } catch { /* evenement deja clos : ecriture best-effort */ }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) cacheResponse(event, response);
    return response;
  }).catch(async () => (await caches.match(event.request, { ignoreSearch: true })) || (event.request.mode === "navigate" ? caches.match("/offline") : Response.error())));
});
