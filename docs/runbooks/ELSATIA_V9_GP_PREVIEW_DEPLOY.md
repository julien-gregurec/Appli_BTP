# ELSATIA V9 — Déploiement du code Gestion Pro en Preview (après la base)

| | |
|---|---|
| Commit exact à déployer | **HEAD du train porteur du pack** (V9.2 : branche `integration/elsatia-canonical-train-v9.2`) — le pack vit DANS le train ; `cutover-step.mjs git-check` prouve que la base publiée V9.1 `24a0c2e993ec0836b492ea72f27ed7dc347a20fa` est ancêtre de HEAD, branche autorisée, worktree propre |
| SHA consigné | `sha_deploye` du rapport de cutover (= `git rev-parse HEAD` au moment du cutover) ; la porte code refuse un rapport dont le SHA ≠ HEAD |
| Projet Vercel | **`elsatia-preview`** (GP, Root Directory `.`) — runbook d'exécution V3, STEP 8 |
| Environnement | **Preview** uniquement. Jamais `vercel deploy --prod` sur ce projet (il possède son propre environnement « Production » : `VERCEL_ENV=production` sur une Preview) |
| Base | Supabase `pgvvpqyjziyapbbkydmc`, **déjà au train complet** (`CURRENT_LEDGER` = `TARGET_LEDGER`, `PENDING_MIGRATIONS=0` ; porte `CODE_DEPLOY_ALLOWED=true`) |
| Code servi avant | le déploiement Preview en cours (historique : `de50245a`, V8 + 813) — **noter l'URL de son déploiement** : c'est le retour arrière |
| Interdit | Production `exhvuzegsefmoguxoiak`, Stripe Live, tout jeton dans un fichier du dépôt |

## 1. Pourquoi la base AVANT le code (rappel)

Le code du train appelle `consulter_rate_limit` (1113) à chaque connexion et refuse la connexion si
l'appel échoue : code récent sur base en retard = plus personne ne se connecte. Il appelle aussi les
RPC des migrations en attente (onboarding légal 901, agrégats et garde-fous GP). Le code servi avant
reste compatible avec la base à jour. Ordre imposé :
`v9-cutover.sh --apply-preview` → `CODE_DEPLOY_ALLOWED=true` → déploiement.

Attention aux **déploiements automatiques de branche** : si l'intégration Git de Vercel est active,
un déploiement Preview de `integration/elsatia-canonical-train-v9-final` peut déjà exister. Il ne
doit **pas** être aliasé ni utilisé avant la porte (il échouerait à la connexion, sans écrire).

## 2. Variables (scope Preview du projet `elsatia-preview`)

Exporter l'inventaire SANS valeurs secrètes déchiffrées (préférer l'API, qui renvoie les secrets
chiffrés) dans un fichier **hors dépôt**, puis :

```bash
npm run preview:v9:env-scope -- ../elsatia-v9-run/vercel-env.json
npm run preview:v9:iban-k1 -- ../elsatia-v9-run/vercel-env.json
```

Attendu : `ENV_SCOPE_OK` (ou `ENV_SCOPE_PARTIAL` avec seulement des avertissements lus et
acceptés) et `IBAN_K1_READY`. Points obligatoires :

| Groupe | Exigence Preview |
|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL` = `https://pgvvpqyjziyapbbkydmc.supabase.co`, clés publique et service PRESENT |
| Stripe | `STRIPE_SECRET_KEY` = clé **test** ; `STRIPE_WEBHOOK_EXPECTED_MODE=test` ; `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE=false` ; aucune `sk_live_` / `rk_live_` / `pk_live_` |
| Limiteur (1113) | `RATE_LIMIT_HMAC_KEY` PRESENT |
| IBAN | `BANK_DATA_ENCRYPTION_KEY` (k1) PRESENT ; **ne pas** poser `BANK_DATA_ENCRYPTION_KEYS` / `WRITE_FORMAT=v2` pendant la recette (retour V8 impossible pour les IBAN écrits en v2) |
| Crons | `FEATURE_CRONS_ENABLED=false` ; `CRON_SECRET` : LIVE_ONLY (Production), sans effet en Preview |
| E-mail | `BREVO_API_KEY` + `EMAIL_PREVIEW_ALLOWLIST` si l'envoi est testé (sinon OPTIONAL MISSING accepté) |
| PDF | variables `PDF_*` facultatives (valeurs par défaut du code) |
| URL | `NEXT_PUBLIC_APP_URL` = alias Preview GP ; `ELSATIA_APPLICATION_ENV=preview` |

## 3. Séquence

| # | Action | Commande | Attendu |
|---|---|---|---|
| 1 | Base au train complet (déjà fait) | `scripts/preview/v9/v9-cutover.sh … --apply-preview --confirm-ref pgvvpqyjziyapbbkydmc` | `CODE_DEPLOY_ALLOWED=true` |
| 2 | Consigner le déploiement servi | `vercel ls elsatia-preview` / tableau de bord : URL du déploiement aliasé | URL notée dans le rapport |
| 3 | Porte, juste avant | `npm run preview:v9:code-gate -- --report ../elsatia-v9-run/cutover-report.json --ledger ../elsatia-v9-run/ledger-apres.json` | `CODE_DEPLOY_ALLOWED=true` (sinon **STOP**) |
| 4 | Arbre exact du commit | `git worktree add ../elsatia-v9-deploy <sha_deploye du rapport>` | worktree détaché sur le SHA de HEAD consigné |
| 5 | (facultatif) build local | `cd ../elsatia-v9-deploy && npm ci && npm run typecheck` | 0 erreur (le build réel se fait chez Vercel) |
| 6 | Lier le projet | `cd ../elsatia-v9-deploy && vercel link --project elsatia-preview` | projet `elsatia-preview` |
| 7 | Déployer en Preview | `vercel deploy` (**sans** `--prod`) | URL `https://…vercel.app` ; log de build : `[env-manifest] cible preview : mode enforce.` puis `GO : aucune erreur.` (commande de build du projet : `npm run build:gestion-pro`) |
| 8 | Commit réellement servi | `vercel inspect <url>` (source / commit) ; après connexion : `/parametres/version` | commit = `sha_deploye` du rapport |
| 9 | Smoke anonyme | `npm run preview:http-smoke -- --gp <url>` puis `npm run preview:v9:post-check -- --gp-url <url> --ledger … --v9-checks … --report …` | `GO` ; `POST_CUTOVER_AUTO_GO` |
| 10 | Alias stable | `vercel alias set <url> <alias Preview GP>` | l'alias sert le nouveau code |
| 11 | Recette guidée | liste imprimée par `post-cutover-check.mjs` (pilote `pilote.karim.haddad@example.test`) | toutes les cases cochées |

Deployment Protection : si active, exporter `VERCEL_AUTOMATION_BYPASS_SECRET` dans le shell (jamais
dans un fichier) pour les smokes ; le régénérer après la campagne.

## 4. Retour arrière du code

`vercel alias set <URL du déploiement notée à l'étape 2> <alias Preview GP>` — immédiat, sans
rebuild, **sans toucher la base** (compatible). Puis `npm run preview:http-smoke -- --gp <alias>`.
Détails et cas : `ELSATIA_V9_PREVIEW_ROLLBACK.md` (cas B / C).

## 5. Ce que ce runbook n'inclut jamais

Jeton Vercel, mot de passe de base, clé Supabase, clé Stripe, clé IBAN. Les commandes lisent les
identifiants des CLI déjà authentifiées (`vercel login`, `supabase login`) ou du shell.
