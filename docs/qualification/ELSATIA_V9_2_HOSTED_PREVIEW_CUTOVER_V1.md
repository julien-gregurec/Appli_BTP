# ELSATIA V9.2 — Cutover Preview hébergé — rapport V1

Date : 2026-10-03 (session autonome, opérateur absent).
Branche de travail : `claude/hopeful-dijkstra-2scnpi` = `integration/elsatia-canonical-train-v9.2` (dfb59cc6) + 1 correctif de sécurité (Next.js) + ce rapport.

## Verdict

**ELSATIA_V9_2_PREVIEW_BLOCKED**

Aucune migration n'a été appliquée, aucun déploiement Vercel n'a été lancé, aucune configuration distante (Vercel, Supabase Auth) n'a été modifiée. Toutes les actions distantes de cette session sont des lectures, plus la sauvegarde logique (lecture) décrite en phase 5.

Trois blocages indépendants, chacun suffisant :

1. **Base Preview non migrée** (36 migrations en attente) : la vérification de sauvegarde du pack (`backup-check.mjs`) a été refusée par le garde-fou d'exécution de la session (« Blind Apply ») ; sans `BACKUP_VERIFIED=YES` établi par le pack, la mission interdit d'appliquer les migrations. Le cutover base doit être lancé par l'opérateur.
2. **Next.js 16.3.5 vulnérable** (GHSA-vcvr-r3jv-pc5j, RCE critique dans `next/og` ImageResponse, `>=16.2.0 <16.3.6`) sur les 4 apps du SHA canonique. Correctif préparé et qualifié localement sur cette branche (16.3.8), non déployé.
3. **Variables Preview manquantes** (valeurs à fournir par l'opérateur, jamais inventées) — voir phase 8.

## Champs demandés

```
CANONICAL_SHA=dfb59cc61e45991165ef5dd8af04f1934ae28ab7 (SHA fonctionnel qualifié 88ba6bfe)
FIX_SHA=ea554fab (dfb59cc6 + Next.js 16.3.8, branche claude/hopeful-dijkstra-2scnpi)
SUPABASE_REF=pgvvpqyjziyapbbkydmc (elsatia-preview, eu-west-3, ACTIVE_HEALTHY, PostgreSQL 17.6)
LEDGER_BEFORE=372 (dernière 20261002000813, 813 ORIGINALE prouvée : statements + pg_proc)
LEDGER_AFTER=372 (inchangé)
PENDING_BEFORE=36 (20261002000901 → 20261003001504 ; 19 V9.1 + 17 V9.2 ; préfixe exact du train)
PENDING_AFTER=36
BACKUP=PARTIAL — sauvegarde physique Supabase du 2026-10-03T04:18:49Z (COMPLETED, walg, pas de PITR) + sauvegarde logique produite (hors dépôt) et restaurée avec succès sur base locale ; vérification du pack (backup-check) NON exécutée (refusée)
PREFLIGHT=PARTIAL — check-ledger-v9 réel : PREVIEW_LEDGER_PREFIX_OK ; preflight complet non exécuté (dépend de la sauvegarde vérifiée)
MIGRATIONS_APPLIED=0

GP_PROJECT=elsatia-preview (prj_0dX75LBHTxWUYQKle7zNdWdrWctK) — identité Gestion Pro Preview : PROBABLE, non confirmée de façon définitive
GP_PREVIEW_URL=https://elsatia-preview-bgf9n4rqz-julien-gregurec1.vercel.app (auto-déploiement Git existant de dfb59cc6, NON créé par cette mission)
GP_STATUS=BLOCKED (code V9.2 en ligne sur une base à 372 : « code avant base » ; Next 16.3.5 vulnérable)

TOOLS_PROJECT=elsatia-tools (prj_XO6FSb0e9IFxu4SPkyvkhrw63YvZ)
TOOLS_PREVIEW_URL=aucune (aucun déploiement Preview n'a jamais existé)
TOOLS_STATUS=BLOCKED (base, Next, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente en Preview)

COLORS_PROJECT=elsatia-colors (prj_ZEw9IIa0J6Rg5Wfi9POe6P67uAko)
COLORS_PREVIEW_URL=aucune
COLORS_STATUS=BLOCKED (base, Next, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente en Preview)

RESERVES_PROJECT=aucun (non créé — voir phase 3)
RESERVES_PREVIEW_URL=aucune
RESERVES_STATUS=BLOCKED

CROSS_APP=NOT_TESTED (aucune app satellite déployée)
AUTH=NOT_TESTED en hébergé ; config Supabase Auth Preview lue : Site URL / Redirect URLs pointent vers un ancien alias de branche (voir phase 9)
RLS=PASS en lecture (267/267 tables public sous RLS, 608 policies, 0 SECURITY DEFINER sans search_path) — tests cross-tenant hébergés non exécutés
SECURITY=BLOCKED (Next 16.3.5 critique en ligne sur la Preview GP publique)
WEBKIT=WEBKIT_NOT_PROVEN
CRONS=READ (GP : abonnements 03:15, notifications-push 03:45 ; Tools/Colors : aucun) — aucun déclenchement
```

## Gates

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

## Phase 1 — Garde-fous

- `git fetch --all --prune` exécuté.
- Branche canonique `origin/integration/elsatia-canonical-train-v9.2`, HEAD `dfb59cc6` (parent `88ba6bfe`) : conforme.
- `supabase/migrations` : 408 fichiers.
- Les 391 migrations de `integration/elsatia-canonical-train-v9.1` sont strictement inchangées (`git diff --name-status` V9.1 → V9.2 : 17 ajouts, 0 modification, 0 suppression, 0 renommage).
- Verrou logique appliqué par les scripts de session : Supabase limité à `pgvvpqyjziyapbbkydmc` ; Vercel limité à `elsatia-preview`, `elsatia-tools`, `elsatia-colors` (+ `elsatia-reserves` si créé), refus `HARD_STOP_WRONG_TARGET` sinon. Aucune action sur `elsatia-production`, `elsatia-site`, `elsatia-studio-preview`, `liria-concept-gestion-btp`.

## Phase 2 — Audit Vercel (lecture seule, noms de variables uniquement)

Équipe `julien-gregurec1` (`team_Jc6YWtXF1pV1ezbLdYzGnMRZ`).

| | elsatia-preview | elsatia-tools | elsatia-colors |
|---|---|---|---|
| PROJECT_ID | prj_0dX75LBHTxWUYQKle7zNdWdrWctK | prj_XO6FSb0e9IFxu4SPkyvkhrw63YvZ | prj_ZEw9IIa0J6Rg5Wfi9POe6P67uAko |
| ROOT_DIRECTORY | (racine) | apps/tools ✓ | apps/colors ✓ |
| FRAMEWORK / NODE | nextjs / 24.x | nextjs / 24.x | nextjs / 24.x |
| BUILD | `check-env-manifest --auto --app gestion_pro && npm run build:gestion-pro` | défaut | défaut |
| GIT_REPOSITORY | julien-gregurec/Appli_BTP | aucun (déploiements CLI) | aucun (déploiements CLI) |
| PRODUCTION_BRANCH | main | — | — |
| Protection | aucune (public) | Vercel Authentication (sauf domaines personnalisés) | idem |
| DOMAINS | elsatia-preview.vercel.app | **tools.elsatia.fr**, elsatia-tools.vercel.app | **colors.elsatia.fr**, elsatia-colors.vercel.app |
| DEPLOYMENTS | Preview auto par branche ; dernier : V9.2 dfb59cc6 READY | 2 × production (manuels) | 3 × production READY + 1 annulé |

Points d'attention :

- `elsatia-tools` et `elsatia-colors` portent les **domaines Production** `tools.elsatia.fr` et `colors.elsatia.fr`. Toute commande ciblant leur environnement `production` toucherait la Production réelle : seuls des déploiements `target=preview` sont admissibles sur ces projets.
- `elsatia-preview` : toutes ses variables sont scopées `preview` (aucune variable `production`), build `--app gestion_pro`, déploiements par branche du dépôt. C'est cohérent avec « Gestion Pro Preview », mais sa cible `production` (branche `main` → `elsatia-preview.vercel.app`) tourne aussi avec ce projet et c'est elle qui porte les crons. La correspondance projet ↔ base `pgvvpqyjziyapbbkydmc` n'a pas pu être prouvée : `SUPABASE_PROJECT_REF` et `NEXT_PUBLIC_SUPABASE_URL` sont de type *sensitive* (illisibles) et l'URL Supabase n'apparaît pas dans les bundles de `/login`. **Identité GP Preview : non confirmée définitivement** → GP non déployé (règle phase 10).
- Variables `elsatia-preview` liées à des branches (`gitBranch=gp-preview-v8`, `claude/sleepy-cannon-6je2vo`) : surcharges propres à ces branches, sans effet sur V9.2.

## Phase 3 — Réserves

Recherche par nom et par Root Directory sur les 7 projets de l'équipe : aucun projet `reserves`, aucun projet sur `apps/reserves`. La recherche d'alias à l'échelle de l'équipe n'a pas été faite (elle lit aussi les alias Production, lecture refusée par le garde-fou de session).
**Projet `elsatia-reserves` non créé** (DECISION_REQUIRED) : la création n'a d'utilité qu'avec un déploiement, lui-même bloqué (base non migrée, 5 variables Preview requises absentes, dont des valeurs à fournir). Paramètres prêts pour l'opérateur : nom `elsatia-reserves`, équipe `julien-gregurec1`, Root Directory `apps/reserves`, framework nextjs, Node 24.x, aucun domaine Production.

## Phase 4 — Supabase Preview (lecture seule)

- Ledger : 372 entrées, `20260710000001` → `20261002000813`, préfixe exact du train (noms identiques, ordre strict, aucune version étrangère).
- 813 : marqueur du corps original présent dans `statements` ; `plateforme_annuaire_entreprises` déployée = originale (pas la reconstruction « HOTFIX 813 »).
- CURRENT_LEDGER=372 · TARGET_LEDGER=408 · PENDING_MIGRATIONS=36. Phase 0 : 20260921000300 au ledger → pont `20261003000201` no-op en Preview.
- Taille DB : 40 MB. Données : 1 entreprise, 29 utilisateurs Auth, 2 846 lignes au total sur 315 tables.
- Extensions : pg_stat_statements, pg_trgm, pgcrypto, pgsodium, plpgsql, supabase_vault, unaccent, uuid-ossp (pas de pg_cron).
- RLS : 267/267 tables `public` sous RLS, 608 policies ; 0 fonction SECURITY DEFINER sans `search_path` ; 26 fonctions SECURITY DEFINER exécutables par `anon` (à revoir dans le cadre sécurité ; non bloquant en soi, garde interne attendue).
- `applications_elsatia` : gestion_pro, colors, tools, reserves, drone actives ; `url_preview` vide pour toutes (la migration 20261003000102 concerne précisément ce point).
- Backups : 6 sauvegardes physiques (2026-09-26 → 2026-10-03T04:18:49Z, COMPLETED), `pitr_enabled=false`. L'endpoint de point de restauration renvoie « unavailable ».

## Phase 5 — Sauvegarde

```
BACKUP_METHOD=Supabase physique quotidienne (walg) + sauvegarde logique via API Management (lecture SQL)
BACKUP_CREATED=2026-10-03 ~16:15Z (logique) ; 2026-10-03T04:18:49Z (physique, existante)
BACKUP_VERIFIED=NO (au sens du pack : backup-check.mjs non exécuté)
RESTORE_PATH=Dashboard Supabase → Database → Backups → restauration 2026-10-03 04:18Z ; puis rejeu des données logiques (DELETE + INSERT par table, session_replication_role=replica)
```

Sauvegarde logique (hors dépôt, dossier de session, jamais commitée) : schéma appliqué (corps des 372 migrations lus dans `schema_migrations.statements`), données `public`, `auth`, `storage`, `platform`, `stripe_attestation`, `vault`, table du ledger, ledger JSON (`elsatia-ledger-v1`), manifeste du pack (`backup-manifest.mjs`). Pas de `pg_dump` possible : aucune URL PostgreSQL ni mot de passe DB dans la session.
Test de restauration réel : socle local PostgreSQL 16 au train 372 (`harness/build-socle.sh`), puis chargement de la sauvegarde → **278/278 tables public/platform/stripe_attestation restaurées avec des comptes identiques** ; les écarts restants (auth, storage) viennent uniquement des substituts locaux simplifiés des schémas gérés par Supabase.
L'étape `backup-check.mjs` (contrôle du pack) a été refusée par le garde-fou d'exécution de la session : PREVIEW_BACKUP_BLOCKER au sens de la mission → **migrations non appliquées**.

## Phase 6 — Preflight

- `check-ledger-v9.mjs` sur l'export réel : `PREVIEW_LEDGER_PREFIX_OK`, CURRENT_LEDGER=372, TARGET_LEDGER=408, PENDING=36, 813 originale prouvée.
- `preflight-v9.mjs` complet, `db push --dry-run`, contrôles de données invalides / essais / invariants : non exécutés (suite du blocage sauvegarde). À lancer par l'opérateur : `npm run preview:v9:preflight -- --ledger <export> --backup-manifest <manifeste>` puis `scripts/preview/v9/v9-cutover.sh`.

## Phase 7 — Migration

Non exécutée. `MIGRATIONS_APPLIED=0`. Aucune écriture sur la base.

## Phase 8 — Variables Vercel Preview (manifeste `config/env-manifest.json`, variables requises en Preview)

| App (projet) | PRESENT | MISSING | WRONG_SCOPE |
|---|---|---|---|
| Gestion Pro (elsatia-preview) | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, ELSATIA_APPLICATION_ENV, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_COLORS_URL, RATE_LIMIT_HMAC_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_ABONNEMENT_SECRET | **BANK_DATA_ENCRYPTION_KEY**, **STRIPE_WEBHOOK_EXPECTED_MODE**, **TOOLS_STORE_ENVIRONMENT** | — |
| Tools (elsatia-tools) | NEXT_PUBLIC_SUPABASE_URL | **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY** (seule ANON présente) | — |
| Colors (elsatia-colors) | NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ELSATIA_APPLICATION_ENV, NEXT_PUBLIC_COLORS_URL, NEXT_PUBLIC_ELSATIA_ACCOUNT_URL | **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY** (seule ANON présente) | — |
| Réserves (aucun projet) | — | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, ELSATIA_APPLICATION_ENV, NEXT_PUBLIC_RESERVES_URL | — |

`EXTERNAL_CONFIGURATION_REQUIRED` pour chaque MISSING. Rien n'a été copié depuis la Production. Non vérifiable sans lecture des valeurs : que `NEXT_PUBLIC_*_URL` des projets Preview désignent bien des URL Preview (et non `*.elsatia.fr`), et que `ELSATIA_APPLICATION_ENV` vaille `preview` sur Colors (la variable existe en scope Preview ; le code Colors l'exige au build, `apps/colors/scripts/verify-public-env.mjs`).

## Phase 9 — Auth callbacks (Supabase Preview, lecture)

- `site_url` et l'unique entrée de `uri_allow_list` désignent un **ancien alias de branche** `elsatia-preview-git-feat-elsatia-canoni-…` (projet elsatia-preview). Toute autre URL Preview (V9.2, Tools, Colors, Réserves) serait refusée comme cible de redirection : magic links, réinitialisation et invitations retomberaient sur cet alias.
- Non modifié : la cible correcte dépend des URL Preview finales, inexistantes tant que les déploiements sont bloqués. À corriger par l'opérateur au moment du cutover (rester en Preview : alias `*-julien-gregurec1.vercel.app` des 4 projets).
- `mailer_autoconfirm=false`, inscriptions ouvertes, SMTP personnalisé configuré, `jwt_exp=3600`.

## Phases 10 à 13 — Déploiements

Aucun déploiement lancé (porte « code après base » fermée, Next vulnérable, variables manquantes, identité GP non confirmée).

Constat : l'intégration Git de `elsatia-preview` a **déjà** construit automatiquement `integration/elsatia-canonical-train-v9.2@dfb59cc6` (READY, publique) alors que la base est à 372. C'est un « code avant base » de fait, hors de cette mission. Le push de la branche de ce rapport déclenchera de même un build Preview automatique de `elsatia-preview` (comportement de l'intégration Git, sans action ciblée ; incidence éventuelle sur les autres projets liés au dépôt non vérifiable, leur lecture étant refusée).

Recommandations opérateur : activer Vercel Authentication sur `elsatia-preview` (aujourd'hui public) ou supprimer les déploiements Preview en 16.3.5 une fois le correctif déployé ; désactiver les builds automatiques des branches tant que la base n'est pas au train.

## Phase 14 — Recette hébergée (GP seul, lecture HTTP sur le déploiement existant)

Sur `elsatia-preview-bgf9n4rqz` (dfb59cc6, base 372) : `/` 200, `/login` 200, `/connexion` → 307 `/login`, `/tableau-de-bord` → 307 `/login` (route protégée), `/manifest.webmanifest` 200.
En-têtes : CSP nonce + strict-dynamic, HSTS preload, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, `X-Robots-Tag: noindex`.
Bundles de `/login` (11 chunks) : aucune clé service role, aucune `sk_live_`/`sk_test_`, aucune clé `sb_secret_` (seule occurrence : l'expression régulière de masquage), aucune référence au projet Supabase Production ; les hôtes `*.elsatia.fr` n'y figurent que dans le catalogue `hoteProduction`.
Login réel, session, logout, mobile/desktop, console : non testés (identifiants de test non fournis ; base non migrée sous du code V9.2).

## Phase 15 — Cross-app

Non testé (aucune app satellite déployée en Preview). `DECISION_REQUIRED_LOGOUT_SCOPE` : logout global inchangé.

## Phase 16 — Parcours métier GP

Non exécuté (base non migrée ; aucune donnée fabriquée).

## Phase 17 — Sécurité

- Cron `/api/cron/abonnements` sans secret → 503 (fermé). `/api/cron/notifications-push` → 404.
- RLS : voir phase 4. Tests cross-tenant / suspended / expired hébergés : non exécutés (une seule entreprise en Preview).

## Phase 18 — Next.js

| App | Version (lockfile V9.2) | Avis | Après correctif |
|---|---|---|---|
| GP (racine) | 16.3.5 | GHSA-vcvr-r3jv-pc5j critique | 16.3.8, `npm audit --omit=dev` : plus aucun avis Next |
| Tools | 16.3.5 | idem (+ dompurify, faible) | 16.3.8 |
| Colors | 16.3.5 | idem | 16.3.8, 0 vulnérabilité |
| Réserves | 16.3.5 | idem | 16.3.8, 0 vulnérabilité |

`next/og` / `ImageResponse` ne sont pas utilisés dans le code (recherche négative), ce qui réduit l'exposition sans l'annuler (version vulnérable en ligne). Correctif `ea554fab` : `next` et `eslint-config-next` 16.3.8, Studio exclu. Rejoué : `npm run typecheck` 0, `npm run lint` 0 (0 erreur, 15 avertissements préexistants), `npm test` 0 (racine 2 950, tools 2 174, reserves 239, colors 436 tests verts), builds GP / Tools / Colors / Réserves en 16.3.8 : OK.
Restent à la racine (outillage de build, non runtime) : `fast-uri` (épinglé en 3.1.6 par `overrides`), `ajv`, `brace-expansion` — élevés, hors périmètre du correctif minimal.

## Phase 19 — Crons

`elsatia-preview` : `/api/cron/abonnements` (15 3 * * *) et `/api/cron/notifications-push` (45 3 * * *), portés par le déploiement de la cible `production` du projet (branche `main`) et donc exécutés chaque nuit contre la base Preview avec le code de `main`. `elsatia-tools` / `elsatia-colors` : aucun cron. Aucun déclenchement manuel.

## Phase 20 — WebKit

`WEBKIT_NOT_PROVEN` (seul Chromium est disponible dans l'environnement ; aucune app à tester de toute façon).

## Actions opérateur pour lever le blocage

1. Valider la sauvegarde (`npm run preview:v9:backup-check -- <manifeste>`, ou nouvelle sauvegarde avec `pg_dump` selon `docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md`).
2. `npm run preview:v9:preflight` puis `scripts/preview/v9/v9-cutover.sh --apply-preview --confirm-ref pgvvpqyjziyapbbkydmc` (36 migrations ; lock_timeout 10 s pour 20261003001503).
3. Fusionner le correctif Next 16.3.8 dans le train canonique.
4. Renseigner en Preview : GP `BANK_DATA_ENCRYPTION_KEY`, `STRIPE_WEBHOOK_EXPECTED_MODE`, `TOOLS_STORE_ENVIRONMENT` ; Tools et Colors `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ; créer `elsatia-reserves` et ses 5 variables.
5. Confirmer que `elsatia-preview` est bien le GP Preview branché sur `pgvvpqyjziyapbbkydmc`.
6. Mettre à jour Site URL / Redirect URLs Supabase Preview vers les URL Preview finales.
7. Rejouer cette mission (phases 10 à 20).
