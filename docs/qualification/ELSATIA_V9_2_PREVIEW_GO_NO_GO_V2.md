# ELSATIA V9.2 — Preview : GO / NO-GO (V2)

Date : 2026-10-03 (UTC). Mission autonome « reprise preview readiness après sécurisation Vercel ».
**Aucune migration, aucun `db push`, aucun `--apply-preview`, aucune Production, aucun Stripe Live,
aucun Studio, aucune Boutique.** Aucune valeur secrète n'est reproduite dans ce document.

```
BASE_SHA=dfb59cc6
BRANCH=integration/elsatia-v9.2-preview-readiness-v1
FINAL_SHA=50319c76   (commit fonctionnel : bump Next.js ; le commit de ce rapport le suit, docs seules)

VERCEL_PRODUCTION_GUARD=CONFORME
VERCEL_LIRIA_GUARD=CONFORME
VERCEL_AUTODEPLOY_SAFE=YES

NEXT_SECURITY_FIX=PASS

GP_VARIABLES_READY=YES
TOOLS_PUBLISHABLE_KEY_READY=YES
COLORS_PUBLISHABLE_KEY_READY=YES
COLORS_PREVIEW_URL_SCOPE_FIXED=NO

RESERVES_PROJECT_STATUS=BLOCKED
AUTH_PREVIEW_READY=NO

BACKUP_PACK_VALIDATED=NO
DB_CREDENTIAL_REQUIRED=YES
SUPABASE_CLI_READY=YES

GP_PREVIEW_PROJECT_CONFIRMED=YES
PUBLIC_SECRET_EXPOSURE=NO
CUTOVER_PREFLIGHT=BLOCKED

PREVIEW_CUTOVER_GO=NO
```

**Verdict : `ELSATIA_V9_2_PREVIEW_GO_PARTIAL`**

---

## Blocages restants (PREVIEW_CUTOVER_GO=NO)

1. **Alias Preview GP stable non défini** (DECISION_REQUIRED). `elsatia-preview.vercel.app` sert un
   déploiement « production » du 2026-08-23 (`feat/remises-clients-v1`) et répond **500** ; le runbook
   `ELSATIA_V9_GP_PREVIEW_DEPLOY.md` laisse « alias Preview GP » en paramètre. Sans URL certaine,
   l'Auth Preview n'a pas été modifiée.
2. **Auth Preview** : `site_url` et `uri_allow_list` pointent toujours vers
   `elsatia-preview-git-feat-elsatia-canoni-4f3ed2-…vercel.app` (ancien alias). Dépend de 1, 3 et 4.
3. **Colors / Tools sans Preview réelle** : `elsatia-colors` et `elsatia-tools` ne sont **pas liés à
   Git** et n'ont **jamais eu de déploiement Preview** (uniquement Production `colors.elsatia.fr` /
   `tools.elsatia.fr`). Aucune URL Preview Colors n'existe → `NEXT_PUBLIC_COLORS_URL` reste une entrée
   unique `preview + production` = `colors.elsatia.fr` (non modifiée : la corriger imposerait de
   toucher l'entrée qui sert la Production et d'inventer l'URL Preview). Tools Preview : il manque
   aussi `NEXT_PUBLIC_TOOLS_BILLING_API_URL` (son build Preview s'arrêterait avant `next build`).
4. **Réserves** : aucun projet Vercel ; `NEXT_PUBLIC_RESERVES_URL` (requise en Preview) indéterminable
   tant que la stratégie d'URL Preview (lien Git + alias de branche, ou domaine dédié) n'est pas
   décidée → projet **non créé** (un projet lié au dépôt construirait en outre à chaque push).
5. **Sauvegarde logique** : la sauvegarde de la session précédente n'existe pas dans ce conteneur ;
   TCP Postgres indisponible (hôte direct IPv6 non routable ici ; pooler = mot de passe base requis).
   `backup-check.mjs` ne peut donc pas être exécuté sur un manifeste réel. Sauvegardes physiques
   Supabase présentes (dernière : 2026-10-01 13:33 UTC), **PITR absent**.
6. **Preflight réel non exécuté** (porte de la phase 14 non satisfaite : `AUTH_PREVIEW_READY=NO`) ;
   il exige de toute façon l'accès base (export ledger, `db push --dry-run`).
7. **Garde Git du pack** (DECISION_REQUIRED) : `preflight-v9.mjs` refuse la branche
   `integration/elsatia-v9.2-preview-readiness-v1` (`GIT-BRANCHE`, seules
   `integration/elsatia-canonical-train-v<N>[.<M>]` sont autorisées). Le correctif Next.js doit être
   porté sur une branche de train autorisée (fusion dans le train V9.2, ou train V9.3) — la garde
   n'a **pas** été affaiblie.
8. **Attestation k1** de la nouvelle `BANK_DATA_ENCRYPTION_KEY` Preview (`bank-keys status/register`)
   à faire avec l'accès base Preview.

Actions manuelles strictement indispensables : fournir l'accès base Preview (mot de passe /
`ELSATIA_PREVIEW_DB_URL`) et trancher 1, 3-4 (URLs Preview) et 7.

---

## Phase 1 — Worktree

Worktree neuf `/home/user/wt-readiness` depuis `origin/integration/elsatia-canonical-train-v9.2`
= `dfb59cc6`. Branche `integration/elsatia-v9.2-preview-readiness-v1` créée (inexistante côté
distant). Checkout principal intact. Les commits `63a657ae` et `c499a801` sont introuvables
(jamais poussés) : correctif reconstruit.

## Phase 2 — Garde-fous Vercel (lecture seule, équipe `julien-gregurec1`)

| Projet | Lien Git | Ignored Build Step / constat | Effet sur une branche de travail |
|---|---|---|---|
| elsatia-production | Appli_BTP, prod `release/commercialisation-v1` | `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi` = *Only build production* (modifié 18:42 UTC) | aucun build |
| liria-concept-gestion-btp | Appli_BTP, prod `main` | `exit 0` = *Don't build anything* (modifié 18:44 UTC) | aucun build |
| elsatia-studio-preview | Appli_BTP | build seulement pour `claude/studio-preview-live-deploy-v2` | aucun build |
| elsatia-preview | Appli_BTP, prod `main` | aucun (projet GP Preview autorisé) | build Preview |
| elsatia-tools / elsatia-colors | aucun | — | aucun |
| elsatia-site | autre dépôt (`elsatia-site`) | — | aucun |

Aucun projet modifié.

## Phase 3 — Next.js 16.3.5 → 16.3.8

Diff limité à `next` et `eslint-config-next` dans `package.json` (racine GP) et
`apps/{tools,colors,reserves}/package.json` + les 4 lockfiles (seules lignes
`version`/`resolved`/`integrity` de `next`, `@next/*`, `eslint-config-next`). Studio exclu.

| Contrôle | Résultat |
|---|---|
| typecheck (GP + Tools + Réserves + Colors) | vert |
| lint | vert |
| tests | **5 799 passés** (2 950 GP + 2 174 Tools + 239 Réserves + 436 Colors), 0 échec |
| builds | GP, Tools, Colors, Réserves verts (Next.js 16.3.8 ; satellites en `*_ENV=local` comme prévu par leurs gardes) |
| `npm audit` | aucun avis sur `next`, 0 critique (avis « high » restants préexistants, hors `next`) |
| pack V9 / pack Preview / attendus du train | 29/29, 32/32, `408 / 20261003001504 / 39` à jour |

## Phase 4 — Push et observation

Push `50319c76` à 18:56 UTC. Déploiements déclenchés :

| Projet | État |
|---|---|
| elsatia-production | **CANCELED** (Ignored Build Step) |
| liria-concept-gestion-btp | **CANCELED** |
| elsatia-studio-preview | **CANCELED** |
| elsatia-preview | READY (Next.js 16.3.8, `[env-manifest] cible preview : mode enforce. GO`) |
| elsatia-site / Tools / Colors | aucun |

Note : ce déploiement de branche (non aliasé, protégé par Vercel SSO) porte le code 408 alors que la
base est au ledger 372 — même situation que le déploiement existant de `dfb59cc6`. Il ne doit pas
être aliasé avant la porte `code-deploy-gate.mjs`.

## Phase 5 — Variables GP Preview (`elsatia-preview`, scope Preview seul, toutes branches)

Créées : `STRIPE_WEBHOOK_EXPECTED_MODE`, `ABONNEMENTS_PUBLICS_OUVERTS`,
`ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, `LEGAL_TVA_REGIME_CONFIRME`, `TOOLS_STORE_ENVIRONMENT`
(valeurs sûres de la mission ; le code exige `=== "true"`, donc fail-closed) et
`BANK_DATA_ENCRYPTION_KEY` (32 octets aléatoires générés localement, type *sensitive*, jamais
affichée ni stockée ; aucune clé Production utilisée). Les 12 variables `required` du manifeste
pour `gestion_pro` en Preview sont désormais présentes hors portée de branche.

## Phase 6 — Clé publishable

Clé `publishable` du projet Supabase `pgvvpqyjziyapbbkydmc` (préfixe `sb_publishable_` vérifié,
lue via l'API de ce projet) posée en `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, scope **Preview** seul,
sur `elsatia-tools` et `elsatia-colors`. Scopes Production inchangés. `NEXT_PUBLIC_SUPABASE_URL`
Preview de ces deux projets = réf. Preview ; l'ancienne `ANON` reste en place (alias hérité accepté
en transition par les gardes).

## Phases 7 à 9 — voir blocages 1 à 4.

## Phase 10/11 — Sauvegarde et CLI

`supabase --version` = **2.109.1** (réinstallé dans le scratchpad, hors dépôt). Aucun `link`, aucun
`db push`. Sauvegarde : voir blocage 5.

## Phase 12 — Projet GP Preview

`elsatia-preview` confirmé : racine du dépôt, build
`check-env-manifest --auto --app gestion_pro && npm run build:gestion-pro`, variables exclusivement
GP (prix Stripe, `GP_DEVIS_V2`, `GP_PLANNING_V2`…), projet Supabase nommé `elsatia-preview`
(= `pgvvpqyjziyapbbkydmc`), référencé par Colors Preview (`NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`) et par
le runbook de déploiement. La CSP servie n'a pas pu être lue (déploiements protégés par SSO).

## Phase 13 — Bundles

Aucun motif secret (`sk_/rk_` Stripe, `sb_secret_`, `whsec_`, clé privée PEM, clé OpenAI, JWT
`service_role`) dans : `.next/static` local de GP, Tools, Colors, Réserves (16.3.8) ; bundles
publics de `elsatia-tools.vercel.app` et `elsatia-colors.vercel.app`. GP Preview non public (SSO).

## Phase 14 — Preflight

Non exécuté sur la base (porte non satisfaite). Preflight **hors ligne** `preflight-v9.mjs`
exécuté pour information : tous les contrôles verts (train 408, plan 372 → 408 = 36 en attente,
phase 0 no-op, 6 ledgers divergents refusés, 813 originale exigée, dry-run ±1 refusé, rollback
classé) **sauf** `GIT-BRANCHE` (blocage 7) → `PREVIEW_V9_OPERATOR_PACK_BLOCKED`.

## Phase 15

`v9-cutover.sh --apply-preview` **non lancé**.
