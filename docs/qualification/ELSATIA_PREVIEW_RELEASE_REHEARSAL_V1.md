# ELSATIA — Répétition générale de release vers Preview (V1)

**Date** : 2026-09-20
**Portée** : répétition/qualification d'un parcours CODE QUALIFIÉ → MIGRATIONS → CONFIGURATION → PREVIEW → AUTH → STORAGE → TESTS → ROLLBACK. **Aucun déploiement Production. Aucun Stripe Live. Aucune donnée cliente réelle.**
**Auteur** : session Claude Code autonome (~4-6h), sandbox isolée, sans accès réseau à Supabase/Vercel/Stripe.

## 0. Note de méthode — ce que cet environnement peut et ne peut pas prouver

Cette session tourne dans un conteneur éphémère **sans** CLI Supabase, **sans** CLI Vercel, **sans** CLI Stripe, **sans** aucune variable d'environnement `SUPABASE_*`/`VERCEL_*`/`STRIPE_*`/`DATABASE_URL`, et **sans** Docker (donc `supabase start` est indisponible). Il n'y a **aucun accès réel au projet Supabase Preview, au projet Vercel Preview, ni à Stripe Test** dans cette session.

En revanche, un vrai serveur **PostgreSQL 16** local (apt, root) est disponible, avec `psql`/`pg_dump`/`pg_restore`/`pg_prove`+`pgtap` (installés durant cette session). Cela permet une **répétition locale authentique** (pas une simulation en l'air) de : replay exact de la séquence de migrations, tests pgTAP réels, tests d'isolation RLS multi-tenant réels, backup/restore réel — mais **sur une base PostgreSQL 16 nue reconstituant un sous-ensemble du plateau Supabase (schémas `auth`/`storage`, rôles, `auth.uid()`), pas sur l'environnement Supabase hébergé réel.**

**Conséquence directe sur les verdicts** : chaque contrôle qui nécessiterait Preview/Vercel/Supabase/Auth/Storage/Stripe réels est marqué `NOT_PROVEN_REMOTE`. Aucun résultat local, même parfait, n'est présenté comme équivalent à une preuve distante. Conformément à l'instruction explicite reçue en cours de mission, le verdict final ne peut donc **jamais** être `PREVIEW QUALIFIED` dans cette session.

Le harnais de répétition locale (stub `auth`/`storage`/rôles/`pgsodium`, scripts de replay) est documenté intégralement en §MIGRATIONS ci-dessous. **Aucun fichier de migration réel n'a été modifié** ; deux copies de travail (hors dépôt, dans `/tmp/pg_rehearsal/`) ont eu une ligne `create extension pgsodium` commentée pour la seule raison que `pgsodium` est une extension propriétaire de la plateforme Supabase, non installable sur PostgreSQL vanille.

---

## Tableau principal

| Étape | Prévu | Exécuté | Résultat | Preuve | Blocage |
|---|---|---|---|---|---|
| 1. Identifier BASE_PREVIEW_CANDIDATE | Comparer les trains GP/V3/commercial/Colors | Comparaison de 24 branches + tag, ancêtre/descendance, migrations | `WORKING_REHEARSAL_BASE` retenue, `FINAL_PREVIEW_CONVERGENCE_BASE` = `DECISION_REQUIRED` | §BASE | **DECISION_REQUIRED** |
| 2. Inventaire Preview actuel | Supabase/Vercel Preview, env, versions, hosts | Recherche credentials/CLI dans le sandbox | Aucun accès | — | **NOT_PROVEN_REMOTE / DECISION_REQUIRED** (accès à fournir) |
| 3. Diff local → Preview | Matrice migrations/tables/RLS/Storage/vars/catalogue | Colonne "local" remplie, colonne "Preview" inconnue | Partiel | §DIFF | Preview inconnue |
| 4. Plan de migration Preview | 11 étapes avec PASS/BLOCK/rollback | Rédigé à partir des runbooks existants (non fusionnés sur main) | Fait | §PLAN | — |
| 5. Backup avant release | DB+Storage+sentinelle+versions, vérifiable | `pg_dump`/`sha256` sur base locale rejouée | `LOCAL_POSTGRES_BACKUP_RESTORE = PASS` ; `HOSTED_SUPABASE_RESTORE = NOT_PROVEN_REMOTE` | §DR | **BLOCK réel Preview tant que non prouvé en hébergé** |
| 6. Migrations — Fresh | Rejouer la séquence exacte sur base jetable | 263/263 migrations rejouées sur PostgreSQL 16 local | PASS (2 écarts d'infrastructure documentés, 0 erreur applicative) | §MIGRATIONS | — |
| 6bis. Migrations — Upgrade | Depuis l'état Preview réel ou clone fidèle | `main` (178) utilisé comme **`SIMULATED_UPGRADE_BASELINE`** (Preview réelle non interrogeable) | Chaîne sans collision ni trou | §MIGRATIONS | `ACTUAL_PREVIEW_UPGRADE = NOT_PROVEN_REMOTE` |
| 7. Auth | signup/login/refresh/logout/reset/MFA/AAL2/suspension | Cartographie statique complète du code (tous les flux localisés fichier:ligne) | Code cohérent, 1 point à confirmer (voir §AUTH) | §AUTH | **NOT_PROVEN_REMOTE** (test humain sur vraie Preview requis) |
| 8. Multi-tenant | A/B isolation lecture/écriture/Storage/RPC | Rejoué réellement en local avec 2 tenants synthétiques + RLS active | Isolation PASS sur toutes les tables testées, **1 fuite RPC réelle trouvée** | §MULTI-TENANT | **Fixer la fuite avant Preview** ; validation finale `NOT_PROVEN_REMOTE` |
| 9. Applications (Colors/Tools/GP) | URL/login/session/entitlement/401-403/nav | Inventaire statique (3 apps Next.js distinctes identifiées) | Table produite, aucune ligne testée en vrai | §APPLICATIONS | **NOT_PROVEN_REMOTE** |
| 10. Gestion Pro — smoke métier | client→devis→facture→encaissement→pointage | Flux localisés dans le code, non exécutés en vrai | Checklist prête | §GP | **NOT_PROVEN_REMOTE** |
| 11. Documents | brouillon/émis/PDF/lien public/snapshot | Checklist prête depuis le code | — | §GP | **NOT_PROVEN_REMOTE** |
| 12. Commercial/Stripe | mapping prix, abonnement test, webhook idempotent | Mécanismes de code confirmés (mode fail-closed, dédup event id) | Code prêt | §COMMERCIAL | `NOT_PROVEN_REMOTE` (aucune clé Stripe Test dans le sandbox) |
| 13. Storage | upload/lecture/permissions/suppression/orphelin | Rejoué en local (RLS storage.objects réelle) | PASS sur les chemins testés | §STORAGE | **NOT_PROVEN_REMOTE** pour signed URLs réelles |
| 14. Healthcheck/observabilité | détection front/API/DB/Auth/Storage/worker/webhook down | Revue statique | 3 lacunes trouvées (voir §DR) | §DR | À corriger avant Preview surveillée |
| 15. Rollback | code + DB + restauration + validation | Rejoué en local (backup/restore réel), doctrine existante lue intégralement | `LOCAL_POSTGRES_BACKUP_RESTORE = PASS` | §ROLLBACK | `HOSTED_SUPABASE_RESTORE = NOT_PROVEN_REMOTE` |
| 16. Release gate | PASS/WARN/BLOCK code/migrations/env/secrets/build/tests/DR | Exécuté réellement (`npm run verify` + pgTAP + npm audit, 3 apps) | Voir tableau §RELEASE GATE | §RELEASE GATE | **1 BLOCK réel (CVE critique Next.js), 1 BLOCK réel (fuite RPC)** |

---

## BASE

- `WORKING_REHEARSAL_BASE = release/tools-store-preflight-v1`
- `TIP = bf27e78c1215ed258c89057b1d50b30d93fd1b86` (2026-09-07)
- `LEDGER` : 263 migrations, la plus récente `20260905000265_essai_30_jours_modules_catalogue_v1.sql`
- `FINAL_PREVIEW_CONVERGENCE_BASE = DECISION_REQUIRED`

24 branches/tags comparés (ancêtre/descendance, avance/retard sur `main`, compte de migrations). **Aucune n'est un sur-ensemble strict des autres** — conformément à la consigne reçue, aucune fusion massive silencieuse n'a été fabriquée. `release/tools-store-preflight-v1` est retenue comme **base de travail pour cette répétition** (la plus large, la plus récemment consolidée : 361 commits / 263 migrations en avance sur `main`, absorbe `commercialisation`, `alertes-delegation`, `terrain-mobile`, `multi-app-convergence`, `colors-canonical(codex)`, `canonical-integration-preprod`), **mais elle n'est pas présentée comme la future branche de déploiement**.

**Ce qui manque à la convergence finale (liste précise, commits comptés) :**

| Train manquant | Tip | Commits manquants | Contenu |
|---|---|---|---|
| `release/gp-v1-rc` ≡ `integration/gp-external-pilot-closure-v1` | `8caef219` | 7 | Durcissement privilèges EXECUTE/anon sur 22 fonctions `SECURITY DEFINER` — **non négociable, sécurité** |
| `integration/gp-postcutover-precommercial-ops-v1` | `4266ba6` | 9 | Contenu GP pilote externe / opérations post-cutover (la substance du train "GP pilot ops" nommée dans les conventions de branches) |
| `feat/elsatia-canonical-final-r73-v1` | `e65fc05` | 33 | Travaux UI/nav canonique |
| `docs/gp-cutover-documentation-closure-on-hotfix-v1` | `f96dd8f` | 8 | Clôture documentaire cutover GP |
| `codex/elsatia-root-qa-closure-v1` | `01720b6` | 1-3 | Clôture QA |
| `codex/elsatia-preprod-db-e2e-rollback-v1` | `a354d13` | 1-3 | Preuves E2E rollback preprod |
| `docs/elsatia-production-migration-cutover-preflight-v1` | `25e377b` | 1-3 | Preflight cutover Production (contient les runbooks lus en §DR/§ROLLBACK) |
| `docs/elsatia-production-rollback-runbook-v1` | `a3aad60` | 1-3 | Runbook rollback Production |

**Alternative si la "story GP pilote" doit primer** : `integration/gp-postcutover-precommercial-ops-v1` (300 commits/265 migrations sur `main`, le plus large des 3 trains GP postcutover) — mais alors il manque les 70 commits de `tools-store-preflight-v1`, le durcissement de `gp-v1-rc`, et les trains canonical-final/QA/rollback.

**Un vrai sur-ensemble nécessiterait une fusion d'intégration explicite** : `release/tools-store-preflight-v1` + `release/gp-v1-rc` + `integration/gp-postcutover-precommercial-ops-v1` + `feat/elsatia-canonical-final-r73-v1` + les clôtures QA/rollback/docs restantes. Cette fusion n'a **pas** été fabriquée ici.

**Écart signalé en cours de mission (`DECISION_REQUIRED`)** : la branche `integration/gp-external-pilot-readiness-v1` (tip `f2917b54`) citée comme devant contenir des "fermetures GP pilote externe importantes" **n'existe pas** sur `origin` (vérifié par `git ls-remote --heads` et `git cat-file`), et le SHA `f2917b54` n'est un objet valide nulle part dans l'historique du dépôt. La branche réelle la plus proche par le nom est `integration/gp-external-pilot-closure-v1` (note : *closure*, pas *readiness*) — dont le tip `8caef219` est **déjà** comptabilisé ci-dessus (identique à `release/gp-v1-rc`). Si une branche distincte, plus récente, existe réellement mais n'a pas encore été poussée sur `origin` au moment de cette répétition, elle doit être re-fournie pour être intégrée à l'analyse — non fabriquée par déduction.

---

## MIGRATIONS

**Harnais de répétition locale** (documenté intégralement, aucune migration réelle modifiée) :
- Schémas `auth`/`storage`/`extensions`/`graphql_public`/`pgsodium` recréés à la main avec un sous-ensemble réaliste des colonnes Supabase réellement référencées par les migrations/tests (`auth.users`, `auth.mfa_factors`, `storage.buckets`, `storage.objects`).
- `auth.uid()`/`auth.role()`/`auth.jwt()`/`auth.email()` simulés via des variables de session (`request.jwt.claim.*`), à la place du vrai GoTrue/PostgREST.
- `storage.foldername()` reproduite à l'identique de l'extension Supabase Storage réelle.
- `pgcrypto` pré-installée dans le schéma `extensions` + `search_path` positionné sur `(public, extensions)`, reproduisant le provisioning de plateforme Supabase réel (pas un correctif applicatif).
- Grants de base (`auth`/`storage`/`extensions` → `anon`/`authenticated`/`service_role`) + RLS activée sur `storage.objects`/`storage.buckets`, reproduisant la base fournie par la plateforme que les migrations du projet durcissent ensuite (GRANT/REVOKE ciblés).
- `pgsodium` : schéma + `crypto_sign_verify_detached()` simulés (retourne toujours `false`) car `pgsodium` est une extension propriétaire de la plateforme Supabase, non installable sur PostgreSQL vanille. **Seul point où 2 copies de travail (hors dépôt) ont eu une ligne commentée** (`create extension if not exists pgsodium;` dans les copies de `20260828000244_stripe_state_attestation_r72.sql`) — le fichier git réel n'a jamais été touché.

**Drill Fresh** : 263/263 migrations de `supabase/migrations/` rejouées, dans l'ordre lexical exact, sur une base PostgreSQL 16 neuve. **0 erreur SQL applicative.** (2 erreurs d'infrastructure du stub rencontrées et corrigées dans le harnais — fonction `storage.foldername()` manquante, extension `pgsodium` absente — pas des défauts des migrations.)
Compteurs post-migration : **181 tables publiques (181/181 = 100% RLS activée)**, **522 policies RLS**, **445 fonctions publiques**, **114 triggers**. Aucun schéma DB séparé par app (`colors`/`tools`) — l'isolation multi-app passe par des tables catalogue/entitlement dans `public` (confirmé : 11 tables préfixées colors/tools).

**Drill Upgrade — `SIMULATED_UPGRADE_BASELINE`** : les 178 fichiers de migration de `main` forment un préfixe strict, sans trou, lexicalement contigu des 263 de la base de travail (`comm -23` vide ; tri combiné `main`+delta = ordre naturel de la base de travail). Donc "appliquer les 178 de `main`, puis les 85 du delta" est **mathématiquement identique** au chemin Fresh — aucune collision/réordonnancement supplémentaire détecté. **`main` est utilisé ici comme substitut de "ledger Preview actuel" faute de credentials pour interroger le vrai projet Preview** (`supabase migration list --linked` impossible). `ACTUAL_PREVIEW_UPGRADE = NOT_PROVEN_REMOTE` tant que ce ledger réel n'a pas été interrogé.

**pgTAP (tests réels écrits par l'équipe ELSATIA)** : 54 fichiers sous `supabase/tests/`, exécutés via `pg_prove` (extension `pgtap` installée dans ce sandbox pour l'occasion) contre la base Fresh rejouée. **Résultat final : 53/54 fichiers entièrement verts, 1125/1125 assertions exécutées passantes, zéro échec d'assertion réel.** Le seul fichier bloqué (`platform_stripe_state_attestation_r72.test.sql`) nécessite `pgsodium.crypto_sign_detached()` (signature Ed25519 réelle) pour construire des signatures de test valides — bloqué par le même écart `pgsodium`, documenté, non un défaut applicatif.
Point de comparaison : le runbook existant (non fusionné sur `main`) `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` rapporte 54 fichiers/1154 tests PASS sur une vraie stack Supabase CLI/Docker à un baseline antérieur (210/263 migrations) — nos 1125 (53 fichiers) sont cohérents avec cela, à l'écart près du fichier dépendant de `pgsodium`.

---

## AUTH

Cartographie statique complète (aucun test live possible sans Preview réelle) — fichiers clés : `src/app/actions/auth.ts`, `src/app/auth/confirm/page.tsx`, `src/lib/entreprise.ts`, `src/lib/supabase/proxy.ts`, `src/lib/auth/mfa.ts`, `src/lib/auth/mfa-server.ts`.

- Signup / confirmation email / login / reset password : implémentés en Server Actions via `@supabase/ssr`, comportements cohérents (pas d'énumération de compte au reset, confirmation par bouton explicite pour éviter la consommation du lien par un pré-fetcheur).
- Refresh : géré par le cookie roundtrip de `@supabase/ssr` dans le middleware (`getUser()`, jamais `getSession()` — commentaire explicite dans le code).
- **Logout : `logoutAction` appelle `supabase.auth.signOut()` sans `scope` → portée `global` par défaut (déconnecte TOUTES les sessions/appareils), non documentée dans le code lui-même.** À confirmer que c'est le comportement voulu avant test Preview (sinon un test multi-appareils donnera un résultat inattendu).
- AAL2/MFA : **appliqué à deux niveaux indépendants** (middleware `proxy.ts` + layout `plateforme/layout.tsx`), cohérent avec la doctrine des runbooks. Pas seulement au niveau RPC DB comme le laissaient penser certains runbooks — défense en profondeur réelle, vérifiée dans le code.
- États entreprise/entitlement/rôle/suspension centralisés dans `src/lib/entreprise.ts::getContexteEntreprise` : redirections `/onboarding`, `/abonnement-suspendu`, `/en-attente` toutes localisées et cohérentes.

**Checklist de test manuel Preview (à exécuter avec un vrai accès, compte de recette uniquement)** : cf. table §APPLICATIONS et section 7 du prompt de mission — chaque flux ci-dessus a son point de clic exact documenté dans le rapport de revue statique (disponible sur demande, fichier:ligne pour chacun).

`Verdict section = NOT_PROVEN_REMOTE` (code cohérent, aucune exécution live).

---

## MULTI-TENANT

Rejoué **réellement** en local : 2 entreprises synthétiques A/B, RLS active (rôle `authenticated`, `auth.uid()` simulé via GUC de session), sur la base Fresh rejouée.

**Résultats (PASS, preuves quantitatives)** :
- Lecture croisée A→B sur `clients`/`chantiers`/`factures` : 0 ligne visible dans tous les cas.
- UPDATE/DELETE croisés A→B : 0 ligne affectée (invisible, pas juste "refusé" — comportement RLS correct).
- Contrôle positif (A sur ses propres lignes) : 1/1/1, UPDATE 1 — harnais validé.
- `applications_autorisees(entreprise_id)` : **vérifie bien l'appartenance de l'appelant** avant de répondre (0 ligne si on lui passe l'ID d'une entreprise étrangère).
- Storage : isolation d'écriture correcte (DELETE croisé bloqué) ; lecture publique du bucket `entreprise-assets` (logos) confirmée **volontaire par design** (policy `TO public`, logos utilisés sur factures).
- Rôle `anon` (sans JWT) : aucun accès table par table (GRANT absent), plus fort qu'une simple RLS.
- Tables d'entitlement (`applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, `modules_entreprises`) : confirmé SELECT-seul pour `authenticated`, aucune policy d'écriture.

**⚠️ FINDING RÉEL (à corriger avant Preview)** : `module_gestion_pro_actif_entreprise(p_entreprise_id, p_module_code)` — fonction `SECURITY DEFINER`, `EXECUTE` accordé à `authenticated` — **ne vérifie pas** que l'appelant est membre de `p_entreprise_id` avant de répondre (contrairement à `a_acces_application`/`applications_autorisees`, qui le font correctement). Confirmé par lecture du corps de fonction (`\sf`) et par preuve empirique : l'entreprise B a un module `stock` actif ; l'utilisateur A (sans lien avec B) appelant `module_gestion_pro_actif_entreprise('<ENT_B>','stock')` obtient **`true`** — fuite booléenne de l'état d'activation d'un module payant d'une entreprise tierce (pas de fuite de lignes de données, mais fuite de métadonnée commerciale cross-tenant).

`Verdict section` : isolation de données = **PASS local** ; **1 correctif requis avant Preview** (fonction d'entitlement à faire vérifier l'appartenance comme ses sœurs) ; validation finale sur Preview réelle = `NOT_PROVEN_REMOTE`.

---

## APPLICATIONS

Trois applications Next.js distinctes coexistent dans la base de travail (pas de séparation par schéma DB, catalogue/entitlement partagé) :

| App | Racine | Next.js | Wiring dans `npm run verify` racine | État local |
|---|---|---|---|---|
| Gestion Pro (GP, principale) | `src/` | 16.2.12 | Oui | typecheck/lint/test/build **PASS** |
| Colors | `apps/colors/` | 16.2.12 | **Non** — scripts propres, jamais appelés par la racine | typecheck/lint/test **PASS** (exécutés séparément dans cette session) ; build non tenté (nécessite ses propres env vars) |
| Tools (Atelier) | `apps/tools/` | 16.2.12 | Partiel (`npm --prefix apps/tools run ...`) | typecheck/lint/test **PASS** ; build **bloqué par un garde-fou volontaire** (`verify:public-env` — voir §RELEASE GATE) |

| App | URL Preview | Login | Entitlement | Navigation | Smoke | État |
|---|---|---|---|---|---|---|
| GP | inconnue (pas de credentials) | — | — | — | — | `NOT_PROVEN_REMOTE` |
| Colors | inconnue | — | — | — | — | `NOT_PROVEN_REMOTE` |
| Tools | inconnue | — | — | — | — | `NOT_PROVEN_REMOTE` |

**Blocage** : sans accès Vercel Preview (aucun token dans ce sandbox), impossible d'obtenir les URLs réelles ni de dérouler un login/session/401-403 réel. `DECISION_REQUIRED` : fournir un accès (au minimum en lecture) au projet Vercel Preview pour la prochaine itération.

---

## GP (Gestion Pro — smoke métier) & Documents

Flux localisés dans le code (Server Actions `src/app/actions/*`, routes `src/app/api/**`) pour client → chantier → devis → émission → PDF → partage → acceptation → facture → encaissement → pointage → export, ainsi que brouillon non-envoyable / document émis immuable / lien public / snapshot / logo / échéance / conditions de paiement — **tous existent en code** (confirmé par la revue statique Auth/Storage/Stripe/healthcheck de cette session) mais **aucun n'a été exécuté en conditions réelles** (pas de serveur Next.js démarré contre une vraie base Auth/Storage fonctionnelle dans ce sandbox — `supabase start` indisponible sans Docker).

`Verdict = NOT_PROVEN_REMOTE`. Checklist prête à dérouler manuellement dès qu'un accès Preview existe.

---

## STORAGE

Rejoué réellement en local (RLS sur `storage.objects`/`storage.buckets` active, cf. §MULTI-TENANT). Code applicatif revu statiquement (`src/app/actions/documents.ts`, `src/app/api/devis/[id]/pieces-jointes/**`) :
- Upload : double isolation — vérification de propriété en base **et** construction du chemin avec `entreprise_id` (défense en profondeur au-dessus de la RLS).
- Lecture : exclusivement via `createSignedUrl` à courte durée de vie (60-900s), jamais d'URL publique sauf le bucket `entreprise-assets` (logos, volontairement public).
- Suppression : re-vérification du préfixe `entreprise_id` avant `.remove()`.
- Isolation locale testée : écriture croisée A→B bloquée (0 ligne affectée) ; lecture des logos publics confirmée volontaire.

`Verdict = PASS local` sur les chemins d'isolation testés ; `NOT_PROVEN_REMOTE` pour la génération réelle d'URL signées / upload navigateur réel (nécessite le service Storage Supabase réel, absent du sandbox).

---

## COMMERCIAL (Stripe Test)

Aucune clé Stripe Test dans ce sandbox → conformément à la mission, **simulé uniquement via revue de code**, marqué `NOT_PROVEN_REMOTE` :
- Garde fail-closed réel : `resoudreModeStripeWebhook` (`src/lib/stripe-webhook-environment.ts`) exige `STRIPE_WEBHOOK_EXPECTED_MODE` exactement `test`/`live`, rejette/ignore un événement dont le mode ne correspond pas.
- Idempotence réelle : dédup par `stripe_event_id` via RPC `reserver_evenement_abonnement_service`, retour `duplicate:true` si rejoué.
- `scripts/verify-stripe-prices.mjs` (`npm run verify:stripe-prices`) compare le catalogue de prix local à Stripe ; **non exécutable ici** (nécessite `STRIPE_SECRET_KEY`) — a tourné en mode non strict (skip silencieux) dans le release gate.
- `ABONNEMENTS_PUBLICS_OUVERTS` : kill-switch de signup self-service, fermé par défaut.

`Verdict = NOT_PROVEN_REMOTE`.

---

## DR (Disaster Recovery)

**Aucun outil de backup/restore/release-gate scripté n'existe dans le dépôt** (confirmé par recherche exhaustive : rien dans `scripts/`, aucun workflow GitHub Actions de backup/migration/rollback — seul `.github/workflows/ci.yml` existe, un unique job `verification`). Toute la doctrine DR existe sous forme de **runbooks Markdown non fusionnés sur `main`** (présents dans `WORKING_REHEARSAL_BASE`, sous `docs/runbooks/`) :
- `ELSATIA_PRODUCTION_ROLLBACK_V1.md` : prérequis P1-P14, séquence de backup (`pg_dump --compress=9` → SHA-256 → volume DR chiffré → manifeste → rétention 7/4/12), 3 stratégies de rollback DB (A. forward-fix préféré, B. restauration snapshot/PITR, C. bundle de compatibilité d'urgence — jamais de GRANT/REVOKE improvisé sous pression), arbre de décision T0-T4, critères GO/NO-GO.
- `ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` : template de drills Fresh/Restore/Rollback exécutés sur vraie stack Supabase CLI/Docker à un baseline antérieur — **cette répétition en reproduit la méthode sur PostgreSQL local nu** (voir §MIGRATIONS et §ROLLBACK).
- `ELSATIA_RELEASE_GOVERNANCE_V1.md` : le "gate" réel est un GitHub Ruleset (`main` : 1 review + code owner + check requis `Contrôles techniques / verification`) + branche de Production Vercel = `release/commercialisation-v1` (déclaratif, non vérifiable sans token Vercel dans ce sandbox).

**Backup réel effectué dans cette session** (sur la base locale rejouée, PAS sur Preview hébergée) : `pg_dump -Fc --compress=9`, `backup_id=rehearsal_20260920T213007Z`, taille 2 008 552 octets, **SHA-256 `a79774af466ab047473fab32391dfb07b262e100b8bc56a68152d6cdffe53d48`**, manifeste JSON écrit. Restauré dans une base neuve : compteurs d'objets identiques avant/après (181 tables / 522 policies / 445 fonctions / 114 triggers), 0 erreur.

`LOCAL_POSTGRES_BACKUP_RESTORE = PASS`. `HOSTED_SUPABASE_RESTORE = NOT_PROVEN_REMOTE` — **BLOCK réel** de toute release Preview tant que le backup n'est pas prouvé sur l'infrastructure hébergée réelle (règle explicite de la mission : "Si le backup n'est pas prouvé : BLOCK la release Preview").

**Lacunes healthcheck/observabilité trouvées (revue statique)** :
1. Aucune route `/api/health` ou `/api/status` n'existe ; `/monitoring` est listé comme chemin public dans le middleware mais aucune route correspondante n'existe (référence morte).
2. Pas de `sentry.client.config.ts` trouvé alors que `docs/SENTRY.md` documente `NEXT_PUBLIC_SENTRY_DSN` "pour le navigateur" — à confirmer intentionnel.
3. Les échecs par tenant dans les deux jobs cron (`abonnements`, `notifications-push`) sont avalés silencieusement dans un corps JSON HTTP 200 (pas de `console.error`, pas de capture Sentry) — invisibles pour la surveillance Vercel qui n'alerte que sur non-2xx.

---

## ROLLBACK

- **Rollback code (git)** : trivial et pleinement démontrable — `git revert`/checkout d'un SHA antérieur sur la branche de release, cohérent avec la doctrine du runbook (jamais de rebase destructif sur une branche partagée).
- **Rollback DB** : confirmé **forward-only** — aucune down-migration n'existe dans `supabase/migrations/`. La doctrine existante est explicite : *"UN ROLLBACK VERCEL SEUL N'EST PAS SUFFISANT APRÈS APPLICATION DES MIGRATIONS ACL/MFA"* — la migration `20260902000255_acl_reconciliation_v1.sql` applique ~1220 REVOKE ciblés ; un ancien binaire applicatif peut donc échouer "fermé" après un simple rollback Vercel sans restauration DB coordonnée.
- **Restauration réelle rejouée** (voir §DR) : `pg_dump`/`pg_restore` sur base locale, compteurs d'objets identiques avant/après, 0 erreur. `LOCAL_POSTGRES_BACKUP_RESTORE = PASS`.
- **`HOSTED_SUPABASE_RESTORE = NOT_PROVEN_REMOTE`** : la restauration réelle (snapshot/PITR Supabase, ou dump chiffré vers le vrai projet) n'a pas pu être exercée — aucun accès.

---

## RELEASE GATE

Exécuté réellement dans le worktree de `WORKING_REHEARSAL_BASE` (`npm ci` + commandes du dépôt, aucune modification de code) :

| Dimension | Commande | Résultat | Détail |
|---|---|---|---|
| Migrations | `npm run verify:migrations` | **PASS** | 263/263 valides, noms/horodatages uniques |
| Secrets | `npm run verify:secrets` | **PASS** | 1765 fichiers suivis scannés, 0 secret détecté |
| Typecheck | `tsc --noEmit` (3 apps) | **PASS** | GP / Colors / Tools : 0 erreur chacune (après installation des dépendances propres à `apps/colors` et `apps/tools`, absentes au premier passage) |
| Lint | `eslint` (3 apps) | **PASS** | GP : 0 erreur, 3 avertissements mineurs (`no-img-element`) ; Colors/Tools : 0 erreur |
| Tests unitaires | `vitest run` (3 apps) | **PASS** | GP 828/828 (93 fichiers), Tools 1991/1991 (174 fichiers), Colors 27/27 (6 fichiers) |
| Tests DB (pgTAP) | `pg_prove` (54 fichiers) | **PASS** (avec 1 réserve documentée) | 53/54 fichiers verts, 1125/1125 assertions, 1 fichier bloqué par l'écart `pgsodium` documenté |
| Build | `next build` (3 apps) | **WARN** | GP : succès complet (38 pages statiques, Turbopack, 28.3s). Tools : **arrêté volontairement** par son garde-fou `verify:public-env` (variables `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`NEXT_PUBLIC_TOOLS_BILLING_API_URL` absentes — comportement correct et voulu, pas un bug). Colors : non tenté (nécessite ses propres variables). |
| Dépendances (`npm audit`) | `npm audit` (3 apps) | **BLOCK** | **`next@16.2.12` dans les 3 apps (GP, Colors, Tools) tombe dans la plage `15.6.0-canary.0 – 16.3.2` de deux CVE critiques (RCE non authentifiée, GHSA-p293-qw3h-jr36 / GHSA-2xp9-vwfh-vxw4) + `sharp` (high). Fix disponible : upgrade vers `next@16.3.5+`.** |
| Env Preview réelles | — | `NOT_PROVEN_REMOTE` | Aucun credential dans ce sandbox |
| Secrets Preview réels | — | `NOT_PROVEN_REMOTE` | idem |
| DR hébergé | — | `NOT_PROVEN_REMOTE` (`HOSTED_SUPABASE_RESTORE`) | idem |
| Multi-tenant RPC | revue de code + test RLS local | **BLOCK** | `module_gestion_pro_actif_entreprise` ne vérifie pas l'appartenance de l'appelant (voir §MULTI-TENANT) |
| CI existante | `.github/workflows/ci.yml` | **PASS (structurel)** | Un seul job `verification` = `npm run verify` (GP uniquement — **Colors et Tools n'y sont pas branchés**, écart de couverture CI à corriger) |

**Verdict release gate global : `BLOCK`** (2 blocages réels : CVE critique Next.js × 3 apps, fuite RPC d'entitlement cross-tenant) — **avant même de considérer les `NOT_PROVEN_REMOTE`.**

---

## Verdict final

# `PREVIEW RELEASE PLAN READY`

*(Plafond imposé explicitement pour cette session : sans accès réel à Preview/Vercel/Supabase/Auth/Storage, le verdict ne peut jamais être `PREVIEW QUALIFIED`. Il ne peut pas non plus être `PREVIEW DEPLOYMENT CANDIDATE` : deux blocages réels et nouvellement découverts — CVE critique Next.js et fuite RPC — doivent être corrigés avant qu'un train soit raisonnablement "candidat au déploiement", indépendamment de l'accès distant.)*

Ce qui est acquis : un plan de migration/backup/rollback précis et **réellement répété** (pas seulement rédigé) sur infrastructure PostgreSQL locale authentique ; 263/263 migrations rejouées sans erreur ; 1125/1125 assertions pgTAP réelles passantes ; isolation multi-tenant vérifiée par expérimentation réelle (à un correctif près) ; backup/restore local prouvé avec checksum ; gate de code/lint/typecheck/tests/secrets entièrement vert sur les 3 apps.

Ce qui manque pour passer à `PREVIEW DEPLOYMENT CANDIDATE` puis `PREVIEW QUALIFIED` : voir blockers ci-dessous.

---

## Blockers indispensables avant la prochaine Preview

1. **`FINAL_PREVIEW_CONVERGENCE_BASE` = `DECISION_REQUIRED`** — décider quel train représente réellement l'intention de release (fusion `tools-store-preflight-v1` + `gp-v1-rc` + `gp-postcutover-precommercial-ops-v1` + `canonical-final-r73` + clôtures QA/rollback, ou un autre choix explicite) et clarifier la référence `integration/gp-external-pilot-readiness-v1@f2917b54` qui n'existe pas sur `origin`.
2. **CVE critique Next.js non corrigée** dans les 3 apps (`next@16.2.12`, RCE non authentifiée) — upgrade vers `16.3.5+` avant tout déploiement Preview.
3. **Fuite RPC cross-tenant réelle** — `module_gestion_pro_actif_entreprise` doit vérifier l'appartenance de l'appelant comme `a_acces_application`/`applications_autorisees`.
4. **Accès réel manquant** : aucun credential Supabase Preview / Vercel Preview / Stripe Test dans cette session — nécessaire pour prouver `ACTUAL_PREVIEW_UPGRADE`, `HOSTED_SUPABASE_RESTORE`, et tous les tests Auth/Multi-tenant/Applications/GP/Storage/Commercial en conditions réelles.
5. **`apps/colors` non branché dans `npm run verify`/CI** — écart de couverture du gate à corriger (actuellement vérifié manuellement hors gate automatisé).
6. **Crypto Ed25519 (`pgsodium`, attestation Stripe r72/r73) non prouvable hors Supabase hébergé** — nécessite vérification sur Preview réelle ou `supabase db branch`.
7. **3 lacunes d'observabilité** — route `/monitoring` référencée mais inexistante, config Sentry client absente, échecs cron par-tenant silencieux (HTTP 200) — à corriger avant de s'appuyer sur la surveillance Preview.
8. **`logoutAction` en portée globale par défaut** — à confirmer intentionnel avant tout test fonctionnel supposant une isolation par session/appareil.
