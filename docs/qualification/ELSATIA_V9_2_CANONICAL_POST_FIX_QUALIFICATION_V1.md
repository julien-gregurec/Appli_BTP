# ELSATIA V9.2 — Intégration des correctifs post-qualification et requalification du train canonique

Date : 2026-10-03 · Train : `integration/elsatia-canonical-train-v9.2` · Base Preview : `pgvvpqyjziyapbbkydmc`

## Synthèse

```
OLD_CANONICAL_SHA=73d2abf8b5adf84596d95ebefa6cbb939013501d   (SHA qualifié déclaré ; ref distante réelle avant intégration : 1a638855441a0f4bfeeb23e4c656c7b2c2fab38e)
NEW_CANONICAL_SHA=73901278cc28614cac26f8f8a31761f17a20d9d4   (code qualifié ; le présent rapport est commité par-dessus, docs seules)
INTEGRATION=FAST-FORWARD 1a638855 → 73901278 (aucun merge, aucun rebase, aucun force push)
MIGRATION_COUNT=408 (dernière 20261003001504, horodatages uniques, Social absent)
MIGRATION_DIFF=AUCUN (supabase/ identique entre 1a638855, 73d2abf8 et 73901278)
APPLICATION_DIFF=73d2abf8 → 73901278 : config/env-manifest.json (+4) et src/lib/supabase/admin.ts (+2), le reste en docs

ENV_MANIFEST=PASS 70/70
SERVER_ONLY_GP=PASS (import "server-only" en tête de src/lib/supabase/admin.ts ; aucun importeur client ; build GP OK)
TYPECHECK=PASS (4 apps)
LINT=PASS (4 apps, 0 erreur, 15 avertissements comme la référence)
TESTS=PASS 5 799 (GP 2 950 + Tools 2 174 + Réserves 239 + Colors 436 ; GP : 1 échec attendu, 194 ignorés)
BUILDS=4/4 PASS (local)
PUBLIC_SECRET_EXPOSURE=NO

POST_LEDGER=PREVIEW_LEDGER_V9_COMPLETE (dernière preuve opérateur Mac ; verify-only non rejoué ici, faute d'accès PostgreSQL)
CODE_DEPLOY_ALLOWED=true (dernière preuve opérateur, verify-only EXIT_CODE=0 avec le pack corrigé b165d83e)
VERIFY_OPERATOR_REQUIRED=YES (confirmation recommandée depuis le nouveau SHA canonique)

PRODUCTION_TOUCHED=NO
MIGRATIONS_REPLAYED=NO
DEPLOYMENT_PERFORMED=NO

VERDICT=ELSATIA_V9_2_CANONICAL_POST_FIX_QUALIFIED
```

## 1. Audit avant intégration

`git fetch --all --prune`, puis :

| Ref | SHA |
|---|---|
| `origin/integration/elsatia-canonical-train-v9.2` | `1a638855` (GO/NO-GO Preview V2) |
| `origin/claude/confident-turing-jyajq2` | `73901278` |
| merge-base | `1a638855` → la branche des correctifs descend en ligne droite du train |

**DECISION_REQUIRED (résolue de façon conservatrice).** Le SHA qualifié `73d2abf8` n'était **pas** sur la
ref distante du train : il n'existait que sur `claude/confident-turing-jyajq2` (et
`claude/hopeful-albattani-h8bgnb`). Le train distant s'arrêtait à `1a638855`. Comme `73d2abf8` et
les deux correctifs sont des descendants linéaires de `1a638855`, une avance rapide amène le train sur
le SHA qualifié **et** sur les correctifs, sans aucune réécriture. Choix retenu : fast-forward jusqu'à
`73901278`. Les 7 commits apportés :

| Commit | Contenu | Catégorie |
|---|---|---|
| `be95e854` | rapport cutover (premier passage) | docs |
| `9d98c827` | pack Preview : point d'entrée via lien symbolique (`preview-guard.mjs`, `v9-cutover.sh`, test) | outillage opérateur, déjà dans 73d2abf8 qualifié |
| `d2e196df` | rapport cutover 408 réel | docs |
| `b165d83e` | pack Preview : lecture seule par `BEGIN READ ONLY` explicite (`db-verify.mjs`, `v9-cutover.sh`, test, doc backup) | outillage opérateur, déjà dans 73d2abf8 qualifié |
| `73d2abf8` | rapport cutover, second défaut corrigé | docs — **SHA qualifié** |
| `3b2a5adb` | recette hébergée Preview (brouillon) | docs |
| `73901278` | recette hébergée + **les deux correctifs attendus** | docs + correctifs |

Diff hors docs entre `73d2abf8` et `73901278` (vérifié avec `git diff 73d2abf8 73901278 -- config src`) :

- `config/env-manifest.json` : ajout de `ELSATIA_READ_ONLY_NON_EFFECTIF` à `scan.ignored_literals`
  (code d'erreur levé par le préambule READ ONLY de `scripts/preview/db-verify.mjs`, pas une variable).
- `src/lib/supabase/admin.ts` : `import "server-only";` en tête. Aucune autre ligne modifiée.

Aucun autre code applicatif ni métier n'est touché. `git diff --stat 1a638855 73901278 -- supabase` est vide.

## 2. Intégration

```
git checkout -B integration/elsatia-canonical-train-v9.2 origin/integration/elsatia-canonical-train-v9.2
git merge --ff-only origin/claude/confident-turing-jyajq2      # 1a638855 → 73901278
git push origin integration/elsatia-canonical-train-v9.2       # avance rapide, sans --force
```

Effet de bord utile : le train canonique distant contient désormais le pack opérateur corrigé
(`9d98c827`, `b165d83e`). Avant cette intégration, un `v9-cutover.sh --verify-only` lancé depuis la ref
distante du train aurait utilisé le pack non corrigé.

## 3. Contrôles git / train

| Contrôle | Résultat |
|---|---|
| Branche | `integration/elsatia-canonical-train-v9.2` |
| Worktree | propre (avant et après builds) |
| Migrations | 408 (`verify:migrations` : noms et horodatages uniques ; cibles partagé 408 · Studio 23) |
| Dernière migration | `20261003001504_taches_chantier_created_idx_v1.sql` (`verify:train-expectations` OK, 39 contrôles DB verify à jour) |
| Social | absent (seuls `raison_sociale`, `securite_sociale` et apparentés dans le SQL ; aucune app ni route Social) |
| Migrations modifiées | aucune |
| Diff applicatif | uniquement les deux correctifs attendus |

## 4. Qualification

Installation : `npm ci` (racine) + `npm ci --prefix apps/{tools,colors,reserves}`.

| Commande | Résultat | Référence |
|---|---|---|
| `npm run typecheck` (GP, Tools, Réserves, Colors) | PASS | PASS |
| `npm run lint` (4 apps) | PASS, 0 erreur, 15 avertissements | idem |
| Vitest GP | 2 950 ✓, 1 échec attendu (SEC-6), 194 ignorés | idem |
| Vitest Tools / Réserves / Colors | 2 174 / 239 / 436 ✓ | idem |
| **Total tests** | **5 799 PASS** | 5 799 |
| `test:env-manifest` | **70/70** | 69/70 sur 73d2abf8 → 70/70 attendu |
| `test:preview-v9` | 29/29 | 29/29 |
| `test:preview-pack` | 39/39 | inclut les tests des correctifs du pack |
| `test:migration-targets` | 7/7 | 7/7 |
| `test:bank-keys` | 1/1 | — |
| `verify:secrets` | 3 978 fichiers suivis, aucun secret | — |
| `verify:env-manifest` | OK, 14 DECISION_REQUIRED non bloquantes | idem |
| `preview:v9:preflight` | `PREVIEW_V9_OPERATOR_PACK_READY` | idem |
| Build GP (`next build`, Turbopack) | PASS | PASS |
| Build Tools (`NEXT_PUBLIC_TOOLS_ENV=local`, webpack + service worker) | PASS | PASS |
| Build Réserves (`ELSATIA_APPLICATION_ENV=local`) | PASS | PASS |
| Build Colors (`ELSATIA_APPLICATION_ENV=local`) | PASS | PASS |

Les builds satellites sans variable d'environnement échouent volontairement : ce sont les garde-fous
« env strict », qui refusent un build publié sans configuration. Le mode `local` est le mode prévu pour un
build de recette, et c'est celui de la référence.

Aucune régression constatée.

## 5. Sécurité

- `src/lib/supabase/admin.ts` commence par `import "server-only";`. Le build GP réussit, ce qui prouve
  qu'aucun composant client ne l'importe : Next.js fait échouer le build dans ce cas.
- 54 fichiers importent ce module. Aucun ne porte de directive `"use client"`.
- Scan des bundles client (`.next/static` des 4 apps) : aucune occurrence de `service_role`,
  `SUPABASE_SERVICE_ROLE_KEY`, `BANK_DATA_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `RESEND_API_KEY`, `CRON_SECRET`, `sk_live_`, `sk_test_` ou `whsec_`. Aucune charge JWT `service_role` encodée.
- Deux occurrences de `sb_secret_`, toutes deux de faux positifs : une regex de masquage des secrets dans
  un chunk GP, et un test de préfixe de clé dans la bibliothèque supabase-js (chunk Tools). Aucune
  valeur de secret.

`PUBLIC_SECRET_EXPOSURE=NO`.

## 6. Verify-only Preview

`ELSATIA_PREVIEW_DB_URL` n'est pas disponible dans cet environnement. Le verify-only n'a donc **pas** été
exécuté ici et n'est pas déclaré comme tel. Aucun `db push`, aucun `--apply-preview`, aucun appel à
Supabase ni à Vercel.

Référence conservée : la dernière preuve opérateur Mac (`v9-cutover.sh --verify-only`, pack corrigé de
`b165d83e`, voir `ELSATIA_V9_2_PREVIEW_CUTOVER_EXECUTION_V1.md` et `ELSATIA_V9_2_PREVIEW_HOSTED_FINAL_V1.md`) :
`PREVIEW_LEDGER_V9_COMPLETE`, CURRENT = TARGET = 408, PENDING = 0, `V9_CHECKS_GO` 14/14,
`CODE_DEPLOY_ALLOWED=true`, EXIT_CODE=0.

Le delta `73d2abf8 → 73901278` ne touche ni les migrations ni le pack opérateur. Cette preuve reste donc
pertinente. `VERIFY_OPERATOR_REQUIRED` : une confirmation opérateur depuis le nouveau SHA est recommandée :

```bash
git fetch origin integration/elsatia-canonical-train-v9.2 && git checkout integration/elsatia-canonical-train-v9.2
scripts/preview/v9/v9-cutover.sh --out ~/elsatia-v9-verify-$(date +%Y%m%d%H%M) --verify-only
```

## 7. Hors périmètre, non touché

Production, migrations, base Supabase, déploiements Vercel. Les builds hébergés Tools, Colors et
Réserves restent bloqués par le quota Vercel (voir `ELSATIA_V9_2_PREVIEW_HOSTED_FINAL_V1.md`).
