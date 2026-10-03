# ELSATIA V9.2 — Preview : déploiement hébergé et recette (V1)

Date : 2026-10-03 (UTC), environ 21:55 à 23:00. Périmètre : les 4 projets Vercel **Preview** uniquement
(Gestion Pro, Tools, Colors, Réserves), canal `gp-preview-v8`. Base Supabase Preview
`pgvvpqyjziyapbbkydmc`, cutover déjà achevé et validé par l'opérateur (verify-only, code de sortie 0).

**Aucune migration rejouée, aucun `db push`, aucun `--apply-preview`, aucun `migration repair`,
aucune écriture en base, aucune Production, aucun `--prod`, aucun Stripe Live, aucun Studio,
aucun Social, aucune Boutique.** Aucune valeur secrète n'est reproduite dans ce document.

```
CANONICAL_SHA=73d2abf8b5adf84596d95ebefa6cbb939013501d

POST_LEDGER=408
POST_PENDING=0
CODE_DEPLOY_ALLOWED=true (verify-only opérateur, EXIT_CODE=0, cutover-report.json)

VERCEL_QUOTA=EXHAUSTED_AFTER_1_OF_4 (api-deployments-free-per-day 100/100, plan Hobby ; reset 2026-10-04T22:01:12Z)

GP_DEPLOYMENT_ID=dpl_aRc4KwypXikw81VKn5w854PscTK2
GP_DEPLOY_SHA=73d2abf8b5adf84596d95ebefa6cbb939013501d
GP_ALIAS=https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app → dpl_aRc4KwypXikw81VKn5w854PscTK2
GP_SMOKE=SMOKE_PARTIAL (build READY, alias vérifié ; HTTP 302 vers SSO Vercel, aucun jeton de contournement autorisé)

TOOLS_DEPLOYMENT_ID=NOT_DEPLOYED (refus Vercel : quota)
TOOLS_DEPLOY_SHA=NONE
TOOLS_ALIAS=ABSENT (gp-preview-v8 jamais créé sur ce projet ; connexion TLS refusée)
TOOLS_SMOKE=NOT_RUN

COLORS_DEPLOYMENT_ID=NOT_DEPLOYED (refus Vercel : quota)
COLORS_DEPLOY_SHA=NONE
COLORS_ALIAS=ABSENT (HTTP 404)
COLORS_SMOKE=NOT_RUN

RESERVES_DEPLOYMENT_ID=NOT_DEPLOYED (refus Vercel : quota)
RESERVES_DEPLOY_SHA=NONE
RESERVES_ALIAS=ABSENT (HTTP 404)
RESERVES_SMOKE=NOT_RUN

AUTH_PREVIEW=CONFORME (Site URL + 4 redirect URLs gp-preview-v8/** ; rien modifié)
INTER_APP_AUTH=NOT_RUN (3 apps sur 4 non déployées ; SSO Vercel sur GP)
CSP=CODE_PRESENT_NOT_VERIFIED_HOSTED (src/proxy.ts, apps/*/src/proxy.ts ; en-têtes masqués par le SSO)
CORS=CODE_PRESENT_NOT_VERIFIED_HOSTED (TOOLS_ALLOWED_ORIGINS, liste blanche ; JWKS public volontaire)
PUBLIC_SECRET_EXPOSURE=NO (cf. § 6)

FEATURE_AI_ENABLED=false (valeur lue au rapport cutover V1 ; non relue ici, cf. § 3)
FEATURE_AI_DEVIS_ENABLED=PRESENT_VALEUR_ILLISIBLE (sensitive) — inerte, exige FEATURE_AI_ENABLED=true
FEATURE_RELANCES_AUTO_ENABLED=PRESENT_VALEUR_ILLISIBLE (sensitive) — inerte, CRON_SECRET absente de la Preview GP

TYPECHECK=PASS (racine + tools + reserves + colors, SHA 73d2abf8)
LINT=PASS (0 erreur, 15 avertissements préexistants)
TESTS=PASS 5 799 (GP 2 950 + Tools 2 174 + Réserves 239 + Colors 436) ; test:env-manifest 69/70 sur 73d2abf8 → 70/70 après correctif outillage (§ 8)
BUILDS=4/4 PASS en local (GP Turbopack, Tools webpack, Réserves, Colors) ; hébergé 1/4 (GP READY), 3/4 non lancés (quota)

PRODUCTION_TOUCHED=NO
MIGRATIONS_REPLAYED=NO

VERDICT=ELSATIA_V9_2_PREVIEW_HOSTED_BLOCKED
```

## 1. SHA déployé

`73d2abf8` est un descendant direct de `1a638855` (tête de `integration/elsatia-canonical-train-v9.2`
au moment de la mission) : 5 commits, uniquement le pack opérateur et sa documentation
(`scripts/preview/db-verify.mjs`, `scripts/preview/lib/preview-guard.mjs`,
`scripts/preview/preview-pack.test.mjs`, `scripts/preview/v9/v9-cutover.sh`, 2 fichiers
`docs/qualification`). Aucune migration, aucun fichier applicatif. Le commit existe sur
`origin/claude/hopeful-albattani-h8bgnb` ; la branche du train n'a pas encore été avancée jusqu'à lui.

## 2. Pré-check Vercel

| Projet | ID | Root | Protection | Variables | Remarque |
|---|---|---|---|---|---|
| `elsatia-preview` (GP) | `prj_0dX75LBHTxWUYQKle7zNdWdrWctK` | `/` | SSO `all_except_custom_domains` | Preview uniquement | build = preflight env + `build:gestion-pro` |
| `elsatia-tools-preview` | `prj_FkEo06ACHhlNYm7ovYtGVw26u10B` | `apps/tools` | SSO idem | 7 variables, Preview uniquement | créé le 2026-10-03 19:38 UTC |
| `elsatia-colors-preview` | `prj_VBn2udZyyrxvcfph77PwMYkizrSO` | `apps/colors` | SSO idem | 6 variables, Preview uniquement | créé le 2026-10-03 19:38 UTC |
| `elsatia-reserves` | `prj_fh21uFyim0A6i44lu72PhuF7Y3TK` | `apps/reserves` | SSO idem | 5 variables, Preview uniquement | créé le 2026-10-03 19:38 UTC |

- Aucune variable n'a de cible `production` ou `development` sur ces 4 projets.
- Tools, Colors et Réserves ont une commande d'ignore qui **ne construit que** `VERCEL_ENV=preview`
  et `VERCEL_GIT_COMMIT_REF=gp-preview-v8` : toute autre branche est annulée.
- Aucun jeton « Protection Bypass for Automation » n'est configuré sur les 4 projets.
- Anomalie à signaler (non causée par cette mission) : sur Tools et Colors, l'unique déploiement
  existant (`dpl_39iYgMbX…`, `dpl_GPpTqNTY…`, branche `claude/elegant-fermi-s9ld1d`, 20:34 UTC) a la
  cible `production` et a échoué (`NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST`, le commit 1fb6ebb0 ne
  contenait pas `apps/tools` / `apps/colors`). Il a reçu l'alias de production par défaut
  `elsatia-*-preview-julien-gregurec1.vercel.app` mais, en échec, ne sert rien. Rien n'a été modifié.

### Quota

Le premier `POST /v13/deployments` (GP) a été accepté. Les trois suivants ont été refusés aussitôt
par Vercel :

```
payment_required — api-deployments-free-per-day — total 100, remaining 0
reset = 1791151272399 ms = 2026-10-04T22:01:12Z (Tools), 22:01:13Z (Colors), 22:01:15Z (Réserves)
```

Le déploiement GP a donc consommé le dernier créneau de la fenêtre glissante de 24 h. Aucun
contournement tenté : pas de push sur la branche `gp-preview-v8` pour déclencher un build Git, pas de
réutilisation d'un build antérieur, pas de modification d'alias.

## 3. Variables Preview (noms et types, sans valeurs)

GP : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_REF`,
`SUPABASE_SERVICE_ROLE_KEY`, `BANK_DATA_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_EXPECTED_MODE`, `FEATURE_AI_DEVIS_ENABLED`, `FEATURE_RELANCES_AUTO_ENABLED` sont de
type *sensitive* (illisibles par conception) ; `FEATURE_AI_ENABLED`, `ABONNEMENTS_PUBLICS_OUVERTS`,
`ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, `LEGAL_TVA_REGIME_CONFIRME`, `TOOLS_STORE_ENVIRONMENT` sont
*encrypted*.

DECISION_REQUIRED : la relecture déchiffrée des variables *encrypted* a été refusée par la politique
de l'environnement d'exécution (protection contre la matérialisation d'identifiants). Les valeurs
non secrètes n'ont donc **pas** été relues dans cette mission. Choix conservateur : s'appuyer sur la
lecture du rapport cutover V1 (`FEATURE_AI_ENABLED=false`) et sur les gardes du code :

- `FEATURE_AI_DEVIS_ENABLED` : `src/lib/preview-features.ts` exige aussi `FEATURE_AI_ENABLED=true`.
- `FEATURE_RELANCES_AUTO_ENABLED` : envoi seulement via `/api/cron/abonnements`, qui répond 503 sans
  `CRON_SECRET` ; `CRON_SECRET` reste absente de la Preview GP (vérifié dans la liste des noms), et
  Vercel ne déclenche pas les crons sur un déploiement Preview.
- `BANK_DATA_ENCRYPTION_KEY` et `SUPABASE_SERVICE_ROLE_KEY` : présentes, *sensitive*, jamais lues.
- Le preflight du build Vercel GP (`check-env-manifest --auto --app gestion_pro`, mode enforce) a
  rendu « GO : aucune erreur » ; les seuls avertissements portent sur des `NEXT_PUBLIC_*` hors
  manifeste (variables système Vercel, `NEXT_PUBLIC_GP_PREVIEW_BADGE`, `NEXT_PUBLIC_GP_DEMO_EMAIL`).

Action humaine à prévoir : vérifier depuis le tableau de bord Vercel les valeurs de
`ABONNEMENTS_PUBLICS_OUVERTS`, `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, `LEGAL_TVA_REGIME_CONFIRME`
(attendu `false`) et `TOOLS_STORE_ENVIRONMENT` (attendu `sandbox`).

## 4. Déploiement

| App | Projet | DEPLOYMENT_ID | DEPLOY_SHA | TARGET | ALIAS | BUILD_STATUS |
|---|---|---|---|---|---|---|
| GP | `elsatia-preview` | `dpl_aRc4KwypXikw81VKn5w854PscTK2` | `73d2abf8…` | preview | `elsatia-preview-git-gp-preview-v8-…` → ce déploiement | READY |
| Tools | `elsatia-tools-preview` | — | — | — | absent | NOT_STARTED (quota) |
| Colors | `elsatia-colors-preview` | — | — | — | absent | NOT_STARTED (quota) |
| Réserves | `elsatia-reserves` | — | — | — | absent | NOT_STARTED (quota) |

Méthode : `POST /v13/deployments` avec `gitSource = {github, repoId 1296945609, ref gp-preview-v8,
sha 73d2abf8…}`, sans champ `target` (donc Preview). Le build GP a cloné « Branch: gp-preview-v8,
Commit: 73d2abf », passé le preflight d'environnement, compilé (Next.js 16.3.8, 39 pages statiques)
et a été déployé ; l'alias de branche a basculé de `dpl_BEESmBgw…` (53b4bc76) vers le nouveau
déploiement. La branche Git `gp-preview-v8` elle-même n'a pas été poussée (elle reste à 53b4bc76).

## 5. Auth Supabase Preview

Lu via l'API de gestion Supabase, sans modification :

- Site URL : `https://elsatia-preview-git-gp-preview-v8-julien-gregurec1.vercel.app`
- Redirect URLs : les 4 motifs `https://elsatia-{preview,tools-preview,colors-preview,reserves}-git-gp-preview-v8-julien-gregurec1.vercel.app/**`

Conforme. L'alias GP est inchangé, donc aucune modification nécessaire.

## 6. Sécurité

- Bundles hébergés : non téléchargeables (SSO Vercel ; l'API ne fournit pas l'arborescence d'un
  déploiement Git). PUBLIC_SECRET_EXPOSURE est établi sur le code du SHA déployé :
  build local des 4 apps du SHA déployé avec des valeurs sentinelles pour
  `SUPABASE_SERVICE_ROLE_KEY`, `BANK_DATA_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_ABONNEMENT_SECRET`, `OPENAI_API_KEY`, `RATE_LIMIT_HMAC_KEY`,
  `ELSATIA_IDENTITY_SIGNING_KEYS`, `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` ; scan de
  `.next/static` (et `apps/tools/public`) : **0 occurrence** des sentinelles, de `sk_test_`/`sk_live_`,
  `whsec_`, `service_role` ou d'un bloc `PRIVATE KEY`. La sentinelle service_role n'apparaît pas non plus
  dans `.next/server` (lecture à l'exécution, jamais inlinée). Seul hôte Supabase présent dans les
  bundles : `pgvvpqyjziyapbbkydmc.supabase.co`. Les littéraux `*.elsatia.fr` présents viennent de
  `packages/application-access/src/navigation.ts` (constantes servant à **reconnaître et refuser** un
  hôte de Production, fail-closed) et des replis Tools (`apps/tools/src/lib/site.ts`), surchargés par
  `NEXT_PUBLIC_TOOLS_URL` en Preview : aucun appel vers la Production. `verify:secrets` : 3 978 fichiers
  suivis, aucun secret.
- `src/lib/supabase/admin.ts` : 60 importeurs, aucun composant `"use client"` ; le preflight
  `check-env-manifest` rejette déjà statiquement tout import de ce module depuis un composant client
  (test dans `scripts/check-env-manifest.test.mjs`). Correctif de défense en profondeur ajouté **sur la branche de
  qualification, non déployé** (le SHA déployé reste 73d2abf8) : `import "server-only";` en tête de
  `src/lib/supabase/admin.ts`. Un import client échoue désormais aussi à la compilation Next. Aucun
  changement métier ; vitest a déjà un alias `server-only` vers un stub. Validation : `tsc` PASS,
  vitest GP 2 950 PASS, eslint PASS.
- CSP : nonce + `strict-dynamic` posés par `src/proxy.ts` (GP) et `apps/*/src/proxy.ts`.
  CORS : `TOOLS_ALLOWED_ORIGINS` (liste blanche, `src/lib/tools-monetization.ts`) ; seul
  `/api/elsatia-identity/jwks` est en `*`, ce qui est voulu pour une clé publique. Vérification des
  en-têtes hébergés impossible derrière le SSO.

## 7. Recette hébergée

| URL | HTTP_STATUS | LOGIN_STATUS | CALLBACK_STATUS | RUNTIME_ERRORS | CONSOLE_ERRORS | API_ERRORS |
|---|---|---|---|---|---|---|
| GP | 302 → `vercel.com/sso-api` | NOT_RUN (SSO) | NOT_RUN | aucune au build | NOT_RUN | NOT_RUN |
| Tools | connexion TLS refusée (alias inexistant) | NOT_RUN | NOT_RUN | — | — | — |
| Colors | 404 (alias inexistant) | NOT_RUN | NOT_RUN | — | — | — |
| Réserves | 404 (alias inexistant) | NOT_RUN | NOT_RUN | — | — | — |

SMOKE_PARTIAL pour GP. Action humaine nécessaire : soit une recette navigateur par un compte membre
de l'équipe Vercel, soit l'activation explicite d'un jeton « Protection Bypass for Automation » sur
les 4 projets Preview (décision humaine, non prise ici).

Tests inter-app (GP → Tools / Colors / Réserves, logout, redirections) : non exécutés, 3 apps sur 4
non déployées. L'architecture reste une session par application.

## 8. Qualification code (SHA 73d2abf8, conteneur)

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` (4 apps) | PASS |
| `npm run lint` (4 apps) | PASS, 0 erreur, 15 avertissements |
| `npm test` (4 apps) | PASS : 2 950 + 2 174 + 239 + 436 = **5 799** (1 échec attendu, 194 ignorés côté GP) |
| builds locaux | 4/4 PASS |
| `test:preview-pack` | 39/39 |
| `test:preview-v9` | 29/29 |
| `test:env-manifest` | **69/70 sur 73d2abf8** → 70/70 après correctif |
| `verify:env-manifest` | OK, 14 DECISION_REQUIRED non bloquantes |
| `test:migration-targets` / `verify:migrations` | 7/7 ; 408 migrations partagées |
| `test:preflight-preview`, `test:seeds`, `test:dr-guard`, `test:bank-keys`, `test:production-v9x-preflight` | 5/5, 48/48, 10/10, 1/1, 39/39 |
| `verify:secrets` | aucun secret |
| `verify:stripe-prices` | SKIP (pas de clé Stripe dans le conteneur) |

**Régression trouvée dans 73d2abf8 (outillage seulement)** : le commit b165d83e introduit la constante
`ELSATIA_READ_ONLY_NON_EFFECTIF` dans `scripts/preview/db-verify.mjs`. Le scanner du manifeste la
prend pour une variable inconnue (`ENV-UNKNOWN`) et le test « dépôt réel : code, gabarits et manifeste
concordent » échoue. `npm test` n'exécute pas ce test, ce qui explique les 5 799 PASS. **Impact sur le
déploiement : aucun.** Le preflight du build Vercel GP est en mode `--auto` (contrôle des variables,
pas du code) et a rendu « GO : aucune erreur ». Correctif sur la branche de qualification, non
déployé : ajout du nom aux `scan.ignored_literals` de `config/env-manifest.json`, avec justification,
comme les autres codes d'erreur déjà listés.

## 9. Prochaine action

1. Après **2026-10-04T22:01:15Z**, relancer uniquement les 3 déploiements restants avec la même
   méthode (§ 4), dans l'ordre Tools, Colors, Réserves (1 build concurrent sur Hobby).
2. Vérifier que les 3 alias `*-git-gp-preview-v8-*` sont créés et pointent sur 73d2abf8.
3. Recette navigateur des 4 URLs par un membre de l'équipe Vercel (SSO), puis tests inter-app.
