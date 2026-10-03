# ELSATIA — Pack opérateur V9 : cutover Preview, rollback, qualification guidée

## V9.2 — pack générique

| | |
|---|---|
| Date | 2026-10-03 |
| Train porteur | train canonique V9.2 (`integration/elsatia-canonical-train-v9.2`), pack importé tel quel en `9ea26ee0` puis rendu générique ; train local : `supabase/migrations` de HEAD |
| Base exigée | base publiée V9.1 `24a0c2e993ec0836b492ea72f27ed7dc347a20fa` **ancêtre** de HEAD |
| SHA déployé | **HEAD** (consigné `sha_deploye` dans le rapport de cutover ; la porte code refuse un rapport d'un autre SHA) |
| Preview | `pgvvpqyjziyapbbkydmc` (garde `REF_PREVIEW_AUTORISEE` inchangée) |
| Production | `exhvuzegsefmoguxoiak` et hôtes `*.elsatia.fr` : **refusés par toutes les gardes** (inchangé) |
| Actions distantes | **aucune** (ni Supabase, ni Vercel, ni Stripe, ni secret réel, ni `db push` réel) |

### Ce qui a changé

Le pack importé codait en dur le cutover historique 372 → 389 (17 migrations, dernière
`20261002001113`, SHA canonique `6392131a`, branche `…-v9-final`). Sur le train V9.2 il était
faux (17 pass / 9 fail). Il **calcule** désormais tout depuis le train local et le ledger
exporté :

| Valeur | Source | Où elle apparaît |
|---|---|---|
| `CURRENT_LEDGER` | nombre et dernière version du ledger distant fourni | `check-ledger-v9.mjs`, plan, préflight (`INPUT-LEDGER`), `backup-check`, rapport (`train`) |
| `TARGET_LEDGER` | nombre et dernière version de `supabase/migrations` (HEAD) | idem + `cutover-step.mjs train-check`, SQL post-cutover (bloc `[train-expectations]` généré) |
| `PENDING_MIGRATIONS` | migrations du train absentes du ledger, **dans l'ordre** | idem ; le dry-run CLI doit annoncer exactement cette liste |

- **Plus aucun 17 / 372 / 389 / 1113 dans la logique** : `NB_SOCLE`, `NB_FINAL`, `NB_A_APPLIQUER`,
  `DERNIERE_FINALE`, `SHA_CANONIQUE` supprimés ; un test grep le source de `lib/*.mjs` et des outils.
  Restent des **invariants historiques identifiés par version** : plancher Preview
  `20261002000813` ORIGINALE (vérifications « 813 originale / non originale » conservées), base
  V9.1 `20261002001302`, prérequis phase 0 `20260921000300`.
- **Règles fail-closed génériques** : ledger = préfixe EXACT du train (ordre strict, aucun trou,
  aucune version étrangère, noms et sha256 identiques) ; plancher 813 ORIGINALE ; toutes les
  PENDING postérieures à la dernière version du ledger → `supabase db push` **sans** `--include-all`
  (toute suggestion `--include-all` ou `migration repair` = ARRÊT) ; `--expect pre` (PENDING ≥ 1),
  `--expect post` (ledger = train complet), `--expect reprise` (même contrôle que `pre`, gardé pour
  compatibilité) ; `--attendu-courant <n>` facultatif (`check-ledger`, `migration-plan`, `v9-cutover.sh`).
- **Phase 0** : les migrations portant `-- elsatia:upgrade-phase0` (aujourd'hui
  `20261003000201_pont_upgrade_prod_phase0_lignes_entreprise_v1`) sont signalées par le plan
  « phase 0 : no-op en Preview, 300 déjà au ledger » et appliquées dans l'ordre lexical normal.
  Un ledger sans `20260921000300` est refusé (`LEDGER-PHASE0-PRODUCTION`, renvoi vers
  `scripts/upgrade/preflight.mjs --phase 0`, hors périmètre du pack Preview).
- **Git** : HEAD contient la base V9.1 ; branches autorisées `integration/elsatia-canonical-train-v9.2`,
  toute `integration/elsatia-canonical-train-v<N>[.<M>]`, `claude/focused-ptolemy-kwdju8` ; `main`,
  `master`, `release/*`, `production` interdites ; worktree propre.
- **Fixtures** régénérées par `fixtures/generate-fixtures.mjs` (noms sans compteur) : socle V8,
  V9.1, train complet, partiel, 813 non originale, version étrangère, ordre incorrect, version
  manquante, ref Production, sans 300 ; dry-run exact / une de moins / une de plus / include-all.
  Jeu « courant » paramétrable : `--courant <version> --out <dossier>`. Le préflight refuse une
  fixture dérivée ou orpheline (anciennes `ledger-372-*`, `dry-run-16/17/18` supprimées).
- **Réversibilité** : `V9_MIGRATION_PLAN.generated.md` est produit depuis le socle V8 **et** depuis
  V9.1 (CURRENT / TARGET / PENDING, classe, phase 0, note) ; le runbook de rollback y renvoie
  (cas A/B/C et notes manuelles conservés) ; `NOTES_RETOUR` ajoutées pour `20261003001503`,
  `20261003001501`, `20261003001407`, `20261003000201` / `0202`, `20261003000103`, `20261003001406` ;
  `lock table` classé META (verrou de transaction, n'écrit rien).
- **SQL post-cutover** : le contrôle 1 lit l'attendu dans un bloc `[train-expectations]` synchronisé
  par `scripts/preview/train-expectations.mjs` (`npm run sync:train-expectations`, vérifié par
  `verify:train-expectations`) ; contrôles 12-14 ajoutés (`push_reserver_lot_service` service_role
  seul, `pointages_couts_appliques` et `plateforme_definir_url_preview_application` authenticated
  seul) ; le nombre de contrôles est compté dans le SQL (`NB_CONTROLES_V9`), plus codé.
- **Garde inchangée** : `pgvvpqyjziyapbbkydmc` seule cible, Production refusée, DRY-RUN par
  défaut, `--apply-preview` exige `--confirm-ref`, `--include-all` refusé avant tout traitement.

### Valeurs calculées sur le train V9.2 (HEAD de ce lot)

| Départ (fixture) | CURRENT_LEDGER | TARGET_LEDGER | PENDING_MIGRATIONS | Phase 0 |
|---|---|---|---|---|
| socle V8 (`ledger-socle-v8-ok.json`) | 372, `20261002000813` | 408, `20261003001504` | 36 (`20261002000901` → `20261003001504`) | `20261003000201` no-op |
| V9.1 (`ledger-v9-1-ok.json`) | 391, `20261002001302` | 408, `20261003001504` | 17 (`20261003000101` → `20261003001504`) | `20261003000201` no-op |

(Ces chiffres sont des **sorties** du pack à cette date, pas des attendus : ils suivent le train.)

### Résultats

| Commande | Résultat |
|---|---|
| `npm run test:preview-v9` | **29 pass / 0 fail** (avant : 17 pass / 9 fail) |
| `node scripts/preview/v9/preflight-v9.mjs --json` (worktree de travail) | 36 contrôles hors ligne, **34 verts** ; seuls `GIT-BRANCHE` / `GIT-PROPRE` en échec (branche de worktree non autorisée, travail non commité) → `BLOCKED` attendu |
| Préflight + `v9-cutover.sh` hors ligne dans un clone isolé sur `integration/elsatia-canonical-train-v9.9` | git / train verts ; dry-run V9.1 exact → `DRY_RUN_MATCHES_PLAN` ; une de plus, une de moins, include-all → `DRY_RUN_REJECTED` (STOP) ; socle V8 exact → OK ; `--attendu-courant` faux → STOP ; ledger sans 300 → STOP ; ledger complet → sortie 3 ; partiel `--resume-partial` → OK ; rapport : `sha_deploye` = HEAD, `train` = 391 / 408 / 17 |
| `npm run test:preview-pack` | 32 pass / 0 fail |
| `npm run verify:train-expectations` | OK (408 / `20261003001504`, DB verify 39 contrôles, SQL post-cutover synchronisé) |
| `npm run verify:migrations` | 408 migrations valides |
| `npm run verify:secrets` | aucun secret reconnu |
| `npm run verify:env-manifest` | OK (14 `DECISION_REQUIRED` non bloquantes) |
| `npx eslint scripts/preview` | 0 erreur |

Non rejoué dans ce lot : le banc PostgreSQL local (`--local-harness`, `harness/build-socle.sh`
dont le `nb` par défaut est maintenant le rang calculé de `20261002000813`) ; aucun accès distant.

---

## Historique — pack V1 (cutover 372 → 389, train V9 FINAL)

> Section conservée telle quelle : chiffres et SHA **historiques** du train V9 FINAL, remplacés
> par les valeurs calculées ci-dessus.

| | |
|---|---|
| Date | 2026-10-02 |
| Base | train canonique V9 FINAL `integration/elsatia-canonical-train-v9-final` @ **`6392131aa02cecc9991358915963068de8292d24`** (389 migrations, dernière `20261002001113`) |
| Branche du pack | `claude/zen-clarke-qchnnt` = `6392131` + outillage `scripts/preview/v9/` + documents + scripts npm (code déployable et migrations **identiques** à `6392131`, prouvé par `git-check`) |
| Preview | `pgvvpqyjziyapbbkydmc`, état attendu 372 / `20261002000813_plateforme_annuaire_lecture_pure` (813 ORIGINALE) |
| Production | `exhvuzegsefmoguxoiak` : **jamais touchée, refusée par toutes les gardes** |
| Actions distantes | **aucune** (ni Supabase, ni Vercel, ni Stripe, ni secret réel) |

### 0. Verdict

**`PREVIEW_V9_OPERATOR_PACK_READY`**

Sens exact : tous les contrôles exécutables hors ligne sont verts (`npm run preview:v9:preflight`),
le cutover complet a été rejoué de bout en bout sur une base PostgreSQL locale dans l'état de la
Preview (372 → 389), et chaque contrôle qui exige un accès (ledger réel, dry-run CLI, sauvegarde,
variables Vercel, k1) est outillé et décrit pas à pas. Le verdict **ne dit pas** que la Preview
est conforme : seul l'opérateur peut le constater demain avec ces outils.

### 1. Inventaire du matériel existant (Phase A, avant toute écriture)

| Matériel | Emplacement | Statut | Décision |
|---|---|---|---|
| Garde de cible | `scripts/preview/lib/preview-guard.mjs` (`exigerRefPreview`), `scripts/garde-scripts-production.mjs` (`REF_PREVIEW_AUTORISEE`), `scripts/dr/v2/garde-cible.mjs` | NEEDS_EXTENSION | réutilisés (constantes, parsers d'URL) ; manquait une garde unique qui croise **toutes** les sources (projet lié, env, URL DB, branche, hôtes) → `guard-preview-target.mjs` |
| DB verify | `scripts/preview/db-verify.mjs` + `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` (38 contrôles, attendus 389) | ALREADY_EXISTS | appelé tel quel par le cutover (étape 14) |
| Contrôles propres à la V9 (813, 1001, 1002/1003, 1112, 1113) | — | MISSING | `ELSATIA_V9_POST_CUTOVER_CHECKS.sql` (11 contrôles, lecture seule) |
| Attendus du train | `scripts/preview/train-expectations.mjs` | ALREADY_EXISTS | intégré au préflight |
| Garde de migrations | `verify-migrations.mjs`, `verify-migration-targets.mjs` | ALREADY_EXISTS | intégrés au préflight |
| Preuve de ledger V9 | `scripts/qualification/v9/ledger-check.sh` (simulation locale contre une ref git) | NEEDS_EXTENSION | ne lit pas un ledger **distant** exporté → `check-ledger-v9.mjs` + `ELSATIA_V9_LEDGER_EXPORT.sql` |
| Upgrade 372 → 389 | `scripts/qualification/upgrade-v8-v9.sh` | ALREADY_EXISTS | preuve de la V9 FINAL ; non rejoué |
| Pack Preview | `scripts/preview/*` (env-check, env-inventory, http-smoke, stripe-test-verify, storage-smoke, redis-check) + `preview-pack.test.mjs` (31) | ALREADY_EXISTS | `http-smoke` réutilisé au déploiement ; tests rejoués 31/31 |
| Préflight Preview | `scripts/preflight-preview.mjs` (gabarits `.env.preview.example`, buckets) | ALREADY_EXISTS | hors périmètre du cutover |
| Manifeste d'environnement | `config/env-manifest.json`, `check-env-manifest.mjs`, `env-check.mjs` (dotenv multi-app) | NEEDS_EXTENSION | manquait la comparaison avec un **inventaire Vercel exporté** (noms + scopes) et les états PRESENT/MISSING/EMPTY/WRONG_SCOPE → `env-scope-check.mjs` |
| Sauvegarde | `scripts/dr/*`, `scripts/dr/v2/backup.sh` (bases **locales** jetables) ; runbook V3 STEP 3 (2 dumps) | NEEDS_EXTENSION | DR = local seulement ; STEP 3 omet Auth et le ledger → runbook V9 + `backup-manifest.mjs` / `backup-check.mjs` |
| Rollback | `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md` (Production, ancien train) | NEEDS_EXTENSION | → `ELSATIA_V9_PREVIEW_ROLLBACK.md` |
| Déploiement | runbook V3 STEP 8-10 (projet `elsatia-preview`, `build:gestion-pro`) | NEEDS_EXTENSION | → `ELSATIA_V9_GP_PREVIEW_DEPLOY.md` (commit exact, porte base → code) |
| Clés IBAN | `scripts/bank-keys/` (`status`, `register`…) | ALREADY_EXISTS | réutilisé pour l'attestation k1 ; manquait un verdict k1 sans lire la clé → `iban-k1-check.mjs` |
| Seeds / pilote | `scripts/seeds/`, `seed-elsatia-preview-year.mjs`, `local-postgres-bootstrap/*` | ALREADY_EXISTS | `pg_bootstrap.sql` réutilisé par le banc |
| Orchestrateur de cutover, plan, porte code, préflight unique | — | MISSING | créés (§2) |

### 2. Scripts créés (`scripts/preview/v9/`)

| Fichier | Phase | Rôle |
|---|---|---|
| `lib/constantes.mjs` | — | SHA, branches, refs, 372 / 389 / 17, sha256 de la 813 originale (`c95e3e…`) et de la reconstruction `23153716` (`194d1d…`), marqueurs de corps |
| `guard-preview-target.mjs` + `lib/cible.mjs` | B | `TARGET_PREVIEW_CONFIRMED` / `TARGET_REJECTED` |
| `check-ledger-v9.mjs` + `lib/ledger.mjs` | C | `PREVIEW_LEDGER_PREFIX_OK` + `PENDING_MIGRATIONS=17` / `PREVIEW_LEDGER_DIVERGENCE` (+ `ALREADY_V9`, `V9_COMPLETE`, `PARTIAL_V9`) |
| `migration-plan-v9.mjs` | D | plan lisible + preuves ; contrôle du dry-run CLI ; `--write-doc` → `docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md` |
| `backup-manifest.mjs`, `backup-check.mjs` + `lib/sauvegarde.mjs` | E | `BACKUP_DECLARED_OK` / `BACKUP_MISSING` (contenu prouvé, pas seulement déclaré) |
| `v9-cutover.sh` | F | 15 étapes, **dry-run par défaut** |
| `code-deploy-gate.mjs` + `lib/rapport.mjs` | G | `CODE_DEPLOY_ALLOWED=false|true` |
| `iban-k1-check.mjs` + `lib/iban.mjs` | H | `IBAN_K1_READY` / `IBAN_K1_MISSING` + `BLOCKER_IBAN_KEY` |
| `env-scope-check.mjs` + `lib/env-scope.mjs` | I | REQUIRED · OPTIONAL · DEPRECATED · LIVE_ONLY · TEST_ONLY × PRESENT · MISSING · EMPTY · WRONG_SCOPE |
| `classify-migrations-v9.mjs` + `lib/classement.mjs` | K | REVERSIBLE / FORWARD_ONLY / RESTORE_REQUIRED depuis le SQL |
| `post-cutover-check.mjs` | L | DB + HTTP + parcours GP guidé (pilote, sans mot de passe) |
| `preflight-v9.mjs` | M | `npm run preview:v9:preflight` → verdict du pack |
| `cutover-step.mjs`, `lib/git.mjs`, `lib/train.mjs` | F | étapes unitaires (rapport, git, train, contrôles V9) |
| `harness/build-socle.sh`, `harness/supabase-sim.sh` | N | banc PostgreSQL local : base « Preview 372 » + simulateur de `supabase db push` |
| `fixtures/*` (+ `generate-fixtures.mjs --check`) | C/N | ledgers 372 / 389 / 380 / 813 non originale / étrangère / ordre / manquante / ref Production, `migration list`, dry-runs 16/17/18/`--include-all`, inventaires Vercel, `bank-keys status`, gabarit de manifeste de sauvegarde |
| `v9-operator-pack.test.mjs` | N | 26 tests |

SQL (lecture seule) : `docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql`,
`docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql`.
Documents : `docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md`,
`ELSATIA_V9_GP_PREVIEW_DEPLOY.md`, `ELSATIA_V9_PREVIEW_ROLLBACK.md`,
`ELSATIA_V9_PREVIEW_OPERATOR_CHECKLIST.md` (le document à ouvrir demain).

### 3. Gardes

| Garde | Où | Refuse |
|---|---|---|
| Cible | `guard-preview-target.mjs`, rejouée à l'étape 4 **et** juste avant l'application | toute ref ≠ `pgvvpqyjziyapbbkydmc` (vide, inconnue, majuscules, Production) dans `--ref`, `supabase/.temp/project-ref`, `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, `ELSATIA_PREVIEW_DB_URL` (directe ou pooler) ; indications contradictoires ; `environment≠preview` ; `VERCEL_ENV` / `ELSATIA_APPLICATION_ENV` / `NODE_ENV` = production ; hôtes `*.elsatia.fr` ; toute variable contenant la ref Production ; branche `main` / `master` / `production` / `release/*` / HEAD détaché |
| Git | `cutover-step.mjs git-check` | HEAD sans `6392131` ; `supabase/migrations` ≠ canonique ; fichier hors pack modifié ; dépendances `package.json` modifiées ; branche hors liste ; worktree sale |
| Application | `v9-cutover.sh` | absence de `--apply-preview --confirm-ref pgvvpqyjziyapbbkydmc` ; `--include-all` (argument) ; dry-run ≠ plan ; sauvegarde non conforme ; `--out` dans le dépôt ; simulation hors ligne + application |
| Ledger | `check-ledger-v9.mjs --require-813-proof` | tout ce qui n'est pas exactement le socle 372 avec la 813 originale prouvée (statements du ledger + `pg_proc`) |
| Ordre base → code | `code-deploy-gate.mjs` | rapport absent / autre cible / autre train / dry-run / ledger ≠ 389 / DB verify ≠ GO / contrôles V9 ≠ GO / rapport > 24 h |
| Stripe | `env-scope-check.mjs` | `sk_live_` / `rk_live_` / `pk_live_` en scope Preview, `STRIPE_WEBHOOK_EXPECTED_MODE≠test`, drapeaux live ≠ `false` |
| Secrets | toutes les sorties | aucune valeur affichée (test dédié avec mot de passe et clés factices) ; `verify:secrets` vert |

### 4. Plan de migration (généré depuis le train et la fixture du socle)

`docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md` : 372 → **17** migrations
(`20261002000901` → `20261002001113`, rangs 373 → 389) → 389. Preuves : aucune ≤ 813, pas de
`--include-all`, historique non réécrit, dernière = `…1113`, total = 389. Le plan réel est
recalculé demain depuis le ledger exporté ; il échoue si ce ledger n'est pas un préfixe exact.

### 5. Rollback

`docs/runbooks/ELSATIA_V9_PREVIEW_ROLLBACK.md` : cas A (DB échoue), B (code échoue), C (recette).
Classement depuis le SQL : **15 REVERSIBLE, 2 FORWARD_ONLY (901, 1112), 0 RESTORE_REQUIRED**.
Conséquence : le retour arrière est un **retour du code V8** (alias Vercel vers le déploiement
`de50245a`), sans restauration de base ; 1001 (sécurité) n'est jamais annulée ; restauration =
dernier recours, décision humaine. Piège de downgrade identifié : ne pas passer les IBAN en `v2`
pendant la recette. Reprise d'un push interrompu : `--resume-partial` (préfixe V9 strict exigé).

### 6. Tests et validations (exécutés dans cette session)

| Commande | Résultat |
|---|---|
| `npm run test:preview-v9` | **26/26** (garde, ledger, plan, dry-run 16/17/18/`--include-all`, cutover refus, git, IBAN, env, Stripe live, absence de secret, sauvegarde, porte, classement, post-cutover, verdict, reprise) |
| `npm run test:preview-pack` | 31/31 |
| `npm run verify:migrations` | 389 valides ; cibles OK (partagé 389, Studio 23) |
| `npm run verify:train-expectations` | OK : 389 / `20261002001113` / 38 contrôles |
| `npm run verify:env-manifest` | OK : 0 erreur (14 DECISION_REQUIRED préexistantes, non bloquantes) |
| `npm run test:env-manifest` | 67/67 |
| `npm run verify:secrets` | aucun secret reconnu |
| `npx eslint` (racine) | 0 erreur, 15 avertissements (préexistants, identiques au rapport V9) |
| `npx tsc --noEmit` (racine) | OK |
| `npm run preview:v9:preflight` | `PREVIEW_V9_OPERATOR_PACK_READY` |

Non rejoués (code applicatif inchangé, identique à `6392131`, qualifié par le rapport V9 FINAL) :
lint / typecheck / Vitest des applications `apps/*`, builds, Playwright, pgTAP.

**Banc local du cutover** (PostgreSQL 16, `pg_bootstrap.sql`, base `elsatia_v9_harness_*` dans
l'état de la Preview : 372 migrations + ledger façon Supabase avec `statements`) :

| Scénario | Résultat |
|---|---|
| Hors ligne (fixtures) | `PREFIX_OK`, 17, `DRY_RUN_MATCHES_PLAN`, `CODE_DEPLOY_ALLOWED=false` |
| Dry-run sur le banc | export réel du ledger, 813 originale prouvée, sauvegarde `pg_dump` vérifiée, rien appliqué |
| `--apply-preview` | 17 migrations appliquées, ledger 389, **DB verify GO** (38 + préflight + RLS + 39 RPC service), **11/11 contrôles V9**, `CODE_DEPLOY_ALLOWED=true` |
| Relance sur base 389 | arrêt « déjà V9 », code 3 → `--verify-only` GO |
| Échec simulé à `…1105` (cas A) | arrêt, ledger partiel 380 détecté, `CODE_DEPLOY_ALLOWED=false` ; relance normale refusée ; `--resume-partial` → 9 migrations → 389 → GO |
| 813 non originale (`23153716`) en base | arrêt à l'étape 6 (`LEDGER-813-NON-ORIGINALE` ×2), **rien appliqué** |
| Restauration des dumps dans une base neuve | schéma + données + Auth + ledger : ledger restauré = `PREFIX_OK` / 17 ; sans le dump `supabase_migrations` le ledger est vide → artefact rendu REQUIRED |

Sur le banc, DB verify tourne avec `--before-owner` (base neuve sans propriétaire plateforme ni clé
d'attestation : les 2 anomalies documentées) ; **jamais** sur la Preview réelle.

### 7. Limitations et DECISION_REQUIRED

| ID | Décision conservatrice prise |
|---|---|
| `DECISION_REQUIRED:V9-PACK-BRANCH` | la branche de session ne contenait pas la V9 : elle a été avancée en fast-forward sur `6392131` (ancêtre direct), puis le pack ajouté. Le code à déployer reste **`6392131`** (pas le commit du pack) |
| `DECISION_REQUIRED:V9-CHECKSUM` | le ledger Supabase ne stocke aucune somme : la preuve de contenu de 813 = marqueur du corps dans `statements` + définition dans `pg_proc` (export SQL). Les sommes sha256 ne sont comparées que si un export en porte |
| `DECISION_REQUIRED:V9-CLI-FLAGS` | `db push --linked --yes` (non interactif) et `db dump --schema …` dépendent de la version de la CLI. Si refusés : la commande échoue **avant** toute écriture ; repli documenté (`pg_dump`), jamais d'improvisation sur le ledger |
| `DECISION_REQUIRED:V9-OWNER-ATTESTATION` | si DB verify signale `administrateur_total_actif_absent` / `cle_attestation_active_absente` sur la Preview : STEP 7 du runbook V3, puis `--verify-only`. Pas de tolérance automatique |
| `DECISION_REQUIRED:V9-PREVIEW-RESTORE` | restauration de la Preview = décision humaine, jamais scriptée (rollback §4) |
| `DECISION_REQUIRED:V9-RESTORE-DRILL-PROJECT` | test de restauration complet seulement dans un projet Supabase jetable (coût / quota) ; prouvé localement à défaut |
| Compatibilité code V8 / base 389 | **déduite du SQL**, non exécutée de bout en bout ; vérification obligatoire après tout retour code |
| Porte base → code | outil + runbook ; Vercel ne peut pas l'imposer techniquement (un déploiement automatique de branche peut exister) : ne pas l'aliaser avant `CODE_DEPLOY_ALLOWED=true` |
| `/api/elsatia-identity/jwks` | 503 = identité centrale non configurée en Preview : signalé, non bloquant (à confirmer par le propriétaire) |
| Hérités du train V9 FINAL (§6 de son rapport) | inchangés : onboarding « Se déconnecter », SEC-4/5/6, B3, `V8-PILOTE-ESSAI-ECHU`, `V8-PERF-C1`, branche `…-hotfix-813` (`23153716`) à retirer |

### 8. Actions nécessitant un accès réseau

Export du ledger Preview ; `supabase db push --dry-run` puis application ; dumps de sauvegarde ;
DB verify et contrôles V9 sur la base hébergée ; export de l'inventaire Vercel ; `bank-keys status`
/ `register` ; déploiement Vercel, `vercel inspect`, alias ; smoke HTTP ; recette pilote.

### 9. Actions nécessitant des secrets (jamais dans le dépôt, jamais affichés)

`ELSATIA_PREVIEW_DB_URL` (mot de passe inclus), `SUPABASE_DB_PASSWORD`, session `supabase login`,
session `vercel login`, `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` +
`BANK_DATA_ENCRYPTION_KEY` dans le shell pour `bank-keys status` (k1 jamais lue par le pack),
`VERCEL_AUTOMATION_BYPASS_SECRET` si la protection de déploiement est active, mot de passe du
pilote saisi **dans le navigateur** uniquement.

### 10. Commandes exactes pour demain

Branche : `claude/zen-clarke-qchnnt` · SHA du code à déployer : `6392131aa02cecc9991358915963068de8292d24`.
Détail et résultats attendus : `docs/runbooks/ELSATIA_V9_PREVIEW_OPERATOR_CHECKLIST.md`.

```bash
# 0. poste
git fetch origin claude/zen-clarke-qchnnt integration/elsatia-canonical-train-v9-final
git switch claude/zen-clarke-qchnnt && git pull --ff-only && npm ci
npm run preview:v9:preflight                                   # PREVIEW_V9_OPERATOR_PACK_READY
# 1. identifiants (shell uniquement)
npx supabase login && npx supabase link --project-ref pgvvpqyjziyapbbkydmc
vercel login && vercel link --project elsatia-preview
export ELSATIA_PREVIEW_DB_URL='…' SUPABASE_DB_PASSWORD='…'
# 2. garde
npm run preview:v9:guard -- --ref pgvvpqyjziyapbbkydmc --environment preview          # TARGET_PREVIEW_CONFIRMED
# 3. sauvegarde (6 dumps + export du ledger : BACKUP_AND_RESTORE §2), puis
node scripts/preview/v9/backup-manifest.mjs --dir "$B" && npm run preview:v9:backup-check -- "$B/manifest.json"   # BACKUP_DECLARED_OK
# 4. variables et k1
R=../elsatia-v9-run; mkdir -p "$R"; vercel env ls preview > "$R/vercel-env.txt"
npm run preview:v9:env-scope -- "$R/vercel-env.txt" && npm run preview:v9:iban-k1 -- "$R/vercel-env.txt"
# 5. dry-run
scripts/preview/v9/v9-cutover.sh --out "$R/dry" --backup-manifest "$B/manifest.json"                # PENDING_MIGRATIONS=17, DRY_RUN_MATCHES_PLAN
# 6. application
scripts/preview/v9/v9-cutover.sh --out "$R/apply" --backup-manifest "$B/manifest.json" --apply-preview --confirm-ref pgvvpqyjziyapbbkydmc   # CODE_DEPLOY_ALLOWED=true
# 7. k1 au registre
npm run --silent bank-keys -- status > "$R/bank-keys-status.json"
npm run preview:v9:iban-k1 -- "$R/vercel-env.txt" --bank-keys-status "$R/bank-keys-status.json"   # IBAN_K1_READY, ATTESTEE
# 8. porte puis code
npm run preview:v9:code-gate -- --report "$R/apply/cutover-report.json" --ledger "$R/apply/ledger-apres.json"
git worktree add ../elsatia-v9-deploy 6392131aa02cecc9991358915963068de8292d24
cd ../elsatia-v9-deploy && vercel link --project elsatia-preview && vercel deploy        # jamais --prod
# 9. recette
npm run preview:http-smoke -- --gp <url>
npm run preview:v9:post-check -- --gp-url <url> --ledger "$R/apply/ledger-apres.json" --v9-checks "$R/apply/v9-checks.txt" --report "$R/apply/cutover-report.json"
vercel alias set <url> <alias Preview GP>
```

### 11. Reproduire la qualification du pack (sans accès)

```bash
npm run test:preview-v9 && npm run preview:v9:preflight
node scripts/preview/v9/fixtures/generate-fixtures.mjs --check && node scripts/preview/v9/migration-plan-v9.mjs --check
# banc local (PostgreSQL 16, rôle superutilisateur pour l'utilisateur courant)
scripts/preview/v9/harness/build-socle.sh elsatia_v9_harness_socle 372
createdb -T elsatia_v9_harness_socle elsatia_v9_harness_run
ELSATIA_V9_HARNESS_DB=elsatia_v9_harness_run scripts/preview/v9/v9-cutover.sh --local-harness --out /tmp/v9run \
  --backup-manifest <manifeste de dumps pg_dump> --apply-preview --confirm-ref pgvvpqyjziyapbbkydmc
```
