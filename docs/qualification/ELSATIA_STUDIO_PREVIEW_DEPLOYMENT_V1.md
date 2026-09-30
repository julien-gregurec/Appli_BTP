# ELSATIA Studio — Preview dédiée : déploiement & lien de test (V1)

Date : 2026-09-30 · Branche : `claude/charming-allen-k61cec` · Base : `integration/elsatia-canonical-train-v7`
@ `547f0b6f` · Guide utilisateur : `docs/qualification/ELSATIA_STUDIO_PREVIEW_USER_TEST_V1.md`

## Verdict

**STUDIO PREVIEW BLOCKED**

**URL STUDIO PREVIEW : aucune.** Ni `https://studio-preview.elsatia.fr`, ni une URL `*.vercel.app`
n'a pu être produite. Aucune écriture distante n'a eu lieu : aucun Vercel, aucun Supabase, aucune
Production, aucun merge sur `main`.

Blocages distants (aucun ne se règle depuis le dépôt) :

| # | Blocage | Preuve | Levée |
|---|---|---|---|
| B1 | **Réseau** : la politique d'accès sortant de l'environnement de la mission refuse `api.vercel.com`, `vercel.com`, `api.supabase.com`, `supabase.com`, `*.supabase.co`, `elsatia.fr` | `CONNECT tunnel failed, response 403` sur chaque hôte (proxy d'accès sortant) | poste opérateur, ou environnement avec ces hôtes autorisés |
| B2 | **Identifiants** : aucun jeton Vercel ni Supabase dans l'environnement | aucune variable `VERCEL_*` / `SUPABASE_*` | jeton posé dans l'environnement (jamais dans le chat ni le dépôt) |
| B3 | **Projet Supabase Studio Preview inexistant** : l'organisation est à sa limite de 2 projets (GP Preview `pgvvpqyjziyapbbkydmc`, GP Production) | `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` D2 ; `ELSATIA_STUDIO_V3_PORT_HOSTED_READINESS_V1.md` §10.1 | `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` (plan payant ou autre organisation). **Le projet GP partagé n'est jamais une option (B + I1).** |
| B4 | **Pont d'identité côté GP Preview** : la GP Preview doit porter le train V7 (migration `20260927100000_elsatia_identity_broker`, route `/identity/studio/handoff`, JWKS) et ses variables `ELSATIA_IDENTITY_*`, `ELSATIA_STUDIO_EXCHANGE_URL`, `ELSATIA_STUDIO_LIFECYCLE_URL`, `STUDIO_ACCESS_MODE=allowlist` | non vérifiable (B1) | déploiement GP Preview V7 (hors périmètre Studio) — `REMOTE_PROOF_REQUIRED` |
| B5 | **Worker de rendu** : aucun hébergeur décidé | `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` | rendu/export **BLOCKED** en Preview tant que non levé ; le reste de l'UI peut ouvrir |
| B6 | **Redis Preview** : aucune instance | — | instance Preview dédiée `rediss://` (worker uniquement) |
| B7 | **DNS** `studio-preview.elsatia.fr` | non vérifiable (B1) | CNAME vers Vercel ; sinon URL Vercel stable (voir §16) |

Ce qui **est** livré et prouvé : la base la plus qualifiée identifiée et rejouée intégralement sur la
pile réelle dédiée (23/23 E2E, 829/829 pgTAP, 345/345 Vitest, identité 70/70), un **build Studio
en conditions Vercel Preview** (preflight `enforce` : GO), une **garde de cible** qui bloque toute
écriture ne visant pas SUPABASE STUDIO PREVIEW + VERCEL STUDIO PREVIEW, un **smoke distant** prêt
(GO sur la pile réelle), un **script opérateur** (backup, ledger, migrate, env, deploy, alias,
disable, rollback), une garde **e-mail Preview** manquante corrigée dans le code, et le guide utilisateur.

---

## 0. Base

| Vérification | Résultat |
|---|---|
| `git fetch origin` | fait (nouveau : `release/tools-store-preflight-v1`, tag `prelaunch-freeze-2026-08`) |
| Train canonique courant | `integration/elsatia-canonical-train-v7` @ `547f0b6f` (2026-09-28, CANONICAL TRAIN V7 LOCALLY QUALIFIED) |
| Post-H dans V7 ? | **oui** — `38f24ca4 merge(v7): Studio post-H (… @ b91084fc)` |
| Dedicated E2E dans V7 ? | **oui** — `baef9b68 merge(v7): Studio Dedicated E2E (claude/jolly-volta-doejq2 @ a8c09c5a)` ; `jolly-volta` est ancêtre de V7 |
| Choix (priorité 1 de la mission) | **train V7** (contient `jolly-volta` + post-H) — ni `main`, ni l'ancien Studio historique |
| Branche de travail | `claude/charming-allen-k61cec`, repartie de V7 (`git checkout -B`) ; son ancien contenu était déjà dans `main` |
| Migrations Studio dédiées | **21** (`apps/studio/supabase/migrations`) = 9 copies gelées + 12 dédiées (`migration-targets.json`) |
| Branches plus récentes | `busy-ramanujan` (GP), `gracious-curie` (auth GP), `blissful-thompson` (Tools) : hors Studio ; `serene-franklin` (Incident Response) : non porté (§21) |

Commits de cette mission : `ed283c3a` (garde, smoke, kit, garde e-mail, responsive, CI) + ce rapport.

## 1. Architecture conservée (B + I1)

Aucune simplification : projet Supabase Studio **dédié**, identité ELSATIA centrale, échange de jeton
signé ES256 (`aud=studio`, ≤ 60 s), `jti` à usage unique, aucun mot de passe Studio
(`STUDIO_IDENTITY_MODE=local` refusé au build en Preview — prouvé §15), aucune inscription
(`/signup` → `/login`, GoTrue `422 signup_disabled` — prouvé §17), `studio_guard` (garde d'écriture
centrale en base), base métier Studio sans aucune table GP (C4 : 18 tables, toutes `studio_*`).

## 2. Cible Preview

| Élément | Valeur retenue |
|---|---|
| Projet Vercel | `elsatia-studio-preview` (« ELSATIA Studio Preview ») — **à créer** ; Root Directory `apps/studio` ; « Include files outside the Root Directory » **ON** (`packages/*`) ; « Automatically expose System Environment Variables » **ON** (sinon le preflight de build ne voit pas `VERCEL_ENV`) |
| Déploiement | **toujours Preview** (`vercel deploy`, jamais `--prod` : refusé par le script) |
| Domaine | `studio-preview.elsatia.fr` (alias posé sur un déploiement Preview) ; **jamais** `studio.elsatia.fr` (refusé par la garde et le smoke) |
| Repli | URL d'alias de branche Vercel (stable par branche) — une URL de déploiement unitaire change à chaque build et ne peut pas servir d'`ELSATIA_STUDIO_EXCHANGE_URL` |

## 3. Supabase Studio dédié

| Élément | État |
|---|---|
| Projet Studio Preview | **inexistant** (B3) — création préparée : `elsatia-studio-preview`, région **eu-west-3** (comme GP), plan permettant un 3ᵉ projet |
| Project ref | à déclarer par l'opérateur (`STUDIO_PREVIEW_REF`) ; la garde **refuse** `pgvvpqyjziyapbbkydmc` (GP partagé) et `exhvuzegsefmoguxoiak` (Production) |
| Preview vs Production | le projet Studio Preview ne doit servir **que** la Preview (Production = projet distinct, plus tard) |
| Migrations | les 21 dédiées (§6) |
| Storage | buckets `studio-originals`, `studio-renders` créés par migration, privés, 1 Gio ; limite projet ≥ 1 Gio |
| Auth | reporter `apps/studio/supabase/config.toml` : `enable_signup=false`, `jwt_expiry=600`, rotation refresh, `site_url` = origine Studio Preview, `additional_redirect_urls` = `https://studio-preview.elsatia.fr/auth/elsatia/exchange` (+ alias Vercel si utilisé) **seulement** |
| Clés | **format `sb_publishable_` / `sb_secret_` exigé** (le manifeste refuse une clé publique au format JWT : `PF-PUBLIC-VALUE-SECRET-SHAPED`) ; `sb_secret_` = `STUDIO_AUTH_SERVICE_KEY` = `STUDIO_STORAGE_SERVICE_KEY`, serveur seulement |

## 4. Protection Production

`scripts/preview/studio-preview-guard.mjs` (20 tests, CI `studio-dedicated`) — pur, aucune valeur
affichée, **STOP WRITES** au premier doute :

| Code | Contrôle |
|---|---|
| SP-REF-* / SP-SUPABASE-URL | référence Studio déclarée, ≠ GP partagé, ≠ Production, = hôte de `NEXT_PUBLIC_SUPABASE_URL` |
| SP-APP-ENV / SP-VERCEL-ENV | `ELSATIA_APPLICATION_ENV=preview`, `VERCEL_ENV` ∈ {absent, preview} |
| SP-ORIGINE | `NEXT_PUBLIC_STUDIO_URL` HTTPS, = `studio-preview.elsatia.fr` ou `*.vercel.app` ; tout hôte de Production refusé |
| SP-IDENTITY-* / SP-JWKS | mode `elsatia` ; issuer + handoff HTTPS, **même hôte**, hors Production ; JWKS public (clé privée `d` refusée) |
| SP-SERVICE-KEY* / SP-PUBLIC-KEY / SP-NO-SERVICE-IN-BROWSER | clé de service de **ce** projet, paire identique, jamais dans un `NEXT_PUBLIC_*` |
| SP-CRON-SECRET | ≥ 32 caractères, distinct de `CRON_SECRET` GP |
| SP-ENABLED / SP-SIGNUP / SP-AI | Studio activé **sur cette Preview seulement**, inscription `closed`, analyse IA `0` |
| SP-EMAIL | fournisseur ⇒ `EMAIL_PREVIEW_ALLOWLIST` ; `mailpit` refusé |
| SPW-* (worker) | même projet, même clé, `rediss://` avec mot de passe, aucune variable GP, pas `production` |
| SPL-* (`--check-links`) | `apps/studio/.vercel/project.json` = `elsatia-studio-preview` ; `apps/studio/supabase/.temp/project-ref` = ref Studio ; **racine jamais liée au projet Studio** (un `db push` racine y enverrait le train GP) |

Preuves : gabarit vide → 8 échecs, STOP WRITES ; environnement synthétique complet → GO ; `deploy --prod`
→ `REFUS : option Production interdite` (exit 2) ; sans liens → `SPL-VERCEL`, `SPL-SUPABASE-STUDIO` → STOP WRITES.

## 5. Backup / ledger

Aucun projet Studio Preview n'existe (B3) : **aucun ledger distant à lire, aucune donnée à sauvegarder.**
Si un projet est créé puis modifié, `studio-preview-deploy.sh backup` (après garde) produit schéma +
données + `migration list` dans `~/elsatia-studio-preview/backups` (0700, hors dépôt).
Storage n'est **pas** couvert par `db dump` : sauvegarde objets à décider (checklist hébergée §10.5).

Ledger local de référence (ordre = registre attendu ; empreinte = SHA-256 tronqué du fichier) :

| # | Version | Migration | SHA-256 (16) |
|---|---|---|---|
| 1 | 20260912120000 | studio_workspace_foundation | `2506640c784f6f8f` |
| 2 | 20260912140000 | studio_media_upload | `5a28c40f292509be` |
| 3 | 20260912160000 | studio_project_management | `8dda7a6753a02de0` |
| 4 | 20260912230000 | studio_timeline | `52b87c33d7de8310` |
| 5 | 20260913010000 | studio_render_engine | `d36e641901743ed1` |
| 6 | 20260913020000 | studio_templates | `a8b3c0a1ca51b8ad` |
| 7 | 20260913030000 | studio_editor_transactions | `ad568fa6dda86d95` |
| 8 | 20260913040000 | studio_media_analysis | `ca496cf78b1ad172` |
| 9 | 20260922000325 | studio_signup_policy | `a3c1b0d75915a14a` |
| 10 | 20260926120000 | studio_identity_foundation | `93f85bbd235024ab` |
| 11 | 20260927110000 | studio_dedicated_admission | `fa501fe3e7a7460b` |
| 12 | 20260928100000 | studio_db_write_guard | `e3fc904ad07cfefe` |
| 13 | 20260928110000 | studio_rgpd_erasure_foundation | `7d4afeb9bd211c09` |
| 14 | 20260928120000 | studio_storage_write_guard | `21065e4e9132d73a` |
| 15 | 20260929100000 | studio_render_admission | `d5e395ee294e098c` |
| 16 | 20260929110000 | studio_export_profiles | `e244fdd1b3d697bf` |
| 17 | 20260929120000 | studio_brand_kit | `4de8018aa4fe2067` |
| 18 | 20260929130000 | studio_shares_watermark | `fb42f3e801719bbc` |
| 19 | 20260929140000 | studio_audio_music | `40ab82b0b85a0046` |
| 20 | 20260929150000 | studio_invitations | `04653ff699a13c99` |
| 21 | 20260929160000 | studio_post_h_guard_rgpd | `710a9585056f4ad1` |

## 6. Migrations

Appliquées **localement** (PostgreSQL 16, plateforme Supabase minimale, privilèges par défaut d'un
projet hébergé) — distant : non appliquées (B1–B3).

| Contrôle | Résultat |
|---|---|
| Ciblage statique `verify-migrations` + `verify-migration-targets` (T1–T8) + tests | 359 migrations valides · Studio dédié 21 · **7/7** |
| `dedicated-db-check.sh` (chaîne dédiée seule) | 21 appliquées, **aucune GP** |
| Garde de chaîne C1–C5 (banc) | 21/21 dans l'ordre, 18 tables `public` toutes `studio_*`, 75 fonctions exposées classées, **anon : 0** |
| Canaris K1–K5 (migration GP, migration oubliée, RPC non classée, table GP, RPC de pont ouverte) | **5/5 détectés**, base restaurée |
| pgTAP Studio (19 suites : grants, RLS, fonctions, garde, RGPD…) | **829/829** |

Commande distante préparée : `STUDIO_PREVIEW_CONFIRM_MIGRATE=YES scripts/preview/studio-preview-deploy.sh migrate`
(garde → `verify-migration-targets` → `db push --dry-run` → `db push` → `migration list`), `--workdir apps/studio` uniquement.

## 7. Storage

Local, **storage-api réel** v1.79.22 (backend fichier) : upload tus (JPEG, PNG, MP4), URL signée
(200 ; jeton altéré refusé ; accès direct refusé), delete + purge réelle, objet référencé non
supprimable même avec la clé de service, lecture seule (URL signée servie, écritures refusées),
nettoyage par effacement RGPD (originaux + rendus supprimés de storage-api). Anonyme (smoke) :
liste des buckets vide, liste d'objets vide. Fichiers **de test** uniquement (générés par FFmpeg).
Distant : `REMOTE_PROOF_REQUIRED` (backend S3 hébergé non exercé : durabilité, multipart S3).

## 8. Identity B + I1

| Test | Local |
|---|---|
| « Continuer avec mon compte ELSATIA », aucun champ mot de passe | ✓ navigateur réel |
| Échange signé (`aud`, `iss`, ≤ 60 s), jti one-time (rejeu → `REPLAY`), état d'un autre départ → `NONCE_MISMATCH`, signature altérée refusée | ✓ |
| Session existante, logout (sessions GoTrue Studio supprimées) | ✓ |
| Révocation (ban central → événement signé → session fermée, reconnexion refusée, réactivation) | ✓ |
| Réconciliation (webhook perdu → cron → fermée ; `/api/elsatia/reconcile` 401 sans/mauvais secret) | ✓ |
| Suite `@elsatia/identity` (GoTrue/PostgREST réels, 2 projets) | **70 réussis**, 3 e2e ignorés hors app (couverts par Playwright) |
| Smoke post-H GoTrue/PostgREST | **24/24** |

Distant : dépend de B4 (GP Preview V7 + variables). Aucun mot de passe Studio, aucune inscription.

## 9. CORS / redirects

| Cas | Garantie | Preuve |
|---|---|---|
| callback | seul `https://<studio-preview>/auth/elsatia/exchange` en `additional_redirect_urls` ; GP n'envoie qu'à `ELSATIA_STUDIO_EXCHANGE_URL` (valeur fixe, `assertTrustedUrl`) | config + code |
| open redirect | `next` normalisé par `safeStudioDestination` : `//evil.example/x` → `/dashboard` ; `start?next=https://evil.example` ne sort pas vers evil | smoke ST-OPEN-REDIRECT, ST-HANDOFF-START |
| cross-app | exchange sans cookie d'état → `303 /login?error_code=NONCE_MISMATCH`, **aucun cookie de session** | smoke ST-EXCHANGE-NO-STATE |
| CSRF | `POST /api/projects` avec `Origin` étranger → 403 | smoke ST-API-CSRF |
| localhost fallback | `studioOrigin()` refuse tout `http:` hors `localhost/127.0.0.1` ; la garde refuse toute origine non HTTPS | code + garde |
| Preview → Production | garde : issuer/handoff/JWKS/origine sur un hôte de Production → refus ; smoke : aucun lien `href` vers la Production sur `/login` | SP-IDENTITY-URL, ST-LOGIN-PROD-LINKS |
| CORS Storage | CSP `connect-src` limitée à l'origine du projet Studio | en-tête vérifié |

Une GP Preview ne sert **qu'une** URL d'échange : choisir l'URL définitive (domaine ou alias stable) avant de poser `ELSATIA_STUDIO_EXCHANGE_URL`.

## 10. Env Vercel (Preview du projet `elsatia-studio-preview`)

Aucune valeur écrite ici. Gabarit : `apps/studio/.env.preview.example` (mis à jour : décision B + I1
tranchée, e-mail). Poussée par `studio-preview-deploy.sh env` (valeurs jamais affichées).

| Groupe | Variables | Nature |
|---|---|---|
| Supabase Studio | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public (`sb_publishable_`) |
| Service role (serveur) | `STUDIO_AUTH_SERVICE_KEY` = `STUDIO_STORAGE_SERVICE_KEY` | **SECRET** `sb_secret_` |
| Identité | `STUDIO_IDENTITY_MODE=elsatia`, `ELSATIA_IDENTITY_ISSUER`, `ELSATIA_IDENTITY_HANDOFF_URL`, `ELSATIA_IDENTITY_JWKS(_URL)`, `STUDIO_IDENTITY_REVALIDATE_S`, `STUDIO_IDENTITY_MAX_SESSION_S` | public / config |
| Planification | `STUDIO_CRON_SECRET` | **SECRET** |
| Surface | `STUDIO_ENABLED=1`, `STUDIO_SIGNUP_MODE=closed`, `STUDIO_LEGAL_PUBLISHED`, `STUDIO_AI_ANALYSIS=0` | config |
| Environnement | `ELSATIA_APPLICATION_ENV=preview`, `NEXT_PUBLIC_STUDIO_URL` | config |
| E-mail (facultatif) | `STUDIO_MAIL_PROVIDER`, `STUDIO_MAIL_FROM`, `STUDIO_RESEND_API_KEY` (**SECRET**), `EMAIL_PREVIEW_ALLOWLIST` | — |
| Redis / worker | **aucune** côté web (Redis = worker seulement : `STUDIO_REDIS_URL`) | — |

Preuve de build : `VERCEL=1 VERCEL_ENV=preview npm run build` (env synthétique complet, clés
fictives) → preflight `cible preview : mode enforce` **GO**, `verify-identity-mode` OK, `next build`
**OK** ; bundle client : **0** occurrence de la clé de service, du secret cron ou de `sb_secret_`.
Contre-preuve : `STUDIO_IDENTITY_MODE=local` → build refusé (exit 1). Constat : un `STUDIO_CRON_SECRET`
absent ne bloque pas le build (variable d'exécution) — c'est la garde (SP-CRON-SECRET) qui bloque.

## 11. Studio enabled

`STUDIO_ENABLED=1` **uniquement** sur la cible Preview du projet dédié `elsatia-studio-preview`.
Aucun changement sur la Preview générale GP/Tools/Colors/Réserves (Studio y reste exclu/OFF),
aucun changement en Production. Coupe-circuit : `studio-preview-deploy.sh disable` (503 partout).

## 12. E-mail

**Défaut trouvé et corrigé** : le mailer Studio (`STUDIO_MAIL_PROVIDER=resend`) envoyait à n'importe
quel destinataire hors Production — contraire à la règle ELSATIA (`packages/email`) et à la mission.
Correctif : `apps/studio/src/lib/mail-recipients.ts` — hors Production **avérée**
(`ELSATIA_APPLICATION_ENV=production` et `VERCEL_ENV` absent ou `production`), seuls les destinataires
d'`EMAIL_PREVIEW_ALLOWLIST` (adresses exactes, `@domaine` exact, sans joker) reçoivent un e-mail ;
sinon rien n'est envoyé et le lien est affiché à copier. 6 tests (Preview sans liste, domaine exact,
sous-domaine refusé, joker ignoré, Production héritée par une Preview, injection d'en-tête).
Manifeste : `EMAIL_PREVIEW_ALLOWLIST` attribuée à `studio`.

Recette : invitations **par lien affiché** (prouvé E2E, sans fournisseur). Envoi réel :
`REMOTE_PROOF_REQUIRED` + `DECISION_REQUIRED:STUDIO-MAIL-SUBPROCESSOR`.

## 13. Worker

Local : worker réel (`workers/studio-video`, FFmpeg 6.1.1, BullMQ/Redis) — rendu → `completed`,
sortie `studio-renders`, **annulation** en cours (scratch supprimé, rien publié), **révocation** du
compte pendant le rendu (session fermée, pas de nouvelle admission), **publication refusée après
effacement** (garde Storage : aucun bail vivant). Distant : **BLOCKED** (B5, B6). L'UI Preview peut
ouvrir sans worker ; rendu/export sont alors marqués indisponibles dans le guide utilisateur.

## 14. Redis

Local : `redis-server` réel (jobs BullMQ, rendu). Distant : aucune instance (B6). Exigence (garde
SPW-REDIS) : instance **Preview dédiée**, `rediss://` + mot de passe, jamais partagée avec la Production.
Comportement en panne : couvert par les tests worker existants ; distant `REMOTE_PROOF_REQUIRED`.

## 15. Build / tests (rejoués sur cette base)

| Suite | Résultat |
|---|---|
| Studio `typecheck` / `typecheck:e2e-dedicated` / `lint` | OK / OK / OK |
| Studio Vitest | **345/345** (339 + 6 nouveaux e-mail) |
| Studio `next build` en conditions Vercel Preview | **OK** (preflight enforce GO) |
| pgTAP dédié (19 suites) | **829/829** |
| Identité `@elsatia/identity` (pile réelle) | 70 réussis, 3 ignorés ; post-H 24/24 |
| Playwright dédié, pile réelle — passage 1 (base V7) | **21/21** |
| Playwright dédié — passage 2 (avec ce lot) | **23/23** (dont responsive mobile + tablette) |
| Garde de cible + smoke (tests purs) | **20/20** |
| `test:preview-pack` / `test:env-manifest` / `verify:env-manifest` | 30/30 / 67/67 / OK |
| `verify:secrets` / `verify:migrations` / `verify:train-expectations` | aucun secret / OK / OK |

## 16. Deploy Vercel

**Non exécuté** (B1, B2). Procédure (poste opérateur lié, garde à chaque étape) :

```bash
export STUDIO_PREVIEW_ENV_FILE=~/elsatia-studio-preview/studio.env    # hors dépôt, 0600
export STUDIO_PREVIEW_WORKER_ENV=~/elsatia-studio-preview/worker.env  # si worker
export STUDIO_PREVIEW_REF=<ref du projet Supabase Studio Preview>
npx vercel link --cwd apps/studio --project elsatia-studio-preview
npx supabase link --workdir apps/studio --project-ref "$STUDIO_PREVIEW_REF"
S=scripts/preview/studio-preview-deploy.sh
$S guard                                   # GO obligatoire
$S ledger                                  # registre distant (vide sur un projet neuf)
$S backup                                  # si le projet contenait déjà des données
STUDIO_PREVIEW_CONFIRM_MIGRATE=YES $S migrate
$S env                                     # variables Preview Vercel
$S deploy                                  # → https://<deployment>.vercel.app
$S alias https://<deployment>.vercel.app   # → studio-preview.elsatia.fr (DNS : CNAME Vercel)
$S smoke https://studio-preview.elsatia.fr # GO attendu
```

Côté GP Preview (B4) : `ELSATIA_STUDIO_EXCHANGE_URL=https://studio-preview.elsatia.fr/auth/elsatia/exchange`,
`ELSATIA_STUDIO_LIFECYCLE_URL=https://studio-preview.elsatia.fr/api/elsatia/lifecycle`,
`STUDIO_ACCESS_MODE=allowlist` + `STUDIO_ACCESS_ALLOWLIST=<comptes de recette>`.

**Protection de déploiement Vercel** : la protection Preview par défaut exige un compte Vercel
(testeur sur téléphone) et bloquerait le webhook signé `/api/elsatia/lifecycle` et le POST inter-sites
de l'échange. `DECISION_REQUIRED:STUDIO-PREVIEW-DEPLOYMENT-PROTECTION` — choix conservateur proposé :
conserver la protection sur les URL de déploiement, et **ne l'ouvrir que pour le domaine
`studio-preview.elsatia.fr`** (Studio y porte sa propre authentification + `STUDIO_ACCESS_MODE=allowlist`).

**Crons** : Vercel n'exécute pas les crons sur un déploiement Preview. `/api/elsatia/reconcile` et
`/api/elsatia/erasure` (Bearer `STUDIO_CRON_SECRET`) : appel manuel ou planificateur externe pendant la recette.

## 17. Test externe

**Non exécuté** (aucune URL). Préparé : `scripts/preview/studio-preview-smoke.mjs`, exécuté sur la pile
réelle dédiée (`--local-harness`) : **GO, 38 contrôles** (+ 1 informatif) —

- Studio : `/login` 200 avec bouton ELSATIA et sans champ mot de passe ; aucun lien vers la Production ;
  redirection ouverte neutralisée ; CSP `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`,
  `no-store` (+ HSTS exigé en HTTPS) ; `/signup` → `/login` ; 6 pages protégées → `/login` (307 ou
  redirection en flux `loading.tsx`, sans contenu) ; API anonyme 401 ; CSRF 403 ; reconcile/erasure 401 ;
  lifecycle forgé 400 ; exchange sans état → `NONCE_MISMATCH` sans cookie ; départ handoff hors
  Production ; lien public et invitation inventés « indisponible » ; `/s/…/media` 404 ;
  JavaScript servi (8 scripts) sans clé de service ;
- Supabase Studio (clé publique) : `POST /auth/v1/signup` → **422 `signup_disabled`** ; 7 tables
  `studio_*` → 401 anonyme ; 4 RPC → 401/404 ; buckets et objets : listes vides.

Parcours complets avec session (landing → export → logout) : couverts par les 23 scénarios Playwright
dédiés ; à rejouer à la main sur l'URL réelle (guide utilisateur §3).

## 18. Mobile

| Cible | Résultat |
|---|---|
| Desktop Chromium | 21 scénarios dédiés ✓ |
| Mobile 390×844 (émulation tactile, DPR 3) | ✓ connexion ELSATIA, onboarding, tableau de bord, projet (création), éditeur, réglages, membres, Brand Kit, lien public, déconnexion — **aucun débordement horizontal** |
| Tablette 820×1180 (émulation tactile, DPR 2) | ✓ même parcours |
| Safari réel (iOS/macOS) | **non disponible** sur le banc (Chromium uniquement) — `REMOTE_PROOF_REQUIRED` sur l'URL réelle |

## 19. Security (local, pile réelle)

Isolation entre comptes (404/« inaccessible »/API refusée) ; liens publics (secret non stocké,
révocation, URL émise ≤ 60 s, compte coupé → lien coupé, expiration) ; lecture seule (app **et** base :
`STUDIO_READ_ONLY` sur RPC avec le vrai jeton) ; révocation ; Storage (garde, bucket `studio-renders`
serveur seulement) ; RPC service-only (C5 + canari K5) ; **anon : 0 fonction exécutable** ; rejeu
d'identité (`REPLAY`). Distant : `REMOTE_PROOF_REQUIRED` via le smoke §17.

## 20. RGPD

Suppression de compte → sessions invalidées + demande d'effacement (même transaction) ; mode `off` :
**rien exécuté** ; `execute` impossible sans décision écrite ni délai ; effacement complet (base,
storage-api, GoTrue Studio) puis rejeu idempotent ; contenu partagé chez autrui → `awaiting_decision`
(**DECISION_REQUIRED:STUDIO-SHARED-CONTENT-ERASURE**). **Aucune durée légale choisie** (politique
`off` / décision NULL / délai NULL).

## 21. Health

Lot Incident Response **absent** de V7 (branche `serene-franklin-rgu054`, non portée — conformément
à la mission). `/api/health` → 404 (informatif dans le smoke).

## 22. Comptes de recette

Aucun compte créé à distance (aucune cible). À créer sur la **GP Preview** (identité centrale),
jamais de donnée client : `studio-owner`, `studio-member`, `studio-invited`, `studio-revoked` sur un
domaine de recette présent dans `STUDIO_ACCESS_ALLOWLIST` (et `EMAIL_PREVIEW_ALLOWLIST` si e-mail).
Mots de passe : transmis hors dépôt, jamais dans ce rapport. Localement, les comptes sont jetables
(`…@example.test`, mot de passe aléatoire par exécution).

## 23. Lien

**URL STUDIO PREVIEW : aucune — BLOCKED.** Dès le déploiement : renseigner l'URL dans le guide
utilisateur §1, lancer `studio-preview-deploy.sh smoke <url>`, puis déclarer READY FOR USER TEST.

## 26. Rollback

| Niveau | Action | Commande |
|---|---|---|
| Vercel | réattribuer l'alias au déploiement Preview précédent (aucune suppression) | `studio-preview-deploy.sh rollback <url-précédente>` |
| Désactivation Studio Preview | `STUDIO_ENABLED=0` + redéploiement + alias → 503 partout | `studio-preview-deploy.sh disable` |
| Pont d'identité | côté GP Preview : `STUDIO_ACCESS_MODE=closed` (plus aucun passage) | variable GP Preview |
| Base | restauration depuis `~/elsatia-studio-preview/backups/*` (schéma + données) ; **jamais** de suppression d'une base existante sans sauvegarde | `psql` sur le projet Studio Preview seulement, après garde |

Rien n'a été déployé : aucun rollback n'est nécessaire aujourd'hui.

## 27. Livrables de ce lot

| Fichier | Rôle |
|---|---|
| `scripts/preview/studio-preview-guard.mjs` (+ `.test.mjs`) | garde de cible STOP WRITES |
| `scripts/preview/studio-preview-smoke.mjs` | smoke distant anonyme |
| `scripts/preview/studio-preview-deploy.sh` | kit opérateur (jamais `--prod`) |
| `apps/studio/src/lib/mail-recipients.ts` (+ test), `mailer.ts` | allowlist e-mail Preview |
| `apps/studio/e2e-dedicated/specs/09-responsive.spec.ts` | mobile + tablette |
| `apps/studio/.env.preview.example`, `.env.example`, `.gitignore` | gabarits à jour ; lien CLI `supabase/.temp` ignoré |
| `config/env-manifest.json`, inventaire généré, `package.json` (`test:studio-preview`), CI | cohérence |
| `docs/qualification/ELSATIA_STUDIO_PREVIEW_USER_TEST_V1.md` | guide utilisateur |

## Décisions ouvertes

| Décision | Choix conservateur appliqué |
|---|---|
| `PREVIEW-PROJECT-INVENTORY` (3ᵉ projet Supabase) | aucun projet créé ; GP partagé refusé |
| `HOSTING-PROVIDER-STUDIO-WORKER` | rendu/export BLOCKED en Preview |
| `STUDIO-MAIL-SUBPROCESSOR` | aucun e-mail ; lien affiché ; allowlist obligatoire si activé |
| `STUDIO-PREVIEW-DEPLOYMENT-PROTECTION` (nouvelle) | protection conservée hors domaine dédié |
| `STUDIO-SHARED-CONTENT-ERASURE`, durées légales | mode `off`, aucune durée |
