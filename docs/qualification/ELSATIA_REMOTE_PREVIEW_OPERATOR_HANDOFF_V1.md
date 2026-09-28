# ELSATIA — Remote Preview Operator Handoff Pack V1

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v5` @ **`f6399f15`** — verdict d'origine `CANONICAL TRAIN V5 LOCALLY QUALIFIED` (355 migrations, dernière `20260928000301`, DB verify 26 contrôles) |
| Branche du pack | `claude/wizardly-keller-3gz8nv` = V5 **+ ce pack** (aucune migration ni code applicatif modifié) |
| Contexte | la mission `V4 REMOTE PREVIEW EXECUTION` a conclu `V4 PREVIEW BLOCKED` (réseau sortant refusé, aucun identifiant) — `docs/qualification/ELSATIA_V4_REMOTE_PREVIEW_EXECUTION_V1.md` sur `claude/zen-davinci-xn6m3m` |
| Actions distantes de cette mission | **Aucune.** Aucun appel Supabase, Vercel, Stripe, Brevo, Redis ni `*.elsatia.fr`. Aucune écriture Preview, aucune Production, aucun merge, aucune PR. |

## 0. Verdict

**`REMOTE PREVIEW OPERATOR HANDOFF PACK V1 READY`** — la qualification distante elle-même reste
**`NOT EXECUTED`** : elle sera produite par la commande du §2, sur un poste qui a le réseau et les
identifiants.

Ce qui est livré :

- **une commande unique** `npm run preview:qualification` qui orchestre les 16 domaines de la
  mission (35 étapes), avec protection Production, sauvegarde validée avant tout `db push`,
  arrêt de sécurité et résultat machine-readable **sans secret** ;
- une recette **Playwright distante** (GP, Tools, Colors, Réserves) ;
- un **plan hors ligne** déjà produit dans ce dépôt : `artifacts/preview-qualification.json`
  (`V5 PREVIEW NOT EXECUTED (offline plan)`, `remote_calls: false`) ;
- **27 tests hors réseau** de l'orchestrateur, dont des scénarios complets simulés (clé `sk_live`,
  URL de la base de Production, déploiement Vercel de Production, ledger d'une autre lignée,
  mode lecture seule, parcours complet jusqu'à `QUALIFIED`).

**GO / NO-GO pilote humain : NO-GO** tant que la commande du §2 n'a pas rendu
`V5 PREVIEW QUALIFIED`.

## 1. Base : pourquoi V5 (et pas V6)

| Train | Tip | Verdict | Choix |
|---|---|---|---|
| `integration/elsatia-canonical-train-v4` | `b7fa9e2c` | READY FOR REMOTE PREVIEW (puis V4 PREVIEW BLOCKED) | dépassé par V5 |
| `integration/elsatia-canonical-train-v5` | `f6399f15` | **LOCALLY QUALIFIED** | **retenu** |
| `integration/elsatia-canonical-train-v6` | — | **n'existe pas** (aucune branche `…-train-v6` sur `origin` au 2026-09-28) | — |

Le train n'est **jamais choisi silencieusement** : `scripts/preview/qualification/train.json` fige
le train, sa branche et son commit qualifié. À chaque exécution, l'étape `preflight.git` :

1. exige que HEAD contienne `f6399f15` et que `supabase/migrations` soit **identique** au train
   qualifié (sinon `NO-GO` : train non qualifié) ;
2. liste `origin/integration/elsatia-canonical-train-v*` ; si un train **plus récent et qualifié**
   existe (commit « CANONICAL TRAIN V*n* LOCALLY QUALIFIED » ou « READY FOR REMOTE PREVIEW » propre
   à ce train), elle rend `NO-GO` et demande de mettre à jour `train.json` par revue ; un train plus
   récent **non qualifié** est signalé et V5 reste la cible.

## 2. LA commande, depuis le Mac

Préparation unique : §3. Puis, depuis la racine du dépôt :

```bash
git fetch origin claude/wizardly-keller-3gz8nv
git checkout -B claude/wizardly-keller-3gz8nv origin/claude/wizardly-keller-3gz8nv
npm ci
npx playwright install chromium

npm run preview:qualification -- \
  --env-dir ~/elsatia-preview \
  --target ~/elsatia-preview/preview-target.json \
  --confirm-preview pgvvpqyjziyapbbkydmc \
  --mode full --apply-migrations
```

- `--confirm-preview` est la confirmation **tapée** à l'exécution : elle doit égaler
  `supabase.project_ref` du fichier de cible.
- `--mode full` autorise les écritures de recette ; `--apply-migrations` autorise le `db push`.
  Sans eux, la même commande est un **diagnostic en lecture seule** (recommandé en premier passage
  si l'on veut voir l'état avant d'écrire : retirer simplement `--mode full --apply-migrations`).
- Durée indicative : 10 à 25 min (dominée par la sauvegarde et Playwright).
- Code de sortie : `0` QUALIFIED · `1` NO-GO · `2` usage · `3` BLOCKED / INCOMPLETE.

À renvoyer après exécution (aucun secret dedans) : `artifacts/preview-qualification.json` et
`artifacts/preview-qualification/summary.md` (les journaux `artifacts/preview-qualification/logs/`
sont masqués eux aussi, et non versionnés). Cocher les **confirmations manuelles** listées dans
`summary.md` (réception des e-mails).

Si, **juste après le premier `db push`**, `db.verify` n'échoue que sur
`administrateur_total_actif_absent` / `cle_attestation_active_absente` : c'est attendu avant le
STEP 7 du runbook V3 (propriétaire plateforme et attestation). Relancer avec `--before-owner`, puis
faire le STEP 7, puis relancer sans ce drapeau.

## 3. Préparation du Mac (une fois)

### 3.1 Outils

| Outil | Installation | Contrôlé par |
|---|---|---|
| Node ≥ 20 (22 recommandé) | nvm / brew | `preflight.tooling` |
| `psql`, `pg_dump`, `pg_restore` **≥ version du serveur** (Supabase : 15 ou 17) | `brew install postgresql@17` puis l'ajouter au `PATH` | `preflight.tooling`, `backup.dump` (refuse un `pg_dump` plus ancien que le serveur) |
| CLI Supabase | `npm ci` (dépendance du dépôt, `npx supabase`) | `preflight.tooling` |
| Playwright + Chromium | `npm ci && npx playwright install chromium` | `preflight.tooling` |

Pas de Docker : la sauvegarde utilise `pg_dump` directement (pas `supabase db dump`).

### 3.2 Répertoire opérateur `~/elsatia-preview` (hors dépôt, `chmod 700`)

```
~/elsatia-preview/
  gp.env  tools.env  colors.env  reserves.env   # vercel env pull --environment=preview <fichier> dans chaque projet lié
  worker.env                                     # facultatif (Studio hors périmètre V5)
  qualification.env                              # secrets opérateur, modèle : docs/qualification/preview-pack/qualification.env.example
  preview-target.json                            # confirmation machine-readable, modèle : docs/qualification/preview-pack/preview-target.example.json
  backups/                                       # créé par la qualification (sauvegardes .dump + .sha256)
```

`qualification.env` (ou variables exportées dans le shell, qui l'emportent) :

| Variable | Requise | Usage |
|---|---|---|
| `ELSATIA_PREVIEW_DB_URL` | oui | ledger, sauvegarde, dry-run, `db push`, DB verify — **Preview uniquement** |
| `VERCEL_TOKEN` | oui | identité des projets, commit déployé, logs runtime |
| `ELSATIA_QA_PASSWORD_A` / `_B` | oui | comptes de recette de deux entreprises (Auth, Storage cross-tenant, Playwright) |
| `SUPABASE_ACCESS_TOKEN` | si migrations à appliquer et CLI non liée ; logs Supabase | `supabase link`, nom du projet, logs |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | si Deployment Protection | smokes HTTP, Playwright |
| `STUDIO_REDIS_URL` | non (Studio hors périmètre) | Redis |

### 3.3 Fichier de cible `preview-target.json`

Il ne contient **aucun secret** : seulement des identifiants publics et leur **recopie** dans
`confirmations`. Le gabarit versionné est volontairement **invalide** tant qu'il n'est pas rempli
(test dédié). Champs :

| Champ | Où le trouver |
|---|---|
| `supabase.project_ref` | `pgvvpqyjziyapbbkydmc` (seule ref admise par le garde du dépôt ; toute autre exige une revue de `scripts/garde-scripts-production.mjs`) |
| `supabase.project_name` | Dashboard Supabase (vérifié si `SUPABASE_ACCESS_TOKEN` est fourni) |
| `vercel.team_id`, `vercel.projects.<app>.project_id` / `project_name` | Vercel → Project → Settings → General |
| `vercel.projects.<app>.preview_origin` | URL `https://…vercel.app` du déploiement Preview **du train V5** (ou alias de branche) |
| `vercel.allowed_custom_preview_domains` | domaines Preview personnalisés éventuels (jamais `app.`, `tools.`, `colors.`, `reserves.`, `studio.`, `www.elsatia.fr` ni `elsatia.fr`) |
| `stripe.account_id` | compte **Test** (`acct_1TtrTU0bT5C0WG2a` selon le runbook V3 — à revérifier) |
| `brevo.account_email`, `brevo.recipient_allowlist` | compte Brevo de recette ; adresses que l'opérateur possède |
| `qa.tenant_a/b` : `email`, `entreprise_id`, `user_id` (facultatif), `apps` | comptes de recette de **deux entreprises différentes** ; le compte A doit avoir `gerer_pointage` dans son entreprise (Storage) ; `apps` = applications accessibles (`gp`, `colors`, `reserves`) |
| `confirmations.*` | recopies exactes (`supabase_project_ref`, les 4 `vercel_preview_projects`, `stripe_mode: "sk_test"`, `brevo_environment: "recette"`, `redis_environment: "preview"` si Redis), `confirmed_by`, `confirmed_at` (ISO 8601, **< 7 jours**) |

### 3.4 Prérequis côté Preview (hors du pack)

Le pack **qualifie**, il ne déploie pas. Avant la commande : les 4 projets Vercel Preview doivent
avoir un déploiement **READY** construit depuis `integration/elsatia-canonical-train-v5`
(`f6399f15`) ou depuis la branche du pack (runbook V3, STEPs 8-10). Sinon
`preflight.vercel-identity` rend `NO-GO` (« déploiement sur … ≠ train V5 »).

## 4. Variante : environnement Claude avec réseau + secrets

1. Réseau de l'environnement : autoriser au minimum `pgvvpqyjziyapbbkydmc.supabase.co`, l'hôte
   PostgreSQL (direct `db.<ref>.supabase.co:5432` ou pooler `aws-0-<région>.pooler.supabase.com`),
   `api.supabase.com`, `api.vercel.com`, les 4 hôtes `*.vercel.app` Preview, `api.stripe.com`,
   `api.brevo.com`, `github.com` (détection d'un train plus récent), et le registre npm pour
   `npm ci`.
2. Secrets de l'environnement (jamais dans le chat) : ceux du §3.2, plus
   `ELSATIA_PREVIEW_TARGET_JSON` = contenu JSON du fichier de cible.
3. Commande (les `.env` Preview sont lus par l'API Vercel et écrits hors dépôt, en `0600`) :

```bash
npm ci && npx playwright install chromium
npm run preview:qualification -- --pull-env --env-dir "$HOME/elsatia-preview" \
  --confirm-preview pgvvpqyjziyapbbkydmc --mode full --apply-migrations
```

Les variables Vercel de type **« sensitive »** ne sont pas déchiffrables par l'API : elles sont
listées **par nom** et `preflight.env` rend `BLOCKED_CREDENTIAL` si l'une est requise ; les fournir
alors comme secrets d'environnement ou par fichier.

## 5. Étapes (mission → orchestrateur)

Nature : **R** lecture seule (toujours exécutée) · **W** écriture de recette réversible ·
**D** écriture dangereuse. **C** = critique (non GO ⇒ arrêt de sécurité des écritures).

| § mission | Étape(s) | Nature | Ce que GO prouve |
|---|---|---|---|
| 1 Base | `preflight.git`, `preflight.train` | R, C | HEAD sur le train V5 qualifié, arbre propre, migrations identiques, aucun train plus récent qualifié ; attendus 355 / `20260928000301` / 26 contrôles à jour |
| 3 Preflight | `preflight.tooling`, `preflight.pull-env`, `preflight.env`, `preflight.dns`, `preflight.network` | R | outils ; 4 `.env` Preview conformes au manifeste et cohérents entre apps (`env-check`) ; variables opérateur ; DNS et joignabilité (HTTPS sans identifiant, TCP PostgreSQL/Redis) |
| 3 Identités | `preflight.supabase-identity`, `preflight.vercel-identity`, `preflight.stripe-mode`, `preflight.redis`, `preflight.brevo` | R, C | ref Supabase identique dans les 4 `.env`, l'URL DB et la CLI liée (+ nom du projet) ; 4 projets Vercel confirmés, déploiements Preview READY sur le train ; clé `sk_test` et compte Stripe confirmé ; hôte Redis confirmé ; compte Brevo de recette |
| 4 Protection | `protection.target` | R, C | fichier de cible valide et récent + recoupement avec **toutes** les observations + `--confirm-preview` |
| 6 Ledger | `ledger.read` | R, C | `supabase_migrations.schema_migrations` **lu réellement** (session lecture seule) et classé : `ALIGNED`, `EMPTY`, `PENDING_COMPATIBLE` (GO) ; `PENDING_OUT_OF_ORDER`, `FOREIGN` (NO-GO) |
| 5 Backup | `backup.dump`, `backup.validate` | R, C | `pg_dump -Fc` des schémas `public`, `platform`, `stripe_attestation`, `auth`, `storage`, `supabase_migrations` hors dépôt ; `pg_restore --list` contient les données de `schema_migrations`, `entreprises`, `auth.users`, `storage.objects` ; SHA-256 ; restauration d'essai locale facultative (`--restore-drill-db`) ; commande de restauration dans le JSON |
| 7 DB push | `db.push-dry-run`, `db.push` | R C, **D** C | le dry-run annonce **exactement** les migrations en attente, dans l'ordre ; `db push` seulement si sauvegarde validée + ledger compatible + dry-run conforme + cible confirmée + arbre propre + `--apply-migrations` ; ledger relu `ALIGNED` après |
| 8 DB verify | `db.verify` (+ `db.pgtap` facultatif) | R, C | `scripts/preview/db-verify.mjs` : 26 contrôles du train, préflight sécurité plateforme, RLS structurel, 35 RPC service-role only, sonde RLS réelle si `user_id` fournis ; **NO-GO si une migration du train manque** |
| 9 Auth | `auth.gotrue` | W | anonyme refusé ; mauvais mot de passe refusé ; login A et B ; `/user` ; refresh avec rotation ; logout ; refresh révoqué après logout ; reset **vers l'allowlist seulement** |
| 10 Storage | `storage.buckets`, `storage.cross-tenant` | R (+W), W | 19 buckets et visibilité ; upload/lecture/URL signée/suppression par A ; B ne lit, ne signe, n'écrit ni ne supprime rien chez A ; URL publique refusée ; nettoyage de secours |
| 11 E-mail | `email.brevo` | R (+W) | configuration ; bac à sable Brevo ; envoi réel **uniquement** à une adresse de `brevo.recipient_allowlist` (refus sinon) ; réception à cocher |
| 12 Stripe | `stripe.verify`, `preflight.stripe-mode` | R | Test uniquement (une clé live n'est **jamais** envoyée) ; endpoints webhook, portail, prix actifs non-livemode ; montants = catalogue (`verify:stripe-prices --strict`) |
| 13 Redis | `preflight.redis`, `redis.check` | R (+W) | PONG, TLS, `maxmemory-policy = noeviction` ; clé TTL 30 s en mode full. **SKIPPED** sans URL (Redis ne sert qu'au worker Studio, hors périmètre V5) |
| 14 HTTP | `http.smoke` | R | pages publiques 200, pages protégées fermées, API et webhooks aux codes attendus (GP, Tools, Colors, Réserves) |
| 15 Playwright | `e2e.gp`, `e2e.tools`, `e2e.colors`, `e2e.reserves` | W | 10 tests distants : pages publiques sans 5xx, pages protégées fermées, connexion A (et B sur GP), session conservée, déconnexion / révocation ; Réserves en viewport mobile |
| 16 Logs | `logs.vercel`, `logs.supabase`, `logs.stripe-webhooks`, `logs.summary` | R | erreurs runtime et 5xx Vercel, edge 5xx/4xx + erreurs Postgres/Auth Supabase, webhooks Stripe en échec, synthèse des requêtes en échec — fenêtre `--logs-since-minutes` (60 par défaut) |

## 6. Protection Production (§4)

Refus systématiques, **avant tout appel** vers la cible concernée :

- **Supabase Production** (`exhvuzegsefmoguxoiak`) ou toute ref ≠ `pgvvpqyjziyapbbkydmc`, qu'elle
  vienne d'un `.env`, de `ELSATIA_PREVIEW_DB_URL`, de la CLI liée ou du fichier de cible. Aucune
  connexion PostgreSQL n'est ouverte vers une ref non confirmée, **même en lecture** (test dédié).
- **`sk_live_` / `rk_live_`** dans n'importe quel `.env` : `NO-GO` sans aucune requête Stripe
  authentifiée (test dédié : la clé ne quitte pas le poste).
- **Domaines de Production** (`elsatia.fr`, `www.`, `app.`, `tools.`, `colors.`, `reserves.`,
  `studio.elsatia.fr`) comme origine Preview ; tout autre `*.elsatia.fr` doit être listé
  explicitement ; déploiement Vercel dont `target = production`.
- `ELSATIA_APPLICATION_ENV=production` ou `VERCEL_ENV=production` dans un `.env`.
- Confirmations non recopiées, confirmation de plus de 7 jours, `--confirm-preview` absent.

## 7. Arrêt de sécurité (§17)

Statuts : `GO`, `NO-GO`, `SKIPPED`, `BLOCKED_CREDENTIAL`, `BLOCKED_NETWORK`.

Dès qu'une étape **critique** n'est pas `GO` (ou `protection.target` est sautée), **toutes** les
écritures suivantes — `db push` **et** écritures de recette (sessions Auth, objets Storage,
e-mails réels, clé Redis, Playwright) — sont `SKIPPED` avec `safe_stop: true` et la liste des
étapes bloquantes. C'est plus strict que « seules les écritures dangereuses » : sur une cible non
confirmée, même une écriture de recette est refusée. Les diagnostics en lecture seule (ledger,
DB verify, Storage en lecture, Stripe en GET, HTTP, logs) **continuent**.

Verdict global : un `NO-GO` quelconque ⇒ `V5 PREVIEW NO-GO` ; sinon un `BLOCKED_*` sur une étape
requise ⇒ `V5 PREVIEW BLOCKED` ; sinon une étape requise `SKIPPED` ⇒ `V5 PREVIEW INCOMPLETE` ;
sinon `V5 PREVIEW QUALIFIED`.

## 8. Résultat machine-readable (§18)

`artifacts/preview-qualification.json`, schéma `elsatia.preview-qualification.v1` : `verdict`,
`counts`, `safe_stop`, `train`, `git`, `target` (identifiants publics, allowlist masquée),
`ledger`, `backup` (nom, taille, SHA-256, entrées, **commande de restauration** avec
`$ELSATIA_PREVIEW_DB_URL` en variable), `deployments`, `manual_confirmations`, `steps[]`
(`id`, `section`, `nature`, `critical`, `required`, `status`, `summary`, `details`,
`duration_ms`, `safe_stop`).

**Sans secret** : toute sortie (console, journaux, JSON, synthèse) passe par un masque qui connaît
chaque valeur des `.env` et de `qualification.env`, chaque jeton obtenu pendant l'exécution
(sessions Auth), le mot de passe extrait de l'URL DB, et les motifs `sk_`/`rk_`/`whsec_`/`sbp_`/
JWT/URL de connexion/`xkeysib-`. Les adresses e-mail sont partiellement masquées. `pg_dump`,
`pg_restore` et `psql` reçoivent la cible par variables `PG*`, jamais en argument. Les traces
Playwright sont désactivées (elles contiendraient les jetons).

La version versionnée aujourd'hui est le **plan hors ligne** de cette mission :
`V5 PREVIEW NOT EXECUTED (offline plan)` — GO 2 (git, train), NO-GO 2 (outil `supabase` absent de
ce conteneur sans `node_modules` ; fichier de cible absent), BLOCKED_CREDENTIAL 21,
BLOCKED_NETWORK 2, SKIPPED 8. L'exécution opérateur l'écrase.

## 9. Limites connues (non masquées)

| Sujet | État |
|---|---|
| Parcours Stripe réel (Checkout carte `4242…`, rejeu de webhooks) | **non automatisé** : le pack vérifie la configuration Test et les livraisons en échec ; le parcours reste le STEP 12 du runbook V3 |
| GP ↔ Réserves, RGPD (export/purge), Relevé Lot 5 distants | hors pack (couverts localement par V5 ; Playwright distant = parcours de santé et d'authentification) |
| Réception des e-mails | confirmation **manuelle** (liste dans `summary.md`) |
| API runtime-logs Vercel | au mieux : `SKIPPED` si le plan / jeton ne l'expose pas, avec la commande manuelle `vercel logs <deployment>` |
| Logs Supabase | requêtes Logflare de l'API de gestion ; les refus RLS / 4xx provoqués par les tests d'isolation sont attendus |
| `db.pgtap` | facultatif (`--pgtap`) ; suppose `supabase test db --linked` disponible dans la CLI installée |
| Restauration | jamais automatique ; restauration d'essai seulement vers une base **locale** |
| Studio / worker / Redis | hors périmètre V5 : Redis `SKIPPED` sans URL |
| Ce pack n'a jamais tourné contre la vraie Preview | prouvé par 27 tests à faux runtime ; les formats de réponse Vercel / Supabase Management / Brevo sont ceux documentés publiquement — un écart se manifestera en `NO-GO` explicite, jamais en faux `GO` |

## 10. Validation locale de cette mission

| Commande | Résultat |
|---|---|
| `npm run test:preview-qualification` | ✅ **27/27** (sans réseau) |
| `npm run test:preview-pack` | ✅ 28/28 (inchangé) |
| `npm run verify:env-manifest` / `test:env-manifest` | ✅ 0 erreur (14 DECISION_REQUIRED préexistantes) / 67/67 — 13 variables opérateur/recette déclarées |
| `npm run verify:train-expectations` | ✅ 355, `20260928000301`, 26 contrôles |
| `npm run verify:secrets` | ✅ aucun secret reconnu |
| `npm run test:seeds`, `test:migration-targets` | ✅ 48/48, 7/7 |
| inventaire `ENV_INVENTORY_PREVIEW_V1.generated.md` | ✅ inchangé |
| `playwright test -c playwright.remote.config.ts --list` | ✅ 10 tests / 4 projets chargés (aucune exécution) |
| `tsc --strict` sur la config et les specs distantes | ✅ 0 erreur (types Node simulés) |
| `npm run preview:qualification -- --offline --mode full` | ✅ plan écrit, **0 appel distant**, 0 secret |
| `npm run typecheck`, `lint`, `build` complets | **non exécutés** ici : `node_modules` absent et aucune installation depuis le registre dans cette mission — la CI de la branche les exécute (nouvelle étape `test:preview-qualification` ajoutée au job sans dépendance) |

## 11. Fichiers

| Fichier | Rôle |
|---|---|
| `scripts/preview/qualification/run.mjs` | orchestrateur (`npm run preview:qualification`) |
| `scripts/preview/qualification/train.json` | train qualifié ciblé (V5) |
| `scripts/preview/qualification/lib/core.mjs` | statuts, masque, verdict, arrêt de sécurité |
| `scripts/preview/qualification/lib/target.mjs` | fichier de cible, protection Production, allowlist |
| `scripts/preview/qualification/lib/database.mjs` | ledger, dry-run, sauvegarde, restauration |
| `scripts/preview/qualification/lib/runtime.mjs` | I/O (processus, HTTP, DNS, TCP), mode `--offline`, journaux masqués |
| `scripts/preview/qualification/steps/*.mjs` | les 35 étapes |
| `scripts/preview/qualification/qualification.test.mjs` | 27 tests hors réseau |
| `playwright.remote.config.ts`, `tests/e2e-remote/*` | recette Playwright distante |
| `docs/qualification/preview-pack/preview-target.example.json` | gabarit de cible (invalide tant que non rempli) |
| `docs/qualification/preview-pack/qualification.env.example` | gabarit des secrets opérateur |
| `artifacts/preview-qualification.json` | plan hors ligne (écrasé par l'exécution) |
| `config/env-manifest.json`, `package.json`, `.github/workflows/ci.yml`, `tsconfig.json`, `.gitignore` | déclarations, scripts npm, étape CI, typage, journaux ignorés |
