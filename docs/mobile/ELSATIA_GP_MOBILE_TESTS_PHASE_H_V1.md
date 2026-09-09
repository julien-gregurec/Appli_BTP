# ELSATIA Gestion Pro — Tests et mesures (phase H)

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1` · Base `52d3282` (ledger 278) · 2026-09-09

## 1. Conditions de mesure — à lire avant les résultats

| Moment | `load average` | Conteneurs Docker |
|---|---|---|
| Début du lot | 14,15 | ~20 |
| Pendant le build | 23,98 | 60 |
| Fin de campagne | 10,77 | 60 |

La machine était **saturée** pendant toute la durée du lot, par des piles Supabase appartenant
à d'autres travaux. Deux conséquences assumées :

1. **Aucune pile Supabase supplémentaire n'a été démarrée.** Le décor du Train V3 déjà en
   service (`supabase_db_elsatia-train-v3-e2e`, ledger 278) a servi aux interrogations de
   schéma, en lecture seule.
2. **Aucune matrice Playwright n'a été lancée.** Les échecs E2E du Train V3 s'étaient révélés
   être de la saturation, pas des défauts ; rejouer la même erreur n'aurait rien appris.

**Aucun délai global n'a été modifié pour masquer la contention.** C'était explicitement
interdit, et c'était surtout inutile : les échecs constatés se sont révélés être exactement de
la contention, ce qu'un délai plus long aurait caché au lieu de montrer.

## 2. Résultats sur arbre figé

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit --incremental false` | **0** |
| `eslint` (dépôt complet) | **0 erreur**, 4 avertissements préexistants |
| `vitest run` (Gestion Pro) | **1 780 tests** — voir § 3 |
| `next build` | **Compilé avec succès**, 4,4 min |
| `verify:migrations` | **278 migrations valides** |
| `verify:secrets` | **1 750 fichiers, aucun secret** |
| `git diff --check` | **Propre** |
| Migrations ajoutées par le lot | **0** |

## 3. Les échecs de suite complète étaient de la contention — démonstration

Deux exécutions successives de la suite complète ont produit **des échecs différents** :

| Exécution | Fichiers en échec |
|---|---|
| 1 | `brand.test.ts`, `brand-visible.test.ts`, `xlsx.test.ts` |
| 2 | `xlsx.test.ts`, `stripe/boutique/webhook/route.test.ts` |

Un jeu d'échecs qui **change d'une exécution à l'autre** n'est pas un défaut fonctionnel.
Tous portaient le même message : `Test timed out in 5000ms`.

**Rejoués isolément, sous la même charge, tous passent :**

```
vitest run src/lib/brand.test.ts src/lib/brand-visible.test.ts src/lib/xlsx.test.ts
  → 3 fichiers, 11 tests, tous verts

vitest run src/app/api/stripe/boutique/webhook/route.test.ts src/lib/xlsx.test.ts
  → 2 fichiers, 7 tests, tous verts
```

Aucun de ces fichiers n'est touché par le lot (`git diff 52d3282..HEAD` : aucun).

**Réserve honnête** : la suite complète n'a donc **jamais été verte en une seule passe** sur
cette machine. Elle doit être rejouée sur un poste au repos avant fusion. Les deux échecs de
la première exécution, eux, étaient bien les miens — voir § 5.

## 4. Mesure navigateur — ce qui a été mesuré, et ce qui ne l'a pas été

**Mesuré**, sur le build de production servi localement (port 3190) :

| Page | 375 | 390 | 430 | 768 | 1024 |
|---|---|---|---|---|---|
| `/login` | 0 px | 0 px | 0 px | 0 px | 0 px |
| `/offline` | 0 px | 0 px | 0 px | 0 px | 0 px |

(débordement horizontal, en pixels)

Également mesuré sur `/login` à 375 px et 768 px :

- **commandes sous 44 px : aucune** (boutons et liens présentés comme boutons) ;
- **taille de police des champs : 16 px** sur les trois champs ;
- **12 balises `apple-touch-startup-image`** présentes ;
- `theme-color` = `#0d1b2a`, `viewport` avec `viewport-fit=cover`.

Contrôles de service, sans session :

| Ressource | Attendu | Mesuré |
|---|---|---|
| `/sw.js` | 200, `application/javascript` | **200**, `application/javascript; charset=UTF-8` |
| `/manifest.webmanifest` | 200 | **200** |
| `/.well-known/apple-app-site-association` | 200 | **200**, 0 redirection |
| `/.well-known/assetlinks.json` | 200 | **200**, 0 redirection |
| `/dashboard` (témoin) | redirection | **307** |

**Non mesuré** : les six parcours terrain authentifiés. Aucun fichier `.env.local` n'existe
dans le dépôt, et les clés Supabase locales du décor E2E n'ont pas été retrouvées — la recette
du Train V3 les avait reçues par variables exportées dans le shell de l'opérateur. Le serveur
de mesure a donc tourné sur des valeurs de remplissage, qui suffisent aux pages publiques et
pas aux pages authentifiées.

**C'est la principale lacune de ce lot**, et elle est portée en réserve du rapport final.

## 5. Trois défauts trouvés PAR la mesure

Ces trois-là n'auraient pas été trouvés par lecture de code. Ils justifient à eux seuls la
campagne, même partielle.

### 5.1 `/sw.js` répondait 307 vers `/login` — défaut préexistant

Le `matcher` du proxy excluait `manifest.webmanifest` mais **pas** `sw.js`, dont l'extension
`.js` ne figure pas non plus dans la liste d'extensions exclues.

Conséquence : un service worker qui reçoit une page HTML au lieu de son script **ne
s'enregistre pas**. Et l'échec est **silencieux** — `navigator.serviceWorker.register()` est
déjà entouré d'un `.catch()`. L'application perdait donc tout son hors-ligne sans le dire, dès
que la session manquait ou expirait.

Corrigé, et gardé par un test.

### 5.2 Les pages non authentifiées ne recevaient aucune règle mobile — défaut introduit par ce lot

Les règles de seuil tactile et de taille de champ étaient portées par `.app-shell`. Or
`/login`, `/signup`, `/mfa`, `/mot-de-passe-oublie` et `/nouveau-mot-de-passe` vivent **hors
du shell**.

Mesuré sur `/login` à 375 px avant correction : **champs à 14 px** (déclencheur du zoom
automatique de Safari iOS) et **11 commandes sous 44 px**.

C'est-à-dire que **l'écran de connexion — le premier que voit un salarié sur son téléphone —
était le moins bien traité de l'application.** Les règles universelles ont été remontées au
niveau du document. Après correction : 16 px partout, aucune commande sous 44 px.

### 5.3 La page hors ligne affichait « Gestion Pro**a** besoin » — défaut préexistant

Repéré sur une capture, puis **vérifié dans le DOM** plutôt que sur l'image : les codes de
caractères donnent `P r o a`, l'espace est bien absent.

Quand une interpolation JSX ouvre une ligne, l'espace qui la suit peut être absorbé au
découpage des enfants. Corrigé par un `{" "}` explicite, insensible à la mise en forme du
source.

Le même motif existe sur une dizaine d'autres pages (`/aide`, `/connecteurs`,
`/parametres/import`…). Elles sont **authentifiées, donc non mesurées** : le point est consigné
en réserve, non corrigé à l'aveugle.

## 6. Une décision revenue en arrière

J'avais raccourci `NOM_COURT_PWA` de « ELSATIA Gestion Pro » à « Gestion Pro », parce qu'iOS et
Android tronquent ce libellé autour de 12 caractères — « ELSATIA Ges… » ne distingue plus
Gestion Pro des autres applications ELSATIA du même téléphone.

Deux tests existants ont échoué : `brand.test.ts` et `brand-visible.test.ts`, qui verrouillent
explicitement « **les noms officiels** ».

**J'ai remis la valeur officielle.** Le nommage de la marque relève d'un arbitrage commercial —
d'autant plus dans le contexte du dépôt INPI en cours — et pas d'une correction technique prise
au passage. Le constat est consigné dans le code et remonté au rapport ; la décision revient à
Julien.

## 7. Tests livrés par le lot

**55 tests unitaires**, tous verts, sur les modules purs :

| Fichier | Tests | Objet |
|---|---|---|
| `identite-locale.test.ts` | 8 | Isolation par entreprise et par utilisateur |
| `brouillon.test.ts` | 10 | Conservation de saisie, péremption, quota, corruption |
| `purge-locale.test.ts` | 4 | Purge sélective, aucune clé sautée |
| `service-worker-invariants.test.ts` | 8 | Invariants de cache |
| `contrat.test.ts` (hors ligne) | 20 | États, transitions, idempotence, identité |
| `liens-profonds.test.ts` | 5 | Association d'application, exclusions du proxy |

**Tests E2E écrits, prêts à jouer, non exécutés** — `tests/e2e/mobile-v1-terrain.spec.ts` :
débordement aux 5 largeurs sur les 6 parcours, cibles tactiles, isolation inter-entreprises,
manifeste, fichiers d'association. Marqués `@responsive`, ils s'exécutent sur
`iphone-webkit`, `android-chromium` et `tablet-webkit`.

## 8. Commande pour lever la réserve de mesure

Sur un poste au repos, avec les clés du décor local :

```bash
# 1. Décor E2E (ledger 278) — déjà en service sur ce poste, port 60321
export E2E_SUPABASE_URL="http://127.0.0.1:60321"
export E2E_SUPABASE_ANON_KEY="<clé publique du décor local>"

# 2. Application sous test
export NEXT_PUBLIC_SUPABASE_URL="$E2E_SUPABASE_URL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$E2E_SUPABASE_ANON_KEY"
npx next build && npx next start -p 3100 &

# 3. Recette mobile
export E2E_BASE_URL="http://127.0.0.1:3100"
npx playwright test tests/e2e/mobile-v1-terrain.spec.ts
```

**Mesurer la charge avant de lancer.** Au-delà d'un `load average` de 8 sur ce poste, les
résultats ne veulent rien dire.
