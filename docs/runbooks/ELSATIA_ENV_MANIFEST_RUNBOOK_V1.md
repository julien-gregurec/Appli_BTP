# ELSATIA — Manifeste d'environnement : mode d'emploi

Source unique : [`config/env-manifest.json`](../../config/env-manifest.json) (schéma : `config/env-manifest.schema.json`).
Contrôle : `scripts/check-env-manifest.mjs`. Tests : `scripts/check-env-manifest.test.mjs`.

**Règle.** Une variable d'environnement ne peut plus apparaître dans une application ELSATIA sans être déclarée, classifiée et contrôlée. Le manifeste ne contient **jamais de valeur** : que des noms, des règles et des descriptions.

---

## 1. Pourquoi `config/env-manifest.json`

Le dépôt a déjà un dossier `config/` pour les contrats machine (`config/stripe-prices.test.json`) et l'habitude d'un manifeste unique contrôlé par script (`verify:stripe-prices`, `verify:migrations`). Le manifeste suit cette convention : un JSON versionné, un script `verify:*` sans dépendance, branché dans la CI. Aucune convention plus adaptée n'existait.

## 2. Ajouter, modifier ou retirer une variable

1. Ajouter l'entrée dans `variables` de `config/env-manifest.json` (tous les champs obligatoires du schéma).
2. Si la variable est attendue dans les gabarits (`example_required: true`), l'ajouter avec un **placeholder sûr** (vide pour un secret ou une URL de déploiement) dans le ou les `.env.example` de l'application. Le contrôle indique lequel.
3. `npm run verify:env-manifest` doit passer, puis `npm run test:env-manifest`.

| Champ | Sens |
|---|---|
| `applications` | Unités qui lisent la variable : `gestion_pro`, `platform` (packages/*), `colors`, `tools`, `reserves`, `studio`, `studio_worker`, `ops_scripts`, `e2e`, `ci`. Boutique et DOE n'ont pas d'application propre : leurs variables sont sous `gestion_pro` (champ `feature`). |
| `required` / `required_when` | `required: true` = obligatoire dans **chaque** environnement listé. Conditionnelle : `required: false` + `required_when` en clair. |
| `environments` | `local`, `test`, `preview`, `production` où la variable s'applique. |
| `forbidden_in` | Environnements où la variable doit être **absente ou fausse** (modes de démonstration, diagnostics). |
| `visibility` | `public` (navigateur : préfixe `NEXT_PUBLIC_` ou `public_via: next_config_env`) ou `server`. |
| `secret` | Un secret est toujours `server`. Un nom qui ressemble à un secret (`SECRET`, `TOKEN`, `API_KEY`, `SERVICE_ROLE`…) **doit** être `secret: true`. |
| `build_time` / `runtime` | Lue à la compilation (inlinée, figée) et/ou à l'exécution. |
| `fail_mode` | `closed` (absent = fonction éteinte ou erreur), `open` (absent = fonction active), `default` (repli documenté), `none`. |
| `deprecated` / `replacement` / `migration` | Alias legacy : la migration est obligatoire. Le nom canonique liste l'alias dans `accepted_aliases`. |
| `dr_critical` / `dr_note` | Secret dont la perte est irrécupérable : registre DR. Réservé aux secrets. |
| `flag` | Obligatoire pour toute variable `feature_flag` : valeur attendue par environnement, comportement si absente, propriétaire, criticité. |
| `url_class` | Toute variable d'URL : contrôlée contre `localhost` / adresses privées en preview et production. |
| `decision` | `DECISION_REQUIRED:<id>` : divergence qui dépend d'une décision produit. Signalée à chaque exécution, jamais tranchée par le script. |

## 3. Les trois modes

```bash
# 1. Dépôt (CI et poste dev) — code ↔ manifeste ↔ gabarits. Aucune valeur, aucune installation.
npm run verify:env-manifest [-- --verbose] [-- --json] [-- --rev <sha>] [-- --fail-on-decision]

# 2. Preflight de déploiement (opérateur) — un environnement fourni ↔ manifeste.
node scripts/check-env-manifest.mjs --preflight --environment production --app gestion_pro --env-file <fichier>
#    Sans --env-file : lit les variables du processus. Ne se connecte à rien.

# 3. Avant build — npm exécute `prebuild` avant `build`. Actif SEULEMENT sur un vrai build Vercel
#    (VERCEL_ENV=preview|production), ignoré partout ailleurs.
```

`--rev <sha>` analyse une autre révision Git : c'est ainsi que le manifeste a été validé contre le train V3, Studio, Réserves V6, la branche Stripe Test et le GP convergé.

### Ce que le mode dépôt refuse (échec de la CI)

| Code | Cas |
|---|---|
| `ENV-UNKNOWN` | Variable lue par le code (directement, par `environnement.X`, ou par nom cité en table) et absente du manifeste. |
| `ENV-APP-MISMATCH` | Lue par une application qui n'est pas déclarée pour elle. |
| `ENV-DYNAMIC-ACCESS` | `process.env[x]` non justifié : il cacherait une variable au contrôle. |
| `ENV-SERVER-VAR-IN-CLIENT` | Variable serveur lue dans un composant `"use client"`. |
| `ENV-SERVICE-ROLE-IN-CLIENT` | Composant client qui importe un module de clé de service. |
| `ENV-NEXT-CONFIG-SECRET` | Le bloc `env:` de `next.config` (inliné dans le bundle) injecte une variable non publique. |
| `ENV-FLAG-UNDECLARED` | Un `FEATURE_*`, `*_ENABLED`, `*_OUVERTS`, `DISABLE_*` qui n'est pas un `feature_flag`. |
| `ENV-REQUIRED-UNUSED` | Déclarée obligatoire mais lue nulle part. |
| `MAN-SECRET-PUBLIC`, `MAN-SECRET-NAME`, `MAN-VISIBILITY` | Secret sous un nom public, nom de secret non classé secret. |
| `MAN-SERVICE-ROLE` | Clé `service_role` publique, ou nom non canonique sans finding de migration. |
| `MAN-FLAG-FAIL-OPEN` | Drapeau fail-open sans justification ni décision : la cible est fail-closed. |
| `MAN-DR-MINIMUM`, `MAN-DR-*` | Registre DR incomplet (clé bancaire, clé Ed25519, secret JWT Supabase, passphrase DR). |
| `MAN-VALUE-LEAK` | Forme de secret ou URL à identifiants dans le manifeste. |
| `EXAMPLE-MISSING` | Variable attendue absente d'un gabarit pour son environnement. |
| `EXAMPLE-UNKNOWN`, `EXAMPLE-FOREIGN` | Gabarit qui déclare une variable inconnue, ou attribuée à une autre application. |
| `EXAMPLE-SECRET-VALUE`, `EXAMPLE-SECRET-SHAPE` | Secret avec une valeur non placeholder, ou valeur qui a la forme d'un secret. |
| `EXAMPLE-LOCALHOST` | Adresse locale dans un gabarit `production` ou `preview`. |
| `EXAMPLE-ENV-INDICATOR` | `ELSATIA_APPLICATION_ENV` ne vaut pas l'environnement du gabarit (jamais `local` en production). |
| `EXAMPLE-FLAG-VALUE` | Drapeau à une valeur différente de celle attendue pour l'environnement. |
| `COLORS-GUARD-CONTRACT` | Le contrat du garde de pré-build de Colors dérive du manifeste. |

**Signalés sans échec :** `DECISION_REQUIRED:*` et `STRIPE-CONTRACTS-DIVERGENT` (contrats Stripe incompatibles), `FLAG-FAIL-OPEN` (écart documenté), `ENV-DEPRECATED-USED`, `ENV-ORPHAN`, `EXAMPLE-DEPRECATED`. `--fail-on-decision` les transforme en échec.

### Ce que le preflight refuse (Preview / Production)

`PF-ENV-ABSENT` (jamais de repli silencieux sur « local »), `PF-ENV-MISMATCH`, `PF-VERCEL-ENV-MISMATCH`, `PF-REQUIRED-MISSING`, `PF-URL-LOCALHOST` (localhost, `127.*`, réseaux privés, `*.local`), `PF-URL-INSECURE` (http en production), `PF-FORBIDDEN-PRESENT`, `PF-FLAG-UNDEFINED` / `PF-FLAG-UNEXPECTED`, `PF-STRIPE-MODE-*` et `PF-STRIPE-KEY-MODE-MISMATCH` (clé live dans un preview, clé incohérente avec `STRIPE_WEBHOOK_EXPECTED_MODE`), `PF-SUPABASE-KEY-ROLE` (clé de service dans une variable publique ou l'inverse), `PF-PUBLIC-SECRET-NAME` et `PF-PUBLIC-VALUE-SECRET-SHAPED`, `PF-VALUE-FORMAT`. Alias déprécié en place : `PF-DEPRECATED-PRESENT` (avertissement). Registre DR : `PF-DR-REGISTRY` (information seulement : le contrôle ne vérifie **jamais** une copie hors site).

Le preflight n'imprime que noms, règles et familles de forme. Un test de non-régression vérifie qu'aucune valeur ne fuit dans la sortie.

## 4. Enforcement du `prebuild` : « report » puis « enforce »

`preflight_enforcement` vaut **`report`** dans ce lot : sur un build Vercel, le contrôle affiche le tableau et les erreurs mais **ne bloque pas** le déploiement. Raison : il n'a pu être validé que sur des valeurs fictives. Une panne interne du contrôleur est toujours non bloquante en mode `--auto`.

Passage à `enforce` (décision Julien, F-PREFLIGHT-ENFORCEMENT) : rejouer d'abord `--preflight` sur les valeurs Preview réelles, corriger, puis changer une seule ligne du manifeste.

`prebuild` est branché pour Gestion Pro (`npm run build`), et disponible pour `build:reserves` et `build:colors` lancés depuis la racine. **Colors garde son propre `prebuild`** (`apps/colors/scripts/verify-public-env.mjs`, plus strict sur ses cinq variables) : le manifeste ne le remplace pas, il **vérifie que son contrat ne dérive pas** (`COLORS-GUARD-CONTRACT`). Tools et Réserves, quand ils sont construits depuis leur propre dossier racine, n'ont pas encore de `prebuild` : à brancher une fois vérifiée la configuration « fichiers hors du dossier racine » des projets Vercel.

## 5. Raccord au `preflight-check` de cutover (préparé, à appliquer à la convergence)

`scripts/cutover/preflight-check.mjs` contrôle le **poste opérateur** (outils, Docker, Git). Il existe sur la ligne cutover (`a083c37b`), pas sur le train V3, et portait **son propre inventaire de 5 variables écrit en dur** (`envAttendues`) : un second système. Le raccord le supprime au lieu de le doubler.

| Pièce | Rôle |
|---|---|
| `scripts/lib/env-manifest-operator.mjs` (dans ce lot) | Fournit au preflight les contrôles d'environnement dérivés du manifeste, au format qu'il consomme déjà : `{ code, libelle, ok, detail, bloquant }`. |
| `docs/runbooks/patches/ELSATIA_PREFLIGHT_CHECK_ENV_MANIFEST_V1.patch` | Patch de `preflight-check.mjs` : +19 / −9 lignes. Retire `envAttendues`, importe l'adaptateur, ajoute `--environment` et `--env-file`. |

**Vérifié** sur un checkout temporaire jetable de `a083c37b` (supprimé ensuite) : `git apply --check` propre ; exécution avec des valeurs fictives dangereuses ; aucune valeur dans la sortie ; les seuls STOP restants sont ceux du script d'origine (espace disque).

Comportement :
- **Mode `report` (actuel) : rien du manifeste ne bloque**, les constats sortent en `WARN`. En `enforce` seulement, les erreurs deviennent `STOP`.
- `--env-file <dump local>` : dump de l'environnement **cible** fourni par l'opérateur, jamais lu depuis Vercel. Sans lui, la ligne `ENVM-SANS-DUMP` dit que l'environnement cible n'est pas évalué (WARN, jamais bloquant).
- Les variables du **shell de l'opérateur** (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`) sont désormais au manifeste (unité `ops_scripts`, `external_consumer`) : présence seulement, jamais bloquantes, comme avant.
- Le patch corrige aussi un défaut préexistant : sans `--target`, un autre premier argument devenait la cible (« commit cible ee »).
- Changement de comportement à connaître : le contrôle de présence de `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` et `SUPABASE_SERVICE_ROLE_KEY` dans le **shell** de l'opérateur disparaît ; ces variables sont contrôlées dans le dump de l'environnement cible, là où elles ont un sens.

Application à la convergence, une fois `scripts/cutover/` présent dans l'arbre :

```bash
git apply docs/runbooks/patches/ELSATIA_PREFLIGHT_CHECK_ENV_MANIFEST_V1.patch
node scripts/cutover/preflight-check.mjs --environment production --env-file <dump local>
```

## 6. Portée et limites

- Le contrôle lit le **code et les gabarits versionnés**. Il ne lit jamais Vercel, Supabase hébergé ni Stripe : l'état réel des projets n'est vérifié que par le preflight, sur un fichier fourni par l'opérateur.
- Sont exclus de l'analyse, avec justification : `supabase/` (gabarit du CLI), `docs/`, `public/`, `android/`, `ios/`, les fichiers de test (`*.test.*`, `*.spec.*`) et `apps/colors/scripts/verify-public-env.mjs`.
- Le contrôle ne vérifie pas qu'un secret est sauvegardé hors site : il signale seulement l'appartenance au registre DR.
- Variables de lignes de code en cours de convergence, non reprises car non supportées sur le train V3 : `GP_DEVIS_V2`, `GP_PLANNING_V2`, `NEXT_PUBLIC_GP_PREVIEW_BADGE` (GP convergé) ; `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL` (scripts de cutover). Elles seront signalées `ENV-UNKNOWN` à la fusion : c'est voulu.
