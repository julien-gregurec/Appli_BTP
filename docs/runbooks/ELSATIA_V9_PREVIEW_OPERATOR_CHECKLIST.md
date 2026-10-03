# ELSATIA V9 — Checklist opérateur : cutover Preview générique (train V9.2+)

Cible : **`pgvvpqyjziyapbbkydmc`** · Code : **HEAD du train** (`sha_deploye`) · Retour code : **déploiement servi avant** (consigné) · Production `exhvuzegsefmoguxoiak` : **interdite**.
Nombres **calculés**, jamais codés : `CURRENT_LEDGER` (ledger exporté), `TARGET_LEDGER` (train local), `PENDING_MIGRATIONS` (train − ledger).
Dossier de travail **hors dépôt** : `R=../elsatia-v9-run` · Sauvegarde : `B=../elsatia-v9-backup-<date>`.

## STOP IMMÉDIAT SI…

- une commande affiche `exhvuzegsefmoguxoiak`, `TARGET_REJECTED` ou `environment=production` ;
- `PREVIEW_LEDGER_DIVERGENCE` (ledger ≠ préfixe exact du train, plancher 813 absent, ou `LEDGER-PHASE0-PRODUCTION` : pas de `20260921000300`) ;
- `LEDGER-813-NON-ORIGINALE` ou `LEDGER-813-NON-PROUVEE` (813 différente) ;
- `PENDING_MIGRATIONS` ≠ `TARGET_LEDGER` − `CURRENT_LEDGER` (ou ≠ attendu avec `--attendu-courant`), ou `DRY_RUN_REJECTED` (une de moins, une de plus, `--include-all`, `migration repair`) ;
- `BACKUP_MISSING` ;
- DB verify `NO-GO` (une ligne ✖ bloquante) ou `V9_CHECKS_NO_GO` ;
- `IBAN_K1_MISSING` / `BLOCKER_IBAN_KEY` (k1 requise mais absente) ;
- `CODE_DEPLOY_ALLOWED=false` au moment de déployer.

→ Ne rien appliquer de plus. Garder `$R`. Suivre `ELSATIA_V9_PREVIEW_ROLLBACK.md`.

---

**ÉTAPE 0 — poste**
```bash
git fetch origin integration/elsatia-canonical-train-v9.2
git switch integration/elsatia-canonical-train-v9.2 && git pull --ff-only && npm ci
npm run preview:v9:preflight
```
RÉSULTAT ATTENDU : `PREVIEW_V9_OPERATOR_PACK_READY`

**ÉTAPE 1 — identifiants (saisis dans le shell, jamais dans un fichier du dépôt)**
```bash
npx supabase login && npx supabase link --project-ref pgvvpqyjziyapbbkydmc
vercel login && vercel link --project elsatia-preview          # .vercel/ est ignoré par git
export ELSATIA_PREVIEW_DB_URL='<URL PostgreSQL Preview>'   # Supabase › Preview › Database
export SUPABASE_DB_PASSWORD='<mot de passe base Preview>'
```
RÉSULTAT ATTENDU : `cat supabase/.temp/project-ref` → `pgvvpqyjziyapbbkydmc`

**ÉTAPE 2 — garde de cible**
```bash
npm run preview:v9:guard -- --ref pgvvpqyjziyapbbkydmc --environment preview
```
RÉSULTAT ATTENDU : `TARGET_PREVIEW_CONFIRMED` (sources : --ref, supabase/.temp/project-ref, ELSATIA_PREVIEW_DB_URL)

**ÉTAPE 3 — sauvegarde** (commandes complètes : `ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md` §2)
```bash
B=../elsatia-v9-backup-$(date +%F-%H%M); mkdir -p "$B"   # puis les 6 dumps + export du ledger du §2
node scripts/preview/v9/backup-manifest.mjs --dir "$B"
npm run preview:v9:backup-check -- "$B/manifest.json"
```
RÉSULTAT ATTENDU : `BACKUP_DECLARED_OK`

**ÉTAPE 4 — variables Vercel et k1**
```bash
mkdir -p ../elsatia-v9-run && R=../elsatia-v9-run
vercel env ls preview > "$R/vercel-env.txt"          # noms et scopes seulement, aucune valeur
npm run preview:v9:env-scope -- "$R/vercel-env.txt"
npm run preview:v9:iban-k1 -- "$R/vercel-env.txt"
```
RÉSULTAT ATTENDU : `ENV_SCOPE_OK` ou `ENV_SCOPE_PARTIAL` (avertissements lus) · `IBAN_K1_READY`

**ÉTAPE 5 — cutover à blanc (DRY-RUN, défaut)**
```bash
scripts/preview/v9/v9-cutover.sh --out "$R/dry" --backup-manifest "$B/manifest.json"
```
RÉSULTAT ATTENDU : `PREVIEW_LEDGER_PREFIX_OK` · `CURRENT_LEDGER=…` / `TARGET_LEDGER=…` / `PENDING_MIGRATIONS=…` (consignés, clé `train` du rapport ; phase 0 signalée « no-op en Preview ») · `BACKUP_DECLARED_OK` · `DRY_RUN_MATCHES_PLAN` · `DRY-RUN TERMINÉ` · `CODE_DEPLOY_ALLOWED=false`

**ÉTAPE 6 — application (les `PENDING_MIGRATIONS` du plan)**
```bash
scripts/preview/v9/v9-cutover.sh --out "$R/apply" --backup-manifest "$B/manifest.json" \
  --apply-preview --confirm-ref pgvvpqyjziyapbbkydmc
```
RÉSULTAT ATTENDU : `PREVIEW_LEDGER_V9_COMPLETE` (`CURRENT_LEDGER` = `TARGET_LEDGER`, `PENDING_MIGRATIONS=0`) · `GO : base Preview conforme.` · `V9_CHECKS_GO` · `CODE_DEPLOY_ALLOWED=true`
SI échec à l'étape 11 : cas A du rollback (pas de nouveau code, pas de restauration ; reprise `--resume-partial`).
SI `DB-PREFLIGHT administrateur_total_actif_absent` / `cle_attestation_active_absente` : STEP 7 du runbook V3, puis `v9-cutover.sh --out "$R/verify" --verify-only`.

**ÉTAPE 7 — k1 au registre (après 1112)**
```bash
npm run --silent bank-keys -- status > "$R/bank-keys-status.json"   # NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et BANK_DATA_ENCRYPTION_KEY de la Preview dans le shell ; sortie = identifiants et statuts seulement
npm run preview:v9:iban-k1 -- "$R/vercel-env.txt" --bank-keys-status "$R/bank-keys-status.json"
```
RÉSULTAT ATTENDU : `IBAN_K1_READY`, attestation `ATTESTEE` (sinon `npm run bank-keys -- register --key-id k1`, puis relancer)

**ÉTAPE 8 — porte code, puis déploiement** (`ELSATIA_V9_GP_PREVIEW_DEPLOY.md` §3)
```bash
npm run preview:v9:code-gate -- --report "$R/apply/cutover-report.json" --ledger "$R/apply/ledger-apres.json"
git worktree add ../elsatia-v9-deploy <sha_deploye du rapport>
cd ../elsatia-v9-deploy && vercel link --project elsatia-preview && vercel deploy     # JAMAIS --prod
```
RÉSULTAT ATTENDU : `CODE_DEPLOY_ALLOWED=true` puis URL Preview ; log de build `GO : aucune erreur.` ; `vercel inspect <url>` → commit = `sha_deploye`

**ÉTAPE 9 — recette post-cutover**
```bash
npm run preview:http-smoke -- --gp <url>
npm run preview:v9:post-check -- --gp-url <url> --ledger "$R/apply/ledger-apres.json" \
  --v9-checks "$R/apply/v9-checks.txt" --report "$R/apply/cutover-report.json"
vercel alias set <url> <alias Preview GP>
```
RÉSULTAT ATTENDU : `GO` · `POST_CUTOVER_AUTO_GO` · puis parcours guidé coché avec `pilote.karim.haddad@example.test` (mot de passe saisi dans le navigateur uniquement)

**RETOUR CODE (si besoin)**
```bash
vercel alias set <URL du déploiement servi, notée avant l'étape 8> <alias Preview GP>
```
RÉSULTAT ATTENDU : ancien code servi ; base inchangée (compatible) ; `npm run preview:http-smoke -- --gp <alias>` → `GO`
