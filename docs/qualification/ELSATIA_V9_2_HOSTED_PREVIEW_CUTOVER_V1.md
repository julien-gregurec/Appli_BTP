CANONICAL_BRANCH=integration/elsatia-canonical-train-v9.2
CANONICAL_SHA=dfb59cc61e45991165ef5dd8af04f1934ae28ab7 (FINAL_FUNCTIONAL_SHA=88ba6bfe5caf31fa5aa4368d1b51b9c2b419f898)
MIGRATION_COUNT=408
PREVIEW_SUPABASE_REF=pgvvpqyjziyapbbkydmc (attendu ; NON CONNECTÉ dans cette session)
LEDGER_BEFORE=NOT_MEASURED (Preview injoignable)
LEDGER_AFTER=NOT_MEASURED (aucune migration appliquée)
MIGRATIONS_APPLIED=0
BACKUP_CREATED=NO
BACKUP_VERIFIED=NO

# ELSATIA V9.2 — Cutover Preview hébergé V1

Date : 2026-10-03. Exécution autonome dans un conteneur cloud Claude Code.

## Résumé

La vérification du train canonique est faite et conforme.

Toutes les phases **distantes** sont bloquées, pour deux raisons que la mission ne peut pas contourner :

1. **Réseau.** La politique réseau du conteneur refuse les hôtes nécessaires. Le proxy répond `CONNECT tunnel failed, response 403` pour :
   - `api.vercel.com` et `vercel.com` ;
   - `api.supabase.com` ;
   - `pgvvpqyjziyapbbkydmc.supabase.co` (HTTPS) ;
   - le port PostgreSQL 5432 en TCP direct (indisponible).
2. **Identifiants.** Aucun jeton Vercel ni Supabase n'est présent dans l'environnement :
   - pas de `VERCEL_TOKEN` ni de `SUPABASE_ACCESS_TOKEN` ;
   - pas d'URL de base Preview ;
   - pas de `~/.vercel` ni de `supabase/.temp/project-ref` ;
   - CLI `vercel` et `supabase` non installées.

En conséquence, **aucune opération distante n'a été tentée**. Aucune base n'a été lue ni modifiée, aucun déploiement n'a été lancé et aucune URL hébergée n'a été ouverte. La Production (`exhvuzegsefmoguxoiak`) n'a pas été touchée, ni Stripe, ni Studio, ni Boutique.

Aucune preuve locale n'est requalifiée ici en preuve hébergée.

## Phase 1 — Audit du train (fait, preuves locales Git)

| Contrôle | Résultat |
|---|---|
| `git fetch --all --prune` | OK |
| Branche distante `integration/elsatia-canonical-train-v9.2` | présente |
| HEAD réel | `dfb59cc61e45991165ef5dd8af04f1934ae28ab7` |
| `24a0c2e9…` (BASE_SHA V9.1) ancêtre de HEAD | oui |
| `88ba6bfe…` (FINAL_FUNCTIONAL_SHA) ancêtre de HEAD | oui |
| Diff `88ba6bfe..dfb59cc6` | un seul fichier, `docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_2_CONVERGENCE_V1.md` (1+/1−) : code fonctionnel identique au train qualifié |
| `supabase/migrations` sur HEAD | 408 fichiers |
| V9.1 (`integration/elsatia-canonical-train-v9.1`) ancêtre de V9.2 | oui |
| Migrations V9.1 | 391 fichiers |
| Diff des migrations V9.1 → V9.2 | 17 `A` (ajouts), 0 `M`, 0 `D`, 0 `R` : **les 391 migrations historiques sont inchangées** |

Le SHA qualifié localement est donc bien le code à déployer, et la campagne locale n'a pas été refaite.

Ce rapport est commité sur `claude/festive-wozniak-ddoqzb`, créée depuis `dfb59cc6`. La branche canonique n'a pas été modifiée.

### Pack opérateur Preview (audit hors ligne)

Scripts présents : `scripts/preview/v9/`.
- `guard-preview-target.mjs`, `preflight-v9.mjs`, `check-ledger-v9.mjs`, `migration-plan-v9.mjs` ;
- `backup-check.mjs`, `backup-manifest.mjs`, `cutover-step.mjs`, `v9-cutover.sh` ;
- `post-cutover-check.mjs`, `env-scope-check.mjs` ;
- `lib/` : `constantes`, `ledger`, `train`, `cible`…

`lib/constantes.mjs` ne contient aucun compteur de migrations. `CURRENT_LEDGER`, `TARGET_LEDGER` et `PENDING_MIGRATIONS` sont calculés à partir de deux sources :
- `TARGET` : le train local ;
- `CURRENT` : l'export du ledger Preview.

| Contrôle hors ligne | Résultat |
|---|---|
| `node --test scripts/preview/v9/v9-operator-pack.test.mjs` | 29/29 pass |
| `node --test scripts/preview/preview-pack.test.mjs` | 32/32 pass |
| Garde, `--ref exhvuzegsefmoguxoiak` | `TARGET_REJECTED` : « --ref désigne la PRODUCTION : refus absolu », exit 2 |
| Garde, `--ref pgvvpqyjziyapbbkydmc` | `TARGET_PREVIEW_CONFIRMED`, exit 0 |
| Garde, `--app-url https://app.elsatia.fr` | `TARGET_REJECTED` : « hôte de Production », exit 2 |
| `check-ledger-v9.mjs` sur la **fixture** `ledger-v9-1-ok.json` (simulation, pas la Preview réelle) | CURRENT=391, TARGET=408, PENDING=17 (`20261003000101` → `20261003001504`) ; phase 0 = no-op en Preview (300 déjà au ledger) |

Ce dernier résultat ne vaut **que** pour une Preview qui serait exactement au niveau V9.1. Le nombre réel de migrations en attente reste inconnu tant que le ledger Preview n'est pas exporté.

## Root Directories et projets Vercel (confirmés dans le dépôt, pas sur Vercel)

Source : `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md`, STEP 8, et `docs/runbooks/ELSATIA_V9_GP_PREVIEW_DEPLOY.md`.

| App | Projet Vercel attendu | Root Directory | Build | Fichiers hors racine | Crons |
|---|---|---|---|---|---|
| Gestion Pro | `elsatia-preview` (existait) | `.` (racine) | `npm run build:gestion-pro` (jamais `npm run build`) | sans objet | `vercel.json` : `/api/cron/abonnements` 03:15, `/api/cron/notifications-push` 03:45 |
| Tools | à confirmer sur Vercel (« à créer » au runbook V3) | `apps/tools` | `npm run build` | ON | aucun |
| Colors | à confirmer sur Vercel (« à créer » au runbook V3) | `apps/colors` | `npm run build` | ON | aucun |
| Réserves | à confirmer sur Vercel (« à créer » au runbook V3) | `apps/reserves` | `npm run build` | ON | `apps/reserves/vercel.json` : `/api/cron/notifications` 04:30 |

Gestion Pro a pour Root Directory la racine du monorepo, via le projet `elsatia-preview`. La mission interdit tout déploiement depuis la racine qui pourrait cibler le projet racine historique par erreur. Seul `elsatia-preview` est donc admissible pour GP, et seulement après vérification sur Vercel de son ID et de son Root Directory. Voir `DECISION_REQUIRED_GP_ROOT_PROJECT`.

Conventions d'environnement confirmées dans le code :
- **Tools** : `NEXT_PUBLIC_TOOLS_ENV` est lu de façon stricte (`apps/tools/src/lib/site.ts`, `resolveToolsEnv`). Une valeur inconnue donne `null` : fail-closed, aucun lien inter-applications. `scripts/verify-public-env.mjs` refuse tout build Vercel Preview qui ne déclare pas `preview`.
- **Colors** : `ELSATIA_APPLICATION_ENV` est lu avec `VERCEL_ENV` (`apps/colors/src/lib/routes-applications.ts`). Une valeur inconnue donne `null`, sans repli d'un environnement vers un autre. La valeur Preview attendue est `preview`.
- **Réserves** : le nom canonique est `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`apps/reserves/src/lib/supabase/cles.ts`). `NEXT_PUBLIC_SUPABASE_ANON_KEY` n'est qu'un alias de repli, et deux valeurs divergentes sont refusées.

## Phases distantes

| Phase | Statut | Motif |
|---|---|---|
| 2 — Audit Preview Supabase (lecture seule) | BLOCKED | hôte et API Supabase refusés (403) ; aucun identifiant |
| 3 — Sauvegarde Preview | BLOCKED | idem ; `pg_dump` est disponible localement, mais aucune connexion n'est possible |
| 4 — Dry-run / preflight | PARTIEL | garde et logique validées hors ligne ; preflight réel impossible sans export du ledger |
| 5 — Cutover DB | NOT_STARTED | conditions préalables non réunies (backup, preflight réel) : fail-closed |
| 6 — Fixtures (Karim Haddad / Karim Belaid) | NOT_VERIFIED | base injoignable |
| 7 — Vercel / variables | BLOCKED | API Vercel refusée (403) ; aucun jeton |
| 8 — Auth / callbacks | BLOCKED | API Management Supabase refusée |
| 9 — Déploiement | NOT_STARTED | aucun accès Vercel |
| 10 à 15 — URLs, cross-app, recettes GP/Tools/Colors/Réserves | NOT_TESTED | aucune URL hébergée ouverte |
| 16 — Crons | INVENTORIED_FROM_REPO_ONLY | 3 crons versionnés (voir plus haut) ; état Vercel inconnu |
| 17 — Stripe | NOT_TESTED | aucun accès ; Live non ouvert |
| 18 — Sécurité hébergée | NOT_TESTED | — |
| 19 — PWA | NOT_TESTED_HOSTED | manifests présents dans le dépôt : `src/app/manifest.ts` (GP), `apps/tools/src/app/manifest.ts` avec service worker, `apps/colors/src/app/manifest.ts`, `apps/reserves/public/manifest.webmanifest` |
| 20 — WebKit | WEBKIT_NOT_PROVEN | — |
| 21 — Rollback | NOT_DEMONSTRATED_HOSTED | runbook `docs/runbooks/ELSATIA_V9_PREVIEW_ROLLBACK.md` présent ; aucun état initial capturé |

==================================================
GESTION PRO
==================================================

VERCEL_PROJECT=elsatia-preview (attendu selon le runbook ; non vérifié sur Vercel)
ROOT_DIRECTORY=. (racine, build `npm run build:gestion-pro`)
PREVIEW_URL=NOT_DEPLOYED
DEPLOYMENT_ID=NONE
DEPLOYED_SHA=NONE
BUILD=NOT_RUN
HTTP=NOT_TESTED
LOGIN=NOT_TESTED
LOGOUT=NOT_TESTED
SESSION=NOT_TESTED
PROTECTED_ROUTES=NOT_TESTED
MOBILE=NOT_TESTED
DESKTOP=NOT_TESTED
CONSOLE=NOT_TESTED
VERDICT=BLOCKED

==================================================
TOOLS
==================================================

VERCEL_PROJECT=UNKNOWN (à identifier sur Vercel ; ne pas en créer un nouveau si un projet existe)
ROOT_DIRECTORY=apps/tools
PREVIEW_URL=NOT_DEPLOYED
DEPLOYMENT_ID=NONE
DEPLOYED_SHA=NONE
BUILD=NOT_RUN
HTTP=NOT_TESTED
LOGIN=NOT_TESTED
LOGOUT=NOT_TESTED
SESSION=NOT_TESTED
PROTECTED_ROUTES=NOT_TESTED
MOBILE=NOT_TESTED
DESKTOP=NOT_TESTED
CONSOLE=NOT_TESTED
PWA=NOT_TESTED_HOSTED
OFFLINE=NOT_TESTED_HOSTED
ENTITLEMENT=NOT_TESTED
MOBILE_PURCHASE_LINKS=NOT_TESTED
VERDICT=BLOCKED

==================================================
COLORS
==================================================

VERCEL_PROJECT=UNKNOWN
ROOT_DIRECTORY=apps/colors
PREVIEW_URL=NOT_DEPLOYED
DEPLOYMENT_ID=NONE
DEPLOYED_SHA=NONE
BUILD=NOT_RUN
HTTP=NOT_TESTED
LOGIN=NOT_TESTED
LOGOUT=NOT_TESTED
SESSION=NOT_TESTED
PROTECTED_ROUTES=NOT_TESTED
MOBILE=NOT_TESTED
DESKTOP=NOT_TESTED
CONSOLE=NOT_TESTED
VERDICT=BLOCKED

==================================================
RÉSERVES
==================================================

VERCEL_PROJECT=UNKNOWN
ROOT_DIRECTORY=apps/reserves
PREVIEW_URL=NOT_DEPLOYED
DEPLOYMENT_ID=NONE
DEPLOYED_SHA=NONE
BUILD=NOT_RUN
HTTP=NOT_TESTED
LOGIN=NOT_TESTED
LOGOUT=NOT_TESTED
SESSION=NOT_TESTED
PROTECTED_ROUTES=NOT_TESTED
MOBILE=NOT_TESTED
DESKTOP=NOT_TESTED
CONSOLE=NOT_TESTED
PUBLISHABLE_KEY_CONFIG=NOT_VERIFIED_HOSTED (code : nom canonique `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, alias ANON en repli seulement)
CROSS_APP_LINKS=NOT_TESTED
VERDICT=BLOCKED

==================================================
SUPABASE
==================================================

LEDGER=NOT_MEASURED (TARGET calculé = 408, dernière 20261003001504 ; CURRENT inconnu)
RLS=NOT_TESTED_HOSTED
AUTH=NOT_AUDITED
REDIRECT_URLS=NOT_AUDITED (aucune modification)
FIXTURES=NOT_VERIFIED
CRONS=3 versionnés dans le dépôt ; état hébergé inconnu
BACKUP=NONE (BACKUP_CREATED=NO, BACKUP_VERIFIED=NO, RESTORE_PROCEDURE_AVAILABLE=DOC_ONLY : `docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md`)
ROLLBACK=NOT_REQUIRED (rien n'a été modifié) ; procédure documentée, non démontrée en hébergé

==================================================
CROSS-APP
==================================================

GP_TOOLS=NOT_TESTED
GP_COLORS=NOT_TESTED
GP_RESERVES=NOT_TESTED
PREVIEW_TO_PROD_LEAKS=NOT_TESTED_HOSTED (la garde du pack refuse les hôtes de Production : prouvé hors ligne)
LOGOUT_SCOPE=DECISION_REQUIRED_LOGOUT_SCOPE (logout global inchangé)

==================================================
SÉCURITÉ
==================================================

SECRET_EXPOSURE=NOT_TESTED_HOSTED (aucun secret affiché ni écrit dans ce rapport)
SERVICE_ROLE_BROWSER=NOT_TESTED_HOSTED
CROSS_TENANT=NOT_TESTED_HOSTED
SUSPENDED=NOT_TESTED_HOSTED
EXPIRED=NOT_TESTED_HOSTED
PLATFORM_ACCESS=NOT_TESTED_HOSTED

==================================================
EXTERNAL_CONFIGURATION_REQUIRED
==================================================

Pour reprendre la mission, les éléments suivants sont nécessaires. Aucune valeur n'est donnée ici.

1. **Accès réseau du conteneur.** Ajouter aux domaines autorisés de l'environnement cloud (Network access → Custom, en conservant les gestionnaires de paquets) :
   - `api.vercel.com`, `vercel.com`, `*.vercel.app` ;
   - `api.supabase.com`, `pgvvpqyjziyapbbkydmc.supabase.co` ;
   - le pooler Supabase de la région du projet, pour `pg_dump` et `psql`.

   Note : la connexion PostgreSQL directe en TCP (5432/6543) n'est pas prise en charge par ce conteneur. Si elle reste impossible, la sauvegarde et le cutover doivent être exécutés par l'opérateur sur un poste disposant de la CLI Supabase, avec le pack `scripts/preview/v9/v9-cutover.sh`.
2. **`VERCEL_TOKEN`.** Jeton limité à l'équipe ELSATIA, en variable d'environnement de l'environnement cloud, plus l'identifiant d'équipe (`VERCEL_ORG_ID`).
3. **`SUPABASE_ACCESS_TOKEN`.** Jeton de la Management API limité si possible au projet Preview, pour l'audit Auth et Redirect URLs et pour la sauvegarde native.
4. **URL de base Preview** (`ELSATIA_PREVIEW_DB_URL`), à fournir à l'opérateur, jamais dans le dépôt. Elle sert à l'export du ledger, à `pg_dump` et à `db push`.
5. **Mots de passe des comptes de recette Preview** (pilote Karim Haddad et les six rôles), fournis hors dépôt, pour les recettes navigateur.
6. **Brevo, secret cron, provider push, Stripe Test** : présence à vérifier dans les variables Preview Vercel. Inconnue à ce jour.

==================================================
DECISION_REQUIRED
==================================================

Décisions ouvertes, conservées sans les résoudre :

- `DECISION_REQUIRED_LOGOUT_SCOPE` : logout global ou par application. Le comportement global actuel est inchangé.
- `DECISION_REQUIRED_PRODUCT` B10, B22, B23 (et B20 inverse, PENDING vs VALIDATED), repris du gate V9.2.
- `DECISION_REQUIRED_PRODUCTION`, repris du gate V9.2 :
  - UPG-P0-2 ;
  - troncature d'essai ;
  - essai sans date ;
  - propriétaire plateforme ;
  - fenêtre de la migration `…1503`.
- `DECISION_REQUIRED_GP_ROOT_PROJECT` : GP se déploie avec Root Directory `.`. Il faut confirmer sur Vercel que `elsatia-preview` est bien le projet GP Preview et non le projet racine historique, ou qu'ils sont un seul et même projet. Cette confirmation est requise avant tout déploiement GP.
- `DECISION_REQUIRED_SATELLITE_PROJECTS` : le runbook V3 marquait les projets Vercel Tools, Colors et Réserves « à créer ». La mission interdit d'en créer un nouveau si un projet existe déjà. L'inventaire Vercel réel doit trancher.

==================================================
PREVIEW GATE
==================================================

| Gate | Valeur | Preuve |
|---|---|---|
| DATABASE_PREVIEW_GATE | BLOCKED | Preview injoignable, aucun backup, aucun ledger mesuré |
| GP_PREVIEW_GATE | BLOCKED | non déployé, aucune URL ouverte |
| TOOLS_PREVIEW_GATE | BLOCKED | idem |
| COLORS_PREVIEW_GATE | BLOCKED | idem |
| RESERVES_PREVIEW_GATE | BLOCKED | idem |
| CROSS_APP_PREVIEW_GATE | BLOCKED | aucun test hébergé |
| SECURITY_PREVIEW_GATE | BLOCKED | aucun test hébergé |
| PREVIEW_GATE_GLOBAL | BLOCKED | — |

Prouvé dans cette session, hors ligne seulement :
- l'intégrité du train (SHA, 408 migrations, 391 historiques inchangées) ;
- le pack opérateur (61/61 tests) ;
- le refus de la Production par la garde.

Le train V9.2 reste **qualifié localement** ; sa qualification **hébergée** n'est ni prouvée ni réfutée.

==================================================
VERDICT FINAL
==================================================

ELSATIA_V9_2_PREVIEW_BLOCKED
