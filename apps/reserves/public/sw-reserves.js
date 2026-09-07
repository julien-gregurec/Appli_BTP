/**
 * Service worker d'ELSATIA Réserves.
 *
 * Objectif unique et borné : que l'application S'OUVRE sans réseau, sur un chantier où
 * la couverture tombe. Il ne met pas en cache les données métier — celles-ci vivent dans
 * IndexedDB, cloisonnées par organisation et par utilisateur (`lib/offline/base-locale`).
 * Mettre des pages rendues côté serveur dans le cache HTTP serait exactement l'erreur à
 * ne pas commettre : ces pages contiennent les données d'UN tenant, et le cache HTTP,
 * lui, n'a aucune notion d'identité — la page d'une organisation resterait servie après
 * la connexion d'une autre.
 *
 * D'où la règle : le cache ne contient que la COQUILLE (une page sans données) et les
 * ressources statiques. Tout le reste passe par le réseau, et bascule vers la coquille
 * hors-ligne quand il n'y a pas de réseau.
 */

const VERSION = "reserves-v5-4";
const CACHE_COQUILLE = `${VERSION}-coquille`;
const CACHE_STATIQUE = `${VERSION}-statique`;

/** La coquille hors-ligne : une page cliente qui lit IndexedDB, sans donnée embarquée. */
const COQUILLE = "/hors-ligne";

/**
 * Pré-cache de la coquille ET de ses ressources.
 *
 * Mettre en cache le seul document HTML ne suffit pas, et l'erreur est silencieuse : la
 * page s'affiche hors ligne, mais ses scripts manquent, React n'hydrate jamais, et
 * l'utilisateur voit l'état INITIAL du rendu serveur — « chargement… », zéro chantier —
 * alors que l'appareil a bien les données. Un écran vide qui ment est pire qu'une erreur.
 *
 * On lit donc le HTML de la coquille et on met en cache les ressources qu'il référence.
 * `DOMParser` n'existe pas dans un service worker : l'extraction se fait à l'expression
 * régulière, sur des URLs que NOUS avons produites, pas sur du HTML arbitraire.
 */
async function precacherCoquille() {
  const cache = await caches.open(CACHE_COQUILLE);
  await cache.addAll([COQUILLE, "/manifest.webmanifest"]);

  const reponse = await cache.match(COQUILLE);
  if (!reponse) return;
  const html = await reponse.clone().text();

  const ressources = new Set();
  for (const [, url] of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    ressources.add(url.replace(/&amp;/g, "&"));
  }
  if (ressources.size === 0) return;

  const statique = await caches.open(CACHE_STATIQUE);
  // Une ressource manquante ne doit pas faire échouer toute l'installation : on cache
  // ce qui répond, et l'application reste utilisable en ligne dans tous les cas.
  await Promise.all([...ressources].map(async (url) => {
    try {
      const r = await fetch(url, { cache: "reload" });
      if (r.ok) await statique.put(url, r);
    } catch { /* ressource indisponible : ignorée */ }
  }));
}

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(
    precacherCoquille()
      // Un échec de pré-cache ne doit pas empêcher l'installation : l'application
      // continue de fonctionner en ligne, simplement sans repli hors-ligne.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(
      noms.filter((nom) => !nom.startsWith(VERSION)).map((nom) => caches.delete(nom)),
    );
    await self.clients.claim();
  })());
});

/**
 * Pourquoi aucune purge à la déconnexion.
 *
 * Ce cache ne contient QUE la coquille hors-ligne — une page dépourvue de donnée, qui lit
 * tout dans IndexedDB au moment du rendu — et des ressources statiques versionnées. Les
 * navigations, elles, ne sont jamais mises en cache (voir plus bas), pas plus que les
 * routes d'API ni les documents imprimables. Aucune donnée d'organisation ne peut donc s'y
 * trouver, et le vider à la déconnexion n'apporterait aucune protection : cela priverait
 * seulement la session suivante d'un démarrage hors ligne. La déconnexion purge ce qui
 * porte réellement les données : le cache de lecture IndexedDB et le pointeur d'identité.
 */

function estStatique(url) {
  return url.pathname.startsWith("/_next/static/")
      || url.pathname.startsWith("/icons/")
      || /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Les routes d'API ne sont JAMAIS servies depuis un cache : une réponse périmée y
  // serait indiscernable d'une réponse fraîche, et la file d'envoi doit voir le vrai
  // état du réseau pour décider si elle peut partir.
  if (url.pathname.startsWith("/api/")) return;

  // Les documents imprimables portent les données d'un tenant : jamais en cache.
  if (url.pathname.startsWith("/imprimer/")) return;

  if (estStatique(url)) {
    evenement.respondWith((async () => {
      const cache = await caches.open(CACHE_STATIQUE);
      const enCache = await cache.match(requete);
      if (enCache) return enCache;
      try {
        const reponse = await fetch(requete);
        if (reponse.ok) cache.put(requete, reponse.clone());
        return reponse;
      } catch (erreur) {
        if (enCache) return enCache;
        throw erreur;
      }
    })());
    return;
  }

  // Navigations : le réseau d'abord — l'application reste une application en ligne, et
  // une page fraîche vaut toujours mieux qu'une page approximative. Sans réseau, on
  // rend la coquille hors-ligne, qui affichera ce que l'appareil a réellement en local.
  if (requete.mode === "navigate") {
    evenement.respondWith((async () => {
      try {
        return await fetch(requete);
      } catch {
        const cache = await caches.open(CACHE_COQUILLE);
        const coquille = await cache.match(COQUILLE);
        if (coquille) return coquille;
        return new Response(
          "<!doctype html><meta charset=utf-8><title>Hors ligne</title>"
          + "<p>ELSATIA Réserves est hors ligne et la coquille n’a pas encore été mise en cache.</p>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
    })());
  }
});
