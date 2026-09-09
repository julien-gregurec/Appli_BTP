/* ELSATIA Gestion Pro — service worker.
   ===========================================================================
   Principe directeur, inchangé depuis l'origine et volontairement conservé :

       AUCUNE DONNÉE MÉTIER PRIVÉE N'ENTRE JAMAIS DANS UN CACHE PARTAGÉ.

   Un cache de service worker est indexé par ORIGINE, pas par session. Deux
   comptes de deux entreprises différentes qui utilisent le même téléphone
   partagent donc le même cache. Y déposer une réponse d'API, c'est offrir les
   données de l'entreprise A au compte de l'entreprise B qui se connectera
   ensuite — sans aucune faute de RLS, sans trace côté serveur, et sans que
   personne ne s'en aperçoive.

   Ce qui est mis en cache ici est donc strictement :
     — versionné et fingerprinté par le build (/_next/static/…) ;
     — public et non personnel (icônes, manifeste, page hors ligne).

   Les données du terrain accessibles hors ligne ne passent PAS par ici : elles
   vivent dans IndexedDB, dans une base dont le NOM porte l'identité de son
   propriétaire (voir src/lib/mobile/). C'est la seule façon d'isoler ce qui doit
   l'être : le cache du service worker n'a aucune notion d'identité, IndexedDB
   permet d'en fabriquer une.
   =========================================================================== */

const VERSION = "elsatia-v5";
const STATIC_CACHE = `${VERSION}-static`;

/* Ressources dont l'absence dégraderait l'expérience hors ligne. */
const PRECACHE = ["/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // `cache.addAll` est ATOMIQUE : une seule ressource en échec (un 404 passager,
      // un déploiement en cours) fait échouer l'installation entière, et le service
      // worker n'est jamais activé. L'application perd alors tout son hors-ligne à
      // cause d'une requête malchanceuse. On dépose donc chaque ressource
      // indépendamment : mieux vaut un précache partiel qu'aucun service worker.
      await Promise.all(
        PRECACHE.map((chemin) =>
          cache.add(chemin).catch(() => undefined),
        ),
      );
    }),
    // Pas de `skipWaiting()` ici : voir le message "APPLIQUER_MISE_A_JOUR" plus bas.
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) =>
        Promise.all(cles.filter((c) => !c.startsWith(VERSION)).map((c) => caches.delete(c))),
      )
      .then(() => self.clients.claim()),
  );
});

/* Une ressource de build est immuable : son nom porte une empreinte du contenu.
   Tout le reste — y compris une image d'icône — peut changer sans changer de nom. */
const estRessourceImmuable = (url) => url.pathname.startsWith("/_next/static/");

const estStatiquePublique = (url) =>
  url.pathname.startsWith("/icons/") ||
  url.pathname === "/manifest.webmanifest" ||
  /\.(?:css|js|woff2?|png|jpg|jpeg|svg|ico)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Jamais d'interférence avec les mutations ni le cross-origin (Supabase, Stripe, Sentry).
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // `/_next/image` sert des images OPTIMISÉES depuis une URL passée en paramètre.
  // Son chemin ne porte aucune extension, il échapperait donc au test ci-dessous —
  // mais l'écrire explicitement évite qu'un futur assouplissement du test ne mette
  // en cache l'aperçu d'un document privé.
  if (url.pathname.startsWith("/_next/image")) return;

  // Une navigation renvoie une page PERSONNELLE : réseau d'abord, et rien en cache.
  // Le repli hors ligne est une page publique et vide de données.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((repli) => repli ?? Response.error()),
      ),
    );
    return;
  }

  if (estRessourceImmuable(url) || estStatiquePublique(url)) {
    event.respondWith(
      caches.match(request).then((enCache) => {
        if (enCache) return enCache;
        return fetch(request)
          .then((reponse) => {
            // Une réponse partielle (206) ou opaque ne se met pas en cache utilement,
            // et `cache.put` lève sur un 206 — ce qui casserait la requête.
            if (reponse.ok && reponse.status === 200) {
              const copie = reponse.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copie)).catch(() => undefined);
            }
            return reponse;
          })
          .catch(() => caches.match(request).then((repli) => repli ?? Response.error()));
      }),
    );
    return;
  }

  // Tout le reste — routes de données, API, actions serveur : réseau uniquement.
});

/* ── Messages venus de la page ─────────────────────────────────────────────── */

self.addEventListener("message", (event) => {
  const type = event.data?.type;

  // Mise à jour APPLIQUÉE PAR L'UTILISATEUR, jamais imposée.
  //
  // `skipWaiting()` à l'installation remplace le service worker sous les pieds d'une
  // page ouverte. Sur un poste de bureau c'est anodin ; sur un chantier, cela peut
  // survenir au milieu d'une saisie. On attend donc un geste explicite, déclenché par
  // la bannière de `MiseAJourApplication`.
  if (type === "APPLIQUER_MISE_A_JOUR") {
    self.skipWaiting();
    return;
  }

  // Purge à la déconnexion.
  //
  // Le cache statique ne contient rien de personnel — c'est tout l'objet de ce fichier.
  // On le vide malgré tout à la déconnexion, pour une raison de principe : « aucune
  // donnée de la session précédente ne survit » doit être vrai SANS avoir à faire
  // confiance à l'exactitude d'un filtre. Le coût est un rechargement des ressources
  // statiques ; le bénéfice est une règle qu'on peut affirmer sans réserve.
  if (type === "PURGER_CACHES") {
    event.waitUntil(
      caches.keys().then((cles) => Promise.all(cles.map((c) => caches.delete(c)))),
    );
  }
});

/* ── Notifications push ────────────────────────────────────────────────────── */
/* Le payload JSON vient de src/lib/push.ts (envoyerNotificationPush). */

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  event.waitUntil(
    self.registration.showNotification(payload.titre || "ELSATIA Gestion Pro", {
      body: payload.message || "",
      data: { lien: payload.lien || "/dashboard" },
      tag: payload.lien || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
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
    }),
  );
});
