# ELSATIA — Preview Execution Prep V3

Date : 2026-09-23 → 2026-09-26. Source : `ELSATIA_PREVIEW_GO_LIVE_CHECKLIST_V2.md`
(`origin/claude/lucid-brahmagupta-xyzhlx`, verdict `PREVIEW PRECONDITIONS REMAIN`), copiée
telle quelle sur cette branche.

**Aucun déploiement, aucune Production, aucun Stripe live, aucune action distante.** Aucun
identifiant Vercel / Supabase / Stripe / Brevo / Redis n'était présent dans l'environnement
(vérifié : aucune variable, aucun `~/.vercel`, `~/.supabase`, config Stripe CLI). Les
identifiants cloud génériques présents dans le conteneur n'appartiennent pas à ce projet et
n'ont pas été utilisés. → toute l'exécution distante est classée **REMOTE_EXECUTION_REQUIRED**.

Livrable opérationnel : **`docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md`** (STEP 0 → STEP 17, GO/NO-GO).

---

## 1. Source et branche

- La checklist V2 vit sur une branche basée sur `main` (178 migrations, sans aucune des 4 apps) :
  inutilisable comme base de travail.
- Branche dédiée `claude/fervent-dirac-eez6pk` = **STEP 1 + STEP 2** du plan
  `ELSATIA_CANONICAL_TRAIN_MERGE_PLAN_V1` (branche `claude/loving-volta-2l3kda`, verdict
  `CANONICAL TRAIN MERGE PLAN READY`, « prochaine action recommandée ») :
  `T0 = claude/magical-mccarthy-sm9lwb @ f34f2263` + merge `claude/zen-goodall-n3opdc @ afd39126`
  (**0 conflit**, 0 migration ajoutée) = **321 migrations**, 4 apps + worker.
- Ce n'est **pas** le train canonique complet : RGPD Purge V2, Billing Security V3 et GP Hardening
  (branches orphelines, collisions de numéros) **ne sont pas** inclus. Choix de la ref = décision
  D1 du runbook, non tranchée ici.

## 2. Preflight : passé en mode bloquant — **ACTIVÉ pour Preview seulement**

Condition posée : « seulement si cela peut être fait sans casser les environnements locaux/tests ».
Elle est remplie, prouvée par exécution :

| Changement | Fichier |
|---|---|
| Niveau par cible : `preflight_enforcement_by_target = { preview: "enforce", production: "report" }` ; le défaut global reste `report` | `config/env-manifest.json`, schéma, `resolveEnforcement()` dans `scripts/lib/env-manifest-core.mjs` |
| `--auto` et le raccord opérateur du cutover lisent le niveau **de la cible** ; Production strictement inchangée | `scripts/check-env-manifest.mjs`, `scripts/lib/env-manifest-operator.mjs` |
| Coupe-circuit opérateur, dans le seul sens qui désarme : `ELSATIA_PREFLIGHT_ENFORCEMENT=report` (journalisé ; aucune valeur ne durcit) — déclaré au manifeste | idem |
| Avertissement si `VERCEL=1` sans `VERCEL_ENV` (variables système non exposées → le garde ne peut pas s'appliquer) | `scripts/check-env-manifest.mjs` |
| Le preflight est désormais appelé par le `prebuild` de **Colors, Réserves, Studio, Tools** (auparavant seul GP l'exécutait : un projet Vercel à racine `apps/<app>` ne passait jamais par le contrôle du manifeste) | `apps/*/package.json` |
| Script dédié `build:gestion-pro` (= `next build`, précédé de `prebuild:gestion-pro`) | `package.json` |

Pourquoi c'est sûr :
- `--auto` ne s'active que si `VERCEL_ENV ∈ {preview, production}` : postes locaux, CI et tests
  ne sont pas concernés (testé : `hors Vercel`, `VERCEL_ENV=development`).
- En Preview, seules les variables **requises au build** sont contrôlées : URL et clés publiques
  (GP 5, Colors 5, Tools 2, Réserves 4, Studio 3). **Aucune** ne dépend d'une décision propriétaire
  (test dédié : catégories `supabase_public`/`url`/`env_indicator` uniquement, aucun `STRIPE_*`).
- Un faux positif a été trouvé et **corrigé avant activation** : le manifeste exigeait
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` pour Tools, qui ne la lit plus depuis `094bd43e` → retiré de Tools
  (manifeste + 2 gabarits Tools).

Preuves (exécution) :
- `test:env-manifest` **67/67** (dont 9 nouveaux : résolution par cible, manifeste réel, CLI
  `--auto` Preview NO-GO / Production report / hors Vercel ignoré / GO complet sans valeur affichée /
  coupe-circuit / avertissement `VERCEL_ENV`, prebuild des 4 apps).
- **Build GP réel simulé en Preview** (`VERCEL_ENV=preview`, valeurs factices) :
  `npm run build:gestion-pro` → `[env-manifest] cible preview : mode enforce.` → `GO` → `next build`
  complet, **exit 0**. Contre-épreuve sans `NEXT_PUBLIC_COLORS_URL` → `NO-GO`, **exit 1 avant
  `next build`**.
- `prebuild` local de Colors / Réserves / Studio / Tools : exit 0 (« preflight ignoré »).

Reste ouvert : Production reste `report` (bascule après un preflight vert sur valeurs Production
réelles, Julien) — `F-PREFLIGHT-ENFORCEMENT` mis à jour en ce sens.

## 3. Env manifest — DECISION_REQUIRED

11 décisions au manifeste. Traitement :

| Décision | Statut V3 | Ce qui a été fait |
|---|---|---|
| `PREVIEW-PROJECT-INVENTORY` | **Fait technique résolu**, choix restant = propriétaire | L'inventaire « inconnu » ne l'était pas : le dépôt documente Vercel `elsatia-preview` (GP seule) et Supabase `pgvvpqyjziyapbbkydmc` (eu-west-3, plan gratuit, organisation à sa limite de 2 projets), SMTP Brevo posé, endpoint Stripe Test `we_1Tziay0bT5C0WG2a4Ib2ncwB`. Question réécrite : réutiliser / réinitialiser / nouveau projet. |
| `RESERVES-URL-FAIL-CLOSED` | **Risque fermé techniquement** | Le risque (build qui passe sans `NEXT_PUBLIC_RESERVES_URL`) est désormais bloqué au build sur les deux cibles publiées (Production : garde Réserves ; Preview : manifeste `enforce`, test dédié). Reste une question d'hygiène (retirer le repli local), sans impact Preview. |
| `STUDIO-SIGNUP-DEFAULT` | **Prémisse corrigée** | La question disait « open (actuel) » : faux depuis le 09-21 (fail-closed, valeur Preview fixée à `closed`). Reste le seul choix de la valeur **Production**. |
| `FLAG-CRONS-FAIL-OPEN` | Propriétaire, **sans impact Preview** | Vercel n'exécute pas les crons sur Preview ; `FEATURE_CRONS_ENABLED=false` posé par le gabarit. |
| `HOSTING-PROVIDER-STUDIO-WORKER` | Propriétaire | Défaut conservateur : worker exclu (runbook D4). |
| `STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` | Propriétaire | Défaut : Studio exclu (D3). |
| 5 × `STRIPE-*` | Propriétaires / commerciales | Aucune ne bloque une Preview **Test** qui vend les 8 forfaits. `SUPPLEMENTARY-ACCOUNTS` : la grille V4 tranche déjà « par rôle » ; il reste surtout du technique (le runtime lit encore les prix par forfait) — à confirmer par Julien. |

Aucune décision propriétaire n'a été prise : seuls des faits vérifiables ont été corrigés.

## 4. Vercel — par app

| Réglage | GP | Colors | Tools | Réserves | Studio |
|---|---|---|---|---|---|
| Root Directory | `.` | `apps/colors` | `apps/tools` | `apps/reserves` | `apps/studio` |
| Include files outside root | — | **requis** (`file:../../packages/*`) | **requis** (chemin TS `../../packages/application-access` + preflight) — le runbook V1 disait le contraire | **requis** | **requis** |
| Install | `npm ci` | `npm ci` | `npm ci` | `npm ci` | `npm ci` |
| Build | **`npm run build:gestion-pro`** | `npm run build` | `npm run build` (`--webpack` + service worker) | `npm run build` | `npm run build` (`--webpack`) |
| Output | `.next` (défaut) | défaut | défaut (`output: export` seulement en natif) | défaut | défaut |
| Node | 24.x (CI, Dockerfile) | 24.x | 24.x | 24.x | 24.x |
| Env scope | Preview uniquement ; variables système exposées **ON** | idem | idem | idem | idem |
| Crons | `vercel.json` (2) — Production seulement | — | — | `apps/reserves/vercel.json` (1) | — |

**Défaut Vercel trouvé** : `npm run build` (racine) enchaîne `npm --prefix apps/tools run build`, qui
exige `apps/tools/node_modules` (Capacitor, jsPDF importés par `apps/tools/src`) ; la CI les installe
explicitement (`npm ci --prefix apps/tools`), Vercel non. D'où `build:gestion-pro`.
**Piège** : `elsatia-preview` a son propre environnement « Production » ; `vercel deploy --prod` dessus
donne `VERCEL_ENV=production` à la Preview. Interdit dans le runbook.

## 5. Supabase

Vérifié par **exécution** : PostgreSQL 16 + socle Supabase reconstruit
(`scripts/local-postgres-bootstrap`), **321/321 migrations appliquées en 20 s**.

| Sujet | Résultat |
|---|---|
| Ordre des migrations | 321 fichiers, `20260710000001` → `20260922000330`, `verify:migrations` OK. Application : `supabase link` → `migration list` → `db push --dry-run` → `db push` (runbook STEP 4-5). |
| Risques signalés à vérifier | `pgsodium` doit être disponible (244/245) ; historique distant d'une autre lignée → `db push` refuse (arrêt, décision). **« GRANTs implicites » (P0 supposé) : RÉFUTÉ** — sans aucun privilège par défaut (état d'un projet cloud neuf), `authenticated` a ses droits explicites sur `chantiers`/`clients`/`devis`/`factures`/`employes` ; `service_role` restreint sur 224 tables = état canonique voulu par `20260902000255` (1 214 REVOKE). |
| Seed minimal | Aucun `seed.sql`, seed désactivé. Données de référence créées par les migrations (catalogue apps, rôles, modèles de postes, `studio_signup_policy=closed`, 2 lignes admin en attente). Minimum Preview : propriétaire plateforme revendiqué + une entreprise créée par l'UI ; fixture pilote optionnelle (garde verrouillé sur `pgvvpqyjziyapbbkydmc`, correct pour la réutilisation). |
| App entitlements | Catalogue : `colors`, `drone`, `gestion_pro`, `reserves` (`interne`), `tools` ; Studio hors catalogue. Aucun droit accordé par migration : activer Colors/Réserves par entreprise + habiliter chaque utilisateur (RPC plateforme AAL2). `url_preview` NULL partout → à poser (STEP 10). |
| Rôles | anon fermé hors 4 catalogues publics en lecture (plans, options, services, modèles de rôles — voulu) ; premier admin = `plateforme_proprietaire_revendiquer()` en AAL2. |
| Auth URLs | Site URL = origine GP (obligatoire : gabarits en `{{ .SiteURL }}/auth/confirm`) ; redirections `/auth/callback` (GP, Colors, Réserves, Studio), `/compte?recovery=1` + `fr.elsatia.tools://auth/recovery` (Tools). Ne jamais `supabase config push`. |
| Buckets | **18/18** confirmés, seul `entreprise-assets` public ; `studio-*` 1 GiB > limite plan gratuit (sans effet si Studio exclu). |
| RLS | 0 table `public` sans RLS. |
| **Nouveau** : `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | 13 contrôles lecture seule. Base saine : **11/11 bloquants OK**. Contre-épreuve sur copie sabotée (RLS coupée, EXECUTE retiré, écriture anon, bucket rendu public, trigger de facturation désactivé) : **5/5 défauts détectés**. |
| `PLATFORM_SECURITY_PREFLIGHT.sql` (mode preview, base neuve) | 2 anomalies bloquantes **attendues** : propriétaire non revendiqué, **clé d'attestation Ed25519 absente** → étape Preview ajoutée (couple `test` dédié, STEP 7). |

## 6. Stripe (Test uniquement)

- **Défaut corrigé (P1)** : le proxy Gestion Pro redirigeait vers `/login` **toutes** les routes
  `/api/tools/monetization/*` appelées sans cookie — webhook Stripe Tools, catalogue, checkout,
  portail, vérifications Apple/Google et preflight CORS. Tools Pro était inutilisable sur tout
  déploiement. Reproduit par exécution réelle de `updateSession` (**7/10 routes redirigées**), corrigé
  (exemption ; chaque route s'authentifie elle-même : signature Stripe ou Bearer vérifié côté
  serveur), **12/12** après, dont 2 témoins (page applicative toujours redirigée ; préfixe voisin
  non exempté).
- Mapping : 8 prix de forfait requis (IDs Test dans `config/stripe-prices.test.json`) ; les 8
  `COMPTE_SUP_<FORFAIT>_*` lus par le runtime **absents** de cette table ; modules / IA / rôles V4
  optionnels ; bloc stockage sans prix (décision).
- Endpoints : 4 routes (abonnement, Tools, Connect, Boutique) — les runbooks antérieurs en
  comptaient 3. Périmètre par défaut : abonnement (+ Tools si testé).
- Portail : **aucun code de cette ref ne lit `STRIPE_PORTAL_CONFIGURATION_ID`** ; le script
  `configurer-portail-stripe.mjs` n'existe que sur l'orpheline Billing V3 → configuration par défaut
  du compte Test (la V2 listait cette étape à tort pour cette ref).
- Mode attendu : `STRIPE_WEBHOOK_EXPECTED_MODE=test`, contrôlé par le preflight
  (`PF-STRIPE-MODE-PREVIEW-LIVE`, `PF-STRIPE-LIVE-KEY-IN-PREVIEW`).
- Écarts notés, non corrigés (hors périmètre ou décision) : `stripe trigger` → 503 sur
  l'abonnement (utiliser `--override metadata.entreprise_id`) ; 3-D Secure suspend immédiatement sur
  cette ref (correctif sur Billing V3) ; Connect/Boutique répondent 503 sur tout écart de mode
  (l'abonnement répond 200 ignoré) ; Boutique exige `FEATURE_BOUTIQUE_ENABLED=true` contre le
  `false` attendu du manifeste (D5).

## 7. E-mail

- Deux canaux : **Brevo API** (seul transport applicatif, `packages/email`) — documents,
  relances, paiement échoué, support, invitation + notifications Réserves ; **Supabase Auth SMTP** —
  confirmation d'inscription (GP, Studio), réinitialisation (GP, plateforme, Colors, Tools).
  Aucun invite / magic link / changement d'e-mail.
- **Aucun bac à sable dans le code** : une vraie clé Brevo sur Preview envoie réellement.
- **Nouveau** : `scripts/smoke-email-preview.mjs` (`--check`, `--brevo-sandbox`, `--brevo-send`,
  `--auth-recovery`) — refus avant tout réseau si Production (`ELSATIA_APPLICATION_ENV` /
  `VERCEL_ENV` / réf. `exhvuzegsefmoguxoiak`), `--to` unique obligatoire, aucune valeur affichée.
  **12/12 tests** sans réseau, branchés en CI (`test:smoke-email`).

## 8. Redis / Studio Worker

- Worker : `npm ci` OK, typecheck OK ; tests 19 passés / 3 échecs **d'environnement** connus
  (`ffmpeg-static` sans `drawtext`, mitigé par le Dockerfile).
- Healthcheck (Redis seul) prouvé contre un **vrai Redis 7.0.15** : vivant → 0 ; absent → 1.
- **Nouveau** : `workers/studio-video/src/redis-readiness.ts` (`npm run readiness:redis`) — contrôle
  ce que la sonde de vie ne voit pas : version (BullMQ refuse < 5.0, recommande ≥ 6.2) et
  **`maxmemory-policy = noeviction`** (un Redis managé par défaut en LRU peut évincer les clés
  BullMQ), TLS conseillé hors local. `INFO` seulement, URL jamais affichée. 6 tests + exécution
  réelle : `noeviction` → ok ; `allkeys-lru` → refus `REDIS-EVICTION` ; Redis arrêté → échec.
- `docker build` / `e2e-gate` : REMOTE_EXECUTION_REQUIRED (Docker Hub bloqué, inchangé).

## 9. Runbook

`docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` : STEP 0 décisions (défauts conservateurs)
→ 1 portes locales → 2 identifiants et garde de cible → 3 sauvegarde → 4 pré-contrôles base →
5 migrations + SQL de vérification → 6 Auth/SMTP → 7 propriétaire + attestation → 8 projets Vercel →
9 variables (preflight local GO) → 10 déploiements (log `mode enforce` + `GO`) → 11 preflight live →
12 Stripe Test → 13 e-mail → 14 smoke fonctionnel → 15 pgTAP réel → 16 worker (optionnel) →
**17 GO/NO-GO**. Il corrige 6 écarts du runbook V1.

Correction à la checklist V2 : « ne jamais définir `ELSATIA_APPLICATION_ENV` / `NEXT_PUBLIC_TOOLS_ENV`
sur Preview » est inexact — les gabarits et le manifeste les **exigent** à `preview` ; le piège est
la valeur `local`/`development`.

## 10. Exécution distante

**REMOTE_EXECUTION_REQUIRED** : aucun identifiant Preview disponible. Rien n'a été tenté à distance.

## Vérifications de cette session

| Commande | Résultat |
|---|---|
| `vitest run` (racine) | 155 fichiers, **1 811/1 811** |
| `apps/tools` vitest / tsc | **1 992/1 992** / OK |
| `tsc --noEmit` (racine) | OK |
| `eslint` (fichiers modifiés) | OK |
| `test:env-manifest` / `test:smoke-email` / `test:preflight-preview` | 67/67 · 12/12 · 5/5 |
| `verify:env-manifest` / `verify:secrets` / `verify:migrations` | OK · OK · 321 valides |
| worker typecheck / readiness + healthcheck tests | OK · 10/10 |
| 321 migrations sur PG16 + SQL de vérification (sain / saboté) | 11/11 · 5/5 détectés |
| build GP Preview simulé (GO / NO-GO) | exit 0 / exit 1 avant `next build` |

Non exécuté : lint/tests complets de Colors, Réserves, Studio (seul leur `prebuild` a changé,
exécuté) ; builds Colors/Tools/Réserves/Studio.

## Note de transparence

Comme les sessions précédentes, l'instruction d'`AGENTS.md` de lire `node_modules/next/dist/docs/`
n'a pas été suivie (aucun code Next.js nouveau n'utilise d'API absente de la version installée ;
le seul changement applicatif ajoute deux chemins à une liste existante).

## Verdict

# PREVIEW LOCALLY PREPARED / CREDENTIALS REQUIRED

Tout ce qui ne demande ni identifiant ni décision propriétaire est fermé et prouvé localement :
preflight bloquant en Preview (Production inchangée), faux positif du manifeste corrigé, défaut de
build Vercel GP contourné par un script versionné, API/webhook Tools débloqués, SQL de vérification
de base validé en positif et en négatif, smoke e-mail et readiness Redis outillés, runbook exact
jusqu'au GO/NO-GO. Ce n'est pas `READY FOR REMOTE EXECUTION` parce que le STEP 0 du runbook exige
encore des réponses propriétaire (ref D1, réutilisation du projet Supabase D2) et que chaque
preuve distante (Supabase réel, Vercel, Stripe Test, livraison e-mail, Docker) attend des
identifiants.
