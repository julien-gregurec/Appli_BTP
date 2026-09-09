# ELSATIA Gestion Pro — PWA (phase D)

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1` · Base `52d3282` · 2026-09-09

## 1. Le principe qui commande tout le reste

> **Aucune donnée métier privée n'entre jamais dans un cache partagé.**

Un cache de service worker est indexé par **origine**, pas par session. Deux comptes de deux
entreprises différentes sur le même téléphone partagent donc le même cache. Y déposer une
réponse d'API, c'est offrir les données de l'entreprise A au compte de l'entreprise B qui se
connectera ensuite — **sans aucune faute de RLS, sans trace côté serveur, et sans que personne
ne s'en aperçoive**.

Ce principe existait déjà dans le service worker d'origine. Il est conservé, explicité, et
**désormais protégé par des tests**.

Les données de terrain accessibles hors ligne ne passent donc **pas** par le cache : elles
iront dans IndexedDB, dans une base dont le nom porte l'identité de son propriétaire (phase E).
C'est la seule voie possible : le cache du service worker n'a aucune notion d'identité,
IndexedDB permet d'en fabriquer une.

## 2. Ce qui a changé

### 2.1 La mise à jour n'est plus imposée

**Avant** : `skipWaiting()` à l'installation. Le service worker était remplacé sous les pieds
d'une page ouverte, sans prévenir.

**Après** : la version installée **attend**. `MiseAJourApplication` affiche une bannière
« Une nouvelle version est prête · Vos saisies en cours sont conservées », avec « Plus tard »
et « Mettre à jour ». Seul le geste de l'utilisateur envoie `APPLIQUER_MISE_A_JOUR`.

Sur un poste de bureau, un remplacement silencieux est anodin. Sur un chantier, il peut
survenir au milieu d'une saisie de note de frais. Une application de terrain qui se recharge
toute seule pendant qu'on l'utilise perd la confiance de celui qui s'en sert.

Le rechargement suit `controllerchange` plutôt qu'un `location.reload()` direct : recharger
avant que le nouveau service worker n'ait pris la main servirait à nouveau l'ancienne version,
et la bannière reviendrait — en boucle.

### 2.2 Le précache survit à l'échec d'une ressource

**Avant** : `cache.addAll(PRECACHE)`. Cette opération est **atomique** — une seule ressource en
échec (un 404 passager, un déploiement en cours) fait échouer l'installation entière, et le
service worker n'est **jamais activé**. L'application perdait alors tout son hors-ligne à
cause d'une requête malchanceuse.

**Après** : chaque ressource est déposée indépendamment, échec toléré. Mieux vaut un précache
partiel qu'aucun service worker.

### 2.3 L'optimiseur d'images de Next est exclu explicitement

`/_next/image?url=…` sert des images **optimisées** depuis une URL passée en paramètre. Son
chemin ne porte aucune extension, il échappait donc déjà au test de mise en cache — par
accident. C'est maintenant écrit, pour qu'un futur assouplissement du test ne mette pas en
cache l'aperçu d'un document privé.

### 2.4 Purge des caches à la déconnexion

Le cache statique ne contient rien de personnel — c'est tout l'objet de ce fichier. Il est
malgré tout vidé à la déconnexion, **par principe** : « aucune donnée de la session précédente
ne survit » doit être vrai *sans avoir à faire confiance à l'exactitude d'un filtre*.

Le coût est un rechargement des ressources statiques. Le bénéfice est une règle qu'on peut
affirmer sans réserve.

Le message part sans attendre de réponse : la déconnexion se termine par une redirection, la
page ne sera plus là pour recevoir un accusé. Le service worker, lui, survit à la navigation
et achève sa purge (`event.waitUntil`).

### 2.5 Un `short_name` qui tient sur un écran d'accueil

| Avant | Après |
|---|---|
| `ELSATIA Gestion Pro` | `Gestion Pro` |

iOS et Android tronquent autour de 12 caractères : « ELSATIA Gestion Pro » devenait
« ELSATIA Ges… », qui **ne distingue plus Gestion Pro des autres applications ELSATIA**
installées sur le même téléphone.

### 2.6 Raccourcis d'écran d'accueil

Trois raccourcis (appui long sur l'icône) : **Pointage**, **Note de frais**, **Chantiers**.

Ce sont les gestes que l'on fait debout, souvent une main occupée, plusieurs fois par jour —
et ce sont aussi les trois qui ouvriront hors ligne. Volontairement limité à trois : Android
n'en affiche que quatre au mieux, et une liste trop longue transforme un raccourci en menu,
donc en temps perdu.

Ajout également de `orientation: "portrait-primary"` : une application de terrain se tient
d'une main.

### 2.7 Écrans de lancement iOS — 12 tailles générées

Android fabrique son écran de lancement seul, à partir de `background_color` et des icônes du
manifeste. **iOS, non** : sans balises `apple-touch-startup-image`, une PWA installée affiche
un **rectangle blanc** pendant tout le démarrage. Sur un téléphone de chantier qui n'est pas
un modèle récent, cela dure assez longtemps pour qu'on croie l'application plantée et qu'on la
relance.

iOS choisit l'image par une media query qui doit correspondre **exactement** aux dimensions
logiques et à la densité de l'appareil. Une taille manquante, et le blanc revient — d'où une
liste explicite plutôt qu'une image unique redimensionnée.

`scripts/mobile/generer-ecrans-lancement.mjs` produit 12 images (360 Ko au total) couvrant
iPhone SE à iPhone 16 Pro Max et iPad 10.2 à iPad Pro 12.9 — dont les largeurs 375, 390, 430,
810 et 1024 px du périmètre de recette. Les images sont **versées au dépôt** : déterministes,
légères, et les regénérer à chaque build ferait dépendre le build de `sharp`.

## 3. Tests livrés

**8 tests d'invariants** sur `public/sw.js`, portant la note de service qui les justifie.

Un service worker n'est pas chargeable par Vitest : ces tests **lisent** le fichier et
vérifient que ses invariants y sont toujours écrits. C'est grossier, et le fichier l'assume :
cela ne prouve pas que le service worker se comporte bien — seule la mesure navigateur le fera.
Cela empêche ce qui arrive vraiment : quelqu'un qui, dans six mois, « accélère l'application »
en mettant les réponses d'API en cache. L'échec du test est là pour amener la conversation
avant la fusion, pas après l'incident.

| Invariant éprouvé |
|---|
| Ignore toute requête qui n'est pas un `GET` |
| Ignore tout ce qui n'est pas de la même origine |
| Exclut explicitement `/_next/image` |
| Navigations en réseau d'abord, **jamais** mises en cache |
| Liste blanche sans aucun chemin d'API |
| **Un seul** `skipWaiting()`, et derrière le message de la page |
| Sait vider ses caches sur demande |
| Survit à l'échec d'une ressource de précache |

### Un détail méthodologique qui vaut d'être noté

Les deux premières versions de ces tests **échouaient sur mes propres commentaires** : le
service worker cite `addAll` et `skipWaiting()` pour expliquer pourquoi il ne les emploie pas.
Le test a été corrigé pour retirer commentaires et littéraux de chaîne avant d'asserter.

Un test qui se déclenche sur une explication est un test qui décourage d'expliquer.

**Total phase C + D : 31 tests unitaires, tous verts.**

## 4. Ce qui n'est pas fait

- **Aucune mesure navigateur** : installation réelle, écran de lancement réel, bannière de mise
  à jour réelle → phase H.
- **Pas de `Background Sync`** : décidé en phase B pour que iOS et Android suivent la même
  règle.
- **Pas de capture d'écran de magasin** dans le manifeste (`screenshots`) : utile pour la
  fiche Play Store, hors périmètre tant qu'aucune publication n'est décidée.
