# ELSATIA V9.2 — Cutover Preview hébergé (V1)

Date : 2026-10-03 · Exécution autonome (opérateur absent) · Mode fail-closed.

**Verdict : `ELSATIA_V9_2_PREVIEW_BLOCKED`**

Aucune migration appliquée, aucun déploiement Vercel, aucune modification de configuration
Supabase ou Vercel. Seule écriture : la branche `claude/elegant-gauss-01rggb` (correctif Next.js et ce rapport).

## Synthèse

```
CANONICAL_SHA=dfb59cc6 (integration/elsatia-canonical-train-v9.2 ; SHA fonctionnel 88ba6bfe, seul docs/ diffère)
SUPABASE_REF=pgvvpqyjziyapbbkydmc
LEDGER_BEFORE=372 (dernière 20261002000813, 813 ORIGINALE prouvée)
LEDGER_AFTER=372 (inchangé)
PENDING_BEFORE=36 (20261002000901 → 20261003001504)
PENDING_AFTER=36
BACKUP=PREVIEW_BACKUP_BLOCKER (sauvegarde physique Supabase quotidienne présente, mais pas de sauvegarde vérifiée au sens du pack)
PREFLIGHT=PASS (PREVIEW_V9_OPERATOR_PACK_READY avec le ledger réel)
MIGRATIONS_APPLIED=0

GP_PROJECT=elsatia-preview (prj_0dX75LBHTxWUYQKle7zNdWdrWctK), confirmé GP Preview
GP_PREVIEW_URL=aucune (pas de déploiement validé ; voir « Déploiement GP préexistant »)
GP_STATUS=BLOCKED (base non migrée + variables REQUIRED manquantes + Next vulnérable sur dfb59cc6)

TOOLS_PROJECT=elsatia-tools (prj_XO6FSb0e9IFxu4SPkyvkhrw63YvZ, root apps/tools)
TOOLS_PREVIEW_URL=aucune
TOOLS_STATUS=BLOCKED (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente en Preview ; cible Supabase non vérifiable)

COLORS_PROJECT=elsatia-colors (prj_ZEw9IIa0J6Rg5Wfi9POe6P67uAko, root apps/colors)
COLORS_PREVIEW_URL=aucune
COLORS_STATUS=BLOCKED (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente en Preview ; cible Supabase non vérifiable)

RESERVES_PROJECT=aucun (aucun projet ni alias trouvé ; non créé, voir Phase 3)
RESERVES_PREVIEW_URL=aucune
RESERVES_STATUS=BLOCKED

CROSS_APP=NOT_TESTED (aucune app V9.2 déployée)
AUTH=NOT_PROVEN (Site URL / Redirect URLs pointent vers un ancien alias de branche, non modifiés)
RLS=OK en lecture (267/267 tables public sous RLS, 608 policies) ; tests cross-tenant non exécutés
SECURITY=PARTIAL (en-têtes OK ; Next corrigé sur branche ; 1 motif sensible à qualifier dans un bundle public)
WEBKIT=WEBKIT_NOT_PROVEN (navigateur WebKit absent de l'environnement)
CRONS=FAIL-CLOSED (CRON_SECRET absent : routes cron renvoient 503)
```

## Portes

```
DATABASE_PREVIEW_GATE=BLOCKED
GP_PREVIEW_GATE=BLOCKED
TOOLS_PREVIEW_GATE=BLOCKED
COLORS_PREVIEW_GATE=BLOCKED
RESERVES_PREVIEW_GATE=BLOCKED
CROSS_APP_PREVIEW_GATE=BLOCKED
SECURITY_PREVIEW_GATE=BLOCKED
PREVIEW_GATE_GLOBAL=BLOCKED
```

## Actions requises de l'opérateur (dans l'ordre)

1. **Sauvegarde (PREVIEW_BACKUP_BLOCKER)** : soit fournir la sauvegarde exigée par
   `docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md` (dumps schéma / données / Auth / ledger,
   moins de 12 h, `backup-check.mjs` = `BACKUP_DECLARED_OK`), ce qui demande l'URL PostgreSQL de la
   Preview et son mot de passe, absents de cette session ; soit décider explicitement
   (`DECISION_REQUIRED:V9-BACKUP-PHYSIQUE-SUPABASE`) que la sauvegarde physique quotidienne Supabase,
   restaurable uniquement en entier depuis le tableau de bord, suffit.
2. **Application des migrations** : le pack applique via `supabase db push --linked`, qui exige la
   CLI Supabase et le mot de passe de la base. La CLI n'est pas installable ici, car `github.com`
   est refusé par le proxy (`GITHUB_NETWORK_REQUIRED`). L'API Management (`database/query`) pourrait
   jouer les 36 fichiers, mais elle contournerait les étapes 9-10 du pack (dry-run CLI égal au plan) :
   non fait sans décision.
3. **Variables Preview manquantes (EXTERNAL_CONFIGURATION_REQUIRED)** : voir Phase 8.
4. **Auth Preview** : Site URL et Redirect URLs, voir Phase 9.
5. Puis déploiement de la branche corrigée (`claude/elegant-gauss-01rggb`, Next 16.3.8) ou
   report du correctif sur le train canonique.

---

## Phase 1 — Garde-fous

| Contrôle | Résultat |
|---|---|
| `git fetch --all --prune` | OK |
| Branche canonique | `origin/integration/elsatia-canonical-train-v9.2` |
| HEAD | `dfb59cc6`, diffère de `88ba6bfe` d'une seule ligne de doc |
| Migrations | 408 |
| 391 migrations V9.1 | intactes : V9.1 → V9.2 = 17 ajouts, 0 modification, 0 suppression |

Verrou appliqué pendant toute la mission :
`SUPABASE_ALLOWED_REF=pgvvpqyjziyapbbkydmc`.
Projets Vercel autorisés : `elsatia-preview`, `elsatia-tools`, `elsatia-colors`.
Projets interdits : `elsatia-production`, `elsatia-site`, `elsatia-studio-preview`, `liria-concept-gestion-btp`.
Aucun appel n'a visé un projet hors de cette liste. Les appels Vercel désignent tous le projet par son nom ou son ID, avec `teamId` explicite.

## Phase 2 — Audit Vercel (lecture seule)

| | elsatia-preview | elsatia-tools | elsatia-colors |
|---|---|---|---|
| Équipe | julien-gregurec1 | julien-gregurec1 | julien-gregurec1 |
| Root Directory | racine (null) | `apps/tools` | `apps/colors` |
| Framework / Node | nextjs / 24.x | nextjs / 24.x | nextjs / 24.x |
| Dépôt Git | julien-gregurec/Appli_BTP | **non lié** | **non lié** |
| Branche Production | main | — | — |
| Build | `check-env-manifest --auto --app gestion_pro && npm run build:gestion-pro` | défaut | défaut |
| Protection déploiements | **aucune (SSO absent)** | SSO sauf domaines custom | SSO sauf domaines custom |
| Domaines | elsatia-preview.vercel.app | **tools.elsatia.fr**, elsatia-tools.vercel.app | **colors.elsatia.fr**, elsatia-colors.vercel.app |
| Déploiements | Preview Git par branche ; dernier : `dfb59cc6` (v9.2) READY | Production uniquement | Production uniquement |
| Crons projet | abonnements 03:15, notifications-push 03:45 | — | — |

**Identité de `elsatia-preview` : confirmée comme Gestion Pro Preview.** Preuves : commande de build
`build:gestion-pro`, `ELSATIA_APPLICATION_ENV` présente en Preview, et CSP du déploiement Preview
`connect-src https://pgvvpqyjziyapbbkydmc.supabase.co`, c'est-à-dire la référence Preview, lue dans les
en-têtes publics.

**Attention : `elsatia-tools` et `elsatia-colors` sont les projets de PRODUCTION de ces apps**
(domaines `tools.elsatia.fr` et `colors.elsatia.fr`). Un déploiement Preview y utilise les variables
de portée Preview, mais **la cible Supabase de ces variables n'a pas pu être vérifiée** : le
déchiffrement des valeurs a été refusé par le garde-fou de la session et les apps n'ont pas de
déploiement Preview à inspecter. Fail-closed : aucun déploiement.

## Phase 3 — Réserves

Recherche par nom (`reserve`, `reserves`, `elsatia-reserves`) : aucun résultat. Aucun alias contenant
`reserv` (100 premiers alias de l'équipe). Aucun projet de l'équipe n'a `apps/reserves` pour racine.
**Projet non créé.** Créer `elsatia-reserves` n'aurait débloqué aucun déploiement : il faut des
variables Preview (URL Supabase, clé publishable) dont les valeurs ne sont pas disponibles dans
cette session, et la copie depuis un autre projet est interdite. La base n'est pas non plus migrée
(20261003000103 concerne Réserves). La création reste à faire au moment où ces valeurs seront fournies.

## Phase 4 — Supabase Preview (lecture seule)

Accès : API Management, endpoint `database/query/read-only` et métadonnées GET. Aucune écriture.

| Élément | Valeur |
|---|---|
| Projet | elsatia-preview, eu-west-3, ACTIVE_HEALTHY, PostgreSQL 17.6 |
| Santé db / auth / rest | healthy (GoTrue v2.197.0) |
| Taille | 40 MB |
| Extensions | pg_stat_statements, pg_trgm, pgcrypto, pgsodium, plpgsql, supabase_vault, unaccent, uuid-ossp |
| RLS | 267 tables `public`, 267 avec RLS, 0 sans ; 608 policies |
| Fonctions `public` | 872 |
| Données | 1 entreprise, 29 utilisateurs Auth ; dernière activité Auth 2026-10-02 18:56Z |
| 813 | fonction déployée = ORIGINALE (`original=true`, `non_original=false`) |
| CURRENT_LEDGER | 372 (préfixe exact du train, ordre correct, aucune version étrangère) |
| TARGET_LEDGER | 408 |
| PENDING_MIGRATIONS | **36** (V9.1 tardives 0901 → 1302, puis les 17 de V9.2) |
| Phase 0 | 20260921000300 au ledger : pont 20261003000201 = no-op en Preview |
| Classement | FORWARD_ONLY=8, REVERSIBLE=24, RESTORE_REQUIRED=4 (plan généré du pack) |

Les attributs 403 du jeton (`database_config_read`, `infra_add_ons_read`, `network_restrictions_read`,
branches) n'ont pas été contournés.

## Phase 5 — Sauvegarde

```
BACKUP_METHOD=Sauvegardes physiques quotidiennes Supabase (WAL-G) ; PITR désactivé
BACKUP_CREATED=NO (pas de sauvegarde à la demande possible sans PITR ; pas d'accès PostgreSQL pour les dumps du runbook)
BACKUP_VERIFIED=NO
RESTORE_PATH=Tableau de bord Supabase > Database > Backups > restauration complète du projet (action manuelle, destructive pour toute écriture postérieure)
```

La dernière sauvegarde est du 2026-10-03 04:18:49Z (COMPLETED, physique). Elle est postérieure à la
dernière activité Auth et le ledger n'a pas bougé depuis. Ce n'est pas la sauvegarde exigée par le
pack (`backup-check.mjs` : dumps et ledger hors dépôt, au plus 12 h) et aucun test de restauration
n'a été fait. → **PREVIEW_BACKUP_BLOCKER** : migrations non appliquées.

## Phase 6 — Preflight V9.2

`node scripts/preview/v9/preflight-v9.mjs --ledger <export réel>`, exécuté sur la branche locale
`integration/elsatia-canonical-train-v9.2` (= origin, `dfb59cc6`) :
**`PREVIEW_V9_OPERATOR_PACK_READY`**. Tous les contrôles sont verts : git (base V9.1 ancêtre),
train 408, verify-migrations, fixtures, 6 ledgers négatifs refusés, phase 0, plan 36 avec 7 preuves,
dry-run exact, env manifest, secrets, build, garde Production, runbooks de rollback.
L'entrée `INPUT-LEDGER` (ledger réel) donne `PREVIEW_LEDGER_PREFIX_OK`, et
`check-ledger-v9.mjs --expect pre --require-813-proof` sort en code 0.
Tests du pack : 29/29.

Le preflight couvre donc bien la cible, le ledger, l'historique 813, V9.1, V9.2, la phase 0 et les
invariants. Les **données invalides ou essais** sont vérifiés par les migrations elles-mêmes à
l'application, ce qui n'a pas été exécuté.

## Phase 7 — Migration

**Non exécutée.** Conditions non réunies : `BACKUP_VERIFIED=NO`. De plus, le chemin d'application du
pack (`v9-cutover.sh --apply-preview`) exige la CLI Supabase (`GITHUB_NETWORK_REQUIRED`) et le mot de
passe de la base. LEDGER_AFTER=372, PENDING=36.

La migration `20261003001503` (RLS) porte bien `set local lock_timeout = '10s'` (ligne 59).

## Phase 8 — Variables Vercel Preview (noms seulement)

`scripts/preview/v9/env-scope-check.mjs` sur l'inventaire API de chaque projet :

**GP (`elsatia-preview`) : ENV_SCOPE_BLOCKED**
- MISSING (REQUIRED) : `BANK_DATA_ENCRYPTION_KEY`, `STRIPE_WEBHOOK_EXPECTED_MODE`,
  `ABONNEMENTS_PUBLICS_OUVERTS`, `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, `LEGAL_TVA_REGIME_CONFIRME`,
  `TOOLS_STORE_ENVIRONMENT`
- PRESENT (REQUIRED) : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RATE_LIMIT_HMAC_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_COLORS_URL`,
  `ELSATIA_APPLICATION_ENV`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_ABONNEMENT_SECRET`, `FEATURE_CRONS_ENABLED`
- MISSING (LIVE_ONLY) : `CRON_SECRET` → crons fail-closed (503)
- Drapeaux non vérifiables sans dotenv : `DISABLE_EMAIL_LOGIN`, `STRIPE_AUTOMATIC_TAX_ENABLED`,
  `FEATURE_BOUTIQUE_ENABLED`, `FEATURE_AI_ENABLED`, `FEATURE_AI_DEVIS_ENABLED`,
  `FEATURE_RELANCES_AUTO_ENABLED`, `FEATURE_CRONS_ENABLED`, `STUDIO_ACCESS_MODE`
- Remarque : plusieurs variables existent en double avec une portée de branche Git
  (`gp-preview-v8`, `claude/sleepy-cannon-6je2vo`), sans effet sur la branche v9.2.

**Tools (`elsatia-tools`) : ENV_SCOPE_BLOCKED**
- MISSING (REQUIRED) : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (seule `NEXT_PUBLIC_SUPABASE_ANON_KEY` existe)
- PRESENT : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_TOOLS_ENV`

**Colors (`elsatia-colors`) : ENV_SCOPE_BLOCKED**
- MISSING (REQUIRED) : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (seule ANON existe)
- PRESENT : `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_COLORS_URL`,
  `ELSATIA_APPLICATION_ENV` (valeur non lisible : la présence de `preview` n'est pas prouvée)

**Réserves** : aucun projet, donc toutes les variables manquent.

→ **EXTERNAL_CONFIGURATION_REQUIRED** pour les quatre apps. Aucune valeur n'a été copiée ni affichée.

## Phase 9 — Auth callbacks (Preview)

- `site_url` et la seule entrée de `uri_allow_list` désignent l'alias de branche
  `elsatia-preview-git-feat-elsatia-canoni-4f3ed2-julien-gregurec1.vercel.app` (ancienne branche feat).
- Aucune URL Preview v9.2, Tools, Colors ou Réserves n'est autorisée : magic links, réinitialisation
  et invitations depuis une nouvelle URL Preview seraient redirigés vers l'ancien alias.
- Le domaine Preview reste un hôte Preview, sans fuite vers la Production.
- **Non modifié** : aucune URL Preview v9.2 n'a été validée et la modification changerait le parcours
  de l'alias actuel. `DECISION_REQUIRED:V9-AUTH-SITE-URL` (URL stable recommandée : un alias de
  branche fixe v9.2, plus les URLs Preview des satellites dans l'allow-list).

## Phases 10 à 13 — Déploiements

Aucun déploiement. Raisons cumulées :
1. porte « code après base » du pack (`code-deploy-gate.mjs`) : base non migrée ;
2. variables REQUIRED manquantes (Phase 8) ;
3. Next.js 16.3.5 vulnérable sur `dfb59cc6` (Phase 18).

### Déploiement GP préexistant (constat)

Un déploiement Preview **Git automatique** de `dfb59cc6` existe déjà et est READY :
`elsatia-preview-bgf9n4rqz-julien-gregurec1.vercel.app`. Il n'est **pas** issu de cette mission.
Il sert le code V9.2 contre une base à 372 migrations : le code est en avance sur la base, l'inverse
de l'ordre exigé par le pack. Il est **public** (pas de protection SSO sur `elsatia-preview`).
Sondes HTTP : `/` 200, `/connexion` 307 vers `/login` (même hôte), `/login` 200,
`/api/cron/abonnements` 503 (CRON_SECRET absent).
En-têtes : CSP stricte à nonce, HSTS preload, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy`, `X-Robots-Tag: noindex`.
L'alias de Production du projet, `elsatia-preview.vercel.app`, répond **500** (cible production du
projet, `feat/remises-clients-v1`, sans variables de portée Production).
Recommandation : `DECISION_REQUIRED:V9-GP-PREVIEW-PROTECTION` (activer la protection des déploiements
ou désactiver les déploiements Git automatiques de branches tant que la base n'est pas migrée).

## Phases 14 à 16 — Recette hébergée, cross-app, métier GP

Non exécutées : aucune app V9.2 validée n'est déployée. `DECISION_REQUIRED_LOGOUT_SCOPE` : non
touché. Aucune donnée créée.

## Phase 17 — Sécurité (constats en lecture)

- RLS : 267/267 tables `public` sous RLS. Les tests cross-tenant, suspended, expired et plateforme
  n'ont pas été exécutés (pas de déploiement, pas de comptes de recette utilisables sans mot de passe).
- Bundles JS publics du déploiement préexistant (11 fichiers de `/login`) : aucune référence Supabase
  de Production. **Un fichier contient une chaîne correspondant à un motif sensible** (nom de
  variable ou préfixe de clé). Son contexte n'a pas pu être inspecté (garde-fou de session) :
  `DECISION_REQUIRED:V9-BUNDLE-SECRET-SCAN`, à qualifier par l'opérateur (faux positif probable,
  car ce sont des noms de variables dans le code client, mais non prouvé).
- Crons : fail-closed (503 sans `CRON_SECRET`, 401 si le Bearer est faux).
- En-têtes : conformes (voir ci-dessus).

## Phase 18 — Sécurité Next.js

| App | Avant (dfb59cc6) | Advisory | Après (branche corrigée) |
|---|---|---|---|
| GP (racine) | 16.3.5 | GHSA-vcvr-r3jv-pc5j, **critique** (RCE `next/og` ImageResponse, 16.2.0 – 16.3.5) | 16.3.8 |
| Tools | 16.3.5 | idem | 16.3.8 |
| Colors | 16.3.5 | idem | 16.3.8 |
| Réserves | 16.3.5 | idem | 16.3.8 |

`next/og` / `ImageResponse` ne sont importés nulle part dans le dépôt. La version reste dans la plage
vulnérable, donc correctif appliqué par précaution.

Correctif minimal : commit `63a657ae` sur `claude/elegant-gauss-01rggb` (base `dfb59cc6`). Il touche
`next` et `eslint-config-next` dans les 4 `package.json` ; les 4 lockfiles sont régénérés et seuls les
paquets `next` y changent. Les migrations ne sont pas touchées.

Validation sur la branche corrigée :
- `npm run typecheck` : OK (4 apps) ;
- `npm run lint` : OK (4 apps) ;
- `npm test` : OK. Racine 2950 réussis (1 échec attendu, 194 ignorés), Tools 2174, Réserves 239, Colors 436 ;
- builds : GP (`build:gestion-pro`) OK ; Tools (`NEXT_PUBLIC_TOOLS_ENV=local`), Colors et Réserves
  (`ELSATIA_APPLICATION_ENV=local`) OK, tous en Next.js 16.3.8.

`npm audit --omit=dev` après correctif : Colors 0, Réserves 0, Tools 1 faible. Racine : 3 « high »
dans l'outillage de build (`fast-uri` épinglé à 3.1.6 par `overrides`, `ajv` via `schema-utils`,
`brace-expansion` via `glob`), hors du périmètre de cette mission et non corrigés.

## Phase 19 — Crons

- `vercel.json` : `/api/cron/abonnements` (03:15), `/api/cron/notifications-push` (03:45).
  Une route `/api/cron/elsatia-identity` existe sans planification.
- Vercel n'exécute les crons que sur le déploiement de Production du projet. Pour `elsatia-preview`,
  c'est `feat/remises-clients-v1`, sans variables Production : les crons y sont inopérants.
- Toutes les routes exigent `CRON_SECRET` (absent en Preview, donc 503) ; abonnements et relances
  sont en plus derrière `FEATURE_CRONS_ENABLED`.
- Aucun cron déclenché, aucun envoi externe.

## Phase 20 — WebKit

`WEBKIT_NOT_PROVEN` : seul Chromium est installé, et `playwright install` est interdit dans
l'environnement.

## Ce qui n'a pas été fait (et pourquoi)

| Action | Raison |
|---|---|
| Migrations Preview | PREVIEW_BACKUP_BLOCKER ; CLI Supabase non installable (GITHUB_NETWORK_REQUIRED) ; mot de passe base absent |
| Déploiements GP / Tools / Colors / Réserves | base non migrée, variables manquantes, Next vulnérable sur le SHA canonique |
| Création du projet Réserves | inutile sans variables Preview ; reportée |
| Modification Auth Preview | aucune URL Preview v9.2 validée ; DECISION_REQUIRED |
| Lecture des valeurs de variables Vercel | refusée par le garde-fou de session (déchiffrement) |
| Production, Stripe Live, Studio, Boutique | interdits, non touchés |
