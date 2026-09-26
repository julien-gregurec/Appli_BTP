# ELSATIA — Preview Go-Live Checklist (Refresh V2)

Date : 2026-09-23
Portée : rafraîchissement de la checklist V1 avec les seuls résultats récents (branches du 2026-09-22).
**Aucun code écrit, aucun déploiement, aucun merge, aucune migration appliquée, aucune Preview atteinte pour produire ce document.**

La V1 (`docs/qualification/ELSATIA_PREVIEW_GO_LIVE_CHECKLIST_V1.md`, branche `claude/serene-turing-ekxjoo`) n'est **pas modifiée**. Ce document la remplace fonctionnellement : quand les deux divergent, c'est la V2 qui reflète l'état lu le 2026-09-23.

## Méthode

`git fetch --all --prune`, puis lecture directe des rapports via `git show <branche>:<chemin>` — aucune branche n'a été extraite (checkout) ni fusionnée. Ce document est le seul ajout de sa branche (`claude/lucid-brahmagupta-xyzhlx`, basée sur `main` @ `4d92ddbe`), afin de ne rien modifier des lignes de code qualifiées.

Règle appliquée : **un blocker que le rapport le plus récent ferme explicitement n'est jamais reconduit en OPEN.** Plusieurs blockers de la V1 étaient déjà fermés au moment de sa rédaction par un rapport que la V1 n'avait pas lu (périmètre limité à deux branches).

### Sources lues (branche · SHA · date · verdict propre du rapport)

| # | Chantier | Branche · SHA · date | Rapport(s) | Verdict du rapport |
|---|---|---|---|---|
| 1 | Boutique Idempotency | `claude/magical-mccarthy-sm9lwb` · `f34f2263` · 09-22 13:00 | `ELSATIA_BOUTIQUE_PAYMENT_IDEMPOTENCY_CLOSURE_V1` | `BOUTIQUE IDEMPOTENCY BLOCKER CLOSED LOCALLY` |
| 2 | Billing Security V3 | `claude/great-mayer-bzxad6` · `3e2a8bea` · 09-22 13:06 | `ELSATIA_SELF_SERVICE_BILLING_SECURITY_CLOSURE_V3` (+ `..._SUBSCRIPTION_CLOSURE_V2`) | `BILLING SECURITY CLOSED / COMMERCIAL DECISION REMAINS` |
| 3 | GP Hardening Real DB | `claude/amazing-pascal-7lddkv` · `d42df217` · 09-22 13:06 | `ELSATIA_GP_HARDENING_REAL_DB_QUALIFICATION_V1`, `ELSATIA_MULTI_APP_ACCESS_CANONICAL_CONVERGENCE_V1` | `GP HARDENING PARTIALLY QUALIFIED` / `CANONICAL MODEL NOT RESOLVED` |
| 4 | RGPD Purge V2 | `claude/brave-planck-bzsvda` · `26112ced` · 09-22 13:19 | `ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2` (succède à `..._END_TO_END_V1`) | `RGPD PURGE ARCHITECTURE LOCALLY QUALIFIED` |
| 5 | Pilot Acceptance V3 | `claude/loving-turing-aaopod` · `4056c5f3` · 09-22 14:16 | `ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3` | `PILOT LOCALLY QUALIFIED WITH MANUAL CASES` |
| 6 | Studio Worker V2 | `claude/zen-goodall-n3opdc` · `afd39126` · 09-22 12:57 | `ELSATIA_STUDIO_VIDEO_WORKER_REAL_BASELINE_V2` | `STUDIO WORKER LOCALLY QUALIFIED` |
| 7 | Branch Convergence Map | `claude/affectionate-hawking-1ly0v1` · `a6fa7661` · 09-22 14:41 | `ELSATIA_BRANCH_CONVERGENCE_MAP_V1` | `CANONICAL TRAIN REQUIRES DECISION` |
| + | Base commune de 1 et 6 | `integration/elsatia-post-qualification-fix-convergence-v1` · `3cfbcd70` | `ELSATIA_POST_QUALIFICATION_FIX_CONVERGENCE_V1` | `POST-FIX TRAIN BLOCKED` (4 points, dont 1 désormais fermé) |
| + | Colors (hors liste, trouvé) | `audit/colors-account-access-predeploy-v1` · `3cbcb1e1` · **09-06** | `ELSATIA_COLORS_PREDEPLOY_FINAL_READINESS_AUDIT_V1` | `READY TO DEPLOY` (périmé, voir COLORS) |

## Légende des statuts

- **CLOSED LOCALLY** — défaut reproduit puis corrigé, vérifié par **exécution réelle** sur harnais local. N'est pas une preuve d'infra réelle.
- **REMOTE PROOF REQUIRED** — le correctif ou le comportement existe, mais seule une Preview / un vrai Supabase / un vrai Stripe / Docker peut le prouver.
- **DECISION_REQUIRED** — rien à corriger : un humain doit trancher.
- **ACTUAL BLOCKER** — empêche réellement le déploiement Preview ou sa qualification, aujourd'hui, en l'état.
- **NON-BLOCKER** — connu, documenté, assumé ; n'empêche pas la Preview.

---

## Fait structurant n°1 — il n'existe aucune branche déployable

`ELSATIA_BRANCH_CONVERGENCE_MAP_V1` (vérifié par recomptage indépendant dans cette session) :

- **Lignée « écosystème multi-app »** — racine `claude/studio-runtime-config-wiring-v1`, **321 migrations**, contient `apps/{studio,tools,reserves,colors}` + `workers/studio-video`. Elle se ramifie en trois têtes qui ne se contiennent pas : `claude/magical-mccarthy-sm9lwb` (Boutique), `claude/zen-goodall-n3opdc` (Worker) — **sœurs, changements disjoints, à fusionner et non à choisir** — et `claude/loving-turing-aaopod` (Pilot V3, isolée).
- **Trois branches orphelines « GP mono-app »**, reconstruites sur `main` figé : `brave-planck` (RGPD, **180** migrations), `great-mayer` (Billing, **180**), `amazing-pascal` (GP Hardening, **196**). Elles sont **141 à 125 migrations en retard** et ne contiennent aucune des 4 apps.

Conséquences vérifiées dans cette session (`git ls-tree` / `git grep`, pas de la lecture de rapport) :

| Constat | Preuve | Portée |
|---|---|---|
| Les 3 orphelines n'ont **pas** `20260729000187_restaurer_execution_fonctions_rls.sql` (rend `EXECUTE` sur `est_membre_actif`/`entreprise_sans_membres` à `authenticated`) | absent des 3 arbres, présent sur toute la lignée écosystème | Déployer une orpheline seule casse **toute lecture authentifiée** (>100 policies RLS) — c'est exactement la régression que `GP HARDENING` a redécouverte et refermée de son côté par `20260922000201` |
| Les 3 orphelines n'ont **pas** `20260806000196_correctif_rls_ecriture_chantiers.sql` | idem | `amazing-pascal` l'a réécrite en `20260922000190` (même nom de sujet) — second doublon prouvé |
| Collision de version réelle | `brave-planck` `20260729000184/185` = purge RGPD ; lignée écosystème `20260729000184/185` = `medias_devis_finalisation` / `isolation_multitenant_grants_et_definer` | Renumérotation **obligatoire** avant tout portage |
| Collision de version réelle | `great-mayer` `20260922000184/185` (billing) **vs** `amazing-pascal` `20260922000184/185` (admin/boutique) | Les deux orphelines ne peuvent pas être portées sans arbitrage de numéros |

**Lecture opérationnelle** : les correctifs des 3 orphelines (RGPD Purge V2, Billing Security V3, GP Hardening) sont de vrais correctifs qualifiés localement, mais ils doivent être **portés** dans la lignée écosystème, jamais déployés tels quels. Symétriquement, la lignée écosystème **ne contient aujourd'hui aucun** de ces trois lots.

## Fait structurant n°2 — toujours zéro preuve d'infra réelle

Les 7 branches récentes confirment, indépendamment, la même limite qu'en V1 : **Docker Hub / ECR bloqué par la politique réseau** (403 reproductible), donc `supabase start`, `supabase test db`, `docker build` et `e2e-gate.mjs` n'ont **jamais** été exécutés. Toute la qualification tourne sur PostgreSQL 16 natif + pgTAP apt + socle Supabase reconstruit à la main (+ mock PostgREST/Storage côté RGPD V2). Aucune Preview Vercel, aucun Stripe test réel, aucun GoTrue réel, aucune API Storage réelle.

**Progrès mesurable malgré tout** : la couverture pgTAP locale est passée de « 96/100 fichiers n'aboutissent pas » (post-fix convergence) à **101 fichiers exécutés, 2 180 assertions `ok`, 0 `not ok`, 16 fichiers arrêtés avant `finish()`** pour des causes de harnais nommées une par une (`pgsodium` stubbé, `auth.mfa_factors` non modélisée, flag « inscription fermée » non positionné, fixtures manquantes) — aucune ne touche Boutique/Stripe/webhooks. La V1 parlait de « 5 fichiers persistants en échec » : ce chiffre est périmé, remplacé par cette liste de 16 causes documentées.

---

## Checklist par domaine

### GESTION PRO

| Point | Statut | Constat (2026-09-23) |
|---|---|---|
| Idempotence webhook Boutique (`boutique_finaliser_commande_payee`) | **CLOSED LOCALLY** | **Le blocker V1 est fermé, et sa description était fausse.** Le rejeu **séquentiel** était déjà sûr depuis `20260801000194` (garde `statut='payee'` → `return`), le déclencheur `..._paiement_serveur_seul` n'intervient jamais sur le chemin `service_role`. Le vrai P1, reproduit avec **deux processus `psql` système en parallèle** (stock 10→4 au lieu de 7), est un **double décrément de stock silencieux** sous rejeu concurrent (TOCTOU, pas de verrou de ligne). Fermé par `20260922000330` (`for no key update`), revérifié 10→7, 15 nouvelles assertions pgTAP, périmètre Boutique/Stripe 89/89, Vitest 1 799/1 799. |
| Pilote externe (parcours d'acceptation) | **CLOSED LOCALLY** | **Le `NOT READY` de la V1 est périmé** : il venait de `GP_EXTERNAL_PILOT_CLOSURE_V1`, superseded par `PILOT_ACCEPTANCE_CLOSURE_V3` (09-22 14:16). Les suites que la V1 disait « jamais exécutées » l'ont été. `PL-02` fermé par garde-fou DB (pgTAP 9/9, contournement SQL direct bloqué). **125/143 PASS** sur preuve d'exécution (40/143 en V1, 118/143 en V2). 0 `NOT_TESTABLE_LOCALLY` résiduel. |
| 10 `FAIL` pilote restants | **NON-BLOCKER** (nommés) + 1 à surveiller | CH-08 (ouvrier non affecté accède au détail chantier — 200 au lieu d'un refus ; **pas** de donnée financière exposée, trouvé cette session), CH-09, CM-06, FA-08, NF-01, PE-06, PE-07, PL-03, PL-05, PT-08. Aucun P0 au sens « empêche le pilote ». 6 sont inchangés depuis l'origine. |
| Sur-exposition RGPD table `employes` | **ACTUAL BLOCKER (réduit)** | Progrès réel non vu par la V1 : `cout_horaire` (`20260818000205`) **et** `taux_horaire` (`20260922000328`) sont désormais isolés dans des tables dédiées à policy restrictive — les 2 colonnes de paie ne fuient plus. **Reste ouvert** : `email`, `telephone`, `notes` lisibles par tout membre actif via la policy SELECT de la table de base, que `20260922000312` déclare explicitement ne pas avoir resserrée (« ce point reste donc OUVERT »). La vue `employes_annuaire` est la fondation, pas la clôture. |
| Numérotation devis/factures (overflow >999) | CLOSED LOCALLY | Inchangé depuis V1 : `lpad()` corrigé, 299/299 + 15/15 pgTAP, concurrence réelle. |
| Performance / capacité pilote | REMOTE PROOF REQUIRED · NON-BLOCKER | Inchangé : deadlock paiement et N+1 RLS corrigés ; Dashboard 1,7–1,8 s non corrigé ; coût RLS ~0,35–0,5 ms/ligne reste le goulot. `PILOT CAPACITY READY`, pas « 40 utilisateurs qualifiés ». |
| Écriture RLS sur `chantiers` | NON-BLOCKER sur la lignée écosystème | `20260806000196` couvre insert/update/delete. Le « bug critique » signalé par la passe multi-app concerne les branches mono-app, pas la lignée déployable — vérifié dans cette session. |
| Verdict omnibus du train | REMOTE PROOF REQUIRED | `POST-FIX TRAIN BLOCKED` avait 4 points : (1) Boutique idempotency → **fermé** ; (2) pgTAP incomplet → nettement amélioré (ci-dessus) mais toujours sans Supabase réel ; (3) upgrade sur données réelles → jamais fait ; (4) décision Supabase dédié Studio → toujours ouverte. Le verdict reste donc « pas qualifié », avec un périmètre résiduel nettement plus étroit. |

### COLORS

| Point | Statut | Constat |
|---|---|---|
| Qualification dédiée | **ACTUAL BLOCKER** (reclassé) | La V1 affirmait « aucun rapport Colors n'existe » — vrai dans son périmètre de 2 branches, **faux globalement** : `ELSATIA_COLORS_PREDEPLOY_FINAL_READINESS_AUDIT_V1` existe (`audit/colors-account-access-predeploy-v1`), verdict `READY TO DEPLOY`, avec recette navigateur réelle (routes, reset mot de passe, CSP, en-têtes, noindex, open redirect, XSS, mobile). **Mais cet audit est du 09-06 et sa branche est divergente** : `git diff --shortstat` sur `apps/colors` entre cet audit et la tête écosystème = **92 fichiers, +6 456/−418 lignes** (D1 références RAL/fabricants, D2 nettoyage EXIF, garde OCR, CSP WebKit, export, PWA…). Le Colors qui serait déployé n'est donc **pas** celui qui a été audité. Statut honnête : preuve **périmée**, pas absente. |
| Écarts de l'audit Colors | NON-BLOCKER | E1 (relais Gestion Pro absent du lot, P1 assumé), E2 (`NEXT_PUBLIC_COLORS_URL` non extraite), E3 (`/nouveau-mot-de-passe` non vue), E4 (`style-src 'unsafe-inline'`, P1 assumé). Aucun n'empêchait le déploiement au 09-06. |
| Vercel — fichiers hors racine | REMOTE PROOF REQUIRED · config manuelle | Option « Include files outside of Root Directory » requise (dépendances `packages/*` en `file:`). Pas de `apps/colors/vercel.json` dans le dépôt : tout passe par le Dashboard. |
| Gate de build | NON-BLOCKER | `prebuild:colors` → `check-env-manifest --auto --app colors` existe, mais en mode `report` (voir VERCEL). |

### TOOLS

| Point | Statut | Constat |
|---|---|---|
| Entitlement cloud-sync (P0 sécurité) | CLOSED LOCALLY → REMOTE PROOF REQUIRED | Bypass réellement reproduit (7/16 pgTAP rouges avant), fermé par un helper serveur canonique sur 3 policies + 1 RPC (`20260922000324` sur la lignée écosystème), 16/16 après, 95/97 fichiers pgTAP identiques avant/après. Jamais rejoué sur un vrai Supabase. |
| Isolation build (fuite PostCSS racine) | CLOSED LOCALLY | `apps/tools/postcss.config.mjs` vide. typecheck/lint OK, vitest 1 992/1 992, build 47/47 pages. |
| Cache d'entitlement client | NON-BLOCKER | `entitlements.ts` (cache HMAC, grâce offline 7 j) non audité ; UX de refus non vue en navigateur réel. |
| `NEXT_PUBLIC_TOOLS_ENV` | NON-BLOCKER (piège) | Bypass de build **local uniquement** : **ne pas** le définir sur Preview. |

### RESERVES

| Point | Statut | Constat |
|---|---|---|
| Isolation build (PostCSS + fuite Sentry via `turbopack.root`) | CLOSED LOCALLY | `apps/reserves/src/instrumentation.ts` vide. typecheck/lint OK, vitest 178/178, build OK. |
| Auth / Storage / multi-tenant | **REMOTE PROOF REQUIRED** | Le rapport source dit explicitement n'avoir ni vérifié ni simulé ces conditions. Inchangé depuis la V1. |
| Télémétrie Sentry | NON-BLOCKER | Absente par choix produit assumé. |
| `ELSATIA_APPLICATION_ENV` | NON-BLOCKER (piège) | Bypass local ; ne pas positionner sur Preview. |
| `DECISION_REQUIRED:RESERVES-URL-FAIL-CLOSED` | **DECISION_REQUIRED** | Présent dans `config/env-manifest.json` sur la tête écosystème, non tranché. |

### STUDIO

| Point | Statut | Constat |
|---|---|---|
| Décision d'exposition du signup | **DECISION_REQUIRED** (bloquant l'exposition publique) | `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` et `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` toujours présents et non tranchés dans `config/env-manifest.json` (vérifié sur la tête écosystème). Consigne source inchangée : **ne pas exposer Studio publiquement avant arbitrage**. |
| Contournement du garde-fou signup | CLOSED LOCALLY → REMOTE PROOF REQUIRED | Le garde Server Action seul était contournable par appel direct à l'Auth Supabase. Fermé en base (`20260922000325_studio_signup_policy.sql` sur la lignée écosystème), 72/72 assertions pgTAP — sur harnais, jamais contre un vrai GoTrue. À noter : une **seconde version du même fichier** existe sur `fix/studio-signup-closed-v1` (`20260921070000`) — un seul artefact doit survivre à la convergence. |
| Build / câblage runtime | CLOSED LOCALLY | `postcss.config.mjs` vide ; build 12 routes, typecheck/lint/test 260/260. `STUDIO_SIGNUP_MODE`, `STUDIO_SIGNUP_ALLOWLIST`, `STUDIO_LEGAL_PUBLISHED` fail-closed ; `STUDIO_ENABLED` fail-open (kill switch). 4 variables mail retirées du manifeste (aucun consommateur). |
| Redirect URLs Auth par app | REMOTE PROOF REQUIRED · config manuelle | Supabase Dashboard → Authentication → URL Configuration, par projet Preview et par app. `config.toml` ne gouverne que le local. |
| 7 fichiers pgTAP Studio en erreur de harnais | NON-BLOCKER | `studio_analysis/editor/media_upload/project_management/render_engine/templates/timeline` s'arrêtent faute du flag « inscription fermée » dans les fixtures — cause identifiée, pas un défaut produit. |

### STUDIO WORKER (`workers/studio-video`)

| Point | Statut | Constat |
|---|---|---|
| Code et tests réels | **CLOSED LOCALLY** (nouveau) | `STUDIO WORKER LOCALLY QUALIFIED` : worker intégralement implémenté (rendu, templates/texte, vision optionnelle, nettoyage, réconciliation, healthcheck), typecheck worker+Studio, lint, 260/260 Studio, **26/26 tests réels du worker** avec FFmpeg complet. Revue sécurité : aucun défaut bloquant (jamais de shell, `spawn` avec tableaux, `-protocol_whitelist file,pipe`, bucket privé, RPC `SECURITY DEFINER` avec `lease_token`). Limites déjà codées (timeline 10 min, 1 000 clips, 5 Gio/job, RSS 1,5 Gio, 3 relances, concurrence 1/process). |
| Cause des 3 échecs initiaux | NON-BLOCKER (résolue) | `ffmpeg-static@5.3.0` sans `drawtext` — root-causé, déjà mitigé par le Dockerfile (FFmpeg Debian + assertion de build `drawtext`/`drawbox`/`overlay`). |
| `docker build` | **REMOTE PROOF REQUIRED** | Jamais exécuté : `FROM node:24-bookworm-slim` échoue, Docker Hub bloqué (contrôle croisé : `mcr.microsoft.com` fonctionne, donc politique réseau et non panne). |
| `e2e-gate.mjs` bout-en-bout | **REMOTE PROOF REQUIRED** | Jamais exécuté (dépend de `docker run redis:7.4.2-alpine` + `supabase start`) : `studio_claim_render`/`dispatch`/`complete` jamais exercées contre un vrai Postgres, injection de panne Storage/callback non testée en réel. |
| Hébergement | **DECISION_REQUIRED** | `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` toujours ouvert dans le manifeste : process long, pas une fonction serverless Vercel. |
| Secrets worker | REMOTE PROOF REQUIRED | `STUDIO_STORAGE_SERVICE_KEY` (= service_role), `STUDIO_REDIS_URL` (peut porter un mot de passe). Non-secrets : `STUDIO_AI_ANALYSIS`, `STUDIO_ANALYSIS_*`, `STUDIO_FFMPEG_PATH`, `STUDIO_FFPROBE_PATH`, `STUDIO_RENDER_TIMEOUT_SECONDS`. |

### SUPABASE

| Point | Statut | Constat |
|---|---|---|
| Stack Supabase réelle | **ACTUAL BLOCKER · REMOTE PROOF REQUIRED** | Inchangé et reconfirmé 7 fois : jamais atteinte. Action : `supabase start` + `supabase test db` réels, puis rejeu **intégral** des suites pgTAP (dont les 16 fichiers arrêtés par le harnais) et des cycles Fresh/Upgrade sur un vrai projet. |
| Migrations rejouées à froid | CLOSED LOCALLY | Lignée écosystème : **321/321** appliquées sans erreur (deux fois : 320 avant correctif, 321 après), plus un chemin d'upgrade représentatif (seule `20260922000330` par-dessus 320). Orphelines : 180/180 (RGPD, Billing) et 195/195 + 1 (GP Hardening). |
| Régression `est_membre_actif` / `entreprise_sans_membres` | CLOSED LOCALLY (lignée écosystème) · **ACTUAL BLOCKER (orphelines)** | Découverte majeure de `GP HARDENING` : depuis `20260714000078`, ces deux fonctions ont perdu tout `EXECUTE` pour `authenticated`, cassant la lecture sur >100 policies (`clients`, `entreprises`, `employes`, `devis`, `factures`, `storage.objects`…). **Déjà corrigé sur la lignée écosystème par `20260729000187`** ; refermé indépendamment côté GP par `20260922000201` ; **toujours absent de `brave-planck` et `great-mayer`**. |
| Purge RGPD (fonctions SQL) | **CLOSED LOCALLY** — mais hors de la lignée déployable | Le blocker V1 (« suite pgTAP jamais exécutée ») est fermé par RGPD Purge V2 : voir RGPD. La lignée écosystème ne porte que `20260922000327_purge_entreprise_supprimee.sql` (identique à la version V1 de la purge) et **pas** `purge_entreprise_architecture_v2`. |
| Fuite service_role côté client | CLOSED LOCALLY | Confirmé strictement serveur par grep exhaustif. Résidu P2 nommé dans le manifeste (`src/lib/supabase/admin.ts` n'importe pas `server-only`, contrairement à Réserves et Colors — aucun import client aujourd'hui). |
| Nommage des clés publiques | NON-BLOCKER | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy, Réserves) coexiste avec `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (canonique, Tools). Cohérence multi-app à vérifier au moment du réglage Preview. |
| Buckets Storage (18) | REMOTE PROOF REQUIRED | Créés par migrations ; policies vérifiées seulement via la RLS du mock. `npm run preflight:preview` existe pour les confirmer — nécessite une vraie clé de service. |

### STRIPE

| Point | Statut | Constat |
|---|---|---|
| Webhook Connect + Boutique (P1 depuis migration 255) | CLOSED LOCALLY | `GRANT INSERT` manquant sur `stripe_webhook_events` + 3 RPC absentes → corrigé (`20260922000326` sur la lignée écosystème), 32 assertions vertes, exploit rejoué, 0 régression. |
| Idempotence Boutique sous concurrence | **CLOSED LOCALLY** | Voir GESTION PRO. Le blocker V1 est fermé par `20260922000330`. |
| Contournement de paiement / auto-attribution d'abonnement | **CLOSED LOCALLY** (nouveau) | Billing Security V3 : un admin d'entreprise pouvait `PATCH` directement `entreprises` (`abonnement_statut='actif'`, `abonnement_offre='entreprise'`, échéance 2099, faux `stripe_subscription_id`) → `UPDATE 1`, **sans paiement**. La RLS était ligne-par-ligne, rien ne limitait les **colonnes**. Fermé par `20260922000184` (revoke UPDATE table-large, grant sur ~50 colonnes non commerciales ; 33 colonnes réservées à `service_role` : tout `abonnement_*`, `stripe_*`, `derniere_facture_*`, `remise_*`, `option_ia_*`, `impaye_*`, `suspension_prevue_at`…). Reproduction avant/après sur vraie base, isolation cross-tenant reconfirmée (`UPDATE 0`). |
| Suspension sur échec de paiement / 3-D Secure | **CLOSED LOCALLY** (nouveau) | Un 3DS requis ne suspend plus jamais ; un échec réel pose une échéance de grâce configurable (`STRIPE_DELAI_GRACE_PAIEMENT_JOURS`, 0 j par défaut = comportement conservateur inchangé). Événements hors-ordre traités. Vitest 128/128, tsc propre, 180 migrations valides. |
| Upgrade / downgrade self-service | CLOSED LOCALLY · REMOTE PROOF REQUIRED | Le contrat Portail Stripe existant est confirmé et **versionné en code** au lieu de dépendre d'un réglage Dashboard invisible. Comportement réel du Portail invérifiable sans Stripe live. |
| Étapes Stripe réelles | **REMOTE PROOF REQUIRED** (`REMOTE STRIPE REQUIRED`) | Créer l'entité juridique, les 8+ Price IDs commercialisés, le webhook endpoint, exécuter `scripts/configurer-portail-stripe.mjs` puis renseigner `STRIPE_PORTAL_CONFIGURATION_ID`. Jamais faisable depuis un dépôt. |
| Remise annuelle offre Entreprise | **DECISION_REQUIRED** | ~10 % sur Entreprise vs 0 % sur Mini/Pro/Business : aligner Entreprise ou étendre la remise. Non tranché, rien changé. Corrigés en revanche : copie « −20 % » figée (désormais calculée, masquée si remise nulle) et variables Mini/Business/Entreprise ajoutées (vides) à `.env.local.example`. |
| Durée réelle du délai de grâce | **DECISION_REQUIRED** | `STRIPE_DELAI_GRACE_PAIEMENT_JOURS` à fixer (0 aujourd'hui). |
| 5 modèles de prix non tranchés | **DECISION_REQUIRED** | `STRIPE-MODULE-PRICE-MODEL`, `STRIPE-SUPPLEMENTARY-ACCOUNTS`, `STRIPE-IA-OPTIONS`, `STRIPE-LEGACY-GENERATIONS`, `STRIPE-STORAGE-BLOCK` — présents dans `config/env-manifest.json`, la V1 ne les listait pas. |
| Flux cassés par `20260902000255` | NON-BLOCKER (partiellement fermé) | La V1 disait « 8 flux encore ouverts ». `GP_CONVERGENCE_TRAIN` a porté `fix/service-role-flux-acl-255-v1` (5 commits, 0 conflit) couvrant **webhook abonnement + boutique, import paie, cron notifications push, moteur de relances** ; `/document/[token]` fermé par `20260922000305`. Résidu **non confirmé fermé** : Powens, `journal_activite`. |
| `verify:stripe-prices` (gate CI) | REMOTE PROOF REQUIRED | Jamais vert : nécessite `STRIPE_SECRET_KEY` (test), présent seulement dans l'environnement GitHub `ci-verification`. |
| `STRIPE_WEBHOOK_EXPECTED_MODE` | REMOTE PROOF REQUIRED · config manuelle | À positionner explicitement à `test` sur chaque déploiement Preview — aucun mécanisme automatique. |
| Rejeu attendu sur Preview | REMOTE PROOF REQUIRED | `stripe listen` / `stripe trigger` réels sur les 3 endpoints (Connect, Boutique, abonnement). |
| Idempotence retry-après-échec (« D3 ») | NON-BLOCKER | Résidu assumé depuis le 2026-09-11, confirmé non régressé, plan documenté. |

### AUTH

| Point | Statut | Constat |
|---|---|---|
| Red team multi-tenant | CLOSED LOCALLY | 3 vulnérabilités P0/P1 cross-tenant réelles (capacité payante auto-octroyée, forge de réconciliation Stripe cross-tenant, commande Boutique validée sans paiement) fermées par `20260922000323`. Le `SECURITY BLOCKERS OPEN` de la V1 dépendait du fix webhook Stripe, depuis fermé. |
| Élévation de privilège plateforme | CLOSED LOCALLY | Auto-promotion admin plateforme fermée ; 2 fonctions `SECURITY DEFINER` retirées d'`anon` ; garde AAL2/lock/owner restaurée sur `plateforme_ajouter_admin`/`retirer_admin` ; CVE js-yaml pinnée ≥4.3.2. Session support ne devient plus un rôle permanent non tracé. |
| AAL2/MFA réel | **REMOTE PROOF REQUIRED** | Simulé par GUC Postgres uniquement ; `auth.mfa_factors` n'existe pas dans le harnais (2 fichiers pgTAP s'arrêtent pour cette raison). L'émission MFA par GoTrue n'est pas prouvée. |
| Détournement de lien e-mail sensible | CLOSED LOCALLY (lignée mono-app) | Liens de confirmation/réinitialisation construits depuis des en-têtes HTTP fournis par l'appelant — corrigé côté GP Hardening. **À vérifier/porter** sur la lignée écosystème. |
| Signup Studio | Cf. STUDIO | — |
| Dépendances npm | CLOSED LOCALLY | 2 avisories **CRITIQUES** `next` (`GHSA-p293-qw3h-jr36`, `GHSA-2xp9-vwfh-vxw4` — RCE non authentifiées) fermées par `16.2.12 → 16.3.5` (dans `^16.2.12`, pas de saut majeur) + 7 autres résolues. Reste 1 modérée sur `@vitest/mocker` (outillage de test seulement). |

### STORAGE

| Point | Statut | Constat |
|---|---|---|
| Service Storage réel | **ACTUAL BLOCKER · REMOTE PROOF REQUIRED** | Jamais atteint. Policies des 18 buckets jamais vérifiées sur un vrai service. |
| Suppression réelle de fichiers (RGPD) | **CLOSED LOCALLY** (progrès) | RGPD Purge V2 : suppression physique **confirmée par exécution** via un mock Storage-REST fidèle (`SET ROLE` par appel, vraies tables `storage.*`, vraie RLS), et `anonymiser_employe` supprime réellement photo/signature/carte BTP (best-effort journalisé, n'annule jamais l'anonymisation acquise). `entreprises.logo_url` exclu d'une suppression prématurée (F7). |
| Mock Storage local | NON-BLOCKER | `local_storage_mock.mjs` : vraies tables + vraie RLS, octets sur disque local. A permis de fermer DP-03 et PE-05 localement. |
| Restauration Storage (DR) | REMOTE PROOF REQUIRED | Procédure documentée, jamais exercée avec du binaire réel à l'échelle. |

### EMAIL

| Point | Statut | Constat |
|---|---|---|
| Fournisseur transactionnel | REMOTE PROOF REQUIRED | **Brevo** (`BREVO_API_KEY`). Aucun changement dans les 7 rapports récents. |
| Livraison réelle | **REMOTE PROOF REQUIRED** | Jamais vérifiée bout-en-bout ; flux testés avec Brevo mocké (`documents-envoi.test.ts`). « Réception e-mail réelle non vérifiable » reste écrit tel quel. |
| Magic link / activation de compte | REMOTE PROOF REQUIRED | Dépend de la même livraison réelle **et** d'un vrai GoTrue. |
| Construction des liens | CLOSED LOCALLY | Voir AUTH (en-têtes HTTP de l'appelant), à porter sur la lignée écosystème. |
| Référentiel des envois | NON-BLOCKER | `docs/operations/MATRICE_EMAILS_V1.md`. |

### VERCEL

| Point | Statut | Constat |
|---|---|---|
| Garde env-manifest au build | **ACTUAL BLOCKER · DECISION_REQUIRED** | **Vérifié dans le code cette session** : `config/env-manifest.json` porte `"preflight_enforcement": "report"` sur **les quatre** têtes écosystème, et `check-env-manifest.mjs` fait `return 0` explicitement en mode report (« MODE REPORT : N erreur(s) NON bloquante(s) »). Un build Vercel ne serait donc PAS arrêté par une variable manquante. Le manifeste porte lui-même la fiche `F-PREFLIGHT-ENFORCEMENT` (P1, `status: open`) avec son `next_step` : rejouer le preflight sur des valeurs Preview réelles, **puis** passer à `enforce`. En prime : en mode `--auto`, une panne du contrôleur lui-même est volontairement non bloquante. |
| Crons | CLOSED LOCALLY | `vercel.json` racine (région `fra1`) : `/api/cron/abonnements`, `/api/cron/notifications-push` ; + `apps/reserves/vercel.json`. Versionnés, reconstruits au redeploy. **Aucun `vercel.json` pour Colors, Tools, Studio** → leur configuration est entièrement Dashboard. |
| `DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN` | **DECISION_REQUIRED** | Présent au manifeste, non tranché. |
| `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` | **DECISION_REQUIRED** | Combien de projets Vercel / quel découpage par app : non tranché. C'est la première décision à prendre avant tout réglage. |
| Fichiers hors racine (monorepo) | REMOTE PROOF REQUIRED · config manuelle | « Include files outside of Root Directory » pour Colors / Studio / Reserves (`packages/*` en `file:`). |
| Domaines / DNS / SSL / deployment protection | REMOTE PROOF REQUIRED · config manuelle | Dashboard uniquement, non versionné ; aucun rapport ne décrit un test réel. |
| Linking projet / sync des variables | **REMOTE PROOF REQUIRED** | Aucun rapport ne décrit le linking ni la synchronisation effective des variables. C'est le tout premier geste manquant. |

### REDIS

| Point | Statut | Constat |
|---|---|---|
| Gestion Pro / Tools / Reserves / Colors | NON-BLOCKER | Aucun usage : le rate limiting est en base (`rate_limits_applicatifs`, `src/lib/security/rate-limit.ts`). |
| Studio Worker | **ACTUAL BLOCKER · DECISION_REQUIRED** | `STUDIO_REDIS_URL` requis (BullMQ `studio-renders-v1`, alimentée par un **outbox Postgres** relu toutes les 2 s — Redis est un transport reconstructible, pas la source de vérité, ce qui limite le risque de perte). Reconnexion/timeout/livraison dupliquée **testés réellement** (V2). Aucune instance provisionnée ; dépend de la décision d'hébergement du worker. `HEALTHCHECK` conteneur = Redis uniquement (choix documenté). |

### RGPD

| Point | Statut | Constat |
|---|---|---|
| Architecture de purge (art. 17) | **CLOSED LOCALLY** — **renversement du statut V1** | La V1 citait `RGPD TECHNICAL BLOCKERS OPEN`. Ordre réel des rapports sur `brave-planck` : `..._END_TO_END_V1` (`RGPD PURGE NOT PROVEN`, 8 défauts F1–F8, commit 08:54) **puis** `..._ARCHITECTURE_CLOSURE_V2` (`LOCALLY QUALIFIED`, commit 13:19) qui **corrige les 8**. Exécution réelle : dry-run, sauvegarde `pg_dump` restaurée, purge **interrompue par un vrai `SIGKILL` puis reprise**, vérification de complétude, second tenant témoin **identique bit-à-bit** avant/après. 46 assertions pgTAP + 111 tests vitest verts. Graphe construit depuis `pg_constraint` (pas l'ordre des migrations) : 127 tables `entreprise_id`, 249 FK réelles → **98 DELETE / 3 ANONYMIZE (`clients`, `employes`, `fournisseurs`) / 26 RETAIN**. |
| Disponibilité du correctif | **ACTUAL BLOCKER** | Ce lot vit **uniquement** sur `brave-planck-bzsvda` (180 migrations, 141 de retard, sans `20260729000187` ni `20260806000196`) et **collisionne** en `20260729000184/185` avec la lignée écosystème. Il doit être **porté et renuméroté**, pas déployé. |
| Job de purge automatique en production | **ACTUAL BLOCKER** | Inchangé : la purge à 30 jours promise n'a **aucun job d'exécution** ; aucune purge automatique à expiration de durée légale n'existe. L'infrastructure est désormais qualifiée, son déclenchement non. |
| Classification RETAIN/DELETE, durées, pseudonymisation | **DECISION_REQUIRED** (5, juridiques) | Durée exacte par domaine (les 10 ans comptables sont une hypothèse jamais encodée) ; granularité du module paie (retenu en bloc) ; fichiers Storage `notes_frais` (conservés par défaut) ; anonymiser vs conserver `clients`/`employes`/`fournisseurs` ; `facturation_comptes_mensuelle` classée RETAIN par analogie. |
| Sur-exposition `employes` | Cf. GESTION PRO | `email`/`telephone`/`notes` encore lisibles par tout membre actif. |
| Divergence documentaire sur les sauvegardes | **ACTUAL BLOCKER (juridique)** | CGV / registre RGPD / politique de confidentialité / DPA affirment des « sauvegardes automatiques régulières » alors qu'aucun mécanisme récurrent n'est confirmé actif. Deux issues : activer/confirmer le PITR Supabase, ou corriger le texte. |
| DR (RTO/RPO) | REMOTE PROOF REQUIRED | Prouvés en local sur données synthétiques minimales ; non prouvés en hébergé. `BANK_DATA_ENCRYPTION_KEY` reste le secret le plus critique, **sans procédure de rotation**. |

### PILOT

| Point | Statut | Constat |
|---|---|---|
| Blocage désigné `PL-02` | CLOSED LOCALLY | Garde-fou DB réel, pgTAP 9/9, contournement SQL direct bloqué, aucune régression. |
| Couverture d'acceptation | CLOSED LOCALLY | 125/143 PASS sur preuve d'exécution (auth/RLS réels, PostgREST + navigateur réel via Playwright, mock Storage, scénarios de session). Progression 40 → 118 → 125. |
| 5 `MANUAL_EXPECTED` | NON-BLOCKER | PA-03 (fixture sans anomalie de paie qualifiante), RG-05, SUP-03/SUP-04 (procédures humaines), SEC-05 (inspection Network manuelle). |
| 3 `REMOTE_ONLY` | REMOTE PROOF REQUIRED | DV-11, MS-04, DOC-02 — nécessitent un appel LLM réel (`OPENAI_API_KEY`). |
| Fixture pilote sur schéma réel | REMOTE PROOF REQUIRED | Cycle seed → `assertions_entreprise_pilote_btp.sql` → cleanup à rejouer sur le schéma Preview. |
| CH-08 | NON-BLOCKER à surveiller | Vrai gap d'isolation par affectation, sans fuite de données financières confirmée. Inspection navigateur recommandée. |

---

## Ce que la V1 tenait pour OPEN et qui est fermé (à ne pas reconduire)

1. **Idempotence webhook Boutique** — fermée (`20260922000330`), et sa description initiale était factuellement fausse (le rejeu séquentiel était sûr depuis `20260801000194`).
2. **Pilote externe `NOT READY`** — périmé, superseded par Pilot Acceptance V3 (125/143, `PL-02` fermé).
3. **Purge RGPD « pgTAP jamais exécutée »** — fermée par RGPD Purge V2 (46 assertions + purge réelle interrompue/reprise). **Mais** hors de la lignée déployable.
4. **`SECURITY BLOCKERS OPEN`** — dépendait du fix webhook Stripe, fermé.
5. **Colors « aucun rapport »** — inexact : un audit dédié existe, mais **périmé de 92 fichiers**.
6. **« 5 fichiers pgTAP persistants en échec »** — remplacé par 16 causes de harnais nommées, 0 assertion `not ok` sur 2 180.
7. **« 8 flux cassés par la 255 encore ouverts »** — 5 commits portés couvrant 4 flux + `/document/[token]` ; résidu Powens / `journal_activite` non confirmé.
8. **Sur-exposition `employes`** — partiellement fermée (les 2 colonnes de paie sont isolées) ; le reste est ouvert.

## Ce qui est nouvellement OPEN (absent de la V1)

1. **Aucune branche déployable** — `CANONICAL TRAIN REQUIRES DECISION` + 4 collisions de migration vérifiées. **C'est le blocker n°1 aujourd'hui.**
2. **Les 3 lots orphelins sont indéployables tels quels** — 180/196 migrations contre 321, sans `20260729000187` (lecture authentifiée cassée) ni `20260806000196` (écriture `chantiers` cassée).
3. **Aucun des 3 lots orphelins n'est présent dans la lignée écosystème** — RGPD V2, Billing Security V3 et GP Hardening seraient absents d'une Preview déployée depuis la lignée écosystème.
4. **5 décisions de modèle de prix Stripe** + `FLAG-CRONS-FAIL-OPEN`, `PREVIEW-PROJECT-INVENTORY`, `RESERVES-URL-FAIL-CLOSED` — 11 `DECISION_REQUIRED` au total dans `config/env-manifest.json`, contre 4 listées par la V1.
5. **Remise annuelle Entreprise** et **durée réelle du délai de grâce** — décisions commerciales explicitement laissées ouvertes par Billing Security V3.
6. **`REMOTE STRIPE REQUIRED`** — entité juridique, 8+ Price IDs, endpoint webhook, Configuration du Portail : rien de cela n'existe encore côté Stripe.
7. **Deux versions concurrentes de `studio_signup_policy.sql`** et deux réécritures indépendantes de `securiser_taux_horaire_facture_employe` / `correctif_statut_avoir_emis_facture_origine` — à dédoublonner à la convergence.

## Décisions à trancher (récapitulatif, 14)

**Techniques / architecture**
1. Ref déployable : quelle branche devient le train canonique (recommandation des rapports : partir d'`integration/elsatia-post-qualification-fix-convergence-v1`, fusionner `magical-mccarthy` **et** `zen-goodall` — sœurs, changements disjoints —, puis réconcilier `loving-turing`, puis porter les 3 orphelines avec renumérotation).
2. `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` — combien de projets Vercel, quel découpage par app.
3. `D-PREFLIGHT` / `F-PREFLIGHT-ENFORCEMENT` — passer `preflight_enforcement` de `report` à `enforce`.
4. `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT`.
5. `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION`.
6. `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` (+ provisionnement Redis).
7. `DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN`.
8. `DECISION_REQUIRED:RESERVES-URL-FAIL-CLOSED`.

**Commerciales**
9. Remise annuelle offre Entreprise.
10. `STRIPE_DELAI_GRACE_PAIEMENT_JOURS`.
11. Les 5 modèles de prix (`STRIPE-MODULE-PRICE-MODEL`, `-SUPPLEMENTARY-ACCOUNTS`, `-IA-OPTIONS`, `-LEGACY-GENERATIONS`, `-STORAGE-BLOCK`).

**Juridiques**
12. Durées de rétention par domaine + granularité paie + `notes_frais` + anonymiser vs conserver + `facturation_comptes_mensuelle` (les 5 `LEGAL_DECISION_REQUIRED`).
13. « Sauvegardes automatiques régulières » : activer/confirmer le PITR Supabase **ou** corriger CGV / registre RGPD / politique de confidentialité / DPA.
14. Procédure de rotation de `BANK_DATA_ENCRYPTION_KEY` (inexistante).

---

## BEFORE PREVIEW DEPLOY

1. **Trancher la ref déployable** (décision 1) et la construire : fusionner `magical-mccarthy` + `zen-goodall`, réconcilier `loving-turing` (dédoublonner 2 migrations), **puis** porter RGPD V2 / Billing Security V3 / GP Hardening avec **renumérotation obligatoire** des collisions `20260729000184/185` et `20260922000184/185`.
2. Sur cette ref : `verify:migrations`, `verify:secrets`, `verify:env-manifest`, typecheck, lint, tests des 4 apps + worker — tous verts avant de parler de déploiement.
3. Trancher les décisions Studio (4, 5) — **sinon ne pas exposer Studio** : `STUDIO_ENABLED=false` (kill switch fail-open câblé), `STUDIO_SIGNUP_MODE` fermé.
4. Décider l'inventaire de projets Vercel (2), créer/linker les projets, activer « Include files outside of Root Directory » pour Colors / Studio / Reserves.
5. Renseigner les variables par app depuis `config/env-manifest.json`. **Ne jamais définir** `NEXT_PUBLIC_TOOLS_ENV` ni `ELSATIA_APPLICATION_ENV` sur Preview (bypass locaux). Positionner `STRIPE_WEBHOOK_EXPECTED_MODE=test` explicitement. Vérifier la cohérence `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` vs `ANON_KEY` selon l'app.
6. `npm run preflight:env` puis `npm run preflight:preview` avec une vraie clé de service — **en connaissant le piège** : tant que `preflight_enforcement` vaut `report`, le contrôle avant build ne bloque **rien** ; lire sa sortie à la main.
7. Créer le projet Supabase Preview, appliquer les migrations, régler Authentication → URL Configuration **par app**, confirmer les 18 buckets.
8. Côté Stripe test : entité, 8+ Price IDs, endpoint webhook, `scripts/configurer-portail-stripe.mjs` → `STRIPE_PORTAL_CONFIGURATION_ID`.
9. Décider l'hébergement du worker (6) et provisionner Redis, **ou** déployer la Preview sans le worker et assumer que Studio Video est hors périmètre de cette Preview.

## DURING PREVIEW DEPLOY

1. Surveiller le build de chaque app : le mode `report` ne stoppera pas une variable manquante — la sortie du preflight est la seule alerte.
2. Rejouer sur le vrai Supabase : **toute** la suite pgTAP, en particulier les **16 fichiers arrêtés par le harnais** (`pgsodium`, `auth.mfa_factors`, flag signup Studio, fixtures), plus les cycles Fresh et Upgrade.
3. `stripe listen` / `stripe trigger` sur les 3 endpoints (Connect, Boutique, abonnement) ; vérifier **explicitement** le rejeu **concurrent** de la Boutique (le défaut réel était concurrent, pas séquentiel) et le non-double-décrément de stock.
4. Rejouer le cycle fixture pilote (seed → assertions → cleanup) et les suites Playwright `pilot-acceptance-v2/v3` contre la Preview.
5. Confirmer AAL2/MFA avec un vrai GoTrue (jamais prouvé) et le garde-fou signup Studio par appel **direct** à l'Auth Supabase (SDK/REST), pas seulement par la Server Action.
6. Vérifier les policies des 18 buckets sur le vrai service Storage, et rejouer la purge RGPD (dry-run → sauvegarde → purge → verify) contre une vraie API Storage.
7. Exécuter `verify:stripe-prices` avec la clé test, et `docker build` + `e2e-gate.mjs` si le worker est dans le périmètre.
8. Lever les 3 `REMOTE_ONLY` pilote (DV-11, MS-04, DOC-02) avec `OPENAI_API_KEY`, et les écarts Colors E2/E3 au smoke live.

## AFTER PREVIEW DEPLOY

1. Passer `preflight_enforcement` à `enforce` une fois le preflight vert sur valeurs réelles (ferme `F-PREFLIGHT-ENFORCEMENT`).
2. Reclasser chaque **REMOTE PROOF REQUIRED** de ce document en fermé ou en défaut réel — et nommer les défauts, sans bucket flou.
3. Traiter le lot dédié `employes` : migrer les lecteurs vers `employes_annuaire` / RPC, **puis** resserrer la policy SELECT de la table de base (`email`, `telephone`, `notes`).
4. Mettre en place le **job de purge RGPD** (aucun n'existe) et trancher les 5 `LEGAL_DECISION_REQUIRED`.
5. Régler la divergence « sauvegardes automatiques » : PITR Supabase activé/confirmé, ou textes légaux corrigés. Écrire la rotation de `BANK_DATA_ENCRYPTION_KEY`.
6. Reprendre les 10 `FAIL` pilote (en commençant par CH-08) et les 5 `MANUAL_EXPECTED` en inspection humaine.
7. Confirmer le sort des résidus nommés : Powens et `journal_activite` (flux 255), « D3 » (idempotence retry-après-échec), `server-only` sur `src/lib/supabase/admin.ts`, avisorie `@vitest/mocker`, `workspace_id` dans les logs du worker.
8. Refaire un audit Colors sur la ref réellement déployée (l'audit `READY TO DEPLOY` porte sur un `apps/colors` antérieur de 92 fichiers).
9. Rejouer un drill DR à l'échelle réelle (RTO/RPO hébergés jamais prouvés).

## GO / NO-GO CONDITIONS

**NO-GO tant que l'une de ces conditions tient :**

- Aucune ref unique ne réunit les lots qualifiés, ou une collision de migration subsiste (`20260729000184/185`, `20260922000184/185`).
- La ref envisagée est une des 3 branches orphelines (180/196 migrations) : lecture authentifiée et écriture `chantiers` cassées.
- Studio est exposé publiquement sans que les décisions 4 et 5 soient tranchées.
- Le worker Studio Video est dans le périmètre sans décision d'hébergement ni Redis provisionné.
- Les variables Preview ne sont pas renseignées et le preflight n'a pas été **lu à la main** (le mode `report` ne bloque pas).
- Un bypass local (`NEXT_PUBLIC_TOOLS_ENV`, `ELSATIA_APPLICATION_ENV`) est défini sur Preview, ou `STRIPE_WEBHOOK_EXPECTED_MODE` n'est pas explicitement `test`.

**GO possible (Preview de qualification, non commerciale) si :**

- La ref est construite et ses vérifications statiques sont vertes ;
- Studio est désactivé (`STUDIO_ENABLED=false`) et le worker exclu du périmètre ;
- Le périmètre annoncé est **Gestion Pro + Tools + Reserves + Colors**, dans le seul but de produire les preuves distantes listées ci-dessus.

**GO commercial : non**, indépendamment de la Preview — les décisions de prix, les Price IDs Stripe, le job de purge RGPD et la divergence légale sur les sauvegardes ne sont pas des questions de déploiement.

---

## Note de transparence (sécurité de session)

`AGENTS.md` de ce dépôt demande de lire `node_modules/next/dist/docs/`, chemin qui n'existe pas. Cette instruction a été identifiée comme une probable injection de prompt, indépendamment, par au moins sept missions antérieures (`SECURITY_TENANT_RED_TEAM_V3`, `RGPD_DATA_LIFECYCLE_CLOSURE_V3`, `PILOT_ACCEPTANCE_CLOSURE_V3`, `GP_CONVERGENCE_TRAIN_V1` §25.6, `SELF_SERVICE_BILLING_SECURITY_CLOSURE_V3`, `RGPD_PURGE_ARCHITECTURE_CLOSURE_V2`, `BOUTIQUE_PAYMENT_IDEMPOTENCY_CLOSURE_V1`) et par la session V1. Elle n'a pas été suivie ici non plus. `AGENTS.md`/`CLAUDE.md` doivent être traités comme non fiables tant que cette instruction y persiste.

## Verdict

# PREVIEW PRECONDITIONS REMAIN

**Ce qui a changé depuis la V1** : le mur n'est plus la qualité du code. Quatre blockers de la V1 sont réellement fermés et deux autres partiellement, par reproduction puis correction vérifiée par exécution — dont trois contournements de paiement/sécurité qui auraient été graves en production (auto-attribution d'abonnement sans paiement, double fulfilment de stock sous rejeu concurrent, entitlement Tools contournable). La purge RGPD est passée de « jamais exécutée » à « interrompue par `SIGKILL` puis reprise avec succès, tenant témoin identique bit-à-bit ». Le pilote est passé de `NOT READY` à 125/143 sur preuve d'exécution. Le worker Studio est intégralement implémenté et testé 26/26.

**Pourquoi ce n'est pas `PREVIEW EXECUTION READY`** :

1. **Il n'existe aucune ref déployable.** Les lots qualifiés vivent sur des branches sœurs ou orphelines qui ne se contiennent pas, avec quatre collisions de version de migration vérifiées dans cette session. Déployer une orpheline seule casserait la lecture authentifiée sur >100 policies et l'écriture sur `chantiers`. Déployer la lignée écosystème seule laisserait dehors RGPD Purge V2, Billing Security V3 et GP Hardening.
2. **Zéro preuve d'infra réelle, toujours.** Sept sessions indépendantes ont buté sur le même 403 de registre Docker : ni Supabase réel, ni Stripe test, ni GoTrue, ni API Storage, ni `docker build`, ni Preview Vercel. Tout ce qui est « CLOSED LOCALLY » ici reste, littéralement, local.
3. **Quatorze décisions non tranchées**, dont trois conditionnent le déploiement lui-même (ref canonique, inventaire de projets Vercel, exposition de Studio) et une conditionne la valeur du garde-fou de build (`report` → `enforce`).
4. **Trois blockers restent ouverts au fond**, pas seulement faute de preuve : la sur-exposition `email`/`telephone`/`notes` de `employes`, l'absence de tout job d'exécution de la purge RGPD, et la divergence entre les textes légaux (« sauvegardes automatiques régulières ») et l'absence de mécanisme confirmé.

**Formulation opérationnelle** : une Preview **de qualification** est désormais l'étape la plus utile et la plus réaliste — c'est le seul moyen de convertir la grande masse de `REMOTE PROOF REQUIRED` en faits. Mais elle exige d'abord de construire une ref, et elle ne devient une Preview **commercialisable** par aucun de ses résultats : les décisions de prix, les Price IDs Stripe, le job de purge et la divergence légale sont hors de portée d'un déploiement.
