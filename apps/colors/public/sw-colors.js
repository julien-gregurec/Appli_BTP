/*
 * Service worker d'ELSATIA Colors.
 *
 * Il ne met en cache que la coquille publique : l'icône, le manifeste et une
 * page « hors ligne » qui ne contient aucune donnée. Aucune page authentifiée,
 * aucune réponse d'API, aucune photo de seau n'est jamais conservée — le cache
 * d'un navigateur survit à la déconnexion et n'est pas cloisonné par
 * organisation ; y déposer du stock reviendrait à défaire la RLS côté client.
 *
 * Colors n'est donc PAS une application hors ligne : elle affiche, hors réseau,
 * un écran qui le dit. C'est un choix, pas un manque — un inventaire modifié
 * hors ligne par deux personnes exigerait un modèle de réconciliation, qui est
 * un lot en soi.
 */
const CACHE_COLORS = "elsatia-colors-shell-v2";
const PAGE_HORS_LIGNE = "/hors-ligne.html";
const RESSOURCES_SHELL = [
  PAGE_HORS_LIGNE,
  "/icons/colors-icon.svg",
  "/icons/colors-maskable.svg",
  "/icons/colors-icon-192.png",
];

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
  const requete = event.request;
  if (requete.method !== "GET" || new URL(requete.url).origin !== self.location.origin) return;

  /*
   * Le repli ne concerne QUE les navigations. La version précédente répondait
   * `/login` — une page HTML — à n'importe quelle requête GET échouée, y compris
   * un appel d'API attendant du JSON : l'appelant recevait une page de connexion
   * et la signalait comme une erreur d'analyse, masquant la vraie cause, la
   * perte de réseau. Une requête de données qui échoue doit échouer.
   */
  if (requete.mode !== "navigate") {
    event.respondWith(fetch(requete).catch(() => caches.match(requete).then((r) => r || Response.error())));
    return;
  }

  event.respondWith(
    fetch(requete).catch(() => caches.match(PAGE_HORS_LIGNE).then((reponse) => reponse || Response.error())),
  );
});
