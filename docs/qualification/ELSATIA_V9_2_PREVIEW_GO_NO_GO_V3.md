# ELSATIA V9.2 — Preview : GO / NO-GO (V3)

Date : 2026-10-03 (UTC). Mission autonome « finalisation train canonique + surfaces Preview ».
**Aucune migration, aucun `db push`, aucun `--apply-preview`, aucune Production, aucun Stripe Live,
aucun Studio, aucune Boutique, Social non intégré.** Aucune valeur secrète dans ce document.

```
OLD_CANONICAL_SHA=dfb59cc61e45991165ef5dd8af04f1934ae28ab7
READINESS_SHA=1a638855441a0f4bfeeb23e4c656c7b2c2fab38e
FINAL_CANONICAL_SHA=1a638855441a0f4bfeeb23e4c656c7b2c2fab38e

MIGRATION_COUNT=408
CURRENT_LEDGER=372
TARGET_LEDGER=408
PENDING_MIGRATIONS=36

BACKUP_PACK_VALIDATED=YES_OPERATOR_PROOF

NEXT_SECURITY_FIX=PASS
LOCAL_QUALIFICATION=PASS

VERCEL_PRODUCTION_GUARD=CONFORME
VERCEL_LIRIA_GUARD=CONFORME
VERCEL_PREVIEW_PROTECTION=CONFORME

GP_PREVIEW_URL=https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app
TOOLS_PREVIEW_URL=https://elsatia-tools-preview-git-gp-preview-v8-julien-gregurec1.vercel.app
COLORS_PREVIEW_URL=https://elsatia-colors-preview-git-gp-preview-v8-julien-gregurec1.vercel.app
RESERVES_PREVIEW_URL=https://elsatia-reserves-git-gp-preview-v8-julien-gregurec1.vercel.app

GP_VARIABLES=READY
TOOLS_VARIABLES=READY
COLORS_VARIABLES=INCOMPLETE_SERVICE_ROLE_REQUIRES_OPERATOR
RESERVES_VARIABLES=INCOMPLETE_SERVICE_ROLE_REQUIRES_OPERATOR

AUTH_PREVIEW=PREPARED_NOT_APPLIED
BANK_KEY_DATABASE_REGISTRATION=REQUIRES_OPERATOR

PREFLIGHT_STATIC=PASS
PREFLIGHT_DATABASE=PARTIAL_LEDGER_PASS
PREFLIGHT_BACKUP_OPERATOR_PROOF=PASS
PREFLIGHT_OVERALL=PASS_FOR_CUTOVER_DRY_RUN

PUBLIC_SECRET_EXPOSURE=NO

PREVIEW_CUTOVER_GO=YES
VERDICT=ELSATIA_V9_2_PREVIEW_GO_PARTIAL
```

`PREVIEW_CUTOVER_GO=YES` signifie **uniquement** : les 36 migrations peuvent être lancées dans une
mission SÉPARÉE, avec autorisation explicite, via `v9-cutover.sh` — d'abord en dry-run (défaut),
qui exécute lui-même le contrôle de sauvegarde (étape 8) et le vrai `supabase db push --dry-run`
comparé exactement au plan (étapes 9-10), et refuse `--apply-preview` si l'un manque.
`VERDICT=…_PARTIAL` : les surfaces Preview (Auth, secrets serveur Colors/Réserves, attestation k1)
exigent encore des actions opérateur **avant la recette post-cutover**, pas avant les migrations.

---

## 1. Train canonique

- `origin/integration/elsatia-canonical-train-v9.2` = `dfb59cc6` ; readiness = `1a638855` ;
  `git merge-base --is-ancestor` : dfb59cc6 ancêtre direct (2 commits : `50319c76` bump Next.js,
  `1a638855` rapport V2).
- **Fast-forward** poussé (`dfb59cc6..1a638855`), sans merge, sans rebase, sans force.
- Vercel après push : `elsatia-preview` READY ; `elsatia-production` **CANCELED** ; aucun
  déploiement `liria-concept-gestion-btp`, `elsatia-studio-preview`, `elsatia-site`, Tools, Colors.
- Social non intégré ; `integration/elsatia-social-v1` non touchée.

## 2. Requalification sur `1a638855`

Seul écart avec `50319c76` : le rapport V2 (docs). Preuves rejouées sur ce SHA (`npm ci`) :

| Contrôle | Résultat |
|---|---|
| migrations | 408 fichiers, 0 horodatage dupliqué |
| Next.js | 16.3.8 (GP, Tools, Colors, Réserves) |
| typecheck / lint | verts |
| tests | 5 799 passés (2 950 GP + 2 174 Tools + 239 Réserves + 436 Colors), 0 échec |
| builds | GP, Tools, Colors, Réserves verts |

## 3. Surfaces Preview

**Canal Preview unique : la branche `gp-preview-v8`.** C'est la conception V8 existante :
variables GP propres à cette branche (dont `NEXT_PUBLIC_APP_URL` et
`NEXT_PUBLIC_TOOLS_BILLING_API_URL` = son alias, et des secrets d'identité *sensitive* non
re-portables). Son alias sert aujourd'hui `53b4bc76` (code V8, 371 migrations), compatible avec
la base 372 (V8 + 813). Aucun domaine n'a été basculé vers le code 408.

**Déploiement du code V9.2 (après migrations et `code-deploy-gate.mjs`)** : fast-forward de
`gp-preview-v8` vers le train canonique (`53b4bc76` est ancêtre de `1a638855`) → GP, Tools, Colors
et Réserves se construisent ensemble sur leurs alias stables.

| App | Projet Vercel | Isolation | URL |
|---|---|---|---|
| GP | `elsatia-preview` (existant) | projet Preview | alias de branche existant, en service (SSO) |
| Tools | `elsatia-tools-preview` (**créé**) | projet séparé de `elsatia-tools` (Production) | alias de branche, servi au 1er build de `gp-preview-v8` |
| Colors | `elsatia-colors-preview` (**créé**) | projet séparé de `elsatia-colors` (Production) | idem |
| Réserves | `elsatia-reserves` (**créé**) | projet Preview | idem |

Nouveaux projets : racines `apps/tools`, `apps/colors`, `apps/reserves` ; lien Git `Appli_BTP` ;
Node 24 ; protection Vercel standard. Ignored Build Step posé **dès la création** :
`if [ "$VERCEL_ENV" = "preview" ] && [ "$VERCEL_GIT_COMMIT_REF" = "gp-preview-v8" ]; then exit 1; else exit 0; fi`
(aucun build Production, aucun build d'une autre branche). Les domaines Production
`<projet>.vercel.app` ajoutés automatiquement par Vercel ont été **retirés** : 0 domaine, 0 déploiement.
`colors.elsatia.fr`, `tools.elsatia.fr` et les projets `elsatia-tools` / `elsatia-colors` ne sont
pas modifiés (leur entrée partagée `NEXT_PUBLIC_COLORS_URL` reste intacte ; ces projets ne
servent plus de Preview).

Les URL des 3 satellites suivent le format d'alias de branche Vercel prouvé par l'alias GP de la
même branche et de la même équipe (moins de 63 caractères, donc pas de troncature).

### Variables (scope Preview uniquement, aucune valeur Production)

- **GP (`elsatia-preview`)** : 12/12 variables requises présentes (`env-scope-check` : 0 erreur).
  Ajouts propres à la branche `gp-preview-v8` : `TOOLS_ALLOWED_ORIGINS` = origine Tools Preview
  (CORS de `/api/tools/monetization/*`, `src/lib/tools-monetization.ts`).
  `NEXT_PUBLIC_COLORS_URL[gp-preview-v8]` corrigée vers Colors Preview (pointait vers un alias
  `elsatia-colors-git-gp-preview-v8-…` qui ne peut pas exister, `elsatia-colors` n'étant pas lié à Git).
- **Tools** : `NEXT_PUBLIC_SUPABASE_URL` (réf. Preview), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_TOOLS_ENV=preview`, `NEXT_PUBLIC_TOOLS_URL`,
  `NEXT_PUBLIC_TOOLS_BILLING_API_URL` = GP Preview (API réelle : `src/app/api/tools/monetization`),
  `NEXT_PUBLIC_TOOLS_GESTION_PRO_URL`, `NEXT_PUBLIC_TOOLS_COLORS_URL`.
- **Colors** : URL Supabase, clé publishable, `ELSATIA_APPLICATION_ENV=preview`,
  `NEXT_PUBLIC_COLORS_URL` (propre à la Preview), `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` = GP Preview + `/abonnement`.
  **Manque `SUPABASE_SERVICE_ROLE_KEY`** (voir §6).
- **Réserves** : URL Supabase, clé publishable, `ELSATIA_APPLICATION_ENV=preview`,
  `NEXT_PUBLIC_RESERVES_URL`. **Manque `SUPABASE_SERVICE_ROLE_KEY`** ; e-mail Brevo optionnel non
  posé (aucun secret copié).

## 4. Auth Preview (`pgvvpqyjziyapbbkydmc`) — PREPARED_NOT_APPLIED

État actuel : `site_url` et `uri_allow_list` = `elsatia-preview-git-feat-elsatia-canoni-4f3ed2-…`,
alias qui répond **410 GONE**. Le modèle « recovery » utilise `{{ .SiteURL }}` : les liens de
réinitialisation Preview sont aujourd'hui morts. Écriture refusée par l'API (`403 auth_config_write`
manquant) ; vérifié : aucun champ modifié. Valeurs à poser (Dashboard → Authentication → URL
Configuration, projet `pgvvpqyjziyapbbkydmc` uniquement) :

```
Site URL      : https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app
Redirect URLs : https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app/**
                https://elsatia-tools-preview-git-gp-preview-v8-julien-gregurec1.vercel.app/**
                https://elsatia-colors-preview-git-gp-preview-v8-julien-gregurec1.vercel.app/**
                https://elsatia-reserves-git-gp-preview-v8-julien-gregurec1.vercel.app/**
(retirer l'alias feat-elsatia-canoni-4f3ed2 : remplacement certain)
```

Modèles magic link, invitation et confirmation : `{{ .ConfirmationURL }}` (suivent la liste
ci-dessus) ; recovery : `{{ .SiteURL }}` (suit la Site URL).

## 5. Clé bancaire k1 — REQUIRES_OPERATOR

`npm run bank-keys -- register --key-id k1` lit la clé dans l'environnement du processus et écrit
l'empreinte en base (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` Preview). La clé posée
à la session précédente est en *sensitive* : illisible par conception, y compris pour l'opérateur.
Aucun IBAN n'est chiffré en Preview : la remplacer est sans perte. Procédure (Mac opérateur, projet
`elsatia-preview` lié, aucune valeur affichée) :

```
umask 077; KF="$(mktemp)"; openssl rand -hex 32 > "$KF"
vercel env rm  BANK_DATA_ENCRYPTION_KEY preview --yes
vercel env add BANK_DATA_ENCRYPTION_KEY preview --sensitive < "$KF"
read -rs SR   # service_role de pgvvpqyjziyapbbkydmc, saisie masquée
BANK_DATA_ENCRYPTION_KEY="$(cat "$KF")" NEXT_PUBLIC_SUPABASE_URL=https://pgvvpqyjziyapbbkydmc.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY="$SR" npm run bank-keys -- register --key-id k1
BANK_DATA_ENCRYPTION_KEY="$(cat "$KF")" NEXT_PUBLIC_SUPABASE_URL=https://pgvvpqyjziyapbbkydmc.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY="$SR" npm run bank-keys -- status
rm -P "$KF"; unset SR
```

## 6. Secrets non posés par cette session

Poser `SUPABASE_SERVICE_ROLE_KEY` Preview (`pgvvpqyjziyapbbkydmc`) sur `elsatia-colors-preview` et
`elsatia-reserves` a été **refusé par le garde de sécurité de la session** (écriture de secret). Le
refus n'a pas été contourné. Action opérateur, scope Preview, type *sensitive* :
`vercel env add SUPABASE_SERVICE_ROLE_KEY preview --sensitive` dans chacun des deux projets.

## 7. Preflight

| Volet | Résultat | Preuve |
|---|---|---|
| PREFLIGHT_STATIC | PASS | `preflight-v9.mjs` sur `integration/elsatia-canonical-train-v9.2` @ `1a638855` : `PREVIEW_V9_OPERATOR_PACK_READY`, 0 ✖ (le blocage `GIT-BRANCHE` de la V2 est levé) |
| PREFLIGHT_DATABASE | PARTIAL_LEDGER_PASS | `ELSATIA_V9_LEDGER_EXPORT.sql` exécuté **en lecture seule** (`read_only`) via l'API de gestion Supabase (pas psql : TCP indisponible ici), étiqueté `cutover-step ledger-tag` ; `check-ledger-v9 --expect pre --attendu-courant 372 --require-813-proof` → `PREVIEW_LEDGER_PREFIX_OK`, 372 → 408, 36 en attente (20261002000901 → 20261003001504), 813 originale (`fonction_813.original=true`), phase 0 no-op. `supabase db push --dry-run` **non exécuté** (mot de passe base requis) : c'est l'étape 9-10 obligatoire de `v9-cutover.sh` |
| PREFLIGHT_BACKUP_OPERATOR_PROOF | PASS | preuve opérateur : `BACKUP_DECLARED_OK` (schema, data, auth, migrations_data, ledger ; réf., 813, préfixe, 372/408/36, tailles + SHA256). `backup-check.mjs` **non exécuté dans cette session** (manifeste sur le Mac opérateur) |
| Inventaire Vercel | PASS (partiel) | `preflight-v9 --ledger … --env-inventory …` → `INPUT-LEDGER` ✓, `INPUT-ENV` `ENV_SCOPE_PARTIAL` (0 erreur, 11 drapeaux non vérifiables sans dotenv), `INPUT-IBAN` `IBAN_K1_READY` (attestation non vérifiée) → `PREVIEW_V9_OPERATOR_PACK_READY` |
| PREFLIGHT_OVERALL | PASS_FOR_CUTOVER_DRY_RUN | — |

## 8. Sécurité des bundles

0 motif secret (`sk_/rk_`, `sb_secret_`, `whsec_`, PEM, OpenAI, JWT `service_role`) dans
`.next/static` de GP, Tools, Colors et Réserves construits sur `1a638855`.
`verify-secrets.mjs` : 3 976 fichiers suivis, aucun secret.

## 9. Points notés, non modifiés

- `elsatia-preview` : entrées Preview globales (`*`) `NEXT_PUBLIC_APP_URL` (alias feat 410) et
  `NEXT_PUBLIC_COLORS_URL` (= `elsatia-colors.vercel.app`, Colors Production). Elles ne concernent
  que les déploiements des branches autres que `gp-preview-v8`.
- `elsatia-tools` / `elsatia-colors` : clés publishable posées en scope Preview à la session V2 ;
  sans effet, puisque ces projets n'ont pas de Preview.

## HUMAN_ACTIONS_REMAINING

1. Supabase Dashboard : appliquer la config Auth du §4.
2. Vercel : `SUPABASE_SERVICE_ROLE_KEY` Preview (*sensitive*) sur `elsatia-colors-preview` et `elsatia-reserves` (§6).
3. Procédure k1 du §5.
4. Mission séparée et autorisée : `v9-cutover.sh` en dry-run avec `ELSATIA_PREVIEW_DB_URL` et le
   manifeste de sauvegarde, puis `--apply-preview --confirm-ref pgvvpqyjziyapbbkydmc`.
