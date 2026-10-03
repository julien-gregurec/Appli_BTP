# ELSATIA V9.2 — Preview : fermeture des bloquants avant cutover — GO / NO-GO V1

Date : 2026-10-03 (session autonome, opérateur absent).
Suite de `ELSATIA_V9_2_HOSTED_PREVIEW_CUTOVER_V1.md` (branche `claude/hopeful-dijkstra-2scnpi`).

Aucune migration, aucun `db push`, aucun `v9-cutover.sh --apply-preview`, aucun déploiement, aucune
modification de projet Vercel ni de configuration Supabase. Aucune action sur la Production, Stripe
Live, Studio ou la Boutique. Aucun secret lu ni affiché.

## Synthèse

```
BASE_SHA=dfb59cc6
BRANCH=integration/elsatia-v9.2-preview-ready-v1
FINAL_SHA=247066ee (code : dfb59cc6 + Next.js 16.3.8 + garde auto-déploiement Vercel ; ce rapport est un commit docs au-dessus)

NEXT_SECURITY_FIX=PASS
BACKUP_PACK_VALIDATED=NO (BACKUP_CHECK_BLOCKER)
SUPABASE_CLI_READY=YES (2.109.1)
GP_PREVIEW_PROJECT_CONFIRMED=YES (elsatia-preview)
VERCEL_AUTODEPLOY_SAFE=YES pour cette branche (garde vercel.json) ; NO pour les autres branches du dépôt (MANUAL_VERCEL_CHANGE_REQUIRED)
GP_VARIABLES=PARTIAL (STRIPE_WEBHOOK_EXPECTED_MODE et TOOLS_STORE_ENVIRONMENT : valeur déterminée, non posée ; BANK_DATA_ENCRYPTION_KEY : MANUAL_SECRET_REQUIRED)
TOOLS_VARIABLES=REQUIRES_MANUAL (TOOLS_PUBLISHABLE_KEY=REQUIRES_MANUAL)
COLORS_VARIABLES=REQUIRES_MANUAL (COLORS_PUBLISHABLE_KEY=REQUIRES_MANUAL)
RESERVES_PROJECT=BLOCKED (aucun projet existant ; non créé)
AUTH_PREVIEW=AUTH_CHANGES_PREPARED=YES / AUTH_CHANGES_APPLIED=NO
PUBLIC_SECRET_EXPOSURE=NO
CUTOVER_PREFLIGHT=BLOCKED (prérequis non verts : non exécuté)

PREVIEW_CUTOVER_GO=NO
VERDICT=ELSATIA_V9_2_PREVIEW_GO_PARTIAL
```

## Phase 1 — Worktree

- Worktree séparé `/home/user/elsatia-v92-ready`, branche `integration/elsatia-v9.2-preview-ready-v1`
  créée sur `dfb59cc6` (= `origin/integration/elsatia-canonical-train-v9.2`). Checkout principal
  intact (aucun reset), aucune branche Claude existante modifiée.

## Phase 2 — Next.js 16.3.8

- `ea554fab` porté par cherry-pick (→ `480b5d3b`, sans conflit, parent direct `dfb59cc6`).
- Diff : 8 fichiers, uniquement `package.json` + `package-lock.json` de la racine (GP), `apps/tools`,
  `apps/colors`, `apps/reserves`. Changements : `next` et `eslint-config-next` 16.3.5 → 16.3.8 ; les
  lockfiles ne touchent que `next`, `@next/env`, `@next/eslint-plugin-next`, `@next/swc-*`,
  `eslint-config-next`. Studio inchangé. Le rapport du lot source n'est pas importé.
- Rejoué sur ce worktree (`npm ci` racine + 3 apps) :

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` (GP, Tools, Réserves, Colors) | 0 |
| `npm run lint` | 0 (0 erreur, 15 avertissements préexistants) |
| `npm test` | 0 — racine 2 950, Tools 2 174, Réserves 239, Colors 436 = **5 799 tests verts** |
| build GP (`build:gestion-pro`) | OK, Next.js 16.3.8 |
| build Tools / Colors / Réserves | OK, Next.js 16.3.8 (mode documenté `NEXT_PUBLIC_TOOLS_ENV=local` / `ELSATIA_APPLICATION_ENV=local` ; sans variables, les gardes `verify-public-env` refusent le build comme prévu) |

- `npm audit --omit=dev` : plus aucun avis `next` sur les 4 apps. Restent, hors périmètre du correctif :
  racine `brace-expansion`, `fast-uri` (élevés, outillage) ; Tools `dompurify` (faible).

**NEXT_SECURITY_FIX=PASS**

## Phase 3 — Sécurité des auto-déploiements Vercel (lecture seule)

Équipe `julien-gregurec1` (`team_Jc6YWtXF1pV1ezbLdYzGnMRZ`), 7 projets.

| Projet | Dépôt lié | Branche production | Root | Ignored Build Step | createDeployments | Protection |
|---|---|---|---|---|---|---|
| elsatia-preview | julien-gregurec/Appli_BTP | main | racine | aucun | enabled | **aucune (public)** |
| elsatia-tools | aucun (CLI) | — | apps/tools | aucun | — | Standard (sauf domaines perso) |
| elsatia-colors | aucun (CLI) | — | apps/colors | aucun | — | Standard |
| elsatia-production | julien-gregurec/Appli_BTP | release/commercialisation-v1 | racine | **aucun** | enabled | Standard |
| elsatia-site | julien-gregurec/elsatia-site | main | racine | aucun | enabled | Standard |
| elsatia-studio-preview | julien-gregurec/Appli_BTP | main | apps/studio | build seulement si preview **et** `claude/studio-preview-live-deploy-v2` | enabled | aucune |
| liria-concept-gestion-btp | julien-gregurec/Appli_BTP | main | racine | **aucun** | enabled | Standard |

Aucun filtre de branche côté projet. Constat sur les déploiements récents : chaque push de branche du
dépôt crée un déploiement Preview sur **elsatia-preview, elsatia-production, liria-concept-gestion-btp**
(construits, READY ou ERROR) et sur elsatia-studio-preview (CANCELED par sa commande d'ignore). Ex. :
`integration/elsatia-canonical-train-v9.2@dfb59cc6` → elsatia-production ERROR, liria ERROR, studio
CANCELED, elsatia-preview READY.

Mesure prise (dépôt, pas de projet modifié) : `vercel.json` racine,
`git.deploymentEnabled = { "integration/elsatia-v9.2-preview-ready-v1": false }`. Les trois projets à
racine du dépôt lisent ce fichier → aucun déploiement pour cette branche (sémantique documentée par
Vercel : la branche ne déclenche pas de déploiement). Studio lit `apps/studio` et ignore déjà la
branche (au pire un enregistrement CANCELED, sans build). Tools, Colors : non liés au dépôt.
Site : autre dépôt. Compatible avec `preflight-v9` (contrôle `BUILD-VERCEL` sur `crons` inchangé).
Conséquence voulue : elsatia-preview ne construira pas non plus cette branche ; le déploiement GP
après cutover se fera explicitement (retirer la clé ou déploiement CLI `--target preview`).

**VERCEL_AUTODEPLOY_SAFE=YES** pour un push de cette branche.

Le risque reste entier pour toute autre branche du dépôt → **MANUAL_VERCEL_CHANGE_REQUIRED** (non
appliqué, projets FORBIDDEN) :

| Projet | Réglage | Ancienne valeur | Nouvelle valeur proposée |
|---|---|---|---|
| elsatia-production | Settings → Git → Ignored Build Step | (vide) | `if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi` (ne construit plus que la branche de production `release/commercialisation-v1`) |
| liria-concept-gestion-btp | Settings → Git → Ignored Build Step | (vide) | `if [ "$VERCEL_ENV" = "production" ]; then exit 1; else exit 0; fi` — ou déconnecter le dépôt si le projet est historique (DECISION_REQUIRED) |
| elsatia-studio-preview | — | commande actuelle | aucune modification nécessaire |

## Phase 4 — Identité GP Preview

- `elsatia-preview` (`prj_0dX75LBHTxWUYQKle7zNdWdrWctK`) : racine du dépôt, build
  `node scripts/check-env-manifest.mjs --auto --app gestion_pro && npm run build:gestion-pro`,
  domaine `elsatia-preview.vercel.app`, toutes les variables scopées `preview` uniquement (aucune
  `production`), dont `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PROJECT_REF` (sensibles, non lues).
- Preuve décisive (publique, sans secret) : la CSP est construite depuis
  `process.env.NEXT_PUBLIC_SUPABASE_URL` (`src/proxy.ts:11`, `src/lib/security/headers.ts`) ; le
  déploiement Preview `elsatia-preview-bgf9n4rqz-julien-gregurec1.vercel.app` (dfb59cc6, variables
  Preview génériques) sert `connect-src 'self' https://pgvvpqyjziyapbbkydmc.supabase.co wss://pgvvpqyjziyapbbkydmc.supabase.co`.

**GP_PREVIEW_PROJECT_CONFIRMED=YES**

Constat annexe : la cible `production` du projet (`elsatia-preview.vercel.app`, branche `main`) répond
500 sur `/login` — aucune variable n'y est scopée `production`. C'est elle qui porte les crons
(`vercel.json`) : ils échouent chaque nuit. Hors périmètre, à décider par l'opérateur.

## Phase 5 — Sauvegarde

- La sauvegarde logique de la session précédente (dossier de session hors dépôt) **n'existe pas dans
  ce conteneur** (nouveau conteneur ; recherche négative).
- Production d'une nouvelle sauvegarde conforme au runbook (`ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md`
  §2) impossible depuis la session : `supabase db dump` / `pg_dump` exigent une connexion PostgreSQL ;
  aucune `ELSATIA_PREVIEW_DB_URL`, aucun mot de passe DB, et le réseau de la session n'ouvre pas le
  port 5432 (pooler et accès direct injoignables).
- Repli tenté : export logique des données (public, platform, stripe_attestation, vault, auth, storage,
  ledger) via l'API Management en transaction READ ONLY, vers un dossier hors dépôt. **Refusé par le
  garde-fou d'exécution de la session** (copie en masse de données Preview, dont Auth). Non contourné.
- `backup-check.mjs` n'a donc rien à vérifier ; aucun manifeste n'a été fabriqué.

**BACKUP_PACK_VALIDATED=NO** — `BACKUP_CHECK_BLOCKER` : pas de sauvegarde accessible dans la session
et pas de canal autorisé pour en produire une. Action humaine : runbook §2 depuis un poste disposant
de `ELSATIA_PREVIEW_DB_URL` (dumps, `backup-manifest.mjs --dir`, puis `backup-check.mjs` → attendu
`BACKUP_DECLARED_OK`, 5 lignes REQUIRED ✓, âge ≤ 12 h au moment du cutover).

État sauvegardes Supabase (rapport V1) : physique quotidienne 2026-10-03T04:18:49Z, PITR absent.

## Phase 6 — CLI Supabase

`supabase` 2.109.1 installé par `npm ci` (devDependency du dépôt ; téléchargement GitHub Releases
fonctionnel). `npx supabase --version` → 2.109.1. Aucun `link`, aucun `db push`.
Limite : Docker client présent, mais `db dump` / `db push` exigent l'accès PostgreSQL (voir phase 5).

**SUPABASE_CLI_READY=YES**

## Phase 7 — Variables Preview GP (elsatia-preview)

| VARIABLE | BUILD_REQUIRED | RUNTIME_REQUIRED | SECRET | PREVIEW_VALUE_SOURCE | STATUS |
|---|---|---|---|---|---|
| BANK_DATA_ENCRYPTION_KEY | NO (manifeste `build_time=false` ; dfb59cc6 construit READY sans elle) | YES (`src/lib/banking-keyring.ts`, fail-closed `CONFIG_ABSENTE` ; repli de signature `src/lib/banking.ts`) | YES (`dr_critical`) | à fournir par l'opérateur : clé 32 octets (hex 64 / base64) propre à la Preview, **jamais** celle de Production ; si des données Preview ont déjà été chiffrées sous une k1 antérieure, reprendre cette même clé (sinon illisibles) — vérifier avec `scripts/preview/v9/iban-k1-check.mjs` | MANUAL_SECRET_REQUIRED |
| STRIPE_WEBHOOK_EXPECTED_MODE | NO | YES (`src/lib/stripe-webhook-environment.ts`, `src/lib/commercialisation-abonnements.ts`, fail-closed) | NO | architecture : `test` (seule valeur admise en Preview : `env-manifest-preflight` `PF-STRIPE-MODE-PREVIEW-LIVE`, `env-scope` `ENV-STRIPE-LIVE`) | READY (valeur `test`, non posée) |
| TOOLS_STORE_ENVIRONMENT | NO | YES (`src/lib/tools-store-environment.ts` : absente en runtime `NODE_ENV=production` → erreur, donc requise sur Vercel) | NO | architecture : `sandbox` (`scripts/preview/env-check.mjs` `X-STORE-ENV` ; aucun achat réel en Preview) | READY (valeur `sandbox`, non posée) |

Non posées : la mission limite la configuration de cette session aux clés publishable (phase 8) ; à
poser par l'opérateur (scope Preview, type non sensible pour les deux drapeaux lisibles).

## Phase 8 — Variables Preview Tools / Colors

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` absente des deux projets (scopes preview et production) ;
seule `NEXT_PUBLIC_SUPABASE_ANON_KEY` existe. Le code Tools (`apps/tools/src/lib/auth/client.ts`) et
Colors (`apps/colors/src/lib/supabase/cles.ts`) ne lit **que** la publishable (aucun repli ANON,
choix documenté) : la variable manque réellement.
La lecture des clés API du projet Supabase Preview a été **refusée par le garde-fou de session**
(l'endpoint renvoie aussi les clés secrètes). Non contourné, rien n'a été posé.

**TOOLS_PUBLISHABLE_KEY=REQUIRES_MANUAL** · **COLORS_PUBLISHABLE_KEY=REQUIRES_MANUAL**
Action : Supabase Preview → Settings → API Keys → clé `sb_publishable_…` ; Vercel → elsatia-tools et
elsatia-colors → Environment Variables → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, **scope Preview
seulement**.

Constats annexes : Tools n'a pas `NEXT_PUBLIC_TOOLS_BILLING_API_URL` (erreur bloquante de
`verify-public-env` en build publié) ni `NEXT_PUBLIC_TOOLS_URL` en Preview ; Colors porte
`NEXT_PUBLIC_COLORS_URL` sur un seul enregistrement `production,preview` (même valeur pour les deux :
la Preview Colors annoncerait l'origine de Production — à séparer).

## Phase 9 — Réserves

Les 7 projets de l'équipe ont été relus : aucun projet `reserves`, aucun projet sur `apps/reserves`.
Variables requises (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ELSATIA_APPLICATION_ENV`, `NEXT_PUBLIC_RESERVES_URL`) : la publishable
et la clé de service ne sont pas obtenables dans la session, l'URL finale n'existe pas encore → projet
non créé (il serait inutilisable).

**RESERVES_PROJECT_STATUS=BLOCKED**. Paramètres prêts : `elsatia-reserves`, équipe `julien-gregurec1`,
Root Directory `apps/reserves`, framework nextjs, Node 24.x, variables Preview seulement, aucun
domaine Production, pas de lien Git (déploiement CLI `--target preview`) ou, si lien Git, Ignored
Build Step fermé jusqu'au cutover.

## Phase 10 — Auth Preview (Supabase `pgvvpqyjziyapbbkydmc`)

Actuel (lu) : `site_url` = `https://elsatia-preview-git-feat-elsatia-canoni-4f3ed2-julien-gregurec1.vercel.app`,
`uri_allow_list` = cette même origine `/**` uniquement.

Préparé (à appliquer quand les URL finales existent ; aucun callback Production concerné, projet
Production non touché) :

| Champ | Valeur proposée |
|---|---|
| Site URL | URL Preview finale de Gestion Pro (alias de branche ou déploiement elsatia-preview du train 408) |
| Redirect URLs | `<GP Preview>/**`, `<Tools Preview>/**`, `<Colors Preview>/**`, `<Réserves Preview>/**` (origines exactes) |
| Repli si les alias changent à chaque déploiement | `https://elsatia-preview-*-julien-gregurec1.vercel.app/**`, `https://elsatia-tools-*-julien-gregurec1.vercel.app/**`, `https://elsatia-colors-*-julien-gregurec1.vercel.app/**`, `https://elsatia-reserves-*-julien-gregurec1.vercel.app/**` — DECISION_REQUIRED (joker plus large qu'une origine exacte) |
| À retirer | l'alias `feat` obsolète, après bascule |

Les URL finales n'existent pas (aucun déploiement Tools/Colors/Réserves Preview ; l'alias de la
nouvelle branche est tronqué/haché par Vercel et elle n'est pas déployée).

**AUTH_CHANGES_PREPARED=YES** · **AUTH_CHANGES_APPLIED=NO**

## Phase 11 — Exposition du GP public

`elsatia-preview` : `ssoProtection=null`, aucun mot de passe, aucune IP de confiance → **tous** ses
déploiements sont publics, dont `elsatia-preview-bgf9n4rqz` (V9.2 dfb59cc6, Next 16.3.5, base 372,
**non valide**). `next/og` n'est pas utilisé par le code (exposition réduite au RCE, pas annulée).
Action préparée (projet ALLOWLIST, sans effet sur la Production réelle) :
`PATCH /v9/projects/prj_0dX75LBHTxWUYQKle7zNdWdrWctK?teamId=team_Jc6YWtXF1pV1ezbLdYzGnMRZ`
`{"ssoProtection":{"deploymentType":"preview"}}` (Vercel Authentication sur les déploiements Preview ;
`elsatia-preview.vercel.app` inchangé). Non appliquée : les recettes HTTP du pack (`http-smoke`)
devront alors utiliser un jeton de contournement — choix opérateur.
**MANUAL_PROTECTION_REQUIRED** (appliquer l'action ci-dessus, ou supprimer les déploiements Preview
16.3.5 de V9.2).

## Phase 12 — Secrets dans les bundles publics

- Statique : `npm run verify:secrets` → 3 975 fichiers suivis, aucun secret reconnu ; aucun fichier
  `"use client"` ne référence `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` ou
  `BANK_DATA_ENCRYPTION_KEY` ; aucune variable `NEXT_PUBLIC_*` au nom de secret.
- Dynamique (12 chunks JS de `/`, `/login`, `/inscription`, `/tarifs`, `/mot-de-passe-oublie` sur
  `elsatia-preview-bgf9n4rqz`) : 0 `sb_secret_`, 0 `sk_live_`/`sk_test_`, 0 `rk_`, 0 `whsec_`, 0 clé
  PEM, 0 URL postgres avec mot de passe, 0 clé OpenAI/AWS, 0 JWT (donc aucun `service_role`),
  0 référence au projet Supabase Production. Seuls des noms de motifs et des compteurs ont été
  affichés.

**PUBLIC_SECRET_EXPOSURE=NO**

## Phase 13 — Pré-vol cutover

Conditions : NEXT_SECURITY_FIX=PASS ✓, BACKUP_PACK_VALIDATED=NO ✖, SUPABASE_CLI_READY=YES ✓,
GP_PREVIEW_PROJECT_CONFIRMED=YES ✓, VARIABLES_CRITICAL_READY=NO ✖, VERCEL_AUTODEPLOY_SAFE=YES (branche) ✓.
→ pré-vol **non exécuté**.

Lecture préalable (une requête READ ONLY) : ledger Preview = 372 (inchangé), PostgreSQL 17.6.
Attendu au pré-vol : LEDGER=372, TARGET=408, PENDING=36 (19 V9.1 + 17 V9.2), 813 originale.

Point bloquant supplémentaire relevé pour le pré-vol : `scripts/preview/v9/lib/git.mjs`
(`GIT-BRANCHE`) n'accepte que `integration/elsatia-canonical-train-v9.2`,
`claude/focused-ptolemy-kwdju8` ou `integration/elsatia-canonical-train-v<N>[.<M>]` ; la branche
`integration/elsatia-v9.2-preview-ready-v1` serait refusée. Le garde n'a pas été élargi : le pré-vol et
le cutover doivent partir du train canonique après y avoir intégré cette branche (fast-forward).

**CUTOVER_PREFLIGHT=BLOCKED**

## Phase 14

`v9-cutover.sh --apply-preview` non lancé (interdit par la mission).

## Phase 15 — Git

Commits sur `integration/elsatia-v9.2-preview-ready-v1` : `480b5d3b` (Next 16.3.8, porté de `ea554fab`),
`247066ee` (garde `vercel.json`), puis ce rapport. Poussée uniquement après la garde d'auto-déploiement
(voir phase 3). La branche de session `claude/dazzling-cannon-6dqcx2` n'a pas été poussée (sans garde,
un push déclencherait les builds interdits).

## HUMAN_ACTIONS_REMAINING

1. **Sauvegarde** : runbook `ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md` §2 avec `ELSATIA_PREVIEW_DB_URL`
   → `backup-check.mjs` = `BACKUP_DECLARED_OK` (≤ 12 h avant le cutover).
2. **GP Preview** : poser `BANK_DATA_ENCRYPTION_KEY` (secret Preview, jamais celui de Production ;
   contrôler `iban-k1-check.mjs`), `STRIPE_WEBHOOK_EXPECTED_MODE=test`, `TOOLS_STORE_ENVIRONMENT=sandbox`.
3. **Tools / Colors** : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` Preview (scope Preview seul) ; Tools :
   `NEXT_PUBLIC_TOOLS_BILLING_API_URL` Preview ; Colors : séparer `NEXT_PUBLIC_COLORS_URL` preview/production.
4. **Vercel FORBIDDEN** : Ignored Build Step sur `elsatia-production` et `liria-concept-gestion-btp`
   (tableau phase 3) — sinon ne pousser que des branches couvertes par `git.deploymentEnabled`.
5. **Protection** : Vercel Authentication sur `elsatia-preview` (phase 11) ou suppression des
   déploiements V9.2 en 16.3.5.
6. **Train** : intégrer `integration/elsatia-v9.2-preview-ready-v1` dans
   `integration/elsatia-canonical-train-v9.2` (fast-forward) pour que le pack accepte la branche ;
   retirer/adapter la clé `git.deploymentEnabled` selon la stratégie de déploiement voulue.
7. **Réserves** : créer `elsatia-reserves` (paramètres phase 9) quand ses 5 variables Preview sont
   disponibles.
8. **Auth** : appliquer la configuration préparée (phase 10) quand les URL Preview finales existent.
9. Puis : `npm run preview:v9:preflight` (attendu 372 / 408 / 36, PASS) et décision GO du cutover.

## GO / NO-GO

**PREVIEW_CUTOVER_GO=NO**

Blocages exacts restants :
- BACKUP_PACK_VALIDATED=NO (aucune sauvegarde vérifiable par `backup-check.mjs`).
- VARIABLES_CRITICAL_READY=NO (`BANK_DATA_ENCRYPTION_KEY` GP ; publishable Tools/Colors).
- CUTOVER_PREFLIGHT non exécuté (dépend des deux précédents ; branche à intégrer au train).

## Verdict

**ELSATIA_V9_2_PREVIEW_GO_PARTIAL**
