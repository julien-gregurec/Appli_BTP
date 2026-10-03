# ELSATIA V9.2 — Vérification finale PRE-CUTOVER + dry-run strict (V1)

Date : 2026-10-03 (UTC). Mission autonome, **lecture seule** sur Supabase Preview et Vercel.
**Aucune migration appliquée, aucun `db push` (réel ou dry-run CLI), aucun `--apply-preview`,
aucune Production, aucun Stripe Live, aucun Studio, aucune Boutique, aucun Social, aucune
réécriture d'historique Git, aucune RPC créée.** Aucune valeur secrète lue ni reproduite.

```
CANONICAL_SHA=1a638855
MIGRATION_COUNT=408

CURRENT_LEDGER=372
LAST_MIGRATION=20261002000813
TARGET_LEDGER=408
PENDING_MIGRATIONS=36
813_ORIGINAL=YES

BACKUP_PACK_VALIDATED=YES_OPERATOR_PROOF

AUTH_PREVIEW=READY

GP_VARIABLES=READY
TOOLS_VARIABLES=READY
COLORS_VARIABLES=READY
RESERVES_VARIABLES=READY

GP_PREVIEW_SURFACE=DEPLOYED_READY_V8_CODE (gp-preview-v8 @ 53b4bc76, SSO Vercel)
TOOLS_PREVIEW_SURFACE=PREPARED_NOT_DEPLOYED
COLORS_PREVIEW_SURFACE=PREPARED_NOT_DEPLOYED
RESERVES_PREVIEW_SURFACE=PREPARED_NOT_DEPLOYED

BANK_KEY_PRESENT=YES
BANK_K1_ATTESTATION=POST_CUTOVER_REQUIRED

PREFLIGHT_STATIC=PASS (PREVIEW_V9_OPERATOR_PACK_READY)
PREFLIGHT_DATABASE=PASS (ledger réel lu en lecture seule : PREVIEW_LEDGER_PREFIX_OK, MIGRATION_PLAN_OK)
PREFLIGHT_ENV=PASS (4 projets ENV_SCOPE_OK/PARTIAL, 0 erreur ; 11 drapeaux GP non vérifiables sans dotenv)
PREFLIGHT_AUTH=PASS
PREFLIGHT_BACKUP=PASS (YES_OPERATOR_PROOF, manifeste non présent dans ce conteneur)
PREFLIGHT_DRY_RUN=BLOCKED
PREFLIGHT_OVERALL=BLOCKED (seul blocage : dry-run CLI réel)

DRY_RUN=BLOCKED_DB_CREDENTIAL

PUBLIC_SECRET_EXPOSURE=NO

PREVIEW_CUTOVER_GO=NO
VERDICT=ELSATIA_V9_2_PRE_CUTOVER_READY_EXCEPT_DRY_RUN

HUMAN_ACTIONS_REMAINING=1) exécuter le dry-run officiel depuis le Mac opérateur (commande ci-dessous) ; 2) après cutover seulement : bank-keys register/status k1, puis avancer gp-preview-v8 sur le train et déployer les satellites
```

---

## Blocage unique

**`DRY_RUN=BLOCKED_DB_CREDENTIAL`.** `supabase db push --linked --dry-run` (étape 9-10 de
`v9-cutover.sh`) exige une connexion PostgreSQL à la Preview :

- aucun `ELSATIA_PREVIEW_DB_URL` ni `SUPABASE_DB_PASSWORD` dans ce conteneur ;
- de plus, la sortie TCP 5432/6543 est fermée depuis ce conteneur (pooler
  `aws-{0,1}-eu-west-3.pooler.supabase.com` et hôte direct : échec de connexion), donc même avec
  le mot de passe, le dry-run CLI ne peut tourner qu'**hors de ce conteneur** (Mac opérateur).

Le dry-run n'est **pas** déclaré vert. Aucune sortie de dry-run n'a été simulée
(`--offline-dry-run` non utilisé). Le contournement par l'endpoint SQL non lecture seule de l'API
Management (transaction + rollback) a été écarté : il exécuterait le SQL des migrations sur la base.

Tout le reste du chemin officiel jusqu'à l'étape 8 est vert sur le **ledger réel**.

### Commande à exécuter (Mac opérateur, dry-run uniquement)

```bash
git fetch origin && git switch integration/elsatia-canonical-train-v9.2   # HEAD = 1a638855, worktree propre
npx supabase link --project-ref pgvvpqyjziyapbbkydmc
export ELSATIA_PREVIEW_DB_URL='…'      # fourni par l'opérateur, jamais commité
export SUPABASE_DB_PASSWORD='…'        # idem
scripts/preview/v9/v9-cutover.sh --out ~/elsatia-v9-cutover-dryrun \
  --backup-manifest <manifeste V9.2 BACKUP_DECLARED_OK> --attendu-courant 372
# SANS --apply-preview. Attendu : « DRY-RUN TERMINÉ », verdict DRY_RUN_OK, CODE_DEPLOY_ALLOWED=false
```

Le script compare lui-même la sortie du dry-run au plan (`migration-plan-v9.mjs --dry-run`) : une
migration de plus, de moins ou dans le désordre → NO-GO.

---

## Phase 1 — Git et train

| Contrôle | Résultat |
|---|---|
| `git fetch --all --prune` | OK |
| `origin/integration/elsatia-canonical-train-v9.2` | `1a638855` ✓ |
| Migrations `supabase/migrations/*.sql` | 408 ✓ |
| Timestamps dupliqués | 0 ✓ |
| Social | aucun fichier ✓ |
| Next.js | `16.3.8` (GP lockfile, Tools, Colors, Réserves) ✓ — Studio `16.3.5`, hors périmètre |

Rien modifié. Les contrôles ont tourné dans un worktree local du train (branche locale de même nom
au même SHA, non poussée), pour satisfaire la garde `GIT-BRANCHE` du pack.

## Phase 2 — Auth Preview (lecture seule, API Management)

- `site_url` = `https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app` ✓
- `uri_allow_list` = exactement les 4 URLs `…-git-gp-preview-v8-julien-gregurec1.vercel.app/**`
  (GP, Tools, Colors, Réserves) ✓
- ancien alias `…-git-feat-elsatia-canoni-…` absent ✓

→ `AUTH_PREVIEW=READY`.

## Phase 3 — Variables Vercel (noms / scopes / types uniquement)

Inventaires exportés **sans aucune valeur** (hors dépôt) puis passés à `env-scope-check.mjs`.

| Projet | Variables demandées | Verdict pack |
|---|---|---|
| `elsatia-preview` (GP) | `BANK_DATA_ENCRYPTION_KEY` (preview, sensitive), `STRIPE_WEBHOOK_EXPECTED_MODE`, `TOOLS_STORE_ENVIRONMENT`, `ABONNEMENTS_PUBLICS_OUVERTS`, `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, `LEGAL_TVA_REGIME_CONFIRME` (preview) : présentes | `ENV_SCOPE_PARTIAL` — 0 erreur, 11 avertissements `ENV-FLAG-UNVERIFIED` (valeurs chiffrées non lues par conception) |
| `elsatia-tools-preview` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_TOOLS_BILLING_API_URL` (preview) : présentes | `ENV_SCOPE_OK` |
| `elsatia-colors-preview` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (preview, sensitive), `NEXT_PUBLIC_COLORS_URL` (preview seul) : présentes | `ENV_SCOPE_OK` |
| `elsatia-reserves` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (preview, sensitive) : présentes | `ENV_SCOPE_OK` |

`NEXT_PUBLIC_COLORS_URL` de Colors Preview est désormais dans un projet dédié, scope Preview seul
(le blocage « entrée unique preview + production » de la V2 ne s'applique plus).

## Phase 4 — Surfaces Preview

| Surface | État réel |
|---|---|
| GP `elsatia-preview-git-gp-preview-v8-…` | **Déployée, READY**, branche `gp-preview-v8` @ `53b4bc76` (= train **V8**, ancêtre du train V9.2), protégée par Vercel SSO (302 vers `sso-api`) |
| Tools `elsatia-tools-preview-git-gp-preview-v8-…` | **Préparée, jamais déployée** (0 déploiement ; 404). Projet lié au dépôt, racine `apps/tools`, build seulement pour `gp-preview-v8` |
| Colors `elsatia-colors-preview-git-gp-preview-v8-…` | **Préparée, jamais déployée** (0 déploiement ; 404). Racine `apps/colors`, même garde |
| Réserves `elsatia-reserves-git-gp-preview-v8-…` | **Préparée, jamais déployée** (1 seul déploiement CANCELED, autre branche ; 404). Racine `apps/reserves`, même garde |

Non bloquant pour le cutover **base** (règle « code après base ») : les surfaces seront construites
en avançant `gp-preview-v8` sur le train **après** la porte `code-deploy-gate.mjs`. Ne pas avancer
`gp-preview-v8` avant : le code 408 tournerait contre une base 372.

Gardes vérifiées : `elsatia-production` (*only build production*), `liria-concept-gestion-btp`
(`exit 0`) inchangés. Rien modifié côté Vercel.

## Phase 5 — Ledger réel (lecture seule)

`docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql` exécuté **tel quel** via l'endpoint
`/database/query/read-only` de l'API Management (transaction lecture seule), sortie étiquetée par
`cutover-step.mjs ledger-tag`, puis `check-ledger-v9.mjs --expect pre --require-813-proof
--attendu-courant 372` :

```
PREVIEW_LEDGER_PREFIX_OK
CURRENT_LEDGER=372 (dernière 20261002000813)
TARGET_LEDGER=408 (dernière 20261003001504)
PENDING_MIGRATIONS=36 (20261002000901 → 20261003001504)
```

813 originale : marqueur du ledger `true` **et** `pg_proc` (`original=true`, `non_original=false`).

## Phase 6 — Plan (exactement ce que le dry-run doit lister)

`migration-plan-v9.mjs` sur le ledger réel : `MIGRATION_PLAN_OK`, 7 preuves vertes.

| Rang | Version | Nom |
|---|---|---|
| 373 | 20261002000901 | acceptations_documents_legaux_v1 |
| 374 | 20261002001001 | securite_residuel_entreprise_sans_membres_v1 |
| 375 | 20261002001002 | stripe_prix_contractuel_periodicite_v1 |
| 376 | 20261002001003 | stripe_facture_essai_zero_v1 |
| 377 | 20261002001101 | finance_exports_agregats_exactitude_v1 |
| 378 | 20261002001102 | pointage_planning_lecture_complete_v1 |
| 379 | 20261002001103 | fiche_chantier_lecture_complete_v1 |
| 380 | 20261002001104 | journal_ia_consommation_exacte_v1 |
| 381 | 20261002001105 | pointages_gestion_totaux_mois_v1 |
| 382 | 20261002001106 | modifier_facture_brouillon_sans_recalc_direct_v1 |
| 383 | 20261002001107 | rentabilite_agregats_chantiers_v1 |
| 384 | 20261002001108 | gp_fiches_agregats_v1 |
| 385 | 20261002001109 | gp_pilotage_agregats_v1 |
| 386 | 20261002001110 | plateforme_agregats_par_tenant_v1 |
| 387 | 20261002001111 | gp_options_selecteurs_v1 |
| 388 | 20261002001112 | banking_encryption_key_rotation_v1 |
| 389 | 20261002001113 | rate_limit_consultation_connexion_v1 |
| 390 | 20261002001301 | post_v9_service_role_fonctions_manquantes_v1 |
| 391 | 20261002001302 | post_v9_sec4_entreprise_active_garde_v1 |
| 392 | 20261003000101 | applications_bientot_non_utilisables_v1 |
| 393 | 20261003000102 | plateforme_url_preview_proprietaire_v1 |
| 394 | 20261003000103 | reserves_url_locale_port_distinct_v1 |
| 395 | 20261003000201 | pont_upgrade_prod_phase0_lignes_entreprise_v1 (phase 0, no-op en Preview) |
| 396 | 20261003000202 | pont_upgrade_prod_controle_lignes_v1 |
| 397 | 20261003001401 | gp_facturation_remise_globale_reportee_v1 |
| 398 | 20261003001402 | gp_paiement_double_envoi_v1 |
| 399 | 20261003001403 | gp_facture_emise_non_annulable_v1 |
| 400 | 20261003001404 | gp_pointage_oublie_doublon_plafond_v1 |
| 401 | 20261003001405 | gp_pointages_totaux_hors_rejetes_v1 |
| 402 | 20261003001406 | gp_chiffre_affaires_hors_brouillons_v1 |
| 403 | 20261003001407 | gp_pointages_cout_horaire_confidentiel_v1 |
| 404 | 20261003001408 | gp_saisie_garde_fous_base_v1 |
| 405 | 20261003001501 | push_file_durable_v1 |
| 406 | 20261003001502 | relances_auto_candidats_eligibles_v1 |
| 407 | 20261003001503 | rls_ensembles_entreprises_autorisees_v1 |
| 408 | 20261003001504 | taches_chantier_created_idx_v1 |

Simulation officielle hors ligne sur le ledger réel
(`v9-cutover.sh --offline-ledger <ledger réel> --attendu-courant 372`, sans dry-run fourni) :
étapes 1-8 vertes (git, train, garde, préfixe, plan) ; sauvegarde marquée absente **dans ce
conteneur uniquement** (manifeste sur le Mac opérateur) ; étape 9-10 non exécutée.
Verdict du script : `DRY_RUN_OK_SANS_SAUVEGARDE` en mode **offline** — ce n'est **pas** un dry-run réel.

## Phase 7 — Clé bancaire

- `BANK_DATA_ENCRYPTION_KEY` : présente, `elsatia-preview`, scope Preview seul, type *sensitive* → `BANK_KEY_PRESENT=YES`.
- RPC `public.cles_bancaires_*` : **absentes** de la Preview (requête lecture seule) ; créées par la
  migration en attente `20261002001112_banking_encryption_key_rotation_v1` (rang 388). Erreur
  « Could not find the function public.cles_bancaires_enregistrer » = attendue. `register` non
  relancé, aucune RPC créée.

Post-cutover (après `--apply-preview` réussi et `CODE_DEPLOY_ALLOWED=true`) :

```bash
npm run --silent bank-keys -- register --key-id k1
npm run --silent bank-keys -- status
# attendu : IBAN_K1_READY / ATTESTEE
```

## Phase 8 — Préflight

| Contrôle | Résultat |
|---|---|
| `guard-preview-target.mjs --ref pgvvpqyjziyapbbkydmc --environment preview --no-linked` | `TARGET_PREVIEW_CONFIRMED` (projet non lié dans ce conteneur ; le lien est exigé par `v9-cutover.sh` sur le Mac) |
| `check-ledger-v9.mjs` (ledger réel) | `PREVIEW_LEDGER_PREFIX_OK` |
| `env-scope-check.mjs` ×4 | 0 erreur (voir phase 3) |
| `preflight-v9.mjs --ledger <réel> --env-inventory <GP>` | **`PREVIEW_V9_OPERATOR_PACK_READY`** (git, train 408, 813 originale, verify-migrations, attendus, fixtures, 6 ledgers divergents refusés, plan, dry-run ±1 refusé, manifeste env, scan secrets, build, gardes, rollback 36 classées dont 4 `RESTORE_REQUIRED`) |
| `code-deploy-gate.mjs` | `CODE_DEPLOY_ALLOWED=false` — attendu avant cutover |
| `supabase db push --dry-run` | **non exécuté** — blocage unique |

## Phase 9 — Verdict

Tous les critères sont remplis **sauf le dry-run réel** → `PREVIEW_CUTOVER_GO=NO`, blocage unique :
`DRY_RUN=BLOCKED_DB_CREDENTIAL` (accès PostgreSQL Preview, à faire hors de ce conteneur).
Aucune mission d'application ne doit être lancée avant un dry-run réel vert.

## Exposition de secrets

Aucune valeur de variable Vercel demandée ni lue (inventaires réduits à `key/target/type/gitBranch`).
Aucune clé Supabase lue. Exports (ledger, inventaires, rapport de cutover) conservés hors dépôt.
Satellites Preview non déployés (aucun bundle public) ; GP Preview derrière SSO.
→ `PUBLIC_SECRET_EXPOSURE=NO`.
