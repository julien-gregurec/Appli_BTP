# ELSATIA — Preview : pack d'exécution final (V1)

Date : 2026-09-26. Base : `integration/elsatia-canonical-train-v2` @ `819ebe5`
(verdict `CANONICAL TRAIN V2 LOCALLY QUALIFIED`). Branche de travail : `claude/trusting-edison-scjrd5`.

**Aucun déploiement. Aucune Production. Aucune action distante.** Aucun identifiant Vercel,
Supabase, Stripe, Brevo ou Redis n'est disponible dans cette session : rien n'a été tenté à distance.
Tout ce qui est marqué « prouvé » l'a été par **exécution locale** (PostgreSQL 16 + les 335
migrations du train, Redis 7, `next start` de Gestion Pro).

**But** : qu'au jour où les identifiants sont là, l'opérateur **exécute** — sans rien réanalyser.
Chaque étape donne une commande, un critère de sortie et une branche d'échec. Ce pack **remplace**,
pour l'exécution, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md`, qui avait été écrit pour
la ref de préparation (321 migrations) et contient 6 affirmations devenues fausses sur le train V2
(§11).

Règles absolues, contrôlées par les scripts **avant tout réseau** :

- référence Supabase Production `exhvuzegsefmoguxoiak` → **refus** (code 2), même si l'opérateur la
  déclare « attendue » ;
- clé Stripe `sk_live_` / `rk_live_` → refus ; `ELSATIA_APPLICATION_ENV=production` ou
  `VERCEL_ENV=production` dans un fichier fourni → refus ;
- jamais `vercel deploy --prod` sur un projet Preview ; jamais `supabase config push` ;
- aucune valeur d'environnement n'est jamais affichée (noms, états, « identique / différent »).

---

## 0. Livrables

| Livrable | Rôle |
|---|---|
| Ce document | Pack d'exécution, verdict |
| `docs/qualification/preview-pack/ENV_INVENTORY_PREVIEW_V1.generated.md` | Inventaire exact, variable par variable, des 6 unités déployables (régénérable : `npm run preview:env-inventory`) |
| `scripts/preview/lib/preview-guard.mjs` | Garde-fous communs (réf. Preview, Production refusée, Stripe test, origines HTTPS) |
| `scripts/preview/env-inventory.mjs` | Inventaire depuis le manifeste (hors ligne) |
| `scripts/preview/env-check.mjs` | Preflight manifeste **+ cohérence entre applications** (hors ligne) |
| `scripts/preview/db-verify.mjs` | Vérification base : registre des migrations, 13 contrôles, préflight sécurité, RLS structurelle, RPC service-role only, sonde RLS fonctionnelle (lecture seule forcée) |
| `scripts/preview/http-smoke.mjs` | Smoke HTTP anonyme des 5 apps (GET/OPTIONS, redirections non suivies) |
| `scripts/preview/stripe-test-verify.mjs` | Stripe Test : endpoints, événements, portail, prix (GET uniquement) |
| `scripts/preview/storage-smoke.mjs` | Buckets, drapeaux public, refus anonyme ; `--write` = safe-run dépôt/lecture signée/suppression |
| `scripts/preview/redis-check.mjs` | Redis du worker sans dépendance : PING, version, `noeviction`, TLS, files BullMQ ; `--roundtrip` safe-run |
| `scripts/preview/preview-pack.test.mjs` | 24 tests hors réseau, branchés en CI (`npm run test:preview-pack`) |
| `config/env-manifest.json` | +2 variables opérateur (`ELSATIA_PREVIEW_DB_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`), +1 accès dynamique justifié |

---

## 1. Base

| | |
|---|---|
| Ref à déployer | `integration/elsatia-canonical-train-v2` (ou cette branche, qui n'ajoute que de l'outillage et de la documentation) |
| Migrations | **335**, `20260710000001` → **`20260923000400`** ; `verify:migrations` ✅ |
| Rejeu à froid (ce pack) | `rebuild_db.sh pack_preview` : **335/335**, 0 erreur |
| Applications | Gestion Pro (racine), Colors, Tools, Réserves, Studio (`apps/*`), worker `workers/studio-video` |
| Lot Studio post-H | **non intégré** (inchangé) |
| Planificateur de purge RGPD | **OFF** (variables vides = `mode: off`) |

---

## 2. Inventaire exact des variables

Source unique : `config/env-manifest.json` (211 variables). Classes pour la cible `preview` :
**REQUIRED** (`required: true`, ou drapeau que le manifeste exige défini en preview),
**CONDITIONAL** (requise dès qu'une fonction est activée, `required_when`), **OPTIONAL**.
« Preview-only » = variable absente de la cible production. Le détail variable par variable (public,
secret, build/runtime, valeur imposée, valeurs admises, interdite) est dans
`preview-pack/ENV_INVENTORY_PREVIEW_V1.generated.md`.

| App | Total | Required | Conditional | Optional | Public | Secret | Build-time |
|---|---|---|---|---|---|---|---|
| gestion_pro | 117 | 19 | 78 | 20 | 11 | 17 | 12 |
| colors | 6 | 6 | 0 | 0 | 4 | 1 | 5 |
| tools | 7 | 2 | 1 | 4 | 6 | 0 | 7 |
| reserves | 9 | 5 | 2 | 2 | 3 | 2 | 4 |
| studio | 13 | 6 | 2 | 5 | 3 | 1 | 3 |
| studio_worker | 15 | 3 | 1 | 11 | 1 | 2 | 1 |

**Preview-only** : aucune variable applicative n'est propre à la Preview (même contrat que la
Production, valeurs différentes). Les seules variables `preview`-only sont côté **opérateur**
(`ops_scripts`) : `ELSATIA_SUPABASE_PROJECT_NAME`, `SUPABASE_PROJECT_REF`,
`ELSATIA_PREFLIGHT_ENFORCEMENT` (coupe-circuit, **ne pas poser**), et les deux ajoutées par ce pack :
`ELSATIA_PREVIEW_DB_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET` (shell opérateur seulement, jamais sur
un déploiement).

### 2.1 REQUIRED par application — `P` public, `S` secret, `= v` valeur imposée en Preview

| App | Variables |
|---|---|
| Gestion Pro | `NEXT_PUBLIC_APP_URL` P · `NEXT_PUBLIC_COLORS_URL` P · `NEXT_PUBLIC_SUPABASE_URL` P · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` P · `SUPABASE_SERVICE_ROLE_KEY` S · `RATE_LIMIT_HMAC_KEY` S · `BANK_DATA_ENCRYPTION_KEY` S · `STRIPE_SECRET_KEY` S (`sk_test_`) · `STRIPE_WEBHOOK_ABONNEMENT_SECRET` S · `STRIPE_WEBHOOK_EXPECTED_MODE` = `test` · `ELSATIA_APPLICATION_ENV` = `preview` · `TOOLS_STORE_ENVIRONMENT` (∈ sandbox/production ; **`sandbox`** en Preview) · drapeaux = `false` : `ABONNEMENTS_PUBLICS_OUVERTS`, `FEATURE_AI_ENABLED`, `FEATURE_AI_DEVIS_ENABLED`, `FEATURE_BOUTIQUE_ENABLED`, `FEATURE_CRONS_ENABLED`, `FEATURE_RELANCES_AUTO_ENABLED`, `STRIPE_AUTOMATIC_TAX_ENABLED` |
| Colors | `NEXT_PUBLIC_SUPABASE_URL` P · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` P · `NEXT_PUBLIC_COLORS_URL` P · `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` P (portail de compte = **origine GP** + `/abonnement`) · `SUPABASE_SERVICE_ROLE_KEY` S · `ELSATIA_APPLICATION_ENV` = `preview` |
| Tools | `NEXT_PUBLIC_SUPABASE_URL` P · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` P — et, bien qu'OPTIONAL au manifeste, **à poser** : `NEXT_PUBLIC_TOOLS_ENV` = `preview`, `NEXT_PUBLIC_TOOLS_URL` P (sinon repli sur l'URL de **production** `https://tools.elsatia.fr`) |
| Réserves | `NEXT_PUBLIC_SUPABASE_URL` P · `NEXT_PUBLIC_SUPABASE_ANON_KEY` P (**même valeur** que la publishable des autres apps) · `NEXT_PUBLIC_RESERVES_URL` P · `SUPABASE_SERVICE_ROLE_KEY` S · `ELSATIA_APPLICATION_ENV` = `preview` |
| Studio (si D3) | `NEXT_PUBLIC_STUDIO_URL` P · `NEXT_PUBLIC_SUPABASE_URL` P · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` P · `STUDIO_STORAGE_SERVICE_KEY` S · `STUDIO_SIGNUP_MODE` (= `closed`) · `STUDIO_LEGAL_PUBLISHED` |
| Worker (si D4) | `NEXT_PUBLIC_SUPABASE_URL` P · `STUDIO_STORAGE_SERVICE_KEY` S · `STUDIO_REDIS_URL` S (`rediss://`) |

### 2.2 CONDITIONAL — à poser selon le périmètre Preview

| Si… | Variables (GP sauf mention) |
|---|---|
| e-mails activés (recommandé : oui) | `BREVO_API_KEY` S, `EMAIL_FROM_ADDRESS` (GP **et** Réserves) ; `EMAIL_FROM_NAME`, `SUPPORT_EMAIL` optionnelles |
| abonnement vendu (oui) | 8 prix de forfait `STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` (IDs Test : `config/stripe-prices.test.json`) ; `STRIPE_PORTAL_CONFIGURATION_ID` (optionnelle, §5.3) |
| capacité supplémentaire testée | `STRIPE_PRICE_COMPTE_SUP_<OFFRE>_<PÉRIODE>` (**noms lus par le runtime**, absents de `stripe-prices.test.json`, qui liste des `COMPTE_SUP_ROLE_*` que le runtime ne lit pas — §5.6) |
| attestation d'état Stripe (STEP propriétaire) | `STRIPE_STATE_ATTESTATION_KEY_ID`, `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` S (couple Ed25519 **dédié Preview**) |
| Tools Pro testé | `STRIPE_TOOLS_SECRET_KEY` S (`sk_test_` obligatoire), `STRIPE_TOOLS_WEBHOOK_SECRET` S, `STRIPE_TOOLS_PRICE_MONTHLY`, `STRIPE_TOOLS_PRICE_ANNUAL`, `TOOLS_APP_URL`, `TOOLS_ALLOWED_ORIGINS` ; côté Tools : `NEXT_PUBLIC_TOOLS_BILLING_API_URL` = origine GP |
| crons déclenchés à la main (§8) | `CRON_SECRET` S (GP : seulement si `FEATURE_CRONS_ENABLED=true` ; **Réserves : toujours**, sinon 503) |
| Connect / Boutique (hors défaut) | `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET` S / `STRIPE_WEBHOOK_BOUTIQUE_SECRET` S |
| reportés (ne pas poser) | Powens, VAPID, `NOTIFICATIONS_WEBHOOK_SECRET`, `PAYROLL_IMPORT_SECRET`, OpenAI, Apple/Google Play |

### 2.3 Interdites en Preview (le preflight échoue si posées à autre chose que `false`/vide)

`DISABLE_EMAIL_LOGIN`, `ELSATIA_LOCAL_DEMO` (GP) ; `STUDIO_ACCEPTANCE`, `STUDIO_RENDER_INTERNAL_PREVIEW`,
`STUDIO_RUNTIME_TRACE` (Studio) ; `STUDIO_RENDER_DIAGNOSTICS`, `STUDIO_AI_TEST_PROVIDER_FAILURE`,
`STUDIO_TEMPLATE_COMPARISON` (worker) ; `STUDIO_MAILPIT_URL`. Et, hors manifeste : jamais
`ELSATIA_APPLICATION_ENV=local`, `NEXT_PUBLIC_TOOLS_ENV=local|development`,
`ELSATIA_PREFLIGHT_ENFORCEMENT=report`.

### 2.4 Contrôle avant pose — `env-check`

```bash
mkdir -p ~/elsatia-preview   # hors dépôt, jamais versionné
# gp.env colors.env tools.env reserves.env [studio.env worker.env] remplis depuis les gabarits
# .env.preview.example / apps/<app>/.env.preview.example / workers/studio-video/.env.example
npm run preview:env-check -- --dir ~/elsatia-preview --require gp,colors,tools,reserves
```

En plus du preflight du manifeste par app, contrôle ce qu'aucun outil existant ne voyait :
même projet Supabase partout (SSO) et = Preview attendue ; même clé publique (Réserves lit
`…_ANON_KEY`) ; même clé de service GP/Colors/Réserves ; même clé Storage Studio/worker ;
`NEXT_PUBLIC_COLORS_URL` GP = Colors ; portail de compte Colors → origine GP ; API de facturation
Tools → origine GP ; `TOOLS_APP_URL` = origine Tools ; `TOOLS_ALLOWED_ORIGINS` ∋ origine Tools ;
aucune `NEXT_PUBLIC_*` égale à un secret d'un autre fichier ; clés Stripe test ; Store Tools `sandbox`.
**Sortie** : `GO : aucune erreur.` Après pose sur Vercel, rejouer sur `vercel env pull
--environment=preview` de chaque projet (les valeurs réellement posées).

---

## 3. Matrice des projets Vercel

| Réglage | Gestion Pro | Colors | Tools | Réserves | Studio (si D3) |
|---|---|---|---|---|---|
| Projet | `elsatia-preview` (existe) | `elsatia-colors` (cité par la doc Colors ; sinon à créer) | à créer (`elsatia-tools-preview`) | à créer (`elsatia-reserves-preview`) | à créer (`elsatia-studio-preview`) |
| Root Directory | `.` | `apps/colors` | `apps/tools` | `apps/reserves` | `apps/studio` |
| Include files outside Root | sans objet | **ON** (`file:../../packages/*`) | **ON** (chemin TS `../../packages/application-access` + preflight) | **ON** | **ON** |
| Framework / Node | Next.js / 24.x | idem | idem | idem | idem |
| Install Command | `npm ci` | `npm ci` | `npm ci` | `npm ci` | `npm ci` |
| Build Command | **`npm run build:gestion-pro`** (jamais `npm run build`, qui enchaîne Tools sans ses dépendances) | `npm run build` | `npm run build` (`--webpack` + génération `sw-tools.js`) | `npm run build` | `npm run build` (`--webpack`) |
| Output | défaut | défaut | défaut (`output: export` seulement si `ELSATIA_TOOLS_NATIVE=1` — **ne pas poser**) | défaut | défaut |
| Env scope | **Preview uniquement** ; « Automatically expose System Environment Variables » **ON** (sinon `VERCEL_ENV` invisible → preflight de build non appliqué) | idem | idem | idem | idem |
| Région | `fra1` (`vercel.json`) | défaut | défaut | `fra1` (`apps/reserves/vercel.json`) | défaut |
| Crons | 2 dans `vercel.json` — **jamais exécutés sur Preview** | — | — | 1 (`apps/reserves/vercel.json`) — jamais sur Preview | — |
| Domaine | alias stable `*.vercel.app` (documenté : `elsatia-preview-julien-gregurec-julien-gregurec1.vercel.app`) | alias `*.vercel.app` | alias `*.vercel.app` | alias `*.vercel.app` | alias `*.vercel.app` |
| Deployment Protection | ON ; secret « Protection Bypass for Automation » pour Stripe et `http-smoke` (à **régénérer** après campagne) | ON | ON | ON | ON |
| Santé (aucune app n'expose `/api/health`) | `GET /login` 200 **et** `GET /auth/callback` 307 (prouve le rate-limiter donc la clé de service) **et** catalogue Tools JSON 200 (503 `{products:[]}` si Tools Pro hors périmètre ; jamais 307) | `GET /login` 200 | `GET /sw-tools.js` 200 | `GET /api/offline/ping` **204** | `GET /login` 200 (503 = `STUDIO_ENABLED=false`) |
| Log de build exigé | `[env-manifest] cible preview : mode enforce.` puis `GO : aucune erreur.` | idem | idem | idem | idem |

Séquence des URL croisées (figées au build) : 1ᵉʳ déploiement de chaque projet → alias stables →
compléter `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_COLORS_URL`, `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`,
`NEXT_PUBLIC_RESERVES_URL`, `NEXT_PUBLIC_TOOLS_URL`, `NEXT_PUBLIC_TOOLS_BILLING_API_URL`,
`TOOLS_APP_URL`, `TOOLS_ALLOWED_ORIGINS` → `env-check` → **redéployer**. Déployer en Preview puis
`vercel alias set <url-deploiement> <alias>` ; **jamais** `--prod` (ce projet a son propre
environnement « Production » : `VERCEL_ENV=production` sur une Preview désarme le preflight).

---

## 4. Supabase — exécution

Projet par défaut (D2) : `pgvvpqyjziyapbbkydmc` (eu-west-3, plan gratuit, organisation à sa limite
de 2 projets). Garde des scripts de recette verrouillé sur cette référence.

### 4.1 Pré-contrôles et sauvegarde

```bash
npx supabase login && npx supabase link --project-ref pgvvpqyjziyapbbkydmc
cat supabase/.temp/project-ref                           # doit afficher pgvvpqyjziyapbbkydmc
npx supabase db dump --linked -f ~/elsatia-preview/backup-schema-$(date +%F).sql
npx supabase db dump --linked --data-only -f ~/elsatia-preview/backup-data-$(date +%F).sql
export ELSATIA_PREVIEW_DB_URL='postgresql://…'           # Dashboard → Database → Connection string
npm run preview:db-verify -- --allow-pending              # AVANT push : registre, lignée, état actuel
npx supabase db push --linked --dry-run
```

Branches de décision **pré-écrites** (sortie de `db-verify --allow-pending`) :

| Constat | Action |
|---|---|
| `DB-MIGRATIONS-FOREIGN` (version distante absente du dépôt : autre lignée, p. ex. une orpheline `…184`) | **Arrêt.** `db push` refusera. Défaut conservateur : `supabase migration repair --status reverted <v>` **uniquement** si le schéma de cette version est prouvé identique à une migration du train ; sinon réinitialiser le projet (données de recette seulement, sauvegarde faite) |
| `DB-MIGRATIONS-PENDING` = 335 − N | Normal avant push. Si N = 328 (base V1), les 7 migrations V2 sont **toutes > `…346`** : upgrade monotone prouvé (V2 §9 : 0 écart de lignes, 34/34 checksums, RLS identique) |
| `pgsodium` indisponible | NO-GO (la `20260828000244` l'installe ; 245→400 bloquées) |

### 4.2 Migration push et vérification

```bash
npx supabase db push --linked
npx supabase migration list --linked                      # 335 des deux côtés, dernière 20260923000400
npm run preview:db-verify -- --before-owner               # juste après push
```

`--before-owner` tolère **exactement** les 2 anomalies attendues avant le STEP propriétaire
(`administrateur_total_actif_absent`, `cle_attestation_active_absente`) ; toute autre anomalie =
NO-GO. **Prouvé localement** sur les 335 migrations (§10) : 11/11 contrôles bloquants OK, 2 non
bloquants en attente (`url_preview`, propriétaire), 0 table `public` sans RLS, 0 droit d'écriture
anon, 18 buckets dont 1 public, 20/20 RPC service-role only.

### 4.3 Auth URLs et redirections (Dashboard → Authentication → URL Configuration)

| Champ | Valeur |
|---|---|
| **Site URL** | origine Preview **Gestion Pro** (obligatoire : les deux gabarits construisent `{{ .SiteURL }}/auth/confirm?token_hash=…&type=email|recovery` — le `redirectTo` des apps n'entre **pas** dans le lien) |
| Additional Redirect URLs | `https://<gp>/auth/callback` · `https://<colors>/auth/callback` · `https://<reserves>/auth/callback` · `https://<tools>/compte?recovery=1` · (`fr.elsatia.tools://auth/recovery` si natif testé) · (`https://<studio>/auth/callback` si D3) |
| Email Templates | coller `supabase/templates/confirm_signup.html` (Confirm signup) et `reset_password.html` (Reset password) ; invite / password-changed : **non utilisés** |
| SMTP | Brevo `smtp-relay.brevo.com:587`, expéditeur `contact@elsatia.fr`, clé SMTP dédiée Preview |
| Providers → Email | confirmations **activées** ; MFA TOTP activé |
| Interdit | `supabase config push` (écraserait l'Auth distante avec `127.0.0.1`) |

Conséquence à connaître (pas un défaut bloquant) : un reset demandé depuis **Tools** ou **Studio**
aboutit sur `/auth/confirm` de **GP** (compte commun, le mot de passe est bien changé) ; seul Colors
dispose d'un relais depuis GP.

### 4.4 Storage

18 buckets créés par migration, **seul `entreprise-assets` public** (5 MiB, png/jpeg/webp) ; les 17
autres privés avec limite et types MIME. `studio-originals` / `studio-renders` = 1 GiB (> limite
du plan gratuit — sans effet si Studio exclu).

```bash
npm run preview:storage-smoke -- --env-file ~/elsatia-preview/gp.env           # lecture seule
npm run preview:storage-smoke -- --env-file ~/elsatia-preview/gp.env --write   # safe-run : 1 PNG 1×1 déposé puis supprimé
```

Attendu : 18/18, drapeau public exact, liste anonyme vide ou refusée, URL publique d'un bucket privé
refusée ; `--write` : URL publique refusée, URL signée = mêmes octets, objet supprimé (vérifié par
liste). Puis, fonctionnel (§8) : upload UI `entreprise-assets` (logo), `pointage-preuves`,
`reserves-photos`.

### 4.5 RLS smoke

1. Structurel (inclus dans `db-verify`) : 0 table `public` sans RLS ; tables RLS sans policy
   listées (15 sur base neuve = tables techniques fermées par défaut, attendu) ; 0 privilège
   d'écriture `anon` sur `public`.
2. Fonctionnel, **lecture seule** : après §4.6, deux utilisateurs métier de **deux entreprises**
   différentes :
   ```bash
   npm run preview:db-verify -- --rls-users <uuid_utilisateur_A>,<uuid_utilisateur_B>
   ```
   Rejoue la RLS en `authenticated` avec leurs claims et compte les lignes visibles d'une autre
   entreprise sur 9 tables (clients, chantiers, devis, factures, employés, pointages, notes de frais,
   réserves, seaux Colors). Attendu **0**. Prouvé localement : 0 sur base saine ; **`clients=1`
   détecté** sur une copie où la RLS de `clients` a été coupée.
3. UI (§8) : deux comptes, aucune lecture croisée.

### 4.6 Seed Preview et entitlements

| Étape | Commande / geste | Sortie |
|---|---|---|
| Propriétaire plateforme | compte `julien@elsatia.fr` : inscription → confirmation e-mail → TOTP → session AAL2 → `/plateforme` → revendiquer (`plateforme_proprietaire_revendiquer()`) | ligne propriétaire `active` |
| Attestation Stripe (env `test`) | couple Ed25519 **dédié Preview** (`ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md` §3, `live`→`test`) ; poser `STRIPE_STATE_ATTESTATION_*` sur GP, scope Preview | `npm run preview:db-verify` (sans `--before-owner`) → **GO** |
| Entreprise A (recette) | créée par l'UI GP (`/signup` → onboarding) | 1 entreprise, 1 gérant |
| Entreprise B (isolation) | idem, autre compte | 2ᵉ tenant |
| Données pilote (optionnel, D2 = réutiliser) | `node scripts/executer-script-production.mjs seed_entreprise_pilote_btp.sql` puis `assertions_entreprise_pilote_btp.sql` | 15 comptages OK (28 employés, 7 chantiers, 9 devis, 7 factures, 300 affectations…) ; comptes pilote **sans mot de passe** |
| Année de recette (optionnel) | `node scripts/seed-elsatia-preview-year.mjs --dry-run --live-readonly` puis `--execute --confirm=…` | exige l'entreprise `1bfc5dc6-…` existante, drapeaux à `false`, `.vercel/project.json` = `elsatia-preview` |
| `url_preview` | `/plateforme/applications` (ou `update public.applications_elsatia set url_preview = '<origine>' where code = …`) pour `gestion_pro`, `colors`, `tools`, `reserves` | contrôle 9 de `db-verify` ✓ |
| **Entitlements** (session AAL2, admin total) | Colors : `plateforme_activer_application_entreprise(<A>,'colors')` puis `plateforme_habiliter_utilisateur_application(<user>,<A>,'colors','colors_admin_organisation')` · Réserves : idem `'reserves'` / `'reserves_admin_organisation'` · Tools : idem `'tools'` / `'tools_pro'` + synchro cloud : `plateforme_attribuer_entitlement_utilisateur(<user>,'tools','pro',array['saved-projects'],'internal')` | Colors `/api/acces` 200 ; Réserves `/dashboard` ; Tools projets synchronisés |
| Nettoyage pilote | `CONFIRM_DELETE_TEST_DATA=YES node scripts/executer-script-production.mjs cleanup_entreprise_pilote_btp.sql` | entreprise PILOTE-BTP-V1 supprimée |

Aucun droit applicatif n'est accordé par migration : sans ces appels, Colors/Réserves/Tools
refusent l'accès — comportement voulu.

### 4.7 Tests « service-role only »

| Contrôle | Où | Attendu |
|---|---|---|
| 20 RPC techniques (journal et synchro abonnement, facture d'abonnement, suspensions, Boutique, Connect, Tools, Réserves notifications, Studio render) : EXECUTE **refusé** à `anon` et `authenticated`, **accordé** à `service_role` | `db-verify` (`DB-SERVICE-ONLY`) | 20/20 ; prouvé + contre-épreuve (`grant … to authenticated` détecté) |
| Liste des buckets | `storage-smoke` (clé de service) vs anonyme | 18 vs rien |
| Webhooks Stripe (seuls appelants des RPC `*_service`) | §5 | 200 ; 400 sans signature |
| Crons (bearer `CRON_SECRET`) | §8 | 401 sans bearer (Réserves) / 404 (GP, crons OFF) |
| Pages `/plateforme` (RPC plateforme exigeant AAL2) | UI, compte non-AAL2 | redirection `/mfa/challenge` |
| Clé de service jamais dans un bundle | `env-check` (`X-SECRET-IN-PUBLIC`) + preflight (`PF-PUBLIC-VALUE-SECRET-SHAPED`) | 0 |

---

## 5. Stripe — mode Test

Compte Test documenté : `acct_1TtrTU0bT5C0WG2a` ; endpoint abonnement existant
`we_1Tziay0bT5C0WG2a4Ib2ncwB` (vérifier l'URL ; sinon le **désactiver**, jamais le supprimer).

### 5.1 Produits et prix

| Famille | Nécessaire en Preview | Variables | Source des IDs |
|---|---|---|---|
| Forfaits | **oui** | `STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` (8) | `config/stripe-prices.test.json` (génération `CANONICAL-V4-2026-09`) |
| Comptes supplémentaires | si capacité testée | `STRIPE_PRICE_COMPTE_SUP_<OFFRE>_*` (runtime) | à relever/créer dans le compte Test (§5.6) |
| Modules, options IA, packs IA | non (non vendus par Checkout) | `STRIPE_PRICE_MODULE_*`, `…OPTION_IA_*`, `…IA_*` | `stripe-prices.test.json` |
| Tools Pro | si Tools Pro testé | `STRIPE_TOOLS_PRICE_MONTHLY/ANNUAL` (compte Tools, `sk_test_` imposé par le code) | compte Tools Test |
| Boutique / Connect | non (D5) | prix inline (`price_data`) | — |

```bash
STRIPE_SECRET_KEY=… npm run verify:stripe-prices -- --strict   # montants = catalogue, annuel = 10 × mensuel, livemode=false
```

### 5.2 Webhooks (tous sur l'origine **GP**)

| Route | Secret | Événements à abonner (exactement) | Défaut |
|---|---|---|---|
| `/api/stripe/abonnement/webhook` | `STRIPE_WEBHOOK_ABONNEMENT_SECRET` | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.created`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required` | **oui** |
| `/api/tools/monetization/stripe/webhook` (compte Tools) | `STRIPE_TOOLS_WEBHOOK_SECRET` | `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded` | si Tools Pro |
| `/api/stripe/webhook` (Connect, événements des comptes connectés) | `STRIPE_WEBHOOK_SECRET` | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `account.updated` | non |
| `/api/stripe/boutique/webhook` | `STRIPE_WEBHOOK_BOUTIQUE_SECRET` | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` | non (404 tant que `FEATURE_BOUTIQUE_ENABLED=false`) |

Avec Deployment Protection : URL d'endpoint `https://<gp>/<route>?x-vercel-protection-bypass=<secret>`.
**N'abonner aucun événement en trop** sur l'abonnement : la route réserve une ligne
`abonnement_evenements` **avant** de regarder le type — un événement non traité crée une ligne à
`statut_resultant` NULL, ou répond 422/503 si l'entreprise est introuvable (et Stripe réessaie).

Codes de réponse (abonnement) : signature invalide **400** ; secret absent **503** ; mode ≠
`STRIPE_WEBHOOK_EXPECTED_MODE` **503** (test reçu par un déploiement live : 200 ignoré) ; événement
Connect (`account` renseigné) **400** ; métadonnées absentes/invalides **422** ; entreprise inconnue
**503** ; doublon **200 `{duplicate:true}`** ; verrou de remise occupé **503 + Retry-After 5** ;
erreur métier **500** (ligne de journal annulée → rejouable).

```bash
npm run preview:stripe-verify -- --env-file ~/elsatia-preview/gp.env --gp-origin https://<gp>.vercel.app --scope abonnement[,tools]
```

### 5.3 Portail client

Le train V2 **lit** `STRIPE_PORTAL_CONFIGURATION_ID` (`src/lib/stripe-abonnement.ts:389`,
optionnel) et fournit `scripts/configurer-portail-stripe.mjs` (contrairement à ce qu'affirmait le
runbook V3). Recommandé :

```bash
STRIPE_SECRET_KEY=sk_test_… node scripts/configurer-portail-stripe.mjs   # crée une configuration Test : changement de prix (8 forfaits, prorata), factures, moyen de paiement, annulation en fin de période
# poser l'ID bpc_… affiché dans STRIPE_PORTAL_CONFIGURATION_ID (GP, scope Preview), redéployer
```

Sinon, configuration **par défaut** du compte Test (Dashboard → Billing → Customer portal) avec
les mêmes 4 fonctions. `stripe-test-verify` contrôle l'une ou l'autre. Les sessions de portail sont
ouvertes par des **server actions** (`ouvrirPortailAbonnementAction`,
`ouvrirPortailAbonnementSuspenduAction`), pas par une route API. Tools a son propre portail
(`POST /api/tools/monetization/portal`).

### 5.4 Connect

Utilisé en **OAuth Standard** (pas de création de compte) : `connecterStripeAction` →
`/api/stripe/oauth/callback`. **Aucun drapeau** : actif dès que `STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET` + `NEXT_PUBLIC_APP_URL` + `STRIPE_CONNECT_CLIENT_ID` sont posées. Défaut
Preview : **non posé** (`STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SECRET` vides) → bouton
« Connecter Stripe » absent.

### 5.5 Événements à rejouer et état DB attendu

Parcours réel d'abord (le `stripe trigger` brut répond 503 sur l'abonnement : métadonnée
`entreprise_id` inconnue). Entreprise de recette `<E>` (UUID), une seule à la fois.

| # | Geste (compte Test) | Événements | État DB attendu |
|---|---|---|---|
| 1 | `/abonnement` → Checkout carte `4242 4242 4242 4242` | `checkout.session.completed`, `customer.subscription.created`, `invoice.created` (non initial), `invoice.paid` | `entreprises` : `stripe_customer_id`, `stripe_subscription_id` posés ; `abonnement_statut` = `actif` (ou `essai` si essai) ; `abonnement_offre`, `abonnement_periodicite`, `abonnement_echeance` posés ; `derniere_facture_statut` = `paid` ; `abonnements_entreprises` 1 ligne ; `factures_abonnement` 1 ligne `payee_at` non nul ; `abonnement_evenements` 1 ligne par événement, `statut_resultant` = `actif`/`essai` |
| 2 | `stripe events resend <evt checkout> --webhook-endpoint we_…` ×2 en parallèle | doublon | réponse 200 `{duplicate:true}` ; **toujours 1** ligne pour cet `stripe_event_id` |
| 3 | Portail : changer de forfait (PRO → BUSINESS) | `customer.subscription.updated` | `abonnement_offre` = nouvelle offre ; statut inchangé |
| 4 | Portail : annuler en fin de période | `customer.subscription.updated` | `abonnement_annulation_prevue_at` posé ; accès conservé |
| 5 | Test clock + carte `4000 0000 0000 0341` (échec au renouvellement) | `invoice.payment_failed` | `abonnement_statut` = **`suspendu` immédiatement** (pas de délai de grâce sur ce train) ; `derniere_facture_statut` ; e-mail « paiement échoué » (Brevo) vers l'e-mail client Stripe |
| 6 | Régulariser (hosted invoice) | `invoice.paid` | `abonnement_statut` = `actif`, `impaye_signale_at` = NULL, `suspension_prevue_at` = NULL |
| 7 | Carte 3-D Secure `4000 0027 6000 3184` | `invoice.payment_action_required` | **accès inchangé** ; `statut_resultant` = `action_requise` ; seules les colonnes `derniere_facture_*` bougent |
| 8 | Annulation immédiate (Dashboard) | `customer.subscription.deleted` | `abonnement_statut` = `annule` |
| T | (si Tools) Checkout Tools | `checkout.session.completed`, `customer.subscription.created`, `invoice.paid` | `tools_monetization_events.status` = `processed` ; `tools_monetization_subscriptions` ; `entitlements_utilisateurs_elsatia` (`tools`, `pro`, source `web`) + historique |

Requêtes de lecture (remplacer `:e`) :

```sql
select stripe_event_id, type, statut_resultant, created_at from public.abonnement_evenements where entreprise_id = :e order by created_at desc limit 20;
select abonnement_statut, abonnement_offre, abonnement_periodicite, abonnement_echeance, abonnement_essai_fin,
       abonnement_annulation_prevue_at, impaye_signale_at, suspension_prevue_at, derniere_facture_statut, derniere_facture_at
  from public.entreprises where id = :e;
select code_offre, periodicite, statut from public.abonnements_entreprises where entreprise_id = :e;
select stripe_invoice_id, statut, payee_at from public.factures_abonnement where entreprise_id = :e order by periode_debut desc;
select status, processed_at from public.tools_monetization_events where provider = 'stripe' and environment = 'test' order by created_at desc limit 20;
```

**Ordre de rejeu — piège prouvé par lecture du code** : les événements `invoice.*` n'ont **aucune
garde d'ordre** (la colonne `entreprises.abonnement_dernier_evenement_at` de `…333` n'est lue ni
écrite par aucun code). Rejouer un vieux `invoice.payment_failed` **après** un `invoice.paid`
re-suspend l'entreprise. Règle : ne jamais rejouer un événement `invoice.*` plus ancien que le
dernier appliqué ; pour restaurer, rejouer le **dernier** `invoice.paid`. Les événements
`customer.subscription.*` sont sûrs (la route relit l'abonnement chez Stripe sous verrou).

### 5.6 Écarts Stripe connus (non bloquants pour une Preview Test)

| Écart | Effet | Traitement |
|---|---|---|
| `invoice.payment_failed` suspend immédiatement ; `STRIPE_DELAI_GRACE_PAIEMENT_JOURS` (évoqué par `…333`) n'est lu par aucun code | un échec de carte coupe l'accès | décision `BILLING-GRACE-PERIOD` (ouverte) ; en recette, n'utiliser l'étape 5 que sur l'entreprise dédiée |
| Aucune garde d'ordre sur `invoice.*` | rejeu désordonné = état faux | règle de rejeu §5.5 |
| `stripe-prices.test.json` : `COMPTE_SUP_ROLE_*` ; runtime : `COMPTE_SUP_<OFFRE>_*` | capacité supplémentaire non vérifiable par `verify:stripe-prices` | décision `STRIPE-SUPPLEMENTARY-ACCOUNTS` (ouverte) |
| Connect/Boutique : `stripe_webhook_events` n'est pas nettoyée sur échec 500 | un rejeu après 500 est pris pour un doublon | hors défaut Preview |
| Connect `account.updated` : erreur d'update non vérifiée | onboarding non reflété silencieusement | hors défaut Preview |

---

## 6. E-mail — checklist de smoke

Deux canaux : **Supabase Auth SMTP** (confirmation, reset) et **Brevo API** (`packages/email`, tout
le reste). **Aucun bac à sable dans le code applicatif** : une vraie clé Brevo envoie réellement.
N'utiliser que des adresses possédées ; fixtures en `@example.test`.

Préalable (hors ligne puis réseau) :

```bash
node --env-file=$HOME/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --check
node --env-file=$HOME/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --brevo-sandbox --to <moi>   # X-Sib-Sandbox: drop, rien de délivré
node --env-file=$HOME/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --brevo-send    --to <moi>
node --env-file=$HOME/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --auth-recovery --to <compte Preview existant>
```

| # | Flux | Déclencheur | Canal | Attendu (constater la **réception**) | ☐ |
|---|---|---|---|---|---|
| E1 | **Signup** GP | `/signup` | Supabase SMTP | e-mail « Confirmez votre adresse email » ; lien `https://<gp>/auth/confirm?token_hash=…&type=email` ; clic → session → `/onboarding` | ☐ |
| E2 | Signup Studio (si D3) | `/signup` Studio (`STUDIO_SIGNUP_MODE=closed` ⇒ refus attendu hors allowlist) | Supabase SMTP | refus si `closed` ; si allowlist : e-mail reçu, lien vers **GP** `/auth/confirm` (limite connue) | ☐ |
| E3 | **Reset** GP | `/mot-de-passe-oublie` | Supabase SMTP | « Réinitialisez votre mot de passe » ; lien GP `/auth/confirm?type=recovery` → `/nouveau-mot-de-passe` ; connexion avec le nouveau mot de passe | ☐ |
| E4 | Reset Colors | écran mot de passe oublié Colors | Supabase SMTP | réponse neutre (anti-énumération) ; lien GP `/auth/confirm` → bouton « Poursuivre sur ELSATIA Colors » → Colors `/auth/confirm` | ☐ |
| E5 | Reset Tools | `/compte` → mot de passe oublié | Supabase SMTP | e-mail reçu ; lien vers **GP** (pas de relais Tools : le mot de passe commun est changé sur GP) | ☐ |
| E6 | Reset plateforme | `/plateforme` → réinitialiser (motif requis, journalisé) | Supabase SMTP | e-mail reçu par l'utilisateur ciblé ; ligne de journal | ☐ |
| E7 | **Invite** Réserves (intervenant) | Réserves → inviter une entreprise intervenante | Brevo | e-mail d'invitation ; lien `https://<reserves>/invitation/<jeton>` (pas `localhost:3020` : sinon `NEXT_PUBLIC_RESERVES_URL` absente) ; si l'envoi échoue, lien proposé à la copie | ☐ |
| E8 | Invite GP (employé) | `InvitationEmploye` | **aucun e-mail** (lien copié/partagé) | aucun envoi : comportement attendu | ☐ |
| E9 | **Billing** : paiement échoué | §5.5 étape 5 | Brevo | e-mail au `customer_email` Stripe ; bouton « Régulariser » → `hosted_invoice_url` ; `replyTo` = `SUPPORT_EMAIL` ; le webhook reste 200 même si l'envoi échoue | ☐ |
| E10 | Billing : autres | `invoice.paid`, changement, fin d'essai, suspension | **aucun e-mail** | absence attendue (matrice e-mails : non implémenté) | ☐ |
| E11 | Documents client | devis/facture → envoyer | Brevo (PDF joint) | lien `https://<gp>/document/<jeton>` | ☐ |
| E12 | Relance manuelle / e-mail de test | Paramètres → Relances → « e-mail de test » | Brevo | reçu **uniquement** par le compte connecté | ☐ |
| E13 | **Notification Réserves** | réserve avec échéance à J-7/J-3/J-1, puis `curl -H "Authorization: Bearer $CRON_SECRET" https://<reserves>/api/cron/notifications` | Brevo | 200 ; e-mail avec lien `https://<reserves>/reserves/<id>` ; rejouer le cron → **pas de doublon** (clé d'idempotence par événement/canal/personne) | ☐ |
| E14 | Réponse support | `/plateforme` support → répondre | Brevo | e-mail, lien `https://<gp>/aide` | ☐ |

**Sortie** : E1, E3, E7, E9, E13 reçus (obligatoires) ; les autres cochés ou marqués « hors périmètre ».
Contrôler SPF/DKIM de `elsatia.fr` sur un message reçu (en-têtes `Authentication-Results`).

---

## 7. Redis / worker Studio (seulement si D3 **et** D4)

| Élément | Fait vérifié dans le code |
|---|---|
| Bibliothèque | BullMQ 6.3.4 + ioredis |
| Files | `studio-renders-v1` (job `render`, jobId = id du rendu) ; `studio-analysis-media-v1` (job `analyze`) |
| Retry | BullMQ `attempts: 1`, `removeOnComplete/Fail: true` ; reprise pilotée par la base : `studio_request_render(p_retry)` si job `failed` et `retry_count < 3` |
| Concurrence / stalled | rendu 1 ; analyse `STUDIO_ANALYSIS_CONCURRENCY` (déf. 1) ; `maxStalledCount: 0` ; toutes les 2 s `studio_render_dispatch()` passe en `failed`/`WORKER_LOST` les jobs sans heartbeat depuis 60 s et réalimente jusqu'à 100 jobs `queued` depuis `studio_render_outbox` |
| Rendu | `studio_claim_render` → téléchargement `studio-originals` → ffmpeg (`rendering` 10-75 %, `encoding` 80 %) → dépôt `studio-renders/…/output.mp4` (`uploading` 95 %) → `studio_complete_render` (`completed`, 100) ; timeout `STUDIO_RENDER_TIMEOUT_SECONDS` (600) |
| Web → worker | l'app n'accède jamais à Redis : `POST /api/renders/<projectId>` → RPC → `studio_render_jobs` (`queued`) + outbox |
| Healthcheck | `src/healthcheck.ts` : PING Redis uniquement (5 s) ; `HEALTHCHECK` Docker toutes les 30 s |
| Image | `workers/studio-video/Dockerfile` (contexte = racine), ffmpeg Debian (drawtext/drawbox/overlay vérifiés au build), `CMD npm start` |

```bash
npm run preview:redis-check -- --env-file ~/elsatia-preview/worker.env                 # Health : PING, version, noeviction, TLS, files
npm run preview:redis-check -- --env-file ~/elsatia-preview/worker.env --roundtrip     # safe-run : 1 clé jetable EX 30
node scripts/check-env-manifest.mjs --preflight --environment preview --app studio_worker --env-file ~/elsatia-preview/worker.env
docker build -f workers/studio-video/Dockerfile -t elsatia-studio-video .
docker run -d --name studio-worker --env-file ~/elsatia-preview/worker.env elsatia-studio-video
docker inspect --format '{{.State.Health.Status}}' studio-worker                       # healthy
npm run preview:redis-check -- --env-file ~/elsatia-preview/worker.env                 # studio-renders-v1 : initialisée
```

| Contrôle | Critère |
|---|---|
| Health | `REDIS-PING` ✓, conteneur `healthy` |
| noeviction | `REDIS-EVICTION` ✓ (sinon **NO-GO** : BullMQ perd des jobs) ; version ≥ 6.2 ; `rediss://` |
| Queue | `studio-renders-v1 : initialisée` après démarrage du worker |
| Worker | un rendu : `studio_render_jobs.status` parcourt `queued → preparing → rendering → encoding → uploading → completed` |
| Retry | forcer un échec (asset supprimé → `ASSET_MISSING`), relancer depuis l'UI : `retry_count` = 1, nouveau job ; au 4ᵉ essai refus |
| Render | `studio_render_outputs` 1 ligne ; objet `output.mp4` lisible par URL signée ; durée et taille cohérentes |
| Perte de worker | `docker stop` pendant un rendu → après ~60 s `failed` / `WORKER_LOST` ; redémarrage → les `queued` repartent |

Prouvé localement (§10) : `redis-check` GO sur Redis 7 `noeviction` ; `allkeys-lru` → NO-GO
`REDIS-EVICTION` ; mauvais mot de passe → échec ; files simulées lues (`wait=2, failed=1`).

---

## 8. Plan de test distant — ordre exact

Chaque ligne suppose la précédente verte. Un échec = arrêt et §9.

| # | Domaine | Action | Commande / geste | Sortie |
|---|---|---|---|---|
| 0 | Portes locales | sur la ref | `npm ci` ; `npm run verify:migrations verify:secrets verify:env-manifest test:env-manifest test:preview-pack test:preflight-preview test:smoke-email` | 335 · 0 secret · OK · 67 · 24 · 5 · 12 |
| 1 | **DB** | sauvegarde, pré-contrôle, push, vérif | §4.1 → §4.2 | `db-verify --before-owner` GO |
| 2 | **Auth** | URL Configuration, gabarits, SMTP, MFA | §4.3 | relevé écrit des 4 écrans |
| 2b | Propriétaire + attestation | §4.6 lignes 1-2 | `db-verify` (sans option) GO |
| 3 | **GP** | projet `elsatia-preview`, variables, déploiement | `env-check` GO → deploy → log `mode enforce` + `GO` → alias → `url_preview` | `http-smoke --gp` GO (aucun `HTTP-RATE-LIMIT-DOWN`) ; `db-verify` 13/13 |
| 4 | **Tools** | projet, variables (`NEXT_PUBLIC_TOOLS_BILLING_API_URL` = GP), déploiement | idem | `http-smoke --gp --tools [--tools-billing]` GO (catalogue JSON, preflight CORS non 307, `sw-tools.js` 200) ; connexion Tools |
| 5 | **Colors** | idem | idem | `http-smoke --colors` GO ; entitlements Colors ; `/api/acces` 200 connecté ; parcours seau |
| 6 | **Réserves** | idem (+ `CRON_SECRET`, Brevo) | idem | `http-smoke --reserves` GO (`/api/offline/ping` 204) ; entitlements ; créer une réserve + photo |
| 7 | **Studio** (si D3) | idem ; `STUDIO_SIGNUP_MODE=closed` | idem | `http-smoke --studio` GO ; `studio_signup_policy` = closed |
| 8 | Isolation | 2 entreprises | `db-verify --rls-users A,B` + UI croisée | 0 ligne hors tenant |
| 9 | **Stripe** | endpoints, portail, parcours | `stripe-test-verify` GO → `verify:stripe-prices --strict` → §5.5 étapes 1-8 (+T) | états DB §5.5 |
| 10 | **Storage** | buckets + safe-run + UI | `storage-smoke --write` GO ; uploads UI | 18/18 |
| 11 | **E-mail** | checklist | §6 | E1, E3, E7, E9, E13 reçus |
| 12 | **Worker** (si D4) | §7 | `redis-check` → docker → rendu | rendu `completed` |
| 13 | Preflight live | variables réelles de chaque projet | `vercel env pull --environment=preview` → `env-check --dir` | GO |
| 14 | pgTAP réel (optionnel) | `npx supabase test db --db-url "$ELSATIA_PREVIEW_DB_URL"` sur **copie jetable** (les tests écrivent) | 0 `not ok` hors les 11 fichiers expliqués (V2 §10) |
| 15 | Clôture | régénérer le secret de bypass Vercel ; désactiver les endpoints Stripe de campagne ; nettoyer le pilote | — | consigné |

```bash
# smoke HTTP complet (étapes 3→7) — bypass dans le shell seulement
export VERCEL_AUTOMATION_BYPASS_SECRET=…
npm run preview:http-smoke -- --gp https://<gp>.vercel.app --tools https://<tools>.vercel.app \
  --colors https://<colors>.vercel.app --reserves https://<reserves>.vercel.app [--studio https://<studio>.vercel.app]
```

Crons (jamais automatiques sur Preview) : GP renvoie **404** tant que `FEATURE_CRONS_ENABLED=false`
(attendu par `http-smoke`) ; pour tester un cron GP, poser temporairement `FEATURE_CRONS_ENABLED=true`
+ `CRON_SECRET`, redéployer, `curl -H "Authorization: Bearer …" https://<gp>/api/cron/abonnements`,
puis remettre `false` (`http-smoke --crons-enabled` pendant la fenêtre). Réserves : pas de drapeau,
401 sans bearer.

**GO Preview** si et seulement si 0 → 13 verts (14 optionnel), aucun contact avec
`exhvuzegsefmoguxoiak` ni avec une clé live, aucun bypass local posé, aucun `--prod`.

---

## 9. Rollback Preview

Principe : la Preview n'a **pas** de PITR (plan gratuit). Le filet est la sauvegarde §4.1 et le
fait que Vercel garde chaque déploiement précédent. On ne supprime jamais rien de Stripe (on
désactive). Aucun rollback ne touche la Production.

| Déclencheur | Détection | Rollback | Critère de retour |
|---|---|---|---|
| **Migration fail** | `db push` s'arrête sur une version | 1. Ne **pas** relancer. 2. `supabase migration list --linked` : relever la dernière version appliquée (le CLI applique chaque fichier dans sa propre transaction : la version en échec n'est pas enregistrée — à constater). 3. `db-verify --allow-pending` : état cohérent ? 4. Base à N-1 cohérente → **ne déployer aucune app** (les apps V2 supposent 335) ; corriger en avant (nouvelle migration) après analyse. 5. Base incohérente → restaurer : réinitialiser le projet (Dashboard → Database → Reset, ou nouveau projet si D2 le permet), `psql -f backup-schema` puis `backup-data` (ou `db push` des 335 + reseed). | `db-verify` GO sur l'état cible |
| **Build fail** | log sans `GO : aucune erreur.` ou `next build` rouge | Rien à défaire : l'alias pointe encore le déploiement précédent. Si l'alias a déjà été déplacé : `vercel alias set <url-deploiement-precedent> <alias>`. Corriger la variable signalée (`PF-*`) ; **jamais** `ELSATIA_PREFLIGHT_ENFORCEMENT=report` sauf faux positif avéré du manifeste (et le retirer) | `http-smoke` GO sur l'alias |
| **Auth fail** (lien e-mail cassé, redirection refusée, SMTP muet) | E1/E3 KO | Remettre les valeurs relevées au STEP Auth (Site URL, Redirect URLs, gabarits, SMTP) ; ne jamais `config push` ; si un compte de recette est bloqué : Dashboard → Users → renvoyer/confirmer. Aucune migration à défaire | E1 + E3 reçus |
| **Stripe fail** (webhooks en échec répété, état faux) | Dashboard → Webhooks ; `abonnement_evenements` | 1. **Désactiver** l'endpoint (arrête les nouvelles tentatives), ne pas le supprimer. 2. Corriger (secret `whsec_`, URL + bypass, événements). 3. Réactiver ; rejouer depuis Dashboard les événements en échec **dans l'ordre**, jamais un `invoice.*` ancien après un plus récent (§5.5). 4. État d'une entreprise de recette faux : annuler l'abonnement Test (→ `annule`) et recommencer le parcours sur une **nouvelle** entreprise de recette ; ou rejouer le dernier `invoice.paid`. | `stripe-test-verify` GO ; parcours §5.5 étape 1 |
| **Worker fail** | conteneur `unhealthy`, `REDIS-EVICTION`, rendus `failed` | 1. `docker stop studio-worker` (les jobs actifs passent `failed`/`WORKER_LOST` sous 60 s, sans corruption). 2. Couper Studio côté web : `STUDIO_ENABLED=false` sur le projet Studio + redéployer → **503** partout (coupe-circuit du proxy). 3. Ne **pas** vider Redis (la base réalimente les `queued` depuis l'outbox au redémarrage). 4. Politique mémoire : repasser `noeviction` chez le fournisseur. | `redis-check` GO ; un rendu `completed` |

Ordre de dépendance : un rollback DB impose de re-vérifier Auth (§4.3), puis de redéployer les
apps (URL et `url_preview` inchangées), puis `http-smoke`.

---

## 10. Scripts — preuves locales

Tous : lecture seule par défaut, safe-run explicite (`--write`, `--roundtrip`), aucune valeur
affichée, sortie `0 GO · 1 NO-GO · 2 refus`, aucune dépendance npm (utilisables avant `npm ci`).

| Script | Automatise | Preuve dans cette session |
|---|---|---|
| `preview:env-inventory` | inventaire §2 | fichier généré ; totaux ci-dessus |
| `preview:env-check` | env check multi-app | gabarits vides → NO-GO détaillé ; 10 incohérences croisées détectées sans exposer de valeur (tests) ; fichier déclarant la Production → refus |
| `preview:db-verify` | DB verify + RLS + service-role only | **base réelle 335 migrations** (PG 16) : GO avec `--before-owner` ; sans l'option : exactement les 2 anomalies attendues ; sonde RLS sur l'entreprise pilote (28 employés, 365 lignes visibles) : 0 hors tenant. **Contre-épreuves** sur copie sabotée : RLS coupée sur `clients` → 3 erreurs dont `clients=1` ; `grant execute … tools_server_appliquer_abonnement to authenticated` → détecté. URL Production → refus (code 2) |
| `preview:http-smoke` | HTTP smoke | **`next start` GP réel : 17/17 GO** ; contre-épreuve rate-limiter coupé → NO-GO (§10.1) |
| `preview:stripe-verify` | Stripe test mode | clé live refusée **avant tout appel** (0 requête) ; endpoints manquant/désactivé/live/événements ; portail ; prix ; GET uniquement (tests) |
| `preview:storage-smoke` | Storage smoke | évaluation des 18 buckets ; safe-run simulé : dépôt → URL publique refusée → URL signée → suppression vérifiée (0 objet restant) ; Production refusée |
| `preview:redis-check` | Redis check | Redis 7 réel : GO `noeviction` ; `allkeys-lru` → NO-GO ; mauvais mot de passe → échec ; files BullMQ lues ; roundtrip OK |
| `test:preview-pack` | tout ce qui précède, hors réseau | **24/24**, branché dans `.github/workflows/ci.yml` |

Scripts existants réutilisés (inchangés) : `check-env-manifest.mjs --preflight`,
`preflight-preview.mjs`, `smoke-email-preview.mjs`, `verify-stripe-prices.mjs`,
`configurer-portail-stripe.mjs`, `executer-script-production.mjs`, `seed-elsatia-preview-year.mjs`,
SQL `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` et `PLATFORM_SECURITY_PREFLIGHT.sql`.

### 10.1 Smoke HTTP sur `next start` (Gestion Pro)

Banc : `next build` + `next start` de Gestion Pro (build de production du train V2), base locale
aux 335 migrations servie par un **PostgREST v12.2.3 réel** derrière le proxy Supabase local
(`scripts/local-postgres-bootstrap`), clés JWT signées localement, `FEATURE_CRONS_ENABLED=false`.

```
node scripts/preview/http-smoke.mjs --local-harness --gp http://127.0.0.1:3100
  ✓ GET / 200 · /login 200 · /signup 200 · /mot-de-passe-oublie 200 · /tarifs 200 · /robots.txt 200 · /manifest.webmanifest 200
  ✓ GET /auth/callback 307 → /login · /dashboard 307 · /plateforme 307 · /abonnement 307 · /api/rgpd/export 307 → /login
  ✓ GET /api/tools/monetization/catalog 503 JSON {products:[]} (Tools Pro non configuré) · OPTIONS 204 (jamais 307)
  ✓ GET /api/cron/abonnements 404 · /api/cron/notifications-push 404 · GET /api/stripe/abonnement/webhook 405
GO : smoke HTTP conforme.   (17/17)
```

Contre-épreuves :
- `--tools-billing` sans prix Tools → NO-GO sur le catalogue (le mode strict ne tolère pas le 503) ;
- **PostgREST arrêté** → NO-GO, 4 routes `HTTP-RATE-LIMIT-DOWN` (`/auth/callback`, les 2 crons,
  **le webhook Stripe**). Premier passage du banc sans PostgREST : même résultat.

**Fait opérationnel établi par ce banc** : le rate-limiter de GP s'appuie sur la base via la clé de
service ; si `SUPABASE_SERVICE_ROLE_KEY` est fausse ou la RPC injoignable, `/auth/*`, `/api/cron/*`
et **tous les webhooks `/api/stripe/*`** répondent 503 (« Protection anti-abus indisponible ») —
Stripe réessaierait en boucle. D'où l'ordre du §8 : `http-smoke` GP vert **avant** d'enregistrer
les endpoints Stripe.

Colors, Tools, Réserves, Studio : attentes dérivées ligne à ligne du code (proxys, pages, routes),
**non exécutées** sur un `next start` dans cette session (build hors mandat de ce pack) ; elles seront
confirmées à l'étape 4→7 du §8. Le banc GP prouve le moteur (évaluation, redirections non suivies,
détection de fuite, détection du rate-limiter).

### 10.2 Gates du dépôt après ce pack

| Gate | Résultat |
|---|---|
| `verify:env-manifest` | ✅ OK, 14 DECISION_REQUIRED non bloquantes (inchangé) |
| `test:env-manifest` | ✅ 67/67 |
| `verify:secrets` | ✅ aucun secret (valeurs factices des tests construites à l'exécution) |
| `test:preflight-preview` / `test:smoke-email` | ✅ 5/5 · 12/12 |
| `test:preview-pack` | ✅ 24/24 |
| `verify:migrations` | ✅ 335 |

---

## 11. Corrections au runbook V3 (faux sur le train V2)

| Runbook V3 disait | Réalité du train V2 (vérifiée dans le code) |
|---|---|
| « aucun code ne lit `STRIPE_PORTAL_CONFIGURATION_ID` » | lu par `src/lib/stripe-abonnement.ts:389` (optionnel) |
| « `configurer-portail-stripe.mjs` n'existe que sur l'orpheline Billing V3 » | présent : `scripts/configurer-portail-stripe.mjs` |
| « 3-D Secure suspend immédiatement » | `invoice.payment_action_required` ne touche **pas** l'accès (`statut_resultant = action_requise`) |
| STEP 0 / D1 : ref de préparation 321 migrations | ref = train canonique V2, 335, dernière `20260923000400` |
| STEP 14 : crons GP « → 200 » avec bearer | **404** tant que `FEATURE_CRONS_ENABLED=false` (valeur Preview imposée) |
| STEP 12 : « 27 prix V4 vérifiés » suffisent à la capacité | les prix `COMPTE_SUP_<OFFRE>` lus par le runtime ne sont pas dans la table vérifiée |

Nouveaux faits, absents des runbooks : aucune garde d'ordre sur `invoice.*` ; événements en trop
sur l'endpoint abonnement = lignes de journal parasites ou 422/503 ; aucune app n'a de
`/api/health` ; les liens Auth de Tools et Studio atterrissent sur GP ; aucun e-mail d'invitation
GP ; `/api/cron/notifications` Réserves n'a pas de drapeau (401/503).

---

## 12. Décisions — défauts conservateurs appliqués par ce pack

| Décision | Défaut si aucune réponse | Bloque la Preview ? |
|---|---|---|
| D2 `PREVIEW-PROJECT-INVENTORY` | réutiliser `pgvvpqyjziyapbbkydmc` après sauvegarde | non (branche §4.1 si autre lignée) |
| D3 Studio / `STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` | Studio **exclu** | non |
| D4 `HOSTING-PROVIDER-STUDIO-WORKER` + Redis | worker **exclu** | non |
| D5 Boutique | non (`FEATURE_BOUTIQUE_ENABLED=false`) | non |
| Connect | non posé | non |
| `BILLING-GRACE-PERIOD` | suspension immédiate (comportement du train) | non |
| `STRIPE-SUPPLEMENTARY-ACCOUNTS` | capacité supplémentaire non testée | non |
| `RGPD-PURGE-VS-FACTURE-EMISE`, rétention | planificateur **OFF** | non (Preview) — oui pour un GO commercial |

---

## 13. Verdict

```
PREVIEW EXECUTION PACK READY
```

- **Inventaire exact** des variables par app (211 au manifeste ; required / conditional / optional,
  public / secret, valeurs imposées et interdites), généré depuis la source canonique.
- **Matrice Vercel** complète pour 5 projets, avec la sonde de santé réelle de chaque app (aucune
  n'a `/api/health`).
- **Supabase** : push, vérification, Auth, Storage, RLS (structurelle + fonctionnelle), seed,
  entitlements, service-role only — scriptés et **prouvés sur les 335 migrations réelles**, avec
  contre-épreuves.
- **Stripe Test** : prix, 4 endpoints avec la liste exacte des événements, portail, Connect,
  8 étapes de rejeu avec l'état DB attendu, et le piège d'ordre `invoice.*`.
- **E-mail** : 14 contrôles, dont les 5 demandés (signup, reset, invite, billing, notification Réserves).
- **Redis/worker** : health, noeviction, queue, worker, retry, render — script sans dépendance prouvé
  sur un Redis réel.
- **Plan distant** ordonné (DB → Auth → GP → Tools → Colors → Réserves → Studio → Stripe → Storage →
  e-mail → worker) et **rollback** pour les 5 déclencheurs.
- **7 scripts** read-only / safe-run, 24 tests en CI, gates du dépôt verts.

Ce qui reste n'est **pas de l'analyse** : ce sont des **entrées** — les identifiants (Supabase,
Vercel, Stripe Test, Brevo, Redis si D4) et la confirmation (ou non) des défauts du §12. Les seuls
inconnus sont observables uniquement à distance (historique de migrations du projet existant,
disponibilité de `pgsodium`) et ont chacun leur branche de décision écrite (§4.1).

GO **commercial** : hors périmètre (décisions RGPD/rétention, délai de grâce, capacité
supplémentaire, bascule Production du preflight en `enforce`).
