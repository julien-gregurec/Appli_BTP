# ELSATIA — Runbook d'exécution Preview (V3)

Date : 2026-09-23. Produit par `ELSATIA_PREVIEW_EXECUTION_PREP_V3`
(`docs/qualification/ELSATIA_PREVIEW_EXECUTION_PREP_V3.md`). Remplace, pour l'exécution, la
séquence de `ELSATIA_PREVIEW_DEPLOYMENT_RUNBOOK_V1.md`, qu'il corrige sur 6 points (§ « Écarts
corrigés » en fin de document).

**Rien de ce runbook n'a été exécuté à distance** : aucun identifiant Vercel, Supabase, Stripe,
Brevo ou Redis n'était disponible dans la session qui l'a écrit. Tout ce qui est marqué
« vérifié localement » l'a été par exécution réelle sur la ref de préparation.

**Règle absolue** : chaque étape vise la **Preview**. Référence Supabase Production connue :
`exhvuzegsefmoguxoiak` — si elle apparaît à une étape quelconque (lien CLI, URL, variable), **arrêt
immédiat**. Aucune clé Stripe `sk_live_` / `rk_live_`. Jamais `vercel deploy --prod`.

Chaque STEP donne : **Qui** (J = Julien, opérateur avec identifiants ; A = n'importe quel agent
sans identifiant), **Commandes**, **Critère de sortie**. Un critère non atteint = s'arrêter et
consigner, ne pas « continuer pour voir ».

---

## STEP 0 — Décisions propriétaire (J) — bloquant

| # | Décision | Défaut conservateur si aucune réponse |
|---|---|---|
| D1 | Ref déployée : la branche de préparation (T0 `magical-mccarthy` + Studio Worker V2, 321 migrations, **sans** RGPD Purge V2 / Billing Security V3 / GP Hardening, qui vivent sur des branches orphelines) ou un train canonique complet (`ELSATIA_CANONICAL_TRAIN_MERGE_PLAN_V1`, STEPs 3→6) | Déployer la ref de préparation, en **Preview de qualification** uniquement |
| D2 | `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` : réutiliser Supabase `pgvvpqyjziyapbbkydmc` (upgrade, données de recette), le réinitialiser, ou créer un projet (plan payant requis : l'organisation est à sa limite de 2 projets gratuits) | Réutiliser `pgvvpqyjziyapbbkydmc` **après sauvegarde** (STEP 3) |
| D3 | Studio dans le périmètre ? (`STUDIO-SIGNUP-DEFAULT` pour la prod, `STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`) | **Exclu** : pas de projet Vercel Studio |
| D4 | Worker vidéo : `HOSTING-PROVIDER-STUDIO-WORKER` + Redis | **Exclu** (sauter STEP 16) |
| D5 | Boutique testée sur cette Preview ? (`FEATURE_BOUTIQUE_ENABLED` attendu `false` en preview par le manifeste) | **Non** : webhook Boutique non enregistré |

**Sortie** : les 5 réponses consignées (même « défaut »). Périmètre par défaut qui en résulte :
**Gestion Pro + Colors + Tools + Réserves**, sur un seul projet Supabase.

## STEP 1 — Portes locales sur la ref (A)

```bash
git fetch origin claude/fervent-dirac-eez6pk && git checkout claude/fervent-dirac-eez6pk
npm ci && for a in tools colors reserves; do npm ci --prefix apps/$a; done
npm run verify:migrations        # attendu : 337 migrations valides (train canonique V2 + RGPD 401/402 ; 335 sur le train V2 seul ; 321 sur la ref de préparation), noms et horodatages uniques
npm run verify:secrets           # attendu : aucun secret reconnu
npm run verify:env-manifest      # attendu : OK : aucune erreur (14 DECISION_REQUIRED non bloquantes)
npm run test:env-manifest        # attendu : 67/67
npm run test:smoke-email         # attendu : 12/12
npm run test:preflight-preview   # attendu : 5/5
npm run typecheck && npm run lint && npm test
```

**Sortie** : tout vert. Tout rouge = NO-GO, pas de STEP 2.

## STEP 2 — Identifiants et garde de cible (J)

```bash
npx supabase login
npx supabase link --project-ref pgvvpqyjziyapbbkydmc      # ou la ref décidée en D2
npx supabase projects list | grep pgvvpqyjziyapbbkydmc      # la ligne liée (●) doit être celle-ci
cat supabase/.temp/project-ref                              # doit afficher la ref Preview, JAMAIS exhvuzegsefmoguxoiak
vercel login
stripe login && stripe config --list                        # compte Test acct_1TtrTU0bT5C0WG2a
```

**Sortie** : les trois CLI pointent vers des cibles Preview/Test, vérifiées à l'œil **et** par
commande.

## STEP 3 — Sauvegarde (J) — si D2 = réutiliser

```bash
npx supabase db dump --linked -f preview-backup-$(date +%F).sql            # schéma
npx supabase db dump --linked --data-only -f preview-backup-data-$(date +%F).sql
```

Plan gratuit : pas de PITR. **Sortie** : deux fichiers non vides, conservés hors dépôt.

## STEP 4 — Pré-contrôles de la base distante (J)

```bash
npx supabase migration list --linked
psql "$PREVIEW_DB_URL" -Atc "select name, default_version, installed_version from pg_available_extensions where name in ('pgsodium','pg_trgm','unaccent','pgcrypto')"
npx supabase db push --linked --dry-run
```

- `pgsodium` doit être **disponible** (la migration `20260828000244` l'installe ; les projets
  existants l'avaient en 3.1.8). Indisponible = NO-GO (la 244 échouerait, 245→330 bloquées).
- Si `migration list` montre des versions **distantes absentes du dépôt** (historique d'une autre
  lignée, p. ex. une orpheline `20260922000184`), `db push` refusera : **arrêt**, décision J
  (réparer l'historique avec `supabase migration repair` ou réinitialiser — D2). Ne jamais
  improviser.

**Sortie** : dry-run qui liste uniquement des migrations du dépôt, dans l'ordre.

## STEP 5 — Migrations (J)

```bash
npx supabase db push --linked
npx supabase migration list --linked      # train canonique V2 + RGPD 401/402 : 337 des deux côtés, dernière 20260926000402 (train V2 seul : 335, 20260923000400) (ref de préparation : 321, 20260922000330)
psql "$PREVIEW_DB_URL" -X -v ON_ERROR_STOP=1 -f docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql
psql "$PREVIEW_DB_URL" -X -v ON_ERROR_STOP=1 -c "set elsatia.preflight_environment='preview'" -f docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql
```

**Sortie** :
- `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` : 11 contrôles bloquants à `ok = t`. Les 2 contrôles non
  bloquants (`url_preview`, propriétaire plateforme) sont fermés aux STEPs 7 et 8.
- `PLATFORM_SECURITY_PREFLIGHT.sql` : sur base neuve, **2** anomalies bloquantes attendues à ce
  stade et seulement elles (vérifié localement) : `administrateur_total_actif_absent` (fermée au
  STEP 7) et `cle_attestation_active_absente` (fermée au STEP 7). Toute autre anomalie = NO-GO.

## STEP 6 — Supabase Auth, SMTP, Storage (J, Dashboard)

Authentication → URL Configuration :
- **Site URL = origine Preview de Gestion Pro** (obligatoire : les gabarits pointent
  `{{ .SiteURL }}/auth/confirm` pour toutes les apps).
- Additional Redirect URLs : `https://<gp>/auth/callback`, `https://<colors>/auth/callback`,
  `https://<reserves>/auth/callback`, `https://<tools>/compte?recovery=1`
  (+ `fr.elsatia.tools://auth/recovery` si natif testé, + `https://<studio>/auth/callback` si D3).

Authentication → Email Templates : coller `supabase/templates/confirm_signup.html` (Confirm signup)
et `supabase/templates/reset_password.html` (Reset password). `config.toml` ne s'applique pas au
projet hébergé. **Ne jamais lancer `supabase config push`** (il écraserait l'Auth distante avec les
valeurs locales `127.0.0.1`).

Authentication → SMTP : confirmer le SMTP Brevo déjà posé (`smtp-relay.brevo.com:587`,
expéditeur `contact@elsatia.fr`, clé dédiée `elsatia-preview-supabase-auth`).
Authentication → Providers → Email : confirmations **activées**. MFA : TOTP activé.

**Sortie** : captures ou relevé écrit des 4 écrans.

## STEP 7 — Propriétaire plateforme et attestation (J)

1. Créer (ou reprendre) le compte `julien@elsatia.fr` sur la Preview, confirmer l'e-mail,
   enrôler un TOTP, se connecter en AAL2, puis `/plateforme` → revendiquer la propriété
   (`plateforme_proprietaire_revendiquer()`), cf. `docs/operations/PLATFORM_ADMIN_ACTIVATION_RUNBOOK.md`.
2. Attestation d'état Stripe, environnement **`test`** : générer un couple Ed25519 **dédié à la
   Preview** et l'enregistrer selon `docs/runbooks/ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md`
   §3 en remplaçant `live` par `test` ; poser `STRIPE_STATE_ATTESTATION_KEY_ID` et
   `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` sur le projet Vercel GP, scope **Preview**. Ne jamais
   réutiliser la clé de Production.
3. Rejouer les deux SQL du STEP 5.

**Sortie** : `PLATFORM_SECURITY_PREFLIGHT.sql` → 0 anomalie bloquante.

## STEP 8 — Projets Vercel (J, Dashboard)

| Réglage | Gestion Pro | Colors | Tools | Réserves | Studio (si D3) |
|---|---|---|---|---|---|
| Projet | `elsatia-preview` (existe) | à créer | à créer | à créer | à créer |
| Root Directory | `.` (racine) | `apps/colors` | `apps/tools` | `apps/reserves` | `apps/studio` |
| Include files outside Root Directory | sans objet | **ON** | **ON** | **ON** | **ON** |
| Framework | Next.js | Next.js | Next.js | Next.js | Next.js |
| Install Command | `npm ci` | `npm ci` | `npm ci` | `npm ci` | `npm ci` |
| Build Command | **`npm run build:gestion-pro`** | `npm run build` | `npm run build` | `npm run build` | `npm run build` |
| Output Directory | défaut (`.next`) | défaut | défaut | défaut | défaut |
| Node.js | 24.x | 24.x | 24.x | 24.x | 24.x |
| Automatically expose System Environment Variables | **ON** | **ON** | **ON** | **ON** | **ON** |
| Crons versionnés | `vercel.json` (2) | aucun | aucun | `apps/reserves/vercel.json` (1) | aucun |

Pourquoi :
- **GP : `npm run build` est interdit sur Vercel** — il enchaîne `npm --prefix apps/tools run build`,
  qui exige `apps/tools/node_modules` (Capacitor, jsPDF) qu'aucune installation Vercel de la racine
  ne crée. `build:gestion-pro` = `next build` précédé du preflight du manifeste (vérifié
  localement : GO puis build complet, 195 lignes de routes, exit 0 ; variable retirée → NO-GO, exit 1
  avant `next build`).
- **Tools a besoin des fichiers hors racine** (chemin TypeScript
  `@elsatia/application-access → ../../packages/…` dans `apps/tools/tsconfig.json`, et le preflight
  du manifeste appelé par son `prebuild`). Le runbook V1 disait le contraire.
- **Variables système exposées** : le preflight de build ne s'applique que s'il voit
  `VERCEL_ENV=preview`. Sans elles, il avertit (« ATTENTION : build Vercel sans VERCEL_ENV ») et ne
  bloque rien.
- **Crons** : Vercel n'exécute les crons que sur les déploiements **Production** ; sur Preview ils
  ne tournent jamais (STEP 14 les déclenche à la main).
- **Deployment Protection** : laisser activée ; pour Stripe (STEP 12), utiliser le secret
  « Protection Bypass for Automation » en paramètre d'URL du seul endpoint Test, et le **régénérer**
  après la campagne (il a déjà fuité une fois en clair, cf. `P15_STRIPE_LIVE_PREPARATION.md`).
- **Ne jamais `vercel deploy --prod` sur `elsatia-preview`** : ce projet a son propre environnement
  « Production » ; un tel déploiement donne `VERCEL_ENV=production` à une Preview (garde d'app en
  mode production, manifeste en report, `PF-VERCEL-ENV-MISMATCH` avec `ELSATIA_APPLICATION_ENV=preview`).
  Déployer en Preview puis poser un alias stable (`vercel alias set <url-deploiement> <alias>`).

**Sortie** : réglages relevés par écrit pour chaque projet.

## STEP 9 — Variables d'environnement (J)

Pour chaque app, partir du gabarit : `.env.preview.example` (GP), `apps/<app>/.env.preview.example`.
Remplir un fichier **local non versionné**, le valider, puis le poser en scope **Preview** seulement :

```bash
node scripts/check-env-manifest.mjs --preflight --environment preview --app gestion_pro --env-file ~/elsatia-preview/gp.env
node scripts/check-env-manifest.mjs --preflight --environment preview --app colors      --env-file ~/elsatia-preview/colors.env
node scripts/check-env-manifest.mjs --preflight --environment preview --app tools       --env-file ~/elsatia-preview/tools.env
node scripts/check-env-manifest.mjs --preflight --environment preview --app reserves    --env-file ~/elsatia-preview/reserves.env
```

Valeurs imposées (vérifiées par le preflight) :
- `ELSATIA_APPLICATION_ENV=preview` (GP, Colors, Réserves) et `NEXT_PUBLIC_TOOLS_ENV=preview`
  (Tools) — **exactement `preview`** ; le piège est la valeur `local`/`development`, qui désarme
  les gardes de build. (La checklist V2 disait « ne jamais définir » : inexact, les gabarits et le
  manifeste les exigent.)
- `STRIPE_WEBHOOK_EXPECTED_MODE=test`, `STRIPE_SECRET_KEY=sk_test_…`, `FEATURE_CRONS_ENABLED=false`,
  `FEATURE_BOUTIQUE_ENABLED=false` (D5), `STRIPE_AUTOMATIC_TAX_ENABLED=false`.
- Même `NEXT_PUBLIC_SUPABASE_URL` pour toutes les apps (SSO). Clé publique :
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (GP, Colors, Tools, Studio) ; Réserves lit encore
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (même **valeur** publishable). Tools ne lit plus l'alias.
- Les URL croisées (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_COLORS_URL`,
  `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`, `NEXT_PUBLIC_RESERVES_URL`, `NEXT_PUBLIC_TOOLS_URL`,
  `NEXT_PUBLIC_TOOLS_BILLING_API_URL` = origine GP) sont connues après le premier déploiement :
  premier déploiement → alias → compléter → **redéployer** (elles sont figées au build).
- Coupe-circuit `ELSATIA_PREFLIGHT_ENFORCEMENT=report` : **ne pas poser**. Seulement pour
  débloquer un faux positif avéré du manifeste, le temps de le corriger, puis retirer.

**Sortie** : les 4 preflights locaux affichent `GO : aucune erreur.`

## STEP 10 — Déploiements Preview (J)

Déployer chaque projet (push de la branche ou `vercel deploy` sans `--prod`). Dans **chaque** log de
build, exiger :

```
[env-manifest] cible preview : mode enforce.
GO : aucune erreur.
```

puis la fin normale de `next build`. **Sortie** : 4 URL Preview + alias stables consignés, puis
compléter `url_preview` des apps :

```sql
update public.applications_elsatia set url_preview = '<origine>' where code = '<gestion_pro|colors|tools|reserves>';
```

(ou via `/plateforme/applications`). Relancer `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` : 13/13 `ok = t`.

## STEP 11 — Preflight en direct (J)

```bash
# Variables Preview réelles chargées dans le shell (vercel env pull --environment=preview <fichier> par projet)
npm run preflight:preview -- --live --strict --app gestion_pro,colors,tools,reserves
```

**Sortie** : 0 erreur ; 18/18 buckets confirmés en lecture seule.

## STEP 12 — Stripe Test (J)

Endpoints à enregistrer (compte **Test**), un secret `whsec_` chacun, posés en scope Preview :

| Route (sur l'origine GP) | Variable | Événements | Dans le périmètre par défaut |
|---|---|---|---|
| `/api/stripe/abonnement/webhook` | `STRIPE_WEBHOOK_ABONNEMENT_SECRET` | `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.created`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required` | **oui** (endpoint existant `we_1Tziay0bT5C0WG2a4Ib2ncwB` : vérifier son URL, sinon le **désactiver**, jamais le supprimer) |
| `/api/tools/monetization/stripe/webhook` | `STRIPE_TOOLS_WEBHOOK_SECRET` (compte Tools, `STRIPE_TOOLS_SECRET_KEY=sk_test_…`) | `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded` | oui si Tools Pro testé |
| `/api/stripe/webhook` (Connect) | `STRIPE_WEBHOOK_SECRET` | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `account.updated` (événements des comptes connectés) | non (Connect reporté côté produit) |
| `/api/stripe/boutique/webhook` | `STRIPE_WEBHOOK_BOUTIQUE_SECRET` | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired` | non (D5) |

```bash
STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICES_VERIFY_STRICT=1 npm run verify:stripe-prices   # 27 prix V4 vérifiés
```

- Les 8 prix de forfait (`STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}`) sont les
  seuls **nécessaires** au parcours d'abonnement (IDs Test dans `config/stripe-prices.test.json`).
  Les 8 `STRIPE_PRICE_COMPTE_SUP_<FORFAIT>_*` lus par le runtime **ne figurent pas** dans cette table
  de correspondance : les relever dans le compte Test (ou les créer) si la capacité supplémentaire
  est testée.
- Portail client : sur cette ref, aucun code ne lit `STRIPE_PORTAL_CONFIGURATION_ID` ; le Portail
  utilise la configuration **par défaut du compte Test** (Dashboard → Settings → Billing →
  Customer portal : activer changement de prix entre les 8 prix, annulation en fin de période,
  historique de factures, moyen de paiement). Le script `configurer-portail-stripe.mjs` n'existe que
  sur la branche orpheline Billing V3.
- Parcours réel : `/abonnement` → Checkout carte `4242 4242 4242 4242` → webhooks 200 → SQL :
  `select stripe_event_id, type, statut_resultant from public.abonnement_evenements order by 1 desc limit 10;`
- Rejeu : `stripe events resend evt_… --webhook-endpoint we_…` deux fois en parallèle → une seule
  ligne `abonnement_evenements`.
- `stripe trigger` sur l'endpoint abonnement répond **503** (entreprise inconnue) et Stripe
  réessaie : utiliser `--override subscription:metadata.entreprise_id=<uuid de recette>` ou le
  parcours réel.
- Sur cette ref, `invoice.payment_action_required` (3-D Secure) **suspend immédiatement**
  (le correctif de grâce n'existe que sur la branche Billing V3) : ne pas le déclencher sur une
  entreprise de recette qu'on veut garder active.

**Sortie** : un abonnement Test complet reflété en base ; aucun 3xx/4xx/5xx inattendu dans
Dashboard → Webhooks.

## STEP 13 — E-mail (J)

```bash
node --env-file=$HOME/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --check
node --env-file=$HOME/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --brevo-sandbox --to <votre adresse>
node --env-file=$HOME/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --brevo-send    --to <votre adresse>
node --env-file=$HOME/elsatia-preview/gp.env scripts/smoke-email-preview.mjs --auth-recovery --to <compte Preview existant>
```

Puis dans les apps : inscription GP (e-mail de confirmation → `/auth/confirm` GP), mot de passe
oublié GP / Colors / Tools, invitation Réserves, bouton « e-mail de test » des relances
(`Paramètres → Relances`, envoie **uniquement** au compte connecté).

**Attention** : aucun bac à sable n'existe dans le code applicatif. Avec une vraie clé Brevo, tout
flux déclenché sur une donnée de recette contenant une vraie adresse envoie réellement. Les
fixtures utilisent `@example.test` / `@elsatia-preview.invalid`.

**Sortie** : réception **constatée** pour chaque canal (Brevo, Auth).

## STEP 14 — Smoke fonctionnel (J)

1. Par app : connexion, déconnexion, mot de passe oublié bout en bout.
2. Isolation : deux comptes de deux entreprises, aucune lecture croisée (liste chantiers, devis,
   factures, fichiers).
3. Storage : upload + lecture sur `entreprise-assets` (public), `pointage-preuves` (privé),
   `reserves-photos` (Réserves) ; un GET anonyme sur `/storage/v1/bucket` échoue.
4. API Tools depuis l'origine Tools : `GET <gp>/api/tools/monetization/catalog` → **200 JSON**,
   jamais une redirection `307 /login` (défaut corrigé par cette préparation, prouvé par 12 tests
   d'exécution du proxy) ; preflight CORS `OPTIONS` idem.
5. Crons (jamais automatiques en Preview) :
   `curl -s -H "Authorization: Bearer $CRON_SECRET" https://<gp>/api/cron/abonnements` et
   `/api/cron/notifications-push` sur GP, `/api/cron/notifications` sur Réserves → 200, résultat lu
   en base.
6. Tools : `GET https://<tools>/sw-tools.js` → 200 (service worker généré après `next build`).

**Sortie** : 6/6 constatés.

## STEP 15 — pgTAP et fixture pilote sur la base réelle (J)

```bash
npx supabase test db --db-url "$PREVIEW_DB_URL"
node scripts/executer-script-production.mjs seed_entreprise_pilote_btp.sql
node scripts/executer-script-production.mjs assertions_entreprise_pilote_btp.sql
CONFIRM_DELETE_TEST_DATA=YES node scripts/executer-script-production.mjs cleanup_entreprise_pilote_btp.sql
```

Le garde des scripts de recette est verrouillé sur `pgvvpqyjziyapbbkydmc` : correct pour D2 =
réutiliser ; à adapter explicitement (revue) pour tout autre projet. **Sortie** : 0 `not ok` ; les
fichiers arrêtés par le harnais local (pgsodium, `auth.mfa_factors`) doivent **passer** sur le vrai
service, sinon défaut nommé.

## STEP 16 — Worker Studio (J) — seulement si D3 et D4

```bash
docker build -f workers/studio-video/Dockerfile -t elsatia-studio-video .     # jamais exécuté à ce jour
STUDIO_REDIS_URL=rediss://… npm --prefix workers/studio-video run readiness:redis   # version ≥ 6.2, maxmemory-policy noeviction
docker run --rm --env-file ~/elsatia-preview/worker.env elsatia-studio-video node --import tsx src/healthcheck.ts
node scripts/check-env-manifest.mjs --preflight --environment preview --app studio_worker --env-file ~/elsatia-preview/worker.env
```

Puis un rendu complet (upload → job → sortie publiée). **Sortie** : image construite, readiness
`ok: true`, un rendu réel publié.

## STEP 17 — GO / NO-GO

**GO Preview de qualification** si et seulement si :

- [ ] STEP 0 consigné ; STEP 1 vert ;
- [ ] aucune commande n'a touché `exhvuzegsefmoguxoiak` ni une clé live ;
- [ ] 337 migrations appliquées (train canonique V2 + RGPD 401/402 ; 335 sur le train V2 seul ; 321 sur la ref de préparation) ; `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` 13/13 ; `PLATFORM_SECURITY_PREFLIGHT.sql` 0 anomalie bloquante ;
- [ ] chaque build Preview affiche `mode enforce` puis `GO : aucune erreur.` ;
- [ ] `preflight:preview -- --live --strict` 0 erreur, 18/18 buckets ;
- [ ] un cycle Stripe Test complet reflété en base ; aucun webhook en échec répété ;
- [ ] réception e-mail constatée (Brevo + Supabase Auth) ;
- [ ] smoke STEP 14 6/6 ;
- [ ] pgTAP sur base réelle : 0 `not ok`.

**NO-GO** si l'un manque, ou si : un bypass local (`ELSATIA_APPLICATION_ENV=local`,
`NEXT_PUBLIC_TOOLS_ENV=local|development`) est posé ; `ELSATIA_PREFLIGHT_ENFORCEMENT=report` est
resté posé ; Studio est exposé sans D3 ; un déploiement a été fait avec `--prod`.

**GO commercial : hors de portée de ce runbook** (décisions de prix, job de purge RGPD, divergence
légale sur les sauvegardes, lots orphelins non portés — voir le rapport PREP V3).

---

## Écarts corrigés par rapport au runbook V1

1. **Build GP** : `npm run build` → `npm run build:gestion-pro` (le premier enchaîne Tools et échoue
   sans `apps/tools/node_modules`).
2. **Tools** a besoin de « Include files outside of the Root Directory » (V1 : « n'a pas cette
   dépendance » — faux, dépendance via chemin TypeScript).
3. **313 → 321 migrations.**
4. **Preflight bloquant en Preview** (V1 : « reste report ») — Production inchangée.
5. **Inventaire existant** : un Vercel `elsatia-preview` et un Supabase `pgvvpqyjziyapbbkydmc`
   existent (V1 : « à vérifier ») ; plan gratuit à sa limite de projets.
6. **Webhook Tools et API de facturation Tools** : injoignables sans cookie avant cette préparation
   (redirection `/login` du proxy) ; les runbooks antérieurs comptaient « 3 routes webhook ».
