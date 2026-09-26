# ELSATIA-TOOLS-PWA-UPDATE-UX-AND-NETWORK-RESILIENCE-V1

Lot P1 faisant suite à `ELSATIA-TOOLS-PWA-ASSET-PRECACHE-UPDATE-ROBUSTNESS-V1`.
Base : `4b60cf2cd06380b978e77078db75d998192d6357` — branche `feat/tools-pwa-update-ux-resilience-v1`.
Aucun déploiement Production.

## 1. Défaut corrigé

Le lot précédent avait rendu la mise à jour du service worker sûre : le nouveau worker ne prend
jamais la main au milieu d'une session, il attend la fermeture des derniers clients.

C'est exactement ce qui crée le P1 restant : **une PWA installée qui reste ouverte plusieurs jours
ne ferme jamais ses clients**. Le worker N+1 reste indéfiniment en `waiting`, et l'utilisateur n'a
aucun moyen de savoir qu'une nouvelle version existe, ni de l'activer.

Avant ce lot, `ServiceWorkerRegister` se réduisait à un `register().catch()` : aucune lecture de
`registration.waiting`, aucun abonnement à `updatefound` ni à `controllerchange`, aucune UI.

## 2. Ce que le lot ajoute

| Fichier | Rôle |
| --- | --- |
| `src/lib/pwa/update-controller.ts` | Détection et activation, sans DOM — le cœur testable |
| `src/lib/pwa/flush-local-state.ts` | Mise à l'abri du travail local avant rechargement |
| `src/components/PwaUpdateBanner.tsx` | Bannière, présentation pure et sans hook |
| `src/components/ServiceWorkerRegister.tsx` | Branchement DOM : enregistrement + état + marqueur CSS |
| `service-worker/sw-tools.source.js` | Handler `message` → `SKIP_WAITING` |
| `src/app/globals.css` | Style de la bannière, cohabitation avec la pastille hors connexion |

## 3. Détection — et pourquoi pas de bannière à la première installation

La bannière n'est proposée que si `navigator.serviceWorker.controller` existe, c'est-à-dire si la
page est **déjà contrôlée** par un worker. Sans contrôleur il n'y a pas d'« avant » : c'est une
première installation, l'utilisateur a déjà la dernière version sous les yeux et n'a rien à décider.

Deux chemins d'entrée, tous deux soumis à cette règle :

1. **Au chargement** — `registration.waiting` non nul : un worker attend depuis une session
   précédente (le cas « PWA ouverte depuis des jours » qui motive le lot).
2. **En cours de session** — `updatefound`, puis `statechange` du worker `installing` jusqu'à
   l'état `installed`. L'état `installed` peut survenir avant l'abonnement : il est rattrapé.

## 4. Activation — quatre temps, jamais spontanée

Le worker en attente ne reçoit `skipWaiting()` **que** sur clic explicite :

1. mise à l'abri du travail local (§6) ;
2. `waiting.postMessage({ type: "SKIP_WAITING" })` ;
3. attente de `controllerchange` ;
4. un **seul** rechargement, verrouillé par un drapeau `reloaded`.

Côté worker, l'unique appel à `self.skipWaiting()` vit dans le handler `message` et n'accepte que
`SKIP_WAITING` (forme objet ou chaîne). Tout autre message est ignoré : ce canal ne prend d'ordre
de personne d'autre que la page. `install` et `activate` ne l'appellent jamais.

**Délai d'expiration (12 s).** Si `controllerchange` n'arrive pas, on revient à « mise à jour
disponible » — surtout pas un rechargement à l'aveugle, qui ne changerait rien et ferait clignoter
l'application. Un nouveau clic reste possible.

**Aucune boucle de rechargement n'est structurellement possible** : le rechargement exige un clic,
et le drapeau `reloaded` n'est jamais remis à zéro dans la vie de la page.

## 5. « Plus tard »

La bannière disparaît pour la session. Le refus est gardé **en mémoire seulement**, associé au
worker refusé — rien n'est écrit en `localStorage` ni en `sessionStorage` (vérifié en recette).

Conséquences voulues :

- à la prochaine ouverture, si le worker est toujours en attente, la bannière revient ;
- une version **encore plus récente** repropose la bannière immédiatement, même après un refus ;
- « Plus tard » dans un onglet ne masque pas la bannière de l'autre.

## 6. Sûreté Atelier — sans toucher à l'Atelier

**Aucun fichier de l'Atelier n'est modifié, et aucun module interne n'est atteint.** Forcer un
flush en allant chercher un contrôleur privé serait exactement ce que l'invariant du lot interdit.

`flushLocalState()` emprunte le seul contrat **public** déjà en place :
`src/lib/tracing/use-atelier-autosave.ts` (et `browserLifecycleBinder`) écoute `pagehide` sur
`window`, y écrit d'abord le pointeur de brouillon (`localStorage`, synchrone) puis déclenche
`flush()` vers IndexedDB. Émettre `pagehide` revient donc à emprunter le chemin déjà testé par
lequel passent la fermeture d'onglet et la mise en arrière-plan de la PWA.

Pourquoi l'émettre **avant** le rechargement plutôt que se contenter du `pagehide` naturel qu'il
provoquera : l'écriture IndexedDB est asynchrone. Émise en amont (avec 150 ms de marge), elle
dispose d'un vrai délai pour aboutir ; émise par la navigation, elle court contre la destruction du
document. Le `pagehide` naturel reste le filet, et l'opération est idempotente — `flush()` sans
état en attente retourne immédiatement.

Les autres abonnés à `pagehide` / `visibilitychange` dans l'application (`use-plan-viewport`) ne
font que remesurer ; aucun ne navigue ni ne détruit quoi que ce soit.

Un abonné défaillant n'empêche pas la mise à jour : l'erreur est signalée puis ignorée — bloquer
laisserait l'utilisateur devant un bouton mort (vérifié en recette, §12).

## 7. Multi-onglets — garde et limite

Un service worker standard n'offre que `controllerchange`, qui ne dit **pas qui** a demandé
l'activation. La garde `requested`, locale à chaque onglet, en tire la règle :

- l'onglet qui a cliqué recharge ;
- **un onglet qui n'a pas cliqué ne recharge jamais** — un clic ailleurs ne fait pas sauter un
  tracé en cours ici. Sa bannière reste affichée : il rechargera quand son utilisateur le décidera.

**Limite assumée.** Entre l'activation et son propre rechargement, l'onglet passif exécute du code
de la version N servi par un worker N+1 dont le cache ne contient plus les assets de N. Un chunk
chargé à la demande pendant cette fenêtre peut donc échouer. C'est le comportement inhérent au
modèle service worker, pas un défaut de ce lot ; la bannière persistante est précisément
l'invitation à refermer cette fenêtre. Aucune API standard ne permet de faire mieux sans imposer un
rechargement non consenti — ce que le lot refuse par principe.

## 8. Hors ligne

`SKIP_WAITING` est purement local : **aucun réseau n'est requis**. La bannière peut donc être
affichée et l'action menée à bien hors connexion. C'est sûr par construction :

- le worker en attente a terminé son précache (sinon `install` aurait échoué) ;
- `activate` ne purge les caches précédents qu'après avoir vérifié son propre précache critique ;
- le rechargement est servi par le nouveau cache, complet.

Vérifié serveur réellement arrêté (§12) : activation, rechargement unique, navigation `/projets`
servie hors ligne avec sa CSS, cache de 105 entrées intact.

## 9. Cohabitation des deux repères globaux

La pastille « Hors connexion » (haut, centrée, z-index 60) et la bannière (haut, z-index 70)
occupaient la même zone. `OfflineIndicator` n'est pas modifié : la bannière pose un marqueur et une
variable de hauteur sur `body`, et la CSS descend la pastille sous la bannière.

La hauteur est **mesurée** et non devinée — le texte passe d'une à deux ou trois lignes selon la
largeur, et un décalage fixe finit toujours par se chevaucher (constaté en recette : un premier
essai à 96 px se chevauchait de 12 px à 375 px). Le `max(var, 118px)` garantit qu'une mesure
absente ou périmée ne peut pas produire de chevauchement : dans le doute la pastille descend, elle
ne remonte jamais.

## 10. Accessibilité

- Bannière `role="status"` + `aria-live="polite"` : annoncée sans interrompre le lecteur d'écran.
- `aria-label` explicite sur chaque bouton, `aria-busy` pendant l'activation.
- **Le focus n'est jamais volé** : ni `autoFocus`, ni `tabIndex` imposé, ni appel à `focus()`.
- Pas d'overlay, pas de `role="dialog"`, pas de piège à focus : l'application n'est pas bloquée.
- Cibles tactiles de 44 px de haut.

## 11. Mobile

Ancrage en haut : le bas est déjà occupé en mobile par la feuille basse de l'Atelier (z-index 40).
Vérifié à 375, 430, 768 et 1280 : aucun débordement horizontal, bannière entièrement dans le
viewport, aucun chevauchement avec la pastille hors connexion. Sur l'écran Atelier, la bannière ne
couvre que le titre — canevas, outils et contrôles restent visibles et atteignables.

## 12. Recette service worker réelle

Builds successifs servis par `next start` sur une même origine, service worker réel, navigateur
réel. Versions distinctes obtenues en modifiant un asset précaché.

| Étape | Attendu | Observé |
| --- | --- | --- |
| Première installation (A) | pas de bannière | pas de bannière, 105 entrées précachées, page contrôlée |
| Déploiement B, `update()` | B en attente, bannière | bannière affichée, **les deux caches intacts** (105 + 105) |
| « Plus tard » | rien n'est activé | bannière masquée, B toujours `waiting`, `localStorage`/`sessionStorage` vides |
| Réouverture | bannière revient | bannière revient |
| « Mettre à jour » | activation + 1 rechargement | `navigation: ["reload"]`, contexte JS détruit, ancien cache purgé, B seule active |
| Second onglet ouvert | pas de rechargement | marqueur `window` intact, `navigation: ["navigate"]`, bannière conservée |
| Serveur **arrêté** (hors ligne) | bannière affichée | bannière affichée, sonde réseau `Failed to fetch` |
| « Mettre à jour » hors ligne | activation sans réseau | activée, 1 rechargement, page rendue, cache 105 entrées |
| Navigation hors ligne après mise à jour | shell + CSS servis | `/projets` rendue, feuille de style chargée |
| Abonné `pagehide` défaillant | mise à jour aboutit, pas d'écran blanc | mise à jour aboutie, 2 812 caractères rendus, aucune frontière d'erreur |

## 13. Périmètre

Non touchés : `geometry/**`, implémentation Atelier, Engine B, tracing, Supabase, GP, Colors, site,
Production.
