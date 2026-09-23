# ELSATIA — Preview Go-Live Checklist (Refresh V1)

Date : 2026-09-23
Portée : local → première vraie qualification **Preview** (Vercel Preview + projet Supabase réel + Stripe test + éventuel Docker/Redis).
Aucun déploiement, aucune modification distante, aucune production n'a été effectué(e) pour produire ce document.

## Méthode et baseline

`main` (et la branche de travail historique `claude/serene-turing-ekxjoo`) n'était qu'un sous-ensemble mono-app de l'historique réel. Après `git fetch --all --prune`, le monorepo ELSATIA (`apps/studio`, `apps/tools`, `apps/reserves`, `apps/colors`, `workers/studio-video`, `config/env-manifest.json`) a été localisé sur plusieurs branches distantes. Deux branches récentes et divergentes contiennent chacune des rapports de qualification que l'autre n'a pas :

- `origin/claude/loving-turing-aaopod` (dernier commit 2026-09-22 14:16)
- `origin/claude/zen-goodall-n3opdc` (dernier commit 2026-09-22 12:57)

Les deux partent du même ancêtre commun `842b4b4f` ("converge Studio/Tools/Reserves isolation + qualification finale"). Les rapports présents sur les deux branches sont strictement identiques (diff vide) ; seuls des rapports supplémentaires distincts existent de chaque côté. **Aucune des deux lignes de code n'a été fusionnée.** Cette branche de documentation (`claude/serene-turing-ekxjoo`) a été recréée depuis `842b4b4f` exactement, et ce fichier est le seul ajout.

Rapports consultés (lecture seule, extraits via `git show`) :

- Communs aux deux branches : `ELSATIA_ENV_MANIFEST_AND_CI_V1`, `ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT`, `ELSATIA_GP_EXTERNAL_PILOT_CLOSURE_V1`, `ELSATIA_GP_NUMBERING_OVERFLOW_FIX_V1`, `ELSATIA_GP_PERFORMANCE_CAPACITY_V1`, `ELSATIA_RESERVES_TURBOPACK_SENTRY_ISOLATION_V1`, `ELSATIA_SECURITY_BLOCKERS_REMEDIATION_V1`, `ELSATIA_STUDIO_BUILD_ISOLATION_V1`, `ELSATIA_STUDIO_ENV_MANIFEST_FIX_V1`, `ELSATIA_STUDIO_RUNTIME_CONFIG_WIRING_V1`, `ELSATIA_TOOLS_RESERVES_POSTCSS_ISOLATION_V1`, `ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1`.
- Uniquement sur `loving-turing-aaopod` : `ELSATIA_EXTERNAL_PILOT_ACCEPTANCE_PACK_V1`, `ELSATIA_EXTERNAL_PILOT_FULL_REHEARSAL_V2`, `ELSATIA_PILOT_ACCEPTANCE_AUTOMATION_V2`, `ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3`, `ELSATIA_PILOT_AUTH_POSTGREST_ACCEPTANCE_AUTOMATION_V1`.
- Uniquement sur `zen-goodall-n3opdc` : `ELSATIA_DR_EXACT_TIP_V2`, `ELSATIA_POST_QUALIFICATION_FIX_CONVERGENCE_V1`, `ELSATIA_PREVIEW_BLOCKERS_CLOSURE_V1`, `ELSATIA_RGPD_DATA_LIFECYCLE_CLOSURE_V3`, `ELSATIA_SECURITY_TENANT_RED_TEAM_V3`, `ELSATIA_STRIPE_CONNECT_BOUTIQUE_WEBHOOK_CLOSURE_V1`, `ELSATIA_STUDIO_AUTH_CLOSED_SIGNUP_HARDENING_V1`, `ELSATIA_STUDIO_VIDEO_WORKER_REAL_BASELINE_V2`, `ELSATIA_TOOLS_ENTITLEMENT_CLOUD_SYNC_CLOSURE_V1`.

**Constat transversal majeur** : dans les ~29 rapports lus, **aucun n'a jamais atteint un vrai environnement Preview, un vrai projet Supabase, un vrai Stripe test, ni Docker** (registres bloqués par la politique réseau du sandbox). Toute la qualification "locale" repose sur un harnais Postgres 16 + pgTAP reconstruit à la main, ou des mocks (GoTrue, PostgREST, Storage) — explicitement documentés comme non équivalents à l'infra réelle.

## Légende des statuts

`READY LOCALLY` · `REQUIRES REMOTE PROOF` · `REQUIRES SECRET` · `REQUIRES MANUAL CONFIG` · `BLOCKER` · `NON-BLOCKER`

## Checklist par domaine

### GESTION PRO

| Point | Statuts | Constat |
|---|---|---|
| Numérotation devis/factures/avoirs/commandes (overflow >999) | READY LOCALLY | Bug racine (`lpad()`) corrigé, 299/299 + 15/15 pgTAP, tests de concurrence réels. Verdict source : `NUMBERING OVERFLOW FIX QUALIFIED`. |
| Performance / capacité pilote | REQUIRES REMOTE PROOF · NON-BLOCKER | Deadlock paiement et N+1 RLS corrigés ; Dashboard reste lent (1.7–1.8s) non corrigé ; coût RLS par ligne (~0.35–0.5ms) reste le goulot dominant. Verdict : `PILOT CAPACITY READY` (pas "qualifié 40 utilisateurs"). |
| Pilote externe (accès client) | BLOCKER | Verdict explicite `NOT READY`. P0 corrigés (liens de partage publics, TOCTOU paiement, double avoir, auto-promotion admin) mais **les 7 nouvelles suites pgTAP + Fresh/Upgrade n'ont jamais tourné**. Aucun flux d'acceptation client réel (seulement changement de statut admin interne). |
| Exposition RGPD table `employes` | BLOCKER | Vue de restriction ajoutée mais la policy sur la table de base n'a pas été retouchée — exposition partiellement ouverte. |
| Verdict omnibus (`CONVERGENCE_TRAIN_V1_REPORT`) | BLOCKER | `PREVIEW DEPLOYMENT CANDIDATE` (jamais `PREVIEW QUALIFIED`) à SHA `d4b9c79` ; `FINAL_PREVIEW_TRAIN = NOT_YET`. |
| Régression Stripe/webhook Boutique post-fix | BLOCKER | `ELSATIA_POST_QUALIFICATION_FIX_CONVERGENCE_V1` : `boutique_finaliser_commande_payee` n'est plus idempotent sous le nouveau trigger de sécurité — un webhook Stripe redélivré échoue au lieu d'être un no-op. Verdict : `POST-FIX TRAIN BLOCKED`, à corriger avant tout déploiement. |

### COLORS

| Point | Statuts | Constat |
|---|---|---|
| Qualification dédiée | **BLOCKER** | **Aucun rapport de qualification dédié à `apps/colors` n'existe sur ces deux branches** (confirmé par recherche exhaustive `grep -ril "colors"`). Colors n'apparaît qu'en mention incidente dans des tableaux non-régression d'autres rapports (Tools). Ces mentions ne constituent pas une preuve de qualification et ne doivent pas être traitées comme telles. |
| Vercel — fichiers hors racine | REQUIRES MANUAL CONFIG | `ELSATIA_PREVIEW_BLOCKERS_CLOSURE_V1` : l'option Vercel "Include files outside of Root Directory" doit être activée pour Colors (dépendance `packages/*` en `file:`). |

### TOOLS

| Point | Statuts | Constat |
|---|---|---|
| Isolation build (fuite PostCSS racine) | READY LOCALLY | Corrigé via `apps/tools/postcss.config.mjs` vide. Local : typecheck/lint OK, vitest 1992/1992, build 47/47 pages. |
| Entitlement cloud-sync (P0 sécurité) | REQUIRES REMOTE PROOF | Bug : utilisateur Free pouvait synchroniser via une org sans entitlement Pro personnel. Corrigé par migration `20260922000325` (RLS + RPC `tools_a_droit_cloud_sync`), pgTAP 16/16 après fix — **mais sur harnais Postgres reconstruit à la main**, jamais sur vrai Supabase (`supabase start` bloqué, 403 proxy sur `pkg-containers.githubusercontent.com`). |
| Cache d'entitlement côté client | NON-BLOCKER | `entitlements.ts` (cache HMAC, grâce offline 7 jours) non audité ; UX de refus non vérifiée en navigateur réel. |
| Variable de contournement local | REQUIRES MANUAL CONFIG | `NEXT_PUBLIC_TOOLS_ENV` est un bypass de build **local uniquement** — à ne pas définir sur Preview. Les vraies variables `NEXT_PUBLIC_*` Supabase/facturation attendues par `verify:public-env` ne sont pas encore listées nommément dans les rapports disponibles. |

### RESERVES

| Point | Statuts | Constat |
|---|---|---|
| Isolation build (PostCSS + Turbopack/Sentry) | READY LOCALLY | Fuite PostCSS corrigée ; fuite de config Sentry de Gestion Pro via `turbopack.root` corrigée par `apps/reserves/src/instrumentation.ts` vide. Local : typecheck/lint OK, vitest 178/178, build OK. |
| Auth / Storage / multi-tenant sur Preview | REQUIRES REMOTE PROOF | Le rapport source précise explicitement n'avoir vérifié ni simulé aucune de ces conditions — verdict volontairement en-deçà de "PREVIEW CANDIDATE". |
| Télémétrie d'erreur (Sentry) | NON-BLOCKER | Absente par choix produit assumé, pas un oubli technique. |
| Variable de contournement local | REQUIRES MANUAL CONFIG | `ELSATIA_APPLICATION_ENV` est un bypass local ; noms de variables Preview réelles non encore énumérés. |

### STUDIO

| Point | Statuts | Constat |
|---|---|---|
| Build (fuite PostCSS racine) | READY LOCALLY | `apps/studio/postcss.config.mjs` vide ajouté. `npm run build` OK (12 routes), typecheck/lint/test 260/260. |
| Câblage runtime (kill switch, signup) | READY LOCALLY | `STUDIO_SIGNUP_MODE`, `STUDIO_SIGNUP_ALLOWLIST`, `STUDIO_LEGAL_PUBLISHED` câblés fail-closed côté serveur ; `STUDIO_ENABLED` câblé fail-open (kill switch) dans `proxy.ts`. `RESEND_API_KEY`, `STUDIO_MAIL_PROVIDER`, `STUDIO_MAIL_FROM`, `STUDIO_LEGAL_TEXT_VERSION` retirés du manifeste (aucun code consommateur). |
| Contournement du garde-fou de signup | REQUIRES REMOTE PROOF | Le garde côté Server Action seul était contournable par appel direct à l'Auth Supabase (SDK/REST). Fermé par migration SQL `20260922000323_studio_signup_policy.sql`, prouvé par 72/72 assertions pgTAP **sur harnais local**, jamais contre un vrai GoTrue/Supabase (pas de Docker dans le sandbox). |
| Décision produit signup | **BLOCKER** | `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` (ouvert vs fermé) et `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` non tranchées. Le rapport source est explicite : "ne pas exposer Studio publiquement avant que ceci soit décidé." |
| Redirect URLs Auth par app | REQUIRES MANUAL CONFIG | Supabase Dashboard → Authentication → URL Configuration doit être positionné par projet Preview (Studio et les 3 autres apps) — `config.toml` ne gouverne que l'instance locale. |

### STUDIO WORKER (`workers/studio-video`)

| Point | Statuts | Constat |
|---|---|---|
| Qualité de code | READY LOCALLY | Typecheck/lint OK ; 26/26 tests réels passent une fois exécutés avec un binaire ffmpeg complet (le ffmpeg-static du sandbox n'a pas `drawtext` — contournement documenté via Dockerfile Debian/apt + assertion au build). |
| Build Docker | **BLOCKER · REQUIRES REMOTE PROOF** | `docker build` n'a jamais été exécuté (registre Docker Hub bloqué dans le sandbox). |
| Bout-en-bout (e2e-gate.mjs) | **BLOCKER · REQUIRES REMOTE PROOF** | Jamais exécuté avec Postgres/Redis réels ; RPC `studio_claim_render`/`dispatch`/`complete` jamais testées contre un vrai Postgres ; injection d'échec Storage/callback non testée. |
| Hébergement | **BLOCKER** | `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` non tranchée — ce n'est pas une fonction serverless Vercel, il faut un hôte conteneur longue durée. |
| Secrets/variables worker | REQUIRES SECRET | `STUDIO_STORAGE_SERVICE_KEY` (= service_role Supabase, nom historique), `STUDIO_REDIS_URL` (peut embarquer un mot de passe). Config non-secrète : `STUDIO_AI_ANALYSIS`, `STUDIO_ANALYSIS_PYTHON`, `STUDIO_ANALYSIS_CONCURRENCY`, `STUDIO_ANALYSIS_TIMEOUT_SECONDS`, `STUDIO_FFMPEG_PATH`, `STUDIO_FFPROBE_PATH`, `STUDIO_RENDER_TIMEOUT_SECONDS`. |

### SUPABASE

| Point | Statuts | Constat |
|---|---|---|
| Fuite service_role côté client | READY LOCALLY | `SUPABASE_SERVICE_ROLE_KEY` confirmé strictement serveur par grep exhaustif. |
| Stack Supabase réelle | **BLOCKER · REQUIRES REMOTE PROOF** | Aucune session n'a jamais atteint la stack Supabase officielle ni Docker (registre ECR bloqué par la politique réseau). Tout pgTAP/Fresh/Upgrade tourne sur un harnais Postgres+pgTAP reconstruit à la main (auth/storage simulés) — explicitement non équivalent. Action requise : `supabase start` + `supabase test db` réels, puis rejeu de toutes les suites pgTAP (dont les 7 nouvelles pilote) et Fresh/Upgrade sur un vrai projet. |
| Purge RGPD (fonctions SQL) | **BLOCKER · REQUIRES REMOTE PROOF** | `purge_entreprises_progres`, `purger_table_entreprise`, etc. écrites mais leur suite pgTAP n'a jamais été exécutée. |
| Convention de nommage des clés publiques | NON-BLOCKER | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy, encore utilisé ex. Reserves) coexistent avec `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (canonique, apps/tools) — cohérence multi-app à vérifier avant Preview. |
| Buckets Storage (18 au total) | REQUIRES REMOTE PROOF | Créés par migrations (12–13 pour Gestion Pro : `documents-employes`, `chantier-documents`, `bulletins-paie`, etc.) ; policies vérifiées uniquement via RLS du mock local, jamais sur un vrai service Storage/Preview. |

### STRIPE

| Point | Statuts | Constat |
|---|---|---|
| Webhook Connect + Boutique (P1, cassé depuis migration 255) | READY LOCALLY | `GRANT INSERT` manquant sur `stripe_webhook_events` + 3 RPC manquantes. Corrigé par migration `20260922000324`, rejoué avec preuves d'exploit réelles et 0 régression pgTAP. |
| Idempotence après échec ("D3") | NON-BLOCKER | Laissé ouvert délibérément, plan de correction documenté. |
| Idempotence `boutique_finaliser_commande_payee` | **BLOCKER** | Cf. Gestion Pro ci-dessus — régression trouvée après le fix Stripe, redélivrance webhook non idempotente. |
| 8 autres flux cassés depuis migration 255 | BLOCKER (hors périmètre de ces rapports) | Paie, relances, Powens, push — encore ouverts, non traités par les rapports lus. |
| `verify:stripe-prices` (gate CI) | REQUIRES SECRET | Jamais confirmé vert — nécessite `STRIPE_SECRET_KEY` (test), disponible seulement dans l'environnement GitHub `ci-verification`, absent de tous les sandboxes testés. |
| Mode webhook par environnement | REQUIRES MANUAL CONFIG | `STRIPE_WEBHOOK_EXPECTED_MODE` doit être positionné explicitement à `test` pour chaque déploiement Vercel Preview — aucun mécanisme automatique. |
| Secrets Stripe (noms uniquement) | REQUIRES SECRET | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_BOUTIQUE_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_TOOLS_SECRET_KEY`, `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64`. |
| Rejeu attendu sur Preview | REQUIRES REMOTE PROOF | `stripe listen` / `stripe trigger` réels contre le déploiement Preview, sur les 3 endpoints webhook (Connect, Boutique, abonnement). |

### AUTH

| Point | Statuts | Constat |
|---|---|---|
| AAL2/MFA sur RPC admin plateforme sensibles | REQUIRES REMOTE PROOF | Uniquement simulé localement via GUC Postgres ; l'émission MFA réelle par GoTrue n'est pas prouvée à distance. |
| Contournement signup Studio | Cf. section STUDIO | — |
| Red team multi-tenant | READY LOCALLY (avec réserve) | `ELSATIA_SECURITY_TENANT_RED_TEAM_V3` : 3 vulnérabilités P0/P1 cross-tenant réelles trouvées et corrigées (capacité payante auto-octroyée, forge de réconciliation Stripe cross-tenant, commande Boutique validée sans paiement), fermées par migration `20260922000323`. Verdict au moment du rapport : `SECURITY BLOCKERS OPEN` (dépendait du fix webhook Stripe, depuis fermé — cf. STRIPE). |
| Régression fonctions admin plateforme | READY LOCALLY | CVE js-yaml corrigée (pin 4.3.2) ; 2 fonctions `SECURITY DEFINER` retirées d'`anon` ; garde AAL2/lock/owner restaurée sur `plateforme_ajouter_admin`/`retirer_admin`. |

### STORAGE

| Point | Statuts | Constat |
|---|---|---|
| Mock Storage local | READY LOCALLY | `local_storage_mock.mjs` : vraies tables `storage.objects`/`storage.buckets` + vraie RLS, mais octets sur disque local (pas S3). A permis de fermer DP-03 (justificatif note de frais) et PE-05 (purge RGPD) — **localement seulement**. |
| Service Storage réel | **BLOCKER · REQUIRES REMOTE PROOF** | Jamais atteint (pas de binaire téléchargeable, registre Docker plafonné) avant la construction du mock. Policies des 18 buckets jamais vérifiées sur un vrai service Storage/projet Preview. |
| Restauration Storage (DR) | REQUIRES REMOTE PROOF | Procédure documentée uniquement, jamais exercée avec du contenu binaire réel. |

### EMAIL

| Point | Statuts | Constat |
|---|---|---|
| Fournisseur transactionnel | REQUIRES SECRET | **Brevo**, nommé explicitement (checklist d'incident, `BREVO_API_KEY`). |
| Livraison réelle | REQUIRES REMOTE PROOF | Jamais vérifiée bout-en-bout — flux testés avec Brevo mocké en vitest (`documents-envoi.test.ts`). "Réception e-mail réelle non vérifiable" est écrit explicitement dans un des rapports. |
| Référence des emails envoyés | NON-BLOCKER | `docs/operations/MATRICE_EMAILS_V1.md` cité comme référence des déclenchements. |
| Magic link / activation | REQUIRES REMOTE PROOF | Dépend de la même livraison Brevo réelle, non vérifiable hors Preview. |

### VERCEL

| Point | Statuts | Constat |
|---|---|---|
| Cron jobs | READY LOCALLY | `vercel.json` (région `fra1`) définit 3 crons (`/api/cron/abonnements`, `/api/cron/notifications-push`, + un dans apps/reserves) — versionnés, se reconstruisent automatiquement au redeploy. |
| Garde env-manifest au build | **BLOCKER** | `scripts/check-env-manifest.mjs` tourne en pré-`npm ci` mais en mode **rapport, non bloquant** — un build Vercel ne serait PAS arrêté par une variable manquante ou incohérente. Décision `D-PREFLIGHT` (passer en mode bloquant) non tranchée. |
| Domaines / DNS / SSL / protection de déploiement | REQUIRES MANUAL CONFIG | Réglages uniquement dashboard, non versionnés dans le repo ; aucun rapport ne décrit un test réel de "deployment protection" ni d'URL Preview obtenue. |
| Fichiers hors racine (monorepo) | REQUIRES MANUAL CONFIG | Option "Include files outside of Root Directory" à activer pour Colors/Studio/Reserves (dépendances `packages/*` en `file:`). |
| Rattachement projet / sync des variables | REQUIRES REMOTE PROOF | Aucun rapport ne décrit le linking du projet Vercel ni la synchronisation effective des variables d'environnement. |

### REDIS

| Point | Statuts | Constat |
|---|---|---|
| Utilisation par Gestion Pro / Tools / Reserves / Colors | NON-BLOCKER | Aucune mention de Redis dans les 8 rapports pilote/infra dédiés — le rate limiting applicatif est en base (`rate_limits_applicatifs`, `src/lib/security/rate-limit.ts`), pas Redis. |
| Utilisation par Studio Worker | **BLOCKER · REQUIRES SECRET · REQUIRES MANUAL CONFIG** | `STUDIO_REDIS_URL` requis par le worker vidéo (file de rendu) ; provisionnement d'une instance Redis jamais fait ; dépend de la décision d'hébergement du worker (cf. STUDIO WORKER). |

## Secrets et configurations requis (noms uniquement — aucune valeur)

**Stripe** : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_BOUTIQUE_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_TOOLS_SECRET_KEY`, `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64`, `STRIPE_WEBHOOK_EXPECTED_MODE` (config, pas un secret, mais à positionner manuellement par environnement).

**Supabase** : `SUPABASE_SERVICE_ROLE_KEY`, secret JWT Supabase, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (canonique).

**Studio Worker** : `STUDIO_STORAGE_SERVICE_KEY`, `STUDIO_REDIS_URL`.

**Paiement / banque** : `BANK_DATA_ENCRYPTION_KEY` (signalé comme le plus critique — chiffrement IBAN, aucune procédure de rotation ne existe encore), `POWENS_CLIENT_SECRET`.

**Notifications / IA / observabilité** : `VAPID_PRIVATE_KEY`, `BREVO_API_KEY`, `OPENAI_API_KEY` (fonctionnalités IA — DV-11/MS-04/DOC-02 restent `REMOTE_ONLY` sans elle), `SENTRY_AUTH_TOKEN`, un compte de service Google (mentionné, usage non détaillé dans les extraits lus).

**Déprécié / à ne pas fournir** : `RESEND_API_KEY`, `STUDIO_MAIL_PROVIDER`, `STUDIO_MAIL_FROM`, `STUDIO_LEGAL_TEXT_VERSION` — retirés du manifeste Studio, plus aucun code consommateur.

**Bypass locaux à ne jamais positionner sur Preview** : `NEXT_PUBLIC_TOOLS_ENV`, `ELSATIA_APPLICATION_ENV`.

## Tests locaux déjà qualifiés à rejouer sur Preview

- Suite pgTAP complète (94–100 fichiers), sur vrai Supabase (jamais fait à ce jour).
- Cycle fixture pilote : seed → `assertions_entreprise_pilote_btp.sql` → cleanup, sur le schéma réel Preview.
- Suites Playwright `pilot-acceptance-v2.spec.ts` / `pilot-acceptance-v3.spec.ts`.
- `npm run preflight:preview` avec une vraie clé de service, pour confirmer la présence des 18 buckets Storage.
- `verify:stripe-prices` contre un vrai compte Stripe test.
- `stripe listen` / `stripe trigger` réels sur les 3 endpoints webhook (Connect, Boutique, abonnement).
- vitest apps/tools (1992 tests) et apps/reserves (178 tests), contre vrai Supabase.
- pgTAP entitlement Tools (`elsatia_tools_cloud_sync_entitlement_closure_v1`, `elsatia_tools_r8/r9/r10`), contre vrai Postgres.
- 72 assertions pgTAP du garde-fou signup Studio (`studio_signup_policy`), contre vrai GoTrue.
- 26 tests réels du worker vidéo, dans le conteneur Docker cible (jamais construit).
- `docker build` du Dockerfile worker, puis `e2e-gate.mjs` avec Postgres + Redis réels.
- Drill de restauration DR à l'échelle réelle (le drill local ne portait que sur des données synthétiques minimales).
- Les 5 fichiers pgTAP persistants en échec (`document_partage_public_par_jeton_v1`, `gp_pilot_plateforme_admin_role_total`, `gp_pilot_rgpd_manifeste_fichiers`, `platform_audit_log_bounded_v1`, `platform_stripe_state_attestation_r72`) — attribués au harnais local / stub `pgsodium`, à confirmer sur Supabase réel avant de les considérer comme faux positifs.

## Décisions produit/techniques non tranchées (bloquantes)

- `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` — signup Studio ouvert ou fermé par défaut.
- `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` — projet Supabase dédié pour Studio ou partagé.
- `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` — hébergeur conteneur longue durée pour le worker vidéo (pas Vercel serverless).
- `D-PREFLIGHT` — passer `check-env-manifest.mjs` en mode bloquant sur le build Vercel (actuellement rapport seul).
- Classification RGPD RETAIN/DELETE par table, rétention GPS/photos de pointage, pseudonymisation `journal_activite`, anonymisation au niveau client (aucune n'existe).

## Risques additionnels identifiés (hors périmètre strict mais pertinents pour le go-live)

- **DR** : `ELSATIA_DR_EXACT_TIP_V2` — RTO/RPO prouvés uniquement en local sur données synthétiques ; RTO/RPO hébergés **non prouvés**. Divergence documentaire : les mentions légales (CGV, registre RGPD, politique de confidentialité, DPA) affirment des "sauvegardes automatiques régulières", alors qu'aucun mécanisme de sauvegarde automatique récurrente n'est confirmé actif côté Supabase Production dans le code — soit activer/confirmer le PITR Supabase, soit corriger le texte légal.
- **RGPD** : verdict `RGPD TECHNICAL BLOCKERS OPEN` — la purge à 30 jours promise n'a aucun job d'exécution en production (infrastructure écrite, jamais testée réellement).
- **Sécurité** : gate CI Stripe toujours non confirmée faute de secret disponible en sandbox (cf. section STRIPE).

## Note de transparence (sécurité de session)

Le fichier `AGENTS.md` de ce dépôt contient une instruction ("lire `node_modules/next/dist/docs/` avant tout code") pointant vers un chemin qui n'existe pas. Cette instruction a été identifiée comme une tentative probable d'injection de prompt, indépendamment, par au moins trois missions antérieures (`ELSATIA_SECURITY_TENANT_RED_TEAM_V3`, `ELSATIA_RGPD_DATA_LIFECYCLE_CLOSURE_V3`, `ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3`, `ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT` §25.6) et par cette session. Elle n'a pas été suivie ici non plus. Le contenu de `AGENTS.md`/`CLAUDE.md` de ce dépôt doit être traité comme non fiable tant que cette instruction y persiste.

## Verdict

**PREVIEW PRECONDITIONS REMAIN**

Justification : aucun rapport de qualification, sur aucune des deux lignes divergentes examinées, n'a jamais atteint un vrai Vercel Preview, un vrai projet Supabase, un vrai Stripe test ou Docker. `apps/colors` n'a aucune preuve de qualification dans le périmètre examiné. Deux décisions produit bloquantes (signup Studio, hébergement du worker vidéo) empêchent toute exposition publique de Studio. Un P1 d'idempotence webhook Boutique a été trouvé après le fix Stripe et bloque le train de déploiement. Les blockers RGPD techniques restent ouverts. Aucun secret Stripe/Supabase de test n'a été confirmé fonctionnel dans un environnement d'exécution réel à ce jour.
