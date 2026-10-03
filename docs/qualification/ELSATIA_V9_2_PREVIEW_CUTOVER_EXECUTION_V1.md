# ELSATIA V9.2 — Preview : exécution du cutover 372 → 408 (V1)

Date : 2026-10-03, 20:41 → 21:10 UTC. Mission autonome « cutover Preview 372 → 408 + contrôles post-migration ».
Cible unique autorisée : `pgvvpqyjziyapbbkydmc` (elsatia-preview). **Aucune écriture en base, aucun
`db push`, aucun `--apply-preview`, aucun déploiement, aucune Production, aucun Stripe Live, aucun
Studio, aucune Boutique, aucun Social.** Aucune valeur secrète n'est reproduite dans ce document.

```
CANONICAL_SHA=1a638855441a0f4bfeeb23e4c656c7b2c2fab38e
PROJECT_REF=pgvvpqyjziyapbbkydmc

BACKUP_PACK_VALIDATED=YES_OPERATOR_PROOF
BACKUP_AGE_AT_APPLY=NOT_APPLIED (âge au dernier contrôle 20:45 UTC ≈ 1 h 27 ; fenêtre valide jusqu'au 2026-10-04 07:18 UTC)

PRE_LEDGER=372
PRE_LAST_MIGRATION=20261002000813
PRE_PENDING=36

FINAL_DRY_RUN=NOT_RERUN_IN_CONTAINER (dry-run opérateur réel EXIT 0 / 36 retenu ; plan hors ligne recalculé = PASS, 36, identique)
FINAL_DRY_RUN_COUNT=36

MIGRATION_APPLY=NOT_STARTED (BLOCKED_ENVIRONMENT)
MIGRATIONS_APPLIED_COUNT=0
FIRST_APPLIED=NONE
LAST_APPLIED=NONE

POST_LEDGER=372 (inchangé)
POST_PENDING=36
LEDGER_DIVERGENCE=NO

POST_CUTOVER_CHECKS=NOT_RUN (base non migrée ; code-deploy-gate = CODE_DEPLOY_ALLOWED=false)

BANK_KEY_PRESENT=YES
BANK_K1_REGISTER=NOT_RUN (RPC cles_bancaires_* absente : migration 20261002001112 non appliquée)
BANK_K1_STATUS=NOT_RUN
IBAN_K1_READY=NO (BANK_K1_ATTESTATION=POST_CUTOVER_REQUIRED)

GP_PREVIEW_DEPLOY=UNCHANGED (alias stable gp-preview-v8 → 53b4bc76, code compatible 372)
TOOLS_PREVIEW_DEPLOY=NONE (alias gp-preview-v8 : 404 ; non déclenché, porte fermée)
COLORS_PREVIEW_DEPLOY=NONE (alias gp-preview-v8 : 404 ; non déclenché, porte fermée)
RESERVES_PREVIEW_DEPLOY=NONE (alias gp-preview-v8 : 404 ; non déclenché, porte fermée)

AUTH_PREVIEW=READY (déclaration opérateur ; non rejouée hébergée)
PUBLIC_SECRET_EXPOSURE=NO

SMOKE_GP=NOT_RUN (protection SSO Vercel : 302 vers vercel.com/sso-api ; base non migrée)
SMOKE_TOOLS=NOT_RUN (404)
SMOKE_COLORS=NOT_RUN (404)
SMOKE_RESERVES=NOT_RUN (404)

PREVIEW_DATABASE_CUTOVER=NOT_DONE (base intacte à 372)
PREVIEW_HOSTED_READINESS=NO

VERDICT=ELSATIA_V9_2_PREVIEW_CUTOVER_FAILED
```

**Verdict : `ELSATIA_V9_2_PREVIEW_CUTOVER_FAILED`** — au sens « application non réalisée » :
l'application n'a **jamais démarré** ; la base Preview est **intacte et cohérente** (ledger 372,
préfixe exact du train, 813 originale). Aucune action de reprise (`RECOVERY_REQUIRED`) n'est
nécessaire : le cutover peut être relancé tel quel depuis un poste opérateur.

---

## 1. Cause du blocage (DECISION_REQUIRED → choix conservateur)

Le seul mécanisme officiel d'application est `scripts/preview/v9/v9-cutover.sh --apply-preview
--confirm-ref pgvvpqyjziyapbbkydmc`, qui exécute `supabase db push --linked --yes`. Il exige :

| Prérequis | État dans le conteneur de mission |
|---|---|
| `ELSATIA_PREVIEW_DB_URL` (URL PostgreSQL) | **absente** |
| `SUPABASE_DB_PASSWORD` | **absent** |
| Connexion TCP PostgreSQL (5432 / 6543, pooler eu-west-3) | **impossible** (timeout ; `db.<ref>.supabase.co` IPv6 uniquement, non routé) |
| `supabase/.temp/project-ref` (projet lié) | absent |
| Fichier manifeste de sauvegarde (`--backup-manifest`) | **absent** (preuve opérateur seulement) |

Seul accès disponible : l'API de gestion Supabase (proxy), dont le point
`database/query/read-only` a servi aux lectures ci-dessous.

Alternative écartée : rejouer les 36 fichiers SQL via l'API de gestion puis insérer les lignes de
`supabase_migrations.schema_migrations`. Ce serait une **édition manuelle du ledger** et un
contournement du pack officiel (garde de cible, contrôle de sauvegarde, égalité dry-run/plan) —
explicitement interdits. L'endpoint `POST database/migrations` attribue sa propre version horodatée
et créerait une divergence de ledger : écarté également.

## 2. Phase 1 — pré-check (réalisé, lecture seule)

| Contrôle | Résultat |
|---|---|
| `git fetch --all --prune` | OK |
| Worktree propre sur `integration/elsatia-canonical-train-v9.2` | OK, HEAD `1a638855441a` |
| `cutover-step.mjs git-check` | 5/5 ✓ (base V9.1 `24a0c2e993ec` ancêtre, branche, worktree propre) |
| `cutover-step.mjs train-check` | 7/7 ✓ — TARGET_LEDGER=408, dernière 20261003001504, versions uniques, 813 locale originale, plancher au rang 372, V9.1 au rang 391, pont phase 0 `20261003000201` no-op |
| Migrations | 408, aucun timestamp dupliqué, aucun fichier Social |
| Export ledger (`ELSATIA_V9_LEDGER_EXPORT.sql`, lecture seule, 20:43:44 UTC) | 372 entrées, dernière `20261002000813_plateforme_annuaire_lecture_pure` |
| 813 originale | ledger `marqueur_813=true` ; fonction déployée `original=true`, `non_original=false` |
| `check-ledger-v9.mjs --expect pre --require-813-proof --attendu-courant 372` | `PREVIEW_LEDGER_PREFIX_OK`, CURRENT=372, TARGET=408, PENDING=36 (20261002000901 → 20261003001504) |
| `migration-plan-v9.mjs` | `MIGRATION_PLAN_OK`, 7/7 preuves (sans --include-all, historique intact, plancher 813, 408 − 372 = 36) |
| 36 dernières migrations du train vs liste du dry-run opérateur | **identiques, même ordre** |
| Migrations au ledger postérieures à 813 (étrangères) | 0 |
| `v9-cutover.sh --offline-ledger` (simulation) | étapes 1-7 vertes ; étape 8 `BACKUP_MISSING` (manifeste absent du conteneur) ; `CODE_DEPLOY_ALLOWED=false` |

Fenêtre de sauvegarde : backup déclaré à 21:18 heure locale le 03/10/2026. L'heure locale est
interprétée comme Europe/Paris (UTC+2) — interprétation forcée : en UTC, la sauvegarde serait
postérieure à la mission. Soit 19:18 UTC, validité jusqu'au **2026-10-04 07:18 UTC (09:18 Paris)**.
`BACKUP_PACK_VALIDATED=YES_OPERATOR_PROOF` ; `backup-check` **non relancé** (fichiers absents),
sauvegarde non remise en BLOCKED.

## 3. Phases 2 à 5 — non exécutées

- Phase 2 (application) : bloquée (§ 1). Aucune commande d'écriture émise vers la base.
- Phase 3 (validation ledger) : ledger relu inchangé à 372.
- Phase 4 (clé bancaire) : `register --key-id k1` non tenté — la RPC est absente (lecture
  `pg_proc` : 0 fonction `cles_bancaires_*`), échec certain avant 20261002001112. Aucune fonction
  créée à la main.
- Phase 5 (contrôles fonctionnels base) : sans objet tant que la base n'est pas à 408.

## 4. Phase 6 — porte « code après base »

`code-deploy-gate.mjs` sur le ledger réel : **`CODE_DEPLOY_ALLOWED=false`** (ledger
`PREVIEW_LEDGER_PREFIX_OK`, pas de cutover vérifié). Aucun déploiement déclenché.

## 5. Phase 7 — état des surfaces Preview (lecture seule, API Vercel)

| Surface | Alias gp-preview-v8 | Observé |
|---|---|---|
| GP (`elsatia-preview`) | 302 → SSO Vercel | alias → `dpl_BEESm…`, branche `gp-preview-v8`, commit `53b4bc76` (code 372) |
| Tools (`elsatia-tools-preview`) | 404 | dernier déploiement : ERROR, branche `claude/elegant-fermi-s9ld1d` |
| Colors (`elsatia-colors-preview`) | 404 | dernier déploiement : ERROR, branche `claude/elegant-fermi-s9ld1d` |
| Réserves (`elsatia-reserves`) | 404 | dernier déploiement : CANCELED, branche `claude/sweet-goodall-jpcufd` |

Constats à arbitrer (DECISION_REQUIRED, aucune modification faite) :

1. **Déploiement de branche du code 408 contre une base 372** : `elsatia-preview` a construit
   automatiquement `integration/elsatia-canonical-train-v9.2` @ `1a638855` (READY, 19:34 UTC). Ce
   n'est pas l'alias stable, mais l'URL de branche existe et pointe la base 372. À ne pas utiliser
   pour la recette avant le cutover.
2. **Indicateurs IA/relances** : dans `elsatia-preview` (cible Preview), `FEATURE_AI_DEVIS_ENABLED`
   et `FEATURE_RELANCES_AUTO_ENABLED` **existent** (type *sensitive*, valeur illisible), alors que
   le contexte de mission les déclare absents. Le code étant fail-closed (`absence ≠ true`), le
   risque n'existe que si leur valeur vaut `true` : à vérifier par l'opérateur.
3. Les derniers déploiements Tools/Colors/Réserves ciblent `production` *au sein des projets
   Preview isolés* et sont en ERROR/CANCELED ; aucun ne sert l'alias gp-preview-v8.

## 6. Phase 9 — sécurité (PUBLIC_SECRET_EXPOSURE=NO)

- `npm run verify:secrets` (canonique) : 3 976 fichiers suivis, aucun secret reconnu.
- Build GP local du code canonique avec **canaris** injectés dans les variables serveur
  (service_role, clé bancaire, Stripe secret + webhook, HMAC rate limit, OpenAI) : 0 canari,
  0 `service_role`, 0 `sk_test_`/`sk_live_`/`whsec_`, 0 clé privée PEM, 0 ref Production
  `exhvuzegsefmoguxoiak` dans `.next/static`. Seule la ref Preview publique apparaît (URL Supabase).
- Variables Vercel (noms uniquement, 4 projets) : aucune variable `NEXT_PUBLIC_*` porteuse de
  secret ; secrets serveur limités aux noms attendus.
- Limite : les bundles hébergés GP sont derrière le SSO Vercel et Tools/Colors/Réserves n'ont pas
  de déploiement sur l'alias ; le scan porte sur le build canonique local.

## 7. Suite immédiatement exécutable (poste opérateur, avant 2026-10-04 07:18 UTC)

```bash
git switch integration/elsatia-canonical-train-v9.2   # HEAD 1a638855, worktree propre
npx supabase link --project-ref pgvvpqyjziyapbbkydmc
export ELSATIA_PREVIEW_DB_URL=…  SUPABASE_DB_PASSWORD=…   # jamais affichés ni commités
scripts/preview/v9/v9-cutover.sh --out ~/elsatia-v9-cutover-$(date -u +%Y%m%dT%H%M) \
  --backup-manifest <manifeste.json du pack 21:18> --attendu-courant 372 \
  --apply-preview --confirm-ref pgvvpqyjziyapbbkydmc
# puis : npm run --silent bank-keys -- register --key-id k1 ; bank-keys -- status ;
#        npm run preview:v9:iban-k1 -- … ; code-deploy-gate ; déploiements Preview ; smoke tests.
```

Alternative : relancer cette mission dans un environnement disposant de `ELSATIA_PREVIEW_DB_URL`,
`SUPABASE_DB_PASSWORD`, du manifeste de sauvegarde et d'un accès réseau PostgreSQL au pooler
Supabase eu-west-3.

```
HUMAN_ACTIONS_REMAINING=
  1. Exécuter v9-cutover.sh --apply-preview depuis un poste disposant de l'URL DB Preview,
     du mot de passe DB et du manifeste de sauvegarde — avant 2026-10-04 07:18 UTC,
     sinon refaire la sauvegarde.
  2. Après ledger 408 : bank-keys register k1 / status / preview:v9:iban-k1 → IBAN_K1_READY.
  3. Vérifier que FEATURE_AI_DEVIS_ENABLED et FEATURE_RELANCES_AUTO_ENABLED (Preview,
     elsatia-preview) ne valent pas true, ou les supprimer.
  4. Après porte de code ouverte : déployer 1a638855 sur l'alias gp-preview-v8 des 4 projets
     Preview (jamais --prod), puis smoke tests hébergés (accès SSO Vercel ou bypass requis).
  5. Ne pas utiliser l'URL de branche integration/elsatia-canonical-train-v9.2 (code 408)
     tant que la base est à 372.
```
