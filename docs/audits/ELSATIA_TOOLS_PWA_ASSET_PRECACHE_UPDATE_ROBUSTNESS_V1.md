# ELSATIA-TOOLS-PWA-ASSET-PRECACHE-UPDATE-ROBUSTNESS-V1

Lot correctif P1 faisant suite à `ELSATIA-TOOLS-PWA-OFFLINE-NATIVE-PREPILOT-AUDIT-V1`.
Base : `6ae4bc40342e36cab0297453076ee67c0ec286ee` — branche `fix/tools-pwa-asset-precache-update-v1`.
Aucun déploiement Production.

## 1. Défaut corrigé

Avant ce lot, `public/sw-tools.js` était un fichier écrit à la main :

- `CACHE = "elsatia-tools-v6"` — version manuelle, à ne pas oublier ;
- `install()` ne préchargeait que ~30 URL de shell HTML ;
- aucun chunk JS, aucune feuille CSS, aucune icône n'était réamorcée ;
- `activate()` supprimait le cache précédent dès l'activation.

Conséquence : au changement de version, l'ancien cache disparaissait et le nouveau ne contenait
que du HTML. Un utilisateur passant hors ligne juste après la mise à jour retrouvait une
application sans ressources d'exécution.

## 2. Manifeste d'assets généré au build

`apps/tools/scripts/generate-service-worker.mjs` lit la sortie de `next build` — jamais le réseau,
jamais une liste de hash écrite à la main — et en dérive le manifeste :

| Source | Ce qui en est tiré |
| --- | --- |
| `.next/server/app/**/*.html` (mode `server`) | URL des routes prérendues, et par lecture du HTML les `src=`/`href=` en `/_next/…` réellement nécessaires |
| `.next/static/**` | tous les chunks et CSS, **y compris les chunks chargés à la demande** (modèles géométriques) invisibles dans le HTML |
| `.next/server/app/manifest.webmanifest.body` | `/manifest.webmanifest` |
| `public/**` | icônes, `icon.svg` |
| `out/**` (mode `export`) | équivalent pour le build natif, URL à slash final |

Exclusions déterministes et documentées : routes internes (`_not-found`, `_global-error`), pages de
recette `*-preview`, `.map`, charges Flight de l'export (`__next.*`, `<route>/index.txt`) — le
worker ne sert jamais de RSC, les précacher gonflerait le cache sans rien apporter.

Garde de confidentialité : `planPrecache()` **jette** si une URL du manifeste correspond à
`/api/`, `/auth/`, `supabase`, `.env`, `token`, `session` ou `.map`. Le build échoue plutôt que de
livrer un worker qui cacherait une donnée sensible. Aucune de ces familles n'existe aujourd'hui
dans le build (l'application n'a aucune route API).

Le générateur échoue également si un asset référencé par un shell est absent du build.

## 3. Version de cache

`CACHE_VERSION` = 16 hex du SHA-256 des couples (URL, SHA-256 du fichier) **des seuls assets
précachés**, triés, plus le SHA-256 du source du worker. Nom du cache : `elsatia-tools-<version>`.

- deux builds identiques ⇒ version identique, worker identique octet pour octet ;
- un seul octet modifié dans un asset précaché ⇒ nouvelle version ⇒ mise à jour déclenchée ;
- une modification de la logique du worker ⇒ nouvelle version.

Vérifié en recette réelle : après ajout puis retrait d'un fichier de `public/`, la version est
revenue exactement à `d21dfaeecf37b420`.

## 4. Source versionnée, artefact généré

- source : `apps/tools/service-worker/sw-tools.source.js` (versionné, linté, testé) ;
- artefact : `apps/tools/public/sw-tools.js`, **généré et git-ignoré** ;
- `npm run build` = `next build --webpack && node scripts/generate-service-worker.mjs --mode=server` ;
- `npm run build:native` fait de même en `--mode=export` et écrit aussi `out/sw-tools.js`.

Arbitrage : versionner l'artefact aurait salí l'arbre de travail à chaque build ; le générer sans
l'accrocher aux scripts de build risquait un déploiement sans worker (un 404 sur `/sw-tools.js`
désenregistre la PWA). Le câblage dans `build` et `build:native` — les deux seules commandes de
déploiement — supprime ce risque : si la génération échoue, le build échoue.

## 5. Ordre de mise à jour (invariant du lot)

```
install  → cache.addAll(CRITIQUES)      atomique, échec ⇒ install échoue
         → cache.add(OPTIONNELS)        best-effort, par lots de 8
activate → vérifie que TOUS les critiques sont présents
         → seulement alors : purge des caches elsatia-tools-* / elsatia-calculs-* obsolètes
         → clients.claim()
```

`skipWaiting()` a été **retiré**. Prendre la main au milieu d'une session purgerait le cache de la
version que la page ouverte utilise, et ses chunks chargés à la demande deviendraient introuvables
hors ligne — exactement le défaut que ce lot doit supprimer. La nouvelle version s'active à la
fermeture du dernier client. Une première installation (aucun worker précédent) s'active
immédiatement d'elle-même, `clients.claim()` étant conservé.

Purge : uniquement les clés préfixées `elsatia-tools-` ou `elsatia-calculs-`. Un cache étranger
n'est jamais supprimé (testé).

## 6. Stratégies réseau

| Requête | Stratégie | Délai |
| --- | --- | --- |
| `/_next/static/**` | cache-first (URL horodatées par hash de contenu, donc immuables) | aucun |
| navigation | network-first, repli cache, puis `/offline` | 3 000 ms |
| autre même origine | network-first, repli cache | 5 000 ms |
| RSC (`en-tête RSC` ou `?_rsc=`) | **non interceptée, non mise en cache** | — |
| non-GET, autre origine, `/api/`, `/auth/` | **non interceptée** | — |

Justification des délais, mesurée sur le build réel : le document `/` pèse 28 ko et ses assets
critiques 931 ko non compressés (le plus gros chunk : 223 ko). Sur un lien chantier dégradé
(~400 kb/s ≈ 50 ko/s, RTT ~2 s), le seul document demande déjà ~2,6 s. Au-delà de 3 s, servir la
copie du cache est sans risque : elle provient du **même build** que la version installée, donc
strictement équivalente. La réponse réseau continue en `waitUntil()` et réalimente le cache. Les
assets non immuables (manifeste, icônes) sont moins urgents : 5 s.

Les assets immuables ne prennent pas de délai du tout — le cache fait autorité, ce qui supprime
tout aller-retour réseau sur le chemin critique et rend la navigation instantanée hors ligne.

### RSC : correction d'un risque non listé mais réel

L'ancien worker mettait en cache les réponses RSC (`/projets?_rsc=abc`) puis résolvait les
navigations avec `caches.match(request, { ignoreSearch: true })` : une navigation vers `/projets`
pouvait donc recevoir une charge Flight à la place du document HTML. Les requêtes RSC sont
désormais entièrement ignorées ; quand elles échouent hors ligne, Next bascule de lui-même en
navigation complète (`fetch-server-response.js` : « If fetch fails handle it like a mpa
navigation »), que le worker sert depuis le cache. Vérifié en recette : 0 entrée `_rsc` en cache
après navigation.

## 7. Cache d'exécution

Le correctif du lot précédent est conservé et gardé par test : `response.clone()` est pris de
manière **synchrone**, avant tout `await`. Un test lit le corps de `cacheResponse` et vérifie que
`response.clone()` précède `caches.open` dans le code livré ; un autre rejoue le scénario complet
avec une doublure `Response` qui refuse `clone()` dès que le corps est consommé.

## 8. Taille de cache

Mesuré dans le navigateur, cache réel après installation :

- 105 entrées (21 critiques + 84 optionnelles) ;
- 3 011 ko (3 083 053 octets) ;
- quota accordé par le navigateur : 2 613 Mo ⇒ **0,11 % du quota** ;
- après navigation sur `/projets`, `/outils/pente`, `/` : **toujours 105 entrées**.

Le cache est borné par construction : tout le même-origine est du build statique, les réponses non
`ok` ne sont pas mises en cache, et les URL à query variable (RSC) sont exclues. Aucune politique
d'éviction n'est donc nécessaire ; en ajouter une introduirait un risque sans bénéfice. **P2** :
réévaluer si un jour l'application sert des ressources même-origine hors build.

## 9. Icônes

`apps/tools/scripts/generate-icons.mjs` rastérise les primitives du logo ELSATIA existant
(`public/icon.svg` : polygone du E, capsules du trait et des flèches) en sur-échantillonnage 4×4 et
encode un PNG 8 bits RGB **sans canal alpha** via `node:zlib`. Aucune dépendance externe, aucun
nouveau parti graphique. Un test vérifie que les tracés de `icon.svg` n'ont pas dérivé.

### `apple-touch-icon`

`icon-192.png` et `icon-512.png` ont des coins **transparents** ; iOS compose un `apple-touch-icon`
sur du noir, ce qui aurait entouré le logo de coins noirs. Un `apple-touch-icon.png` 180×180 opaque
et plein bord a donc été généré (composition identique à `icon.svg`, iOS appliquant lui-même
l'arrondi), et déclaré dans `layout.tsx`.

### `maskable`

Audit de `icon-512.png` contre la zone de sécurité normalisée (cercle centré de 80 % du côté,
rayon 204,8 px) :

- coins **transparents** (rx = 112) ⇒ non « full-bleed » ⇒ trous avec un masque carré ;
- pointe basse droite de la flèche à ~203 px du centre, +8 px de demi-épaisseur ⇒ ~211 px, **hors**
  du rayon de sécurité de 204,8 px.

L'asset n'est donc pas conforme. Solution retenue : option B du cahier des charges — génération
d'une vraie variante `icon-maskable-512.png`, fond opaque plein bord, logo reculé à 72 %
(rayon maximal ~152 px, très largement dans les 204,8 px). `purpose: "maskable"` pointe désormais
sur cette variante et a été retiré de `icon-512.png`. Un test échoue si un seul pixel hors du
cercle de sécurité n'est pas le fond ambre.

## 10. Frontière d'erreur

`src/app/error.tsx` et `src/app/global-error.tsx` : message clair, bouton « Recharger » (`reset()`),
retour accueil. Aucun système d'observabilité, aucun fichier de l'Atelier touché.

## 11. Indicateur hors connexion

`src/components/OfflineIndicator.tsx` : pastille « Hors connexion », `position: fixed`, haut centre,
`z-index: 60`, `pointer-events: none`. Placement en **haut** volontaire : la feuille de propriétés
de l'Atelier est fixée en bas en mobile (`viewport.module.css`, `z-index: 40`). Aucun composant
existant n'est modifié ; seules deux classes sont ajoutées à `globals.css`. Vérifié en navigateur
à 375 px.

## 12. Recette réelle (navigateur, service worker réel)

Serveur `next start` sur le build de production ; le « hors ligne » est simulé en **arrêtant le
serveur**, ce qui fait réellement échouer toutes les requêtes.

| Scénario | Résultat |
| --- | --- |
| A — version N installée, en ligne puis hors ligne | Rechargement complet depuis le cache : 518 règles CSS, 23 scripts, page hydratée |
| A′ — route précachée jamais visitée (`/outils/arche`) hors ligne | Servie, CSS + JS complets |
| A″ — route inconnue hors ligne | Page `/offline` servie |
| B — N+1 installée, non activée | `elsatia-tools-N` = 105 entrées **et** `elsatia-tools-N+1` = 106 entrées : aucune purge avant activation |
| B′ — N+1 activée (fermeture des clients) | Un seul cache restant, `elsatia-tools-N+1` ; hors ligne immédiat : CSS + JS complets à 430 px |
| C — precache N+1 en échec (asset critique introuvable) | Installation rejetée, aucun worker `waiting`, cache N intact (106 entrées), application toujours fonctionnelle hors ligne |
| D — installation neuve (SW désenregistré, caches vidés) | Une visite en ligne ⇒ 105 entrées ; serveur arrêté ⇒ accueil **et** `/atelier` (jamais visité) servis avec CSS + JS |
| Mobile | Vérifié à 375 px et 430 px |

## 13. Périmètre

Non touchés : `geometry/**`, interaction Atelier, contrats de tracing, Engine B, Supabase, GP,
Colors, site, Production.

## 14. Reste P1/P2

- **P1** — Pas de mécanisme d'invitation à recharger quand une version est en attente. Sans
  `skipWaiting()`, une PWA installée jamais fermée peut rester longtemps sur l'ancienne version.
  Un `registration.waiting` + bandeau « Nouvelle version disponible » est le lot suivant naturel.
- **P2** — Les charges RSC ne sont pas précachées : la navigation client hors ligne retombe en
  navigation complète (fonctionnelle, mais sans transition douce).
- **P2** — Politique d'éviction du cache d'exécution : inutile tant que tout le même-origine est du
  build statique.
- **P2** — `icon-192.png` / `icon-512.png` gardent leurs coins transparents pour l'usage `any`
  (correct) ; une refonte des icônes relève du lot ELSATIA-UI-V2.
