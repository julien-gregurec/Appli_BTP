CANONICAL_SHA=1a638855441a0f4bfeeb23e4c656c7b2c2fab38e
PROJECT_REF=pgvvpqyjziyapbbkydmc

POST_LEDGER=408
POST_PENDING=0
LAST_MIGRATION=20261003001504
LEDGER_DIVERGENCE=NO (408 versions distantes = 408 fichiers de supabase/migrations, même ordre, 0 inconnue, 0 manquante)
MIGRATION_813_ORIGINAL=YES (marqueur original au ledger + fonction déployée originale, « HOTFIX 813 » absent)

BANK_K1_REGISTERED=YES
BANK_K1_ACTIVE=YES (seule clé du registre ; 2/2 gardes ; 0 donnée chiffrée en base ; empreinte_controle non posée → « 1 clé à attester (bank-keys register) », information non bloquante)

OPERATOR_PACK_BUG=CONFIRMED — `estPointEntree` (scripts/preview/lib/preview-guard.mjs) compare `import.meta.url` (chemin canonicalisé par Node) à `process.argv[1]` (non canonicalisé). Dépôt atteint par un lien symbolique (ou casse / forme Unicode différente sous macOS) → chaque script Node du pack sort en 0 SANS RIEN FAIRE, porte CODE_DEPLOY_ALLOWED comprise. Reproduit à l'identique sur la Preview réelle (lecture seule).
OPERATOR_PACK_FIX=8de10ef8 (branche claude/modest-hypatia-7dakn2) — canonicalisation des deux chemins + v9-cutover.sh fail-closed (auto-contrôle du rapport, SHA 40 hex, verdicts relus dans les sorties, porte ouverte seulement si elle ÉCRIT `CODE_DEPLOY_ALLOWED=true`). Aucune migration touchée, aucun db push.
OPERATOR_PACK_TESTS=test:preview-v9 31/31 (dont 2 nouveaux ; le test « lien symbolique » échoue sans le correctif) · test:preview-pack 32/32

CODE_DEPLOY_ALLOWED=YES (porte officielle du pack au SHA 1a638855 lui-même, `--verify-only` complet sur preuves fraîches du 2026-10-03 21:09 UTC)

GP_DEPLOY_SHA=NOT_DEPLOYED (quota Vercel Hobby « api-deployments-free-per-day » 100/100 épuisé — sert toujours 53b4bc76 V8)
TOOLS_DEPLOY_SHA=NOT_DEPLOYED (même blocage ; alias sans déploiement : 404)
COLORS_DEPLOY_SHA=NOT_DEPLOYED (même blocage ; alias sans déploiement : 404)
RESERVES_DEPLOY_SHA=NOT_DEPLOYED (même blocage ; alias sans déploiement : 404)

GP_PREVIEW_URL=https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app
TOOLS_PREVIEW_URL=https://elsatia-tools-preview-git-gp-preview-v8-julien-gregurec1.vercel.app
COLORS_PREVIEW_URL=https://elsatia-colors-preview-git-gp-preview-v8-julien-gregurec1.vercel.app
RESERVES_PREVIEW_URL=https://elsatia-reserves-git-gp-preview-v8-julien-gregurec1.vercel.app

SMOKE_GP=NOT_RUN (code V9.2 non déployé ; alias = V8 53b4bc76 derrière la protection SSO Vercel : 302 → vercel.com/sso-api)
SMOKE_TOOLS=NOT_RUN (404 : aucun déploiement sur l'alias)
SMOKE_COLORS=NOT_RUN (404 : aucun déploiement sur l'alias)
SMOKE_RESERVES=NOT_RUN (404 : aucun déploiement sur l'alias)

AUTH_CALLBACKS=CONFIG_OK / HOSTED_NOT_RUN — site_url = alias GP gp-preview-v8 ; allow-list = exactement les 4 alias gp-preview-v8 (/**) ; aucune URL Production ; non modifiée
CORS=CONFIG_OK / HOSTED_NOT_RUN — TOOLS_ALLOWED_ORIGINS (GP, branche gp-preview-v8) = alias Tools Preview uniquement
CSP=HOSTED_NOT_RUN
RLS=PASS (base) — 0 table public sans RLS, 0 droit d'écriture anon, 39/39 RPC service_role seul, 14/14 contrôles V9, préflight sécurité 21 contrôles / 0 anomalie bloquante
PUBLIC_SECRET_EXPOSURE=NO (bundles client des 4 builds locaux au SHA : 0 occurrence sur 198 fichiers JS ; bundles HÉBERGÉS non inspectés, faute de déploiement V9.2)

TYPECHECK=PASS (GP + Tools + Réserves + Colors)
LINT=PASS (GP + Tools + Réserves + Colors)
TESTS=PASS 5 799 (GP 2 950 + 1 échec attendu SEC-6 · Tools 2 174 · Réserves 239 · Colors 436) — identique à la référence ; + pack V9 31/31, pack Preview 32/32
BUILDS=PASS 4/4 (GP ; Tools, Réserves et Colors avec ELSATIA_APPLICATION_ENV=local / NEXT_PUBLIC_TOOLS_ENV=local, comme l'exigent leurs gardes)

PRODUCTION_TOUCHED=NO

VERDICT=ELSATIA_V9_2_PREVIEW_HOSTED_PARTIAL

# ELSATIA V9.2 — Preview post-cutover, déploiement et recette hébergée — V1

Date : 2026-10-03 (UTC). Exécution autonome, sans opérateur.

## Verdict

# `ELSATIA_V9_2_PREVIEW_HOSTED_PARTIAL`

La **base Preview est confirmée au train V9.2 complet** de façon indépendante : ledger 408/408, 0 en attente, 813 originale,
14/14 contrôles V9 et DB verify GO. La **porte code est ouverte** (`CODE_DEPLOY_ALLOWED=true` pour 1a638855). Le **bug du pack
opérateur est expliqué, reproduit, corrigé et testé**.

En revanche, **aucune des 4 apps n'a pu être déployée**. Vercel (plan Hobby) refuse toute création de déploiement :
`payment_required — Resource is limited - try again in 24 hours (more than 100, code: "api-deployments-free-per-day")`.
La réinitialisation annoncée est le 2026-10-04 à 21:09 UTC. La recette hébergée des 4 apps n'a donc pas pu être exécutée.
Le verdict READY n'est pas atteignable sans déploiement ; NO_GO ne correspond pas non plus à la situation, puisque la base
et la porte sont vertes et qu'aucune régression n'a été trouvée.

## Phase A — audit post-cutover en lecture seule (indépendant)

Lecture directe de la Preview via l'API Supabase Management, endpoint `database/query/read-only` (rôle
`supabase_read_only_user`, `transaction_read_only=on` vérifié). Aucune écriture.

| Contrôle | Résultat |
|---|---|
| Projet | `pgvvpqyjziyapbbkydmc` « elsatia-preview », eu-west-3, ACTIVE_HEALTHY, PostgreSQL 17.6 |
| Ledger | 408 lignes ; dernière 20261003001504 ; **liste identique, dans l'ordre**, aux 408 fichiers de `supabase/migrations` au SHA canonique |
| `check-ledger-v9.mjs --expect post --require-813-proof` (sur l'export officiel `ELSATIA_V9_LEDGER_EXPORT.sql`) | `PREVIEW_LEDGER_V9_COMPLETE`, CURRENT=TARGET=408, PENDING=0 |
| `ELSATIA_V9_POST_CUTOVER_CHECKS.sql` → `cutover-step.mjs v9-checks` | `V9_CHECKS_GO (14 contrôles)` — identique aux 14 PASS de l'opérateur, dont IBAN k1 = 1 / active = 1 |
| DB verify (`db-verify.mjs`, 39 contrôles + préflight + RLS + RPC service) | **GO** — 39/39 lignes, un seul avertissement **non bloquant** : `url_preview` absente pour 5 applications du sélecteur |
| Préflight sécurité plateforme (mode preview) | 21 contrôles, 0 anomalie |
| RLS structurelle | 0 table public sans RLS ; 20 tables RLS sans policy (information, fermées par défaut) ; 0 droit d'écriture anon ; buckets 1 public / 19 |
| RPC « service-role only » | 39/39 : EXECUTE refusé à anon et authenticated, accordé à service_role |
| Clés bancaires | registre : 1 clé (`k1`, `active`) ; 2/2 gardes `garde_chiffres_bancaires` ; RPC opérateur et table fermées à authenticated ; 0 donnée chiffrée (donc 0 sous clé interdite) |

**Adaptation documentée.** Le rôle lecture seule de l'API n'a pas EXECUTE sur 2 fonctions appelées par le SQL de DB verify :
`incident_table_exemptee` (contrôle des gardes d'incident) et `cles_bancaires_inventaire` (contrôle 38, SECURITY DEFINER).
Pour ces deux cas uniquement, le corps de la fonction, lu dans `pg_get_functiondef`, a été substitué **à l'identique** dans
la requête : liste de tables exemptées, et formats v1/v2 de `chiffre_bancaire_format` / `chiffre_bancaire_cle` sur les
4 colonnes de `chiffres_bancaires_sources`. Le résultat du contrôle est donc équivalent, sans élévation de droits. Il n'y
avait pas de mot de passe de base dans l'environnement : l'API a été branchée derrière une cale `psql` hors dépôt. Cette
cale ne cible que `pgvvpqyjziyapbbkydmc`, refuse toute autre URL et passe uniquement par l'endpoint read-only. Les scripts
officiels (`v9-cutover.sh`, `db-verify.mjs`, `code-deploy-gate.mjs`) ont tourné sans modification.

## Phase B — bug du pack opérateur

### Cause racine

`scripts/preview/lib/preview-guard.mjs` :

```js
export function estPointEntree(importMetaUrl) {
  return Boolean(process.argv[1]) && fileURLToPath(importMetaUrl) === resolve(process.argv[1]);
}
```

Pour le point d'entrée, Node **résout les liens symboliques** dans `import.meta.url`, mais pas dans `process.argv[1]`.
Quand le dépôt est atteint par un chemin qui n'est pas canonique, les deux chemins diffèrent. C'est le cas d'un lien
symbolique, mais aussi, sous macOS, d'une casse ou d'une forme Unicode NFC/NFD différente, par exemple un dossier accentué.
Chaque script Node du pack croit alors être importé par un test : il ne fait rien et sort en **0**.

`v9-cutover.sh` se fie uniquement aux codes de sortie, ce qui explique chaque symptôme observé :

| Symptôme opérateur | Mécanisme |
|---|---|
| `HEAD` vide dans la bannière | `cutover-step.mjs head` n'affiche rien, sort en 0 → `SHA_HEAD=""` accepté |
| `cutover-report.json` absent | `report-set` muet |
| `ledger-apres.json` absent | `ledger-tag` muet (sort en 0 sans écrire), puis `rm -f` du brut |
| `db-verify.txt` vide | `db-verify.mjs` muet |
| `ledger-avant.txt` / `plan.md` vides | `check-ledger-v9.mjs` / `migration-plan-v9.mjs` muets |
| `v9-checks.txt` correct | produit directement par `psql`, sans Node |
| ÉTAPE 15 atteinte, `EXIT_CODE=0` | `code-deploy-gate.mjs` muet → code 0 interprété comme « porte ouverte » |

**Reproduction sur la Preview réelle** (même SHA 1a638855, lancé par un chemin à lien symbolique, `--verify-only`) :
bannière `HEAD ` vide, ni rapport ni `ledger-apres.json`, `db-verify.txt` de 0 octet, `v9-checks.txt` complet,
ÉTAPE 15 atteinte, `EXIT_CODE=0`. Le même SHA lancé depuis son chemin réel produit toutes les preuves.

### Portée — à lire

Le bug ne porte **pas** seulement sur le reporting. Pendant le `--apply-preview` réel, les gardes Node ont aussi été
**muettes** : garde de cible, contrôle git et train, préfixe du ledger, plan, égalité dry-run/plan, sauvegarde.
L'application a reposé sur `supabase db push --linked` seul, lié à la Preview. **Le résultat est sain**, c'est prouvé
indépendamment ci-dessus : ledger exactement égal au train, 813 originale, 14/14, DB verify GO. **Le cutover DB n'est pas
en échec.** En revanche, ces gardes n'avaient pas protégé l'opération.
DECISION_REQUIRED (opérateur) : vérifier sur son poste d'où le pack a été lancé (`pwd` contre `pwd -P`). Le correctif rend
désormais ce cas fail-closed.

### Correctif (commit 8de10ef8, sans migration, sans db push)

- `estPointEntree` : canonicalisation des **deux** chemins (`realpathSync.native`, repli sur `resolve`).
- `v9-cutover.sh` : refus si le rapport n'est pas écrit après les premiers `report-set` (pack inopérant) ; refus si le SHA de
  HEAD n'a pas 40 caractères hexadécimaux ; `ledger-tag` doit produire un fichier non vide ; chaque verdict de l'étape 12 à
  l'étape 15 est relu dans sa sortie (`PREVIEW_LEDGER_V9_COMPLETE`, `GO : base Preview conforme`, `V9_CHECKS_GO`) ; la porte
  n'est ouverte que si elle **écrit** `CODE_DEPLOY_ALLOWED=true` et que le rapport et `ledger-apres.json` existent.
- Tests : exécution réelle des scripts par un chemin à lien symbolique (`head`, `report-set`, porte, ledger), et contrôle
  statique des garde-fous de `v9-cutover.sh`. Sans le correctif : 30/31. Avec : 31/31.
- `--verify-only` corrigé, lancé par le lien symbolique sur la Preview réelle : toutes les preuves sont écrites
  (`cutover-report.json`, `ledger-apres.json/.txt`, `db-verify.txt`, `v9-checks*.txt`, `code-deploy-gate.txt`),
  `DB_V9_CONFIRMED`, `EXIT_CODE=0`. Sans base joignable, le même script échoue proprement en code 1.

Le correctif n'est pas dans 1a638855. Il porte uniquement sur `scripts/preview/**` et ne change aucun code applicatif
déployé. DECISION_REQUIRED : l'intégrer au train (cherry-pick de 8de10ef8).

## Phase C — porte « code après base »

Pack officiel **au SHA 1a638855** (worktree détaché, branche locale `integration/elsatia-canonical-train-v9.3`, autorisée par
le motif du pack, chemin réel), `v9-cutover.sh --verify-only` complet :

```
GIT-* ✓ (HEAD 1a638855…, base V9.1 ancêtre, worktree propre) · TRAIN-* ✓ (TARGET_LEDGER=408)
TARGET_PREVIEW_CONFIRMED
PREVIEW_LEDGER_V9_COMPLETE · CURRENT_LEDGER=408 · TARGET_LEDGER=408 · PENDING_MIGRATIONS=0
GO : base Preview conforme.          (1 avertissement non bloquant : url_preview)
V9_CHECKS_GO (14 contrôles)
CODE_DEPLOY_ALLOWED=true — le code de HEAD (1a638855441a) peut être déployé en Preview
EXIT_CODE=0  · rapport : mode verify, ref pgvvpqyjziyapbbkydmc, sha_deploye 1a638855…, verdict DB_V9_CONFIRMED
```

Relance indépendante de `code-deploy-gate.mjs --report … --ledger …` : `CODE_DEPLOY_ALLOWED=true`, code 0.

**CODE_DEPLOY_ALLOWED=YES.**

## Phase D — déploiement Preview : BLOQUÉ (quota Vercel)

| App | Projet Vercel (isolé Preview) | Root | Alias conservé | Servi actuellement |
|---|---|---|---|---|
| Gestion Pro | `elsatia-preview` | `.` | `elsatia-preview-git-gp-preview-v8-…` | `dpl_BEESmBgwjEPsECz5kBECKXReFom8` = 53b4bc76 (V8) — **retour arrière** |
| Tools | `elsatia-tools-preview` | `apps/tools` | `elsatia-tools-preview-git-gp-preview-v8-…` | aucun (404) |
| Colors | `elsatia-colors-preview` | `apps/colors` | `elsatia-colors-preview-git-gp-preview-v8-…` | aucun (404) |
| Réserves | `elsatia-reserves` | `apps/reserves` | `elsatia-reserves-git-gp-preview-v8-…` | aucun (404) |

**Méthode retenue (conservatrice).** Créer les déploiements par l'API Vercel avec
`gitSource {ref: "gp-preview-v8", sha: "1a638855…"}`, en cible Preview, sans `--prod`. Ce choix évite de réécrire la
branche git `gp-preview-v8`. Il conserve aussi les variables propres à cette branche : `NEXT_PUBLIC_APP_URL`,
`TOOLS_ALLOWED_ORIGINS`, `ELSATIA_IDENTITY_*` et les URLs Studio. Il garde les alias que l'allow-list Auth connaît et
passe la commande d'exclusion de build de Tools, Colors et Réserves, qui ne construisent qu'en Preview avec
`VERCEL_GIT_COMMIT_REF=gp-preview-v8`. Les Auth Redirect URLs ne sont pas modifiées.

**Résultat.** Les 4 créations ont été refusées : `payment_required` / `api-deployments-free-per-day` (100/100, compte Hobby).
Réinitialisation annoncée : **2026-10-04 21:09 UTC**.

Alternatives écartées :
- Réaliaser vers l'alias GP le build Preview déjà existant de 1a638855 (`dpl_Gj6nRiK2BNwmemkwpsPy86owu1qE`, branche
  `integration/elsatia-canonical-train-v9.2`). Écarté : ce build a été compilé avec les variables génériques. Son
  `NEXT_PUBLIC_APP_URL` vise `…-git-feat-elsatia-canoni-…`, et il n'a ni origines Tools ni émetteur d'identité gp-preview-v8.
  Les URLs publiques compilées ne correspondraient pas à l'alias, ce qui casserait les callbacks Auth et le passage
  inter-app.
- Pousser 1a638855 sur la branche git `gp-preview-v8`. Écarté : branche hors du périmètre autorisé pour cette session.
  Les déploiements Git sont de toute façon soumis au même plafond quotidien Hobby.

Configuration Preview vérifiée **avant** déploiement (valeurs non secrètes lues, secrets jamais lus) :

| Projet | Constat |
|---|---|
| GP | `ELSATIA_APPLICATION_ENV=preview` ; `STRIPE_WEBHOOK_EXPECTED_MODE=test` ; `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE=false` ; `ABONNEMENTS_PUBLICS_OUVERTS=false` ; `TOOLS_STORE_ENVIRONMENT=sandbox` ; `FEATURE_AI_ENABLED=false` ; `FEATURE_CRONS_ENABLED=false` ; `FEATURE_BOUTIQUE_ENABLED=false` ; URLs gp-preview-v8 cohérentes ; `NEXT_PUBLIC_SUPABASE_URL` est de type « sensitive », donc illisible par l'API (à confirmer dans le bundle après déploiement) |
| Tools | `NEXT_PUBLIC_SUPABASE_URL=https://pgvvpqyjziyapbbkydmc.supabase.co` ; billing → alias GP Preview ; `NEXT_PUBLIC_TOOLS_ENV=preview` ; aucune URL Production |
| Colors | Supabase Preview ; compte → alias GP Preview `/abonnement` ; `ELSATIA_APPLICATION_ENV=preview` |
| Réserves | Supabase Preview ; `ELSATIA_APPLICATION_ENV=preview` |

Point d'attention : la variable de GP `NEXT_PUBLIC_COLORS_URL` sans branche vaut `https://elsatia-colors.vercel.app`. Elle
est surchargée par la valeur gp-preview-v8, qui pointe vers l'alias Colors Preview, d'où la nécessité de déployer avec
`ref=gp-preview-v8`.

## Phase E — recette hébergée : NON EXÉCUTÉE

Aucun code V9.2 n'est servi sur les alias. Constats anonymes relevés avant les refus :
- alias GP → `302` vers `vercel.com/sso-api` : la Deployment Protection est active ;
- alias Tools, Colors et Réserves → `404`.

Trois prérequis manquent pour la recette authentifiée, en plus du déploiement :
1. **Jeton de contournement d'automatisation Vercel.** Aucun n'existe sur les 4 projets. Sa création par l'agent a été
   refusée par la politique d'exécution (écriture dans un stockage de secrets). Elle relève de l'opérateur, comme le prévoit
   le runbook `ELSATIA_V9_GP_PREVIEW_DEPLOY.md` §3.
2. **Mot de passe du compte pilote** `pilote.karim.haddad@example.test`, saisi par l'opérateur et jamais consigné.
3. Le smoke anonyme officiel (`preview:http-smoke`, `preview:v9:post-check --gp-url`) une fois 1 et le déploiement en place.

## Phase F — sécurité

Inspection des bundles client produits au SHA (builds locaux, Phase G) : `.next/static` de GP (77 JS), Tools (87),
Réserves (19) et Colors (15). On y a cherché `SUPABASE_SERVICE_ROLE_KEY`, `BANK_DATA_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK*`, `RATE_LIMIT_HMAC_KEY`, `ELSATIA_IDENTITY_SIGNING_KEYS`, `STRIPE_STATE_ATTESTATION_PRIVATE*`,
`OPENAI_API_KEY`, `CRON_SECRET`, `BREVO_API_KEY`, `sk_live_`, `sk_test_`, `rk_live_`, `whsec_`, `PRIVATE KEY` et
`service_role` : **0 occurrence**.

- La clé service-role n'est lue que par 3 modules serveur : `src/lib/supabase/admin.ts`,
  `apps/reserves/src/lib/supabase/admin.ts` et `apps/colors/src/lib/supabase/admin-storage.ts`. Aucun d'eux n'est importé
  par un composant `"use client"`.
  Observation non bloquante : le module GP n'a pas l'import `server-only`. Next n'injecte de toute façon que les variables
  `NEXT_PUBLIC_*` côté client, et le scan le confirme.
- `FEATURE_AI_ENABLED=false` (Preview GP, valeur lue). Aucune fonctionnalité activée ni modifiée.
- Stripe : `STRIPE_WEBHOOK_EXPECTED_MODE=test`, ouverture Live `false`. La clé secrète, de type « sensitive », n'a pas
  été lue.
- Limite : les bundles **hébergés** n'ont pas pu être inspectés (aucun déploiement V9.2, protection SSO). Il faudra
  rejouer le scan sur les URLs après déploiement, notamment pour confirmer `NEXT_PUBLIC_SUPABASE_URL` = Preview dans le
  bundle GP.

## Phase G — tests au SHA

Exécuté sur l'arbre 8de10ef8 = 1a638855 + correctif `scripts/preview/**`, sans effet sur le code applicatif.

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | PASS (4 apps) |
| `npm run lint` | PASS (4 apps) |
| `npm test` | PASS — GP 2 950 ✓ (1 échec attendu SEC-6, 194 ignorés, identiques au gate V9.2) · Tools 2 174 · Réserves 239 · Colors 436 = **5 799** |
| `test:preview-v9` / `test:preview-pack` | 31/31 · 32/32 |
| Builds | GP `next build` PASS ; Tools, Réserves et Colors PASS avec `ELSATIA_APPLICATION_ENV=local` et `NEXT_PUBLIC_TOOLS_ENV=local` |

Le premier essai des builds satellites, sans aucune variable, est refusé par les gardes `verify-public-env`. Elles
attendent un environnement déclaré et sont fail-closed par conception : ce n'est pas une régression.

## Production

Aucun accès à la Production : ni `exhvuzegsefmoguxoiak`, ni le projet Vercel `elsatia-production`. Aucun Stripe Live,
aucune migration, aucun `migration repair`, aucune écriture en base. Studio, Social et Boutique n'ont pas été déployés.
**PRODUCTION_TOUCHED=NO.**

## Blockers restants

1. **Quota Vercel Hobby épuisé** (100 déploiements par jour). Réinitialisation 2026-10-04 21:09 UTC, ou passage à un plan
   supérieur.
2. **Recette hébergée authentifiée** : jeton de contournement d'automatisation, à créer par l'opérateur puis à régénérer
   après la campagne, et mot de passe du pilote.
3. DECISION_REQUIRED : intégrer le correctif du pack (8de10ef8) au train.
4. Non bloquant : `url_preview` non renseignée pour 5 applications du sélecteur, et clé k1 sans empreinte d'attestation
   (`bank-keys register`).

## Prochaine action immédiatement exécutable (après 2026-10-04 21:09 UTC)

Pour chacun des projets `elsatia-preview`, `elsatia-tools-preview`, `elsatia-colors-preview` et `elsatia-reserves` :

```
POST https://api.vercel.com/v13/deployments
{"name":"<projet>","project":"<projet>",
 "gitSource":{"type":"github","repoId":1296945609,"ref":"gp-preview-v8","sha":"1a638855441a0f4bfeeb23e4c656c7b2c2fab38e"}}
```

Pas de `target` (Preview), jamais `--prod`. Ensuite :
- vérifier que chaque alias `…-git-gp-preview-v8-…` sert 1a638855 ;
- relancer `code-deploy-gate.mjs` juste avant ;
- lancer `preview:http-smoke` et `preview:v9:post-check`, avec `VERCEL_AUTOMATION_BYPASS_SECRET` dans le shell ;
- dérouler la recette guidée pilote.

Retour arrière GP : réaliaser `dpl_BEESmBgwjEPsECz5kBECKXReFom8`.
