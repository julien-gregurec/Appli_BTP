# ELSATIA — Lot ciblé : RESERVES TURBOPACK SENTRY ISOLATION V1

Base : `claude/tools-reserves-postcss-isolation-v1`, code SHA
`e79864f8a88c062b1fdf87938e8616c1ce3998d1`, docs SHA `cc6d8e0`.
**Nouveau SHA exact après ce lot : `d6e3d7ee5ec4ce6e582473362b46a650e3f2c5a4`**
(court : `d6e3d7e`), branche `claude/reserves-turbopack-sentry-isolation-v1`.
1 seul fichier ajouté (8 lignes). `next.config.ts` de Reserves et de
Gestion Pro non modifiés. Non fusionné dans le train principal.

---

## ROOT CAUSE

`apps/reserves/next.config.ts` déclare :

```ts
turbopack: {
  root: fileURLToPath(new URL("../../", import.meta.url)), // racine du monorepo
},
```

Reproduit sans contourner `verify:public-env` (`ELSATIA_APPLICATION_ENV=local
npm run build`, variable passée uniquement en ligne de commande, jamais
commitée — mécanisme déjà utilisé dans le lot PostCSS précédent) :

```
Error: Module not found: Can't resolve '@sentry/nextjs'
Import trace:
  Instrumentation:
    ./sentry.server.config.ts
    ./sentry.edge.config.ts
    ./src/instrumentation.ts
```

Les trois chemins cités correspondent **exactement** aux fichiers réels de
**Gestion Pro, à la racine du dépôt** (`sentry.server.config.ts`,
`sentry.edge.config.ts`, `src/instrumentation.ts`) — vérifiés présents à ces
emplacements exacts avant toute correction. `apps/reserves` n'a pas ces
fichiers, ni la dépendance `@sentry/nextjs` (lockfile isolé). Root's
`src/instrumentation.ts` importe directement `@sentry/nextjs` et importe
dynamiquement `../sentry.server.config`/`../sentry.edge.config` selon le
runtime — c'est cette chaîne qui casse le build de Reserves.

---

## TURBOPACK ROOT

**Pourquoi Reserves a besoin de `turbopack.root` au niveau du monorepo :**
trois dépendances déclarées en `file:` dans `apps/reserves/package.json`,
toutes hors de `apps/reserves` :

```json
"@elsatia/application-access": "file:../../packages/application-access",
"@elsatia/platform-support-comms": "file:../../packages/platform-support-comms",
"@elsatia/email": "file:../../packages/email"
```

Usage réel confirmé (pas supposé) : `grep -rl` sur `src/` trouve ces paquets
importés dans au moins 9 fichiers de logique métier
(`src/lib/contexte.ts`, `src/lib/acces-reserves.ts`,
`src/lib/emails-reserves.ts`, `src/components/Coquille.tsx`, etc.). Sans
`turbopack.root` englobant `packages/`, Turbopack ne peut pas résoudre ces
imports hors de l'arborescence de `apps/reserves`.

**`turbopack.root` reste nécessaire et n'a pas été retiré.** Le correctif
retenu ne le touche pas : voir §FIX.

---

## FILE DISCOVERY

Fichiers de convention Next découverts automatiquement à la racine, avant ce
lot : `src/instrumentation.ts`, `src/instrumentation-client.ts`,
`sentry.server.config.ts`, `sentry.edge.config.ts` (ces deux derniers ne
sont pas eux-mêmes une convention Next — ils sont importés manuellement
*depuis* `src/instrumentation.ts` de Gestion Pro, ce qui explique pourquoi
ils apparaissent dans la trace d'import sans être eux-mêmes le point d'entrée
détecté).

**Lequel fuit réellement vers Reserves, prouvé par test empirique et pas
seulement supposé :**

| Fichier racine | Fuit vers Reserves ? | Preuve |
|---|---|---|
| `src/instrumentation.ts` | **Oui** | Cité explicitement dans l'erreur de build ; disparaît après ajout d'un fichier local homonyme (§FIX) ; le chunk compilé après correctif référence `apps_reserves_src_instrumentation_ts`, pas le fichier racine |
| `sentry.server.config.ts` / `sentry.edge.config.ts` | Indirectement, via l'import fait par `src/instrumentation.ts` | Disparaissent de la trace d'erreur dès que `src/instrumentation.ts` local existe — jamais chargés directement, seulement comme conséquence du premier |
| `src/instrumentation-client.ts` | **Non, aucune preuve de fuite** | Recherché explicitement dans le journal de build échoué (avant correctif) **et** dans le journal réussi (après) : zéro occurrence dans les deux. Aucun fichier local ajouté pour celui-ci, faute de preuve d'un besoin |

**Chemin de découverte avant :**
```
Reserves -> turbopack.root (racine monorepo) -> src/instrumentation.ts (Gestion Pro)
         -> importe @sentry/nextjs (absent de apps/reserves) -> échec
```

**Chemin de découverte après :**
```
Reserves -> convention instrumentation.ts : apps/reserves/src/instrumentation.ts
         (trouvé en premier, register() vide, aucun import Sentry)
         -> turbopack.root reste actif pour la résolution des 3 paquets file:,
            jamais pour la convention instrumentation.ts qui s'arrête ici
```

Même mécanisme « le plus proche gagne » que celui déjà prouvé pour la fuite
PostCSS du lot précédent : un fichier de convention présent localement
arrête la recherche avant qu'elle n'atteigne la racine, sans qu'il soit
nécessaire de modifier `turbopack.root` lui-même.

---

## FIX

Un seul fichier ajouté, `apps/reserves/src/instrumentation.ts` :

```ts
// Reserves does not use Sentry/GP's instrumentation. Deliberately empty:
// this file's only purpose is to exist here so Next's instrumentation
// convention resolves to this app instead of the monorepo root's
// (apps/reserves sets turbopack.root to the repo root for its file: linked
// packages, which otherwise causes Next to discover and load Gestion Pro's
// src/instrumentation.ts — and, through it, @sentry/nextjs, a dependency
// apps/reserves does not have).
export async function register() {}
```

Alternatives explicitement écartées, conformément aux interdictions :
- **`npm install @sentry/nextjs` dans Reserves** — aurait fait taire
  l'erreur sans corriger l'isolation ; aurait aussi exigé de copier/adapter
  les fichiers `sentry.*.config.ts` de Gestion Pro (configuration DSN,
  échantillonnage, etc.) pour une app qui n'a aujourd'hui aucun besoin
  prouvé de Sentry. Écarté.
- **Copie aveugle des fichiers d'instrumentation racine** — aurait fait de
  Reserves un consommateur silencieux de la configuration Sentry de Gestion
  Pro (même DSN, mêmes règles), sans décision produit sur le sujet. Écarté.
- **Modifier ou retirer `turbopack.root`** — casserait la résolution des 3
  paquets `file:` réellement utilisés (§TURBOPACK ROOT). Non envisagé
  sérieusement : la fuite ne vient pas du besoin d'accès aux paquets
  partagés, mais d'un effet de bord de la convention de découverte
  d'instrumentation, isolable localement sans toucher à `turbopack.root`.
- **Modifier Gestion Pro** — aucune nécessité : le problème est entièrement
  résolu côté Reserves, sans toucher un seul fichier racine. `git diff` sur
  `src/instrumentation.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
  à la racine : vide, confirmé après ce lot.

---

## BUILD

Testé avec le même mécanisme de déclaration locale que le lot précédent —
`ELSATIA_APPLICATION_ENV=local`, jamais écrit dans un fichier ni commité —
et rejoué deux fois indépendamment (une fois par moi, une fois par un
second passage de vérification, installation `npm` propre à chaque fois) :

| Contrôle `apps/reserves` | Résultat |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run test` (vitest) | **PASS** — 178/178 |
| `npm run build` (`ELSATIA_APPLICATION_ENV=local`) | **PASS** — build complet (29 à 31 routes selon la passe, `Proxy (Middleware)` inclus), zéro occurrence « sentry »/« instrumentation » dans le journal |

**Preuve de compilation, pas seulement un journal sans erreur** : le chunk
Turbopack compilé s'appelle
`apps_reserves_src_instrumentation_ts_<hash>._.js` (chemin du fichier local
ajouté, pas de la racine) et son contenu est littéralement le `register()`
vide. `.next/server/instrumentation.js` généré : zéro occurrence « sentry »
en recherche textuelle directe dans le fichier compilé.

---

## NON-REGRESSION

Rejoué, installation `npm` propre à chaque fois, deux fois indépendamment :

| App | Résultat | Instrumentation propre préservée ? |
|---|---|---|
| **Gestion Pro (racine)** | `next build` propre, 38/38 pages | **Oui, positivement vérifié** — `git diff` vide sur `src/instrumentation.ts`/`sentry.server.config.ts`/`sentry.edge.config.ts` ; le chunk compilé de Gestion Pro contient toujours du vrai code Sentry (`@sentry/nextjs`, `sentry_server_config_ts_*`, `globalThis._sentryNextJsVersion`) — à l'inverse du chunk vide de Reserves. Gestion Pro n'a pas perdu son instrumentation |
| **`apps/tools`** | Build propre, 47/47 pages (`NEXT_PUBLIC_TOOLS_ENV=local`) | N/A — Tools n'a pas d'instrumentation Sentry propre, non concerné |
| **`apps/colors`** | Build propre, 27/27 pages (`ELSATIA_APPLICATION_ENV=local`) | N/A — idem |
| **`apps/studio`** | Build propre, 12/12 pages + `Proxy (Middleware)` | N/A — idem, et son propre correctif PostCSS d'un lot antérieur reste intact |

Aucune app testée n'a changé de comportement par rapport à son état connu
avant ce lot. `workers/studio-video` non touché.

Lockfiles : root, `apps/reserves`, `apps/tools`, `apps/colors`
byte-identiques avant/après chaque `npm install` — zéro drift. Une
réinstallation de `apps/studio` effectuée par la vérification indépendante
a produit un churn de métadonnées `libc` sans changement de version
(comparé ligne à ligne) — écarté avant ce commit, comme lors des lots
précédents. **Aucune dépendance ajoutée, modifiée ou supprimée dans ce
lot.**

---

## OPEN RISKS

- Le mécanisme racine (convention `instrumentation.ts` résolue via
  `turbopack.root`, sans notion de monorepo) n'est pas corrigé au niveau de
  l'outillage — seul son symptôme sur Reserves est neutralisé, comme pour
  PostCSS. Toute future app de ce monorepo qui définirait `turbopack.root`
  vers un ancêtre commun sans posséder ses propres fichiers de convention
  (`instrumentation.ts`, `middleware.ts`/`proxy.ts`) resterait exposée au
  même risque.
- `apps/tools` n'a pas de `turbopack.root` étendu et n'a pas non plus de
  fichiers `file:` hors de son dossier à ce jour ; non concerné par ce
  mécanisme précis, mais non audité en détail ici (hors périmètre).
- `src/instrumentation-client.ts` (Sentry navigateur) : confirmé non
  affecté par cette fuite précise, mais son mécanisme de découverte
  spécifique côté client n'a pas été investigué en profondeur — si Reserves
  développait un jour un besoin de monitoring client, il faudrait vérifier
  séparément qu'aucune fuite symétrique n'existe.
- Reserves reste sans aucune télémétrie d'erreur (Sentry ou autre) — ce lot
  ferme un blocage de build, ce n'est pas une décision produit sur
  l'observabilité de Reserves. Si une décision est prise d'équiper Reserves
  de Sentry, ce fichier `instrumentation.ts` devra être réécrit avec son
  propre `register()`, sa propre dépendance `@sentry/nextjs`, sa propre
  configuration DSN — pas hérité de Gestion Pro.

---

## VERDICT

**`RESERVES TURBOPACK ISOLATED`**

Cause prouvée (pas supposée) : convention d'instrumentation Next, sous
Turbopack, résolue via `turbopack.root` plutôt que le dossier de l'app,
identique en nature à la fuite PostCSS déjà corrigée. Correctif minimal (un
seul fichier, 8 lignes), le plus local possible, sans toucher
`turbopack.root` (toujours nécessaire et vérifié fonctionnel pour les 3
paquets `file:`), sans dépendance ajoutée, sans copie aveugle de
configuration Sentry, sans toucher Gestion Pro. Preuve de compilation
directe (nom de chunk, contenu du fichier compilé), pas seulement un
journal de build sans erreur. `apps/reserves` est vert de bout en bout
(typecheck, lint, 178 tests, build). Non-régression prouvée sur Gestion Pro
(instrumentation Sentry positivement confirmée intacte), Tools, Colors et
Studio.

Comme pour le lot Studio, ce n'est pas encore un
`RESERVES PREVIEW CANDIDATE LOCALLY` au sens plein : ce lot ferme
uniquement le blocage de build. Aucune vérification en conditions Preview
réelles (Auth, Storage, multi-tenant) n'a été faite ni simulée ici.
