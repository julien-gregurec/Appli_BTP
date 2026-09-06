/*
 * Service worker ELSATIA Tools — SOURCE.
 *
 * Ce fichier n'est jamais servi tel quel : `scripts/generate-service-worker.mjs` le lit apres
 * `next build`, remplace les quatre constantes marquees `ELSATIA:` par les valeurs derivees du
 * build (version de cache, URL de la page hors ligne, listes d'assets a precacher) et ecrit le
 * resultat dans `public/sw-tools.js` (et `out/sw-tools.js` pour l'export natif).
 *
 * Invariant du lot PRECACHE-UPDATE-ROBUSTNESS : une nouvelle version ne supprime JAMAIS le cache
 * de la precedente avant que son propre precache critique ne soit constitue. L'ordre est
 * install -> precache -> activate -> verification -> purge -> claim. Si le precache critique
 * echoue, `install` echoue, `activate` n'est jamais appele, et l'ancien worker continue de servir.
 */

const CACHE_VERSION = "source"; /* ELSATIA:CACHE_VERSION */
const OFFLINE_URL = "/offline"; /* ELSATIA:OFFLINE_URL */
const CRITICAL_ASSETS = []; /* ELSATIA:CRITICAL_ASSETS */
const OPTIONAL_ASSETS = []; /* ELSATIA:OPTIONAL_ASSETS */

const CACHE = `elsatia-tools-${CACHE_VERSION}`;
/* Seuls les caches portant un de ces prefixes appartiennent a Tools : rien d'autre n'est efface. */
const OWNED_CACHE_PREFIXES = ["elsatia-tools-", "elsatia-calculs-"];
/* Les URL `/_next/static/` portent un hash de contenu : elles sont immuables, donc cache-first. */
const IMMUTABLE_PREFIX = "/_next/static/";
/* Chemins jamais mis en cache meme en meme origine (aucun aujourd'hui, garde de defense). */
const NEVER_CACHE = ["/api/", "/auth/"];
/*
 * Delais mesures sur le build reel (docs/audits/ELSATIA_TOOLS_PWA_ASSET_PRECACHE_UPDATE_ROBUSTNESS_V1.md) :
 * le document `/` pese 28 ko et
 * ses assets critiques 931 ko non compresses. Sur un lien chantier degrade (~400 kb/s, RTT 2 s) le
 * document seul demande ~2,6 s ; au-dela on sert la copie du cache — issue du MEME build, donc
 * strictement equivalente — et la reponse reseau continue d'alimenter le cache en arriere-plan.
 */
const NAVIGATION_TIMEOUT_MS = 3000;
/* Assets non immuables (manifeste, icones) : plus gros, moins urgents, on laisse 5 s au reseau. */
const ASSET_TIMEOUT_MS = 5000;
/* Sentinelle interne : le reseau n'a pas repondu dans le delai imparti. */
const TIMED_OUT = { timedOut: true };

function isOwnedCache(key) {
  return key !== CACHE && OWNED_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/*
 * Les requetes RSC (prefetch et navigation client du App Router) ne sont NI interceptees NI mises
 * en cache : leur URL ne differe de la page que par `?_rsc=…`, et un `caches.match` tolerant aux
 * query renverrait une charge Flight la ou le navigateur attend un document HTML. Quand elles
 * echouent hors ligne, Next bascule de lui-meme en navigation complete, que ce worker sert depuis
 * le cache (« Failed to fetch RSC payload … Falling back to browser navigation »).
 */
function isRscRequest(request) {
  try {
    if (request.headers && request.headers.get && request.headers.get("RSC")) return true;
  } catch { /* en-tetes indisponibles : on retombe sur la query */ }
  return new URL(request.url).searchParams.has("_rsc");
}

function isCacheable(pathname) {
  return !NEVER_CACHE.some((prefix) => pathname.startsWith(prefix));
}

/*
 * Le clone doit etre pris SYNCHRONEMENT, avant que la reponse ne soit rendue au client :
 * differe (par exemple apres `caches.open`), `clone()` leve « Response body is already used »
 * et la mise en cache d'execution n'a jamais lieu — le shell reste sans JS ni CSS hors ligne.
 */
function cacheResponse(event, response) {
  const copy = response.clone();
  const written = caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
  try { event.waitUntil(written); } catch { /* evenement deja clos : ecriture best-effort */ }
  return written;
}

function delay(ms) {
  let timer;
  const promise = new Promise((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); });
  return { promise, cancel: () => clearTimeout(timer) };
}

async function fetchAndCache(event) {
  const response = await fetch(event.request);
  if (response.ok && isCacheable(new URL(event.request.url).pathname)) cacheResponse(event, response);
  return response;
}

/* `/_next/static/**` : contenu immuable, le cache fait autorite et evite tout aller-retour reseau. */
async function cacheFirst(event) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  try { return await fetchAndCache(event); } catch { return Response.error(); }
}

/* Reseau d'abord, cache si le reseau tarde ou echoue, page hors ligne en dernier recours. */
async function networkFirst(event, timeoutMs, isNavigation) {
  const network = fetchAndCache(event);
  network.catch(() => undefined);
  const timeout = delay(timeoutMs);
  let first;
  try { first = await Promise.race([network, timeout.promise]); } catch { first = TIMED_OUT; }
  timeout.cancel();
  if (first !== TIMED_OUT) return first;

  const cached = await caches.match(event.request, { ignoreSearch: true });
  if (cached) {
    try { event.waitUntil(network); } catch { /* evenement deja clos */ }
    return cached;
  }
  try { return await network; } catch { /* rien en cache et reseau indisponible */ }
  if (isNavigation) {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
  }
  return Response.error();
}

/*
 * `addAll` est atomique : si un seul asset critique manque, la promesse est rejetee, `install`
 * echoue et le worker precedent reste actif avec son cache intact. Le reste est best-effort, par
 * lots pour ne pas saturer une connexion de chantier.
 */
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(CRITICAL_ASSETS);
  for (let index = 0; index < OPTIONAL_ASSETS.length; index += 8) {
    const batch = OPTIONAL_ASSETS.slice(index, index + 8);
    await Promise.all(batch.map((url) => cache.add(url).catch(() => undefined)));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  /*
   * Aucun appel a skipWaiting ici : prendre la main au milieu d'une session purgerait le cache de
   * la version que la page ouverte est en train d'utiliser, et ses chunks lazy deviendraient
   * introuvables hors ligne. La nouvelle version s'active a la fermeture des derniers clients, ou
   * sur demande explicite de l'utilisateur (message `SKIP_WAITING`, plus bas), jamais autrement.
   * Une premiere installation (aucun worker precedent) s'active immediatement d'elle-meme.
   */
});

/*
 * Activation controlee par l'utilisateur (lot PWA-UPDATE-UX). Le worker en attente ne prend jamais
 * la main de lui-meme : il n'appelle `skipWaiting()` que sur ce message, envoye par la page apres
 * un clic explicite sur « Mettre a jour ». Aucun reseau n'est requis, ce qui rend l'operation sure
 * hors ligne : le precache de CETTE version est deja complet (sinon `install` aurait echoue), et
 * `activate` ne purge les caches precedents qu'apres l'avoir verifie.
 *
 * Tout autre message est ignore : ce canal n'accepte pas d'ordre venu d'ailleurs que de la page.
 */
self.addEventListener("message", (event) => {
  const data = event && event.data;
  const type = typeof data === "string" ? data : data && data.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const present = await Promise.all(CRITICAL_ASSETS.map((url) => cache.match(url)));
    /* Purge conditionnee : sans precache critique complet, on garde les caches precedents. */
    if (present.length > 0 && present.every(Boolean)) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(isOwnedCache).map((key) => caches.delete(key)));
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (!request.url.startsWith(`${self.location.origin}/`)) return;
  if (isRscRequest(request)) return;
  const pathname = new URL(request.url).pathname;
  if (!isCacheable(pathname)) return;
  if (pathname.startsWith(IMMUTABLE_PREFIX)) { event.respondWith(cacheFirst(event)); return; }
  event.respondWith(networkFirst(event, request.mode === "navigate" ? NAVIGATION_TIMEOUT_MS : ASSET_TIMEOUT_MS, request.mode === "navigate"));
});
