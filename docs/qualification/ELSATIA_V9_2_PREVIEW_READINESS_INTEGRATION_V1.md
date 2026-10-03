# ELSATIA V9.2 — Intégration Preview ready + preflight strict sans migration (V1)

Date : 2026-10-03 (UTC), session autonome, opérateur absent.
**Aucune migration, aucun `db push`, aucun `--apply-preview`, aucune Production, aucun Stripe Live,
aucun Studio, aucune Boutique, Social non intégré. Aucune configuration Vercel ni Supabase modifiée.**
Aucune valeur secrète dans ce document.

```
BASE_CANONICAL_SHA=1a638855441a0f4bfeeb23e4c656c7b2c2fab38e   (dfb59cc6 au départ de la mission ; voir §1)
PREVIEW_READY_SOURCE_SHA=70d51f0deb53c6e06efc0d118ed508855d94d00a   (code 247066ee)
FINAL_CANONICAL_SHA=1a638855441a0f4bfeeb23e4c656c7b2c2fab38e   (inchangé par cette session)
MIGRATION_COUNT=408
CURRENT_LEDGER=372
TARGET_LEDGER=408
PENDING_MIGRATIONS=36

BACKUP_PACK_VALIDATED=YES (preuve opérateur BACKUP_DECLARED_OK ; backup-check NON relancé ici)
NEXT_SECURITY_FIX=PASS (16.3.8 sur GP, Tools, Colors, Réserves ; aucun avis next restant)
LOCAL_QUALIFICATION=PASS (5 799 tests, 4 builds)
VERCEL_PRODUCTION_GUARD=CONFORME
VERCEL_LEGACY_GUARD=CONFORME
VERCEL_PREVIEW_PROTECTION=CONFORME
GP_PREVIEW_PROJECT_CONFIRMED=YES (elsatia-preview)
GP_VARIABLES=NON_CONFORME (FEATURE_AI_ENABLED=true en Preview, attendu false ; 2 drapeaux sensitive invérifiables)
TOOLS_VARIABLES=PRESENT_NON_VERIFIE (elsatia-tools-preview : 7 variables Preview présentes, valeurs non lues)
COLORS_VARIABLES=INCOMPLETE (elsatia-colors-preview : SUPABASE_SERVICE_ROLE_KEY absente)
RESERVES_PROJECT=EXISTS_INCOMPLETE (elsatia-reserves créé par une autre session ; SUPABASE_SERVICE_ROLE_KEY absente)
AUTH_PREVIEW=PREPARED_NOT_APPLIED
PREFLIGHT=PASS (PREVIEW_V9_OPERATOR_PACK_READY sur 1a638855, ledger réel + inventaire Vercel réel)
PUBLIC_SECRET_EXPOSURE=NO (aucune valeur secrète lue ni affichée ; scan bundles : voir rapport V3)
PREVIEW_CUTOVER_GO=NO

VERDICT=ELSATIA_V9_2_PREVIEW_READINESS_PARTIAL
DECISION_REQUIRED:V9_2_PREVIEW_READY_INTEGRATION
DECISION_REQUIRED:FEATURE_AI_ENABLED_PREVIEW
```

## 1. Git et intégration

État au démarrage (`git fetch --all --prune`) :

| Branche | SHA |
|---|---|
| `origin/integration/elsatia-canonical-train-v9.2` | `dfb59cc6` (attendu) |
| `origin/integration/elsatia-v9.2-preview-ready-v1` | `70d51f0d` (`480b5d3b` Next 16.3.8, `247066ee` garde `vercel.json`, `70d51f0d` rapport V1) |

`dfb59cc6` était ancêtre direct : fast-forward possible. Pendant la qualification locale, **une session
concurrente a poussé le train canonique** en fast-forward `dfb59cc6..1a638855` depuis une autre branche,
`integration/elsatia-v9.2-preview-readiness-v1` (`50319c76` Next 16.3.8, `1a638855` rapport V2), puis le
rapport V3 sur cette autre branche (`29142af0`, non intégré au train). Re-fetch avant toute poussée :

| Branche | SHA |
|---|---|
| `origin/integration/elsatia-canonical-train-v9.2` | **`1a638855`** |
| `origin/integration/elsatia-v9.2-preview-ready-v1` | `70d51f0d` |
| `origin/integration/elsatia-v9.2-preview-readiness-v1` | `29142af0` |

`merge-base(1a638855, 70d51f0d) = dfb59cc6` : historiques **divergents**, fast-forward **impossible**.
Rien n'a été forcé, rien n'a été fusionné, le train canonique n'a pas été poussé par cette session.

Analyse en lecture seule de ce qui sépare les deux :
- `git diff 480b5d3b 50319c76` = **vide** : les deux correctifs Next.js 16.3.8 sont identiques à l'octet.
- `git diff 1a638855 70d51f0d` = uniquement `vercel.json` (+5, garde `git.deploymentEnabled`) et les
  rapports (V1 en plus, V2 en moins). Le **code** du train canonique est donc celui qualifié au §2.

Seul apport réel de `preview-ready-v1` absent du train : le garde `vercel.json`. Audit sémantique :
il ne désactivait que `integration/elsatia-v9.2-preview-ready-v1`, branche qui n'est plus poussée. Une fois
intégré tel quel, il ne protégerait plus rien. Le risque réel est le **train canonique lui-même** : chaque
push construit le code V9.2 sur `elsatia-preview` alors que la base est à 372 (constaté :
`elsatia-preview-4zvrpqeer` READY pour `1a638855` à 19:34Z, protégé par SSO, non aliasé ; connexions
refusées tant que les 36 migrations ne sont pas appliquées — runbook `ELSATIA_V9_GP_PREVIEW_DEPLOY.md` §1).

**Adaptation minimale proposée** (branche `claude/sweet-goodall-jpcufd` = `1a638855` + 1 commit, avance
rapide possible pour le train) : `git.deploymentEnabled = { "integration/elsatia-canonical-train-v9.2": false }`
et un test du pack (`v9-operator-pack.test.mjs`) qui échoue si une branche train autorisée par le pack
n'est pas exclue ou si le garde réactive une branche. Testé : 30/30 avec le garde, échec du nouveau test
sans lui. Compatible avec les deux voies de déploiement du code V9 après `CODE_DEPLOY_ALLOWED=true` :
CLI (runbook) ou branche `gp-preview-v8` (rapport V3), non concernée par la clé. `crons` inchangés
(`BUILD-VERCEL` vert).

**DECISION_REQUIRED:V9_2_PREVIEW_READY_INTEGRATION** — choix opérateur :
(a) avancer `integration/elsatia-canonical-train-v9.2` en fast-forward vers `claude/sweet-goodall-jpcufd`
(garde + ce rapport) ; ou (b) laisser le train à `1a638855` et considérer `preview-ready-v1` comme
obsolète (son correctif Next.js est déjà au train). Non tranché ici : une autre session écrivait sur le
train pendant cette mission, et la consigne interdit toute intégration autre qu'un fast-forward de la
branche source.

Note de poussée : la branche de session est poussée sans garde qui la couvre ; elle déclenche au plus un
déploiement Preview `elsatia-preview` protégé par SSO, du même code que `1a638855` (déjà déployé). Les
autres projets liés au dépôt l'ignorent (voir §3).

## 2. Requalification locale

Exécutée sur l'arbre `70d51f0d` + garde (code identique à `1a638855`, voir §1), `npm ci` racine + 3 apps :

| Contrôle | Résultat |
|---|---|
| migrations | 408 fichiers `.sql`, 0 horodatage dupliqué |
| Next.js | 16.3.8 (racine, apps/tools, apps/colors, apps/reserves) |
| `npm run typecheck` | 0 |
| `npm run lint` | 0 (0 erreur, 15 avertissements préexistants) |
| `npm test` | 0 — GP 2 950 (1 échec attendu, 194 ignorés), Tools 2 174, Réserves 239, Colors 436 = **5 799 verts** |
| build GP (`build:gestion-pro`) | 0, Next.js 16.3.8 (Turbopack) |
| build Tools | 0, `NEXT_PUBLIC_TOOLS_ENV=local` (mode local documenté), Next.js 16.3.8 (webpack) |
| build Colors / Réserves | 0, `ELSATIA_APPLICATION_ENV=local`, Next.js 16.3.8 |
| `npm audit --omit=dev` | aucun avis `next` ; restent racine `brace-expansion`, `fast-uri` (élevés, outillage), Tools `dompurify` (faible) |

Studio hors périmètre.

## 3. Vercel (lecture seule)

| Projet | Ignored Build Step | Protection | Constat |
|---|---|---|---|
| elsatia-production | `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi` | all_except_custom_domains | **CONFORME** : pushes de branche CANCELED (`1a638855`, `50319c76`) |
| liria-concept-gestion-btp | `exit 0` | all_except_custom_domains | **CONFORME** : ne construit plus rien (CANCELED) |
| elsatia-preview | aucun | **all_except_custom_domains** | **CONFORME** (Vercel Authentication) ; construit toutes les branches (cf. §1) |
| elsatia-tools-preview / elsatia-colors-preview / elsatia-reserves | build seulement si preview **et** `gp-preview-v8` | all_except_custom_domains | créés à 19:38Z par une autre session ; 0 domaine, 0 déploiement |
| elsatia-tools / elsatia-colors | — (non liés à Git) | all_except_custom_domains | Production, non touchés |
| elsatia-studio-preview | branche `claude/studio-preview-live-deploy-v2` seulement | aucune | inchangé, hors périmètre |

Rien n'a été modifié.

## 4. Variables Preview (aucune valeur secrète lue)

**Gestion Pro (`elsatia-preview`, entrées globales scope `preview`)** — inventaire Vercel réel, 53 variables :

| Variable | État |
|---|---|
| BANK_DATA_ENCRYPTION_KEY | présente, *sensitive* (posée 18:57Z ; non lue ; `iban-k1-check` : `IBAN_K1_READY`, attestation au registre NON_VERIFIEE) |
| STRIPE_WEBHOOK_EXPECTED_MODE | `test` ✓ |
| TOOLS_STORE_ENVIRONMENT | `sandbox` ✓ |
| ABONNEMENTS_PUBLICS_OUVERTS | `false` ✓ |
| ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE | `false` ✓ |
| LEGAL_TVA_REGIME_CONFIRME | `false` ✓ |
| DISABLE_EMAIL_LOGIN, STRIPE_AUTOMATIC_TAX_ENABLED, FEATURE_BOUTIQUE_ENABLED, FEATURE_CRONS_ENABLED | `false` ✓ |
| **FEATURE_AI_ENABLED** | **`true`** ✖ — manifeste : `expected.preview = "false"` (`config/env-manifest.json`) |
| FEATURE_AI_DEVIS_ENABLED, FEATURE_RELANCES_AUTO_ENABLED | *sensitive* : valeur invérifiable (attendu `false`) |

Seuls des drapeaux non secrets (type *encrypted*) ont été lus. `env-scope-check` sur l'inventaire brut :
`ENV_SCOPE_PARTIAL` (0 erreur, 10 avertissements « drapeau non vérifiable ») ; avec les valeurs de
drapeaux lues ci-dessus, `ENV-FLAG FEATURE_AI_ENABLED` est une **erreur** (`ENV_SCOPE_BLOCKED`).
Le rapport V3 (`ENV_SCOPE_PARTIAL`, 0 erreur) n'avait pas lu ces valeurs.
La correction (valeur `false`, scope Preview) a été **refusée par le garde de session** (écriture de
drapeau) et n'a pas été contournée → **DECISION_REQUIRED:FEATURE_AI_ENABLED_PREVIEW** : mettre `false`
(contrat du manifeste) ou amender le manifeste si l'IA doit rester active en Preview. Effet seulement
sur les prochains déploiements.

Annexes : entrées globales `NEXT_PUBLIC_APP_URL` (alias `feat` → 410) et `NEXT_PUBLIC_COLORS_URL`
(`elsatia-colors.vercel.app`) ; surchargées pour la branche `gp-preview-v8` (canal Preview retenu par V3).

**Tools** : `elsatia-tools` (Production) porte une publishable Preview valide pour `pgvvpqyjziyapbbkydmc`
(préfixe `sb_publishable_`, `/auth/v1/settings` → 200) mais n'a pas de Preview Git. Le projet Preview
réel est `elsatia-tools-preview` : `NEXT_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY`, `NEXT_PUBLIC_TOOLS_ENV`,
`NEXT_PUBLIC_TOOLS_URL`, `NEXT_PUBLIC_TOOLS_BILLING_API_URL`, `NEXT_PUBLIC_TOOLS_GESTION_PRO_URL`,
`NEXT_PUBLIC_TOOLS_COLORS_URL`, toutes scope `preview`. Valeurs non relues (lecture refusée par le garde
de session). `NEXT_PUBLIC_TOOLS_BILLING_API_URL` : consultative en mode `preview`
(`apps/tools/scripts/verify-public-env.mjs`, `ADVISORY_MODES`), utile au runtime (monétisation).

**Colors** : `elsatia-colors` partage `NEXT_PUBLIC_COLORS_URL` sur `production,preview`
(= `https://colors.elsatia.fr`) — non scindé (la scission modifierait l'entrée Production). Le projet
Preview réel `elsatia-colors-preview` a sa propre `NEXT_PUBLIC_COLORS_URL` scope `preview`, la publishable,
l'URL Supabase, `ELSATIA_APPLICATION_ENV`, `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` ; **manque
`SUPABASE_SERVICE_ROLE_KEY`** (secret : opérateur).

**Réserves** : `elsatia-reserves` existe (créé par l'autre session, aucun domaine, aucun déploiement) :
`NEXT_PUBLIC_SUPABASE_URL`, publishable, `ELSATIA_APPLICATION_ENV`, `NEXT_PUBLIC_RESERVES_URL` ;
**manque `SUPABASE_SERVICE_ROLE_KEY`**. Aucun projet créé par cette session.

## 5. Auth Preview (`pgvvpqyjziyapbbkydmc`, lu seulement)

`site_url` = `uri_allow_list` = `https://elsatia-preview-git-feat-elsatia-canoni-4f3ed2-julien-gregurec1.vercel.app(/**)`,
alias qui répond **410**. Non modifié : aucun déploiement Preview V9.2 n'est encore servi sur les
alias `gp-preview-v8` des satellites (0 déploiement). **AUTH_PREVIEW=PREPARED_NOT_APPLIED.**
URL finales attendues (canal `gp-preview-v8`, rapport V3) :

```
Site URL      : https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app
Redirect URLs : https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app/**
                https://elsatia-tools-preview-git-gp-preview-v8-julien-gregurec1.vercel.app/**
                https://elsatia-colors-preview-git-gp-preview-v8-julien-gregurec1.vercel.app/**
                https://elsatia-reserves-git-gp-preview-v8-julien-gregurec1.vercel.app/**
Retirer       : l'alias feat-elsatia-canoni-4f3ed2
```

## 6. Preflight officiel

Depuis `integration/elsatia-canonical-train-v9.2` @ `1a638855`, worktree propre :

| Commande | Résultat |
|---|---|
| `preview:v9:guard -- --ref pgvvpqyjziyapbbkydmc --environment preview` | `TARGET_PREVIEW_CONFIRMED` |
| ledger réel : `ELSATIA_V9_LEDGER_EXPORT.sql` en transaction `read only` via l'API de gestion Supabase (pas de TCP 5432 ici), `project_ref` ajouté d'après la réf. interrogée | 372 entrées, dernière `20261002000813`, `fonction_813.original=true`, marqueur 813 = original |
| `preview:v9:ledger -- <export> --expect pre --attendu-courant 372 --require-813-proof` | `PREVIEW_LEDGER_PREFIX_OK` ; 372 → 408 ; **36** en attente (`20261002000901 → 20261003001504`) ; phase 0 no-op (300 au ledger) |
| `preview:v9:preflight -- --ledger <export> --env-inventory <inventaire Vercel réel>` | **`PREVIEW_V9_OPERATOR_PACK_READY`** (sortie 0, 39 ✓, 0 ✖ : git, migrations, attendus, fixtures, plan, manifeste, secrets, build, `GUARD-PRODUCTION`, `GUARD-INCLUDE-ALL`, `GUARD-DRY-RUN-DEFAUT`, rollback ; `INPUT-LEDGER` ✓, `INPUT-ENV` PARTIAL 0 erreur, `INPUT-IBAN` ✓) |
| `v9-cutover.sh` | non lancé (dry-run réel = `ELSATIA_PREVIEW_DB_URL` + manifeste de sauvegarde, absents ici) |
| `supabase db push --dry-run` | non exécuté (mot de passe base requis ; étapes 9-10 de `v9-cutover.sh`) |

Aucune divergence de ledger. Aucun garde Production violé. Aucun garde affaibli.

## 7. GO / NO-GO

| Condition | État |
|---|---|
| intégration canonique correcte | train cohérent et qualifié ; intégration de `preview-ready-v1` = DECISION_REQUIRED (non FF) |
| qualification locale verte | ✓ |
| sauvegarde officiellement validée | ✓ (preuve opérateur) |
| gardes Vercel conformes | ✓ |
| variables Preview nécessaires conformes | ✖ `FEATURE_AI_ENABLED=true` ; `SUPABASE_SERVICE_ROLE_KEY` Colors / Réserves absente |
| Auth Preview suffisamment prête | ✖ non appliquée (alias 410) |
| preflight officiel vert | ✓ |

**PREVIEW_CUTOVER_GO=NO.** Côté base, rien ne bloque : ledger, sauvegarde et preflight sont verts. Les
blocages restants portent sur les surfaces Preview, au sens strict des critères de la mission.
Divergence avec le rapport V3 (`PREVIEW_CUTOVER_GO=YES`) : V3 classait ces surfaces « avant recette »
et n'avait pas lu la valeur de `FEATURE_AI_ENABLED`.

## HUMAN_ACTIONS_REMAINING

1. `elsatia-preview` → `FEATURE_AI_ENABLED` (scope Preview) = `false`, ou amender le manifeste
   (DECISION_REQUIRED:FEATURE_AI_ENABLED_PREVIEW). Confirmer `FEATURE_AI_DEVIS_ENABLED` et
   `FEATURE_RELANCES_AUTO_ENABLED` = `false` (*sensitive*, invérifiables).
2. `SUPABASE_SERVICE_ROLE_KEY` de `pgvvpqyjziyapbbkydmc` (*sensitive*, scope Preview) sur
   `elsatia-colors-preview` et `elsatia-reserves`.
3. Supabase Dashboard `pgvvpqyjziyapbbkydmc` → Authentication → URL Configuration : valeurs du §5.
4. Attestation k1 (`bank-keys register` / `status`, procédure du rapport V3 §5).
5. DECISION_REQUIRED:V9_2_PREVIEW_READY_INTEGRATION (§1) : avancer le train vers
   `claude/sweet-goodall-jpcufd`, ou clore `preview-ready-v1` comme obsolète.
6. Puis, mission séparée et autorisée : `v9-cutover.sh` en dry-run (sauvegarde ≤ 12 h,
   `ELSATIA_PREVIEW_DB_URL`), puis `--apply-preview --confirm-ref pgvvpqyjziyapbbkydmc`.
