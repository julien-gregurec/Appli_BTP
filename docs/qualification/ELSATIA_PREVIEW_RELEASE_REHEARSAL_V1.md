# ELSATIA — Répétition générale de release vers Preview (V1)

**Date** : 2026-09-20 (mise à jour : fermeture ciblée de 2 blockers techniques, puis des 7 RPC sœurs identifiées par l'audit de systémicité, même jour)
**Portée** : répétition/qualification d'un parcours CODE QUALIFIÉ → MIGRATIONS → CONFIGURATION → PREVIEW → AUTH → STORAGE → TESTS → ROLLBACK. **Aucun déploiement Production. Aucun Stripe Live. Aucune donnée cliente réelle.**
**Auteur** : session Claude Code autonome (~4-6h), sandbox isolée, sans accès réseau à Supabase/Vercel/Stripe.

> **Mise à jour post-répétition (1/2)** : les 2 blockers techniques identifiés en §RELEASE GATE (CVE critique Next.js, fuite RPC `module_gestion_pro_actif_entreprise`) ont été **corrigés, testés et poussés dans un lot isolé** : branche `claude/preview-rehearsal-security-fixes-v1` (commit `bb42e1d`, base `WORKING_REHEARSAL_BASE`), **non fusionnée** dans `release/tools-store-preflight-v1`, `main`, ni aucun autre train — aucun merge général, aucun déploiement. Voir §FERMETURE DES BLOCKERS pour le détail (reproduction, cause racine, correctif, témoins, non-régression). Un audit des RPC voisines a par ailleurs révélé que le défaut n'était **pas isolé** : 7 fonctions supplémentaires partageaient le même type de faille.
>
> **Mise à jour post-répétition (2/2)** : ces 7 RPC ont été **fermées** dans un second lot ciblé (pas de nouvel audit large, pas de refactor massif) : branche `claude/preview-rehearsal-security-fixes-v1-rpc-sweep` (commit `71565ed`, base la branche précédente), **non fusionnée**. Voir §FERMETURE DES 7 RPC pour le détail par fonction (reproduction, modèle attendu, correctif, témoins, non-régression, audit final des grants). **Verdict : `RPC SECURITY BLOCKERS CLOSED`.** `FINAL_PREVIEW_CONVERGENCE_BASE` reste `DECISION_REQUIRED`.

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
| 8. Multi-tenant | A/B isolation lecture/écriture/Storage/RPC | Rejoué réellement en local avec 2 tenants synthétiques + RLS active | Isolation PASS ; fuite RPC `module_gestion_pro_actif_entreprise` + 7 fuites sœurs, **toutes `SECURITY_BLOCKER_FIXED`** (voir §FERMETURE DES BLOCKERS / §FERMETURE DES 7 RPC) | §MULTI-TENANT | Validation finale sur Preview réelle `NOT_PROVEN_REMOTE` |
| 9. Applications (Colors/Tools/GP) | URL/login/session/entitlement/401-403/nav | Inventaire statique (3 apps Next.js distinctes identifiées) | Table produite, aucune ligne testée en vrai | §APPLICATIONS | **NOT_PROVEN_REMOTE** |
| 10. Gestion Pro — smoke métier | client→devis→facture→encaissement→pointage | Flux localisés dans le code, non exécutés en vrai | Checklist prête | §GP | **NOT_PROVEN_REMOTE** |
| 11. Documents | brouillon/émis/PDF/lien public/snapshot | Checklist prête depuis le code | — | §GP | **NOT_PROVEN_REMOTE** |
| 12. Commercial/Stripe | mapping prix, abonnement test, webhook idempotent | Mécanismes de code confirmés (mode fail-closed, dédup event id) | Code prêt | §COMMERCIAL | `NOT_PROVEN_REMOTE` (aucune clé Stripe Test dans le sandbox) |
| 13. Storage | upload/lecture/permissions/suppression/orphelin | Rejoué en local (RLS storage.objects réelle) | PASS sur les chemins testés | §STORAGE | **NOT_PROVEN_REMOTE** pour signed URLs réelles |
| 14. Healthcheck/observabilité | détection front/API/DB/Auth/Storage/worker/webhook down | Revue statique | 3 lacunes trouvées (voir §DR) | §DR | À corriger avant Preview surveillée |
| 15. Rollback | code + DB + restauration + validation | Rejoué en local (backup/restore réel), doctrine existante lue intégralement | `LOCAL_POSTGRES_BACKUP_RESTORE = PASS` | §ROLLBACK | `HOSTED_SUPABASE_RESTORE = NOT_PROVEN_REMOTE` |
| 16. Release gate | PASS/WARN/BLOCK code/migrations/env/secrets/build/tests/DR | Exécuté réellement, puis rejoué après chaque lot de correctifs (`npm run verify` + pgTAP + npm audit, 3 apps) | Voir tableau §RELEASE GATE | §RELEASE GATE / §FERMETURE DES BLOCKERS / §FERMETURE DES 7 RPC | **9/9 blocages de sécurité `SECURITY_BLOCKER_FIXED`** (2 initiaux + 7 audit de systémicité) |

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

**✅ FINDING CORRIGÉ (`SECURITY_BLOCKER_FIXED`, voir §FERMETURE DES BLOCKERS)** : `module_gestion_pro_actif_entreprise(p_entreprise_id, p_module_code)` — fonction `SECURITY DEFINER`, `EXECUTE` accordé à `authenticated` — **ne vérifiait pas** que l'appelant est membre de `p_entreprise_id` avant de répondre (contrairement à `a_acces_application`/`applications_autorisees`, qui le font correctement). Confirmé par lecture du corps de fonction (`\sf`) et par preuve empirique : l'entreprise B a un module `stock` actif ; l'utilisateur A (sans lien avec B) appelant `module_gestion_pro_actif_entreprise('<ENT_B>','stock')` obtenait **`true`** — fuite booléenne de l'état d'activation d'un module payant d'une entreprise tierce (pas de fuite de lignes de données, mais fuite de métadonnée commerciale cross-tenant). **Corrigé** (migration `20260905000266`), témoins négatif/positif et pgTAP de non-régression exécutés avec succès.

**✅ NOUVEAU, PUIS CORRIGÉ (`SECURITY_BLOCKER_FIXED`)** : l'audit des RPC voisines au même pattern (SECURITY DEFINER + argument `entreprise_id` + `EXECUTE` accordé à `authenticated` + aucune vérification d'appartenance) avait trouvé **7 fonctions génuinement vulnérables** sur 20 candidates analysées en détail (13 faux positifs, gardées par un mécanisme différemment nommé) — le défaut n'était **pas isolé**. Les 7 ont depuis été fermées dans un lot dédié — voir §FERMETURE DES 7 RPC pour le détail par fonction.

`Verdict section` : isolation de données = **PASS local** ; fuite originale et 7 fuites sœurs = **`SECURITY_BLOCKER_FIXED`** (9/9) ; validation finale sur Preview réelle = `NOT_PROVEN_REMOTE`.

---

## APPLICATIONS

Trois applications Next.js distinctes coexistent dans la base de travail (pas de séparation par schéma DB, catalogue/entitlement partagé) :

| App | Racine | Next.js (branche de rehearsal) | Next.js (lot de correctifs) | Wiring dans `npm run verify` racine | État local |
|---|---|---|---|---|---|
| Gestion Pro (GP, principale) | `src/` | 16.2.12 (vulnérable) | **16.3.5** (corrigé) | Oui | typecheck/lint/test/build **PASS** |
| Colors | `apps/colors/` | 16.2.12 (vulnérable) | **16.3.5** (corrigé) | **Non** — scripts propres, jamais appelés par la racine | typecheck/lint/test/build **PASS** (exécutés séparément dans cette session) |
| Tools (Atelier) | `apps/tools/` | 16.2.12 (vulnérable) | **16.3.5** (corrigé) | Partiel (`npm --prefix apps/tools run ...`) | typecheck/lint/test **PASS** ; build **bloqué par un garde-fou volontaire, inchangé par le correctif** (`verify:public-env` — voir §RELEASE GATE) |

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

## FERMETURE DES BLOCKERS (mise à jour post-répétition)

Toujours **aucun environnement distant** : pas de Preview, pas de Production, pas de Stripe Live, pas de fusion générale. Les deux correctifs ci-dessous vivent sur une branche isolée, **non fusionnée** : `claude/preview-rehearsal-security-fixes-v1` (commit `bb42e1d`), créée depuis `WORKING_REHEARSAL_BASE` (`release/tools-store-preflight-v1` @ `bf27e78`). `WORKING_REHEARSAL_BASE` reste `release/tools-store-preflight-v1` ; `FINAL_PREVIEW_CONVERGENCE_BASE` reste `DECISION_REQUIRED` — rien de cette fermeture ne change l'analyse de convergence du §BASE (le train GP external pilot, entre autres, reste à converger explicitement).

### 1. CVE critique Next.js — `SECURITY_BLOCKER_FIXED`

**Correction de la version cible annoncée précédemment** : le rapport initial affirmait `next@16.3.5+` comme version minimale requise sans le vérifier sur les advisories elles-mêmes (il reprenait la suggestion de `npm audit fix --force`, qui propose la dernière version, pas la première corrigée). Vérifié directement sur les advisories officielles :

| Advisory | Plage affectée (branche 16.x) | Première version corrigée |
|---|---|---|
| `GHSA-p293-qw3h-jr36` (RCE non authentifiée, Windows) | `≥ 16.0.0, < 16.3.3` | **`16.3.3`** |
| `GHSA-2xp9-vwfh-vxw4` (RCE via Image Optimization/AVIF) | `≥ 16.0.0, < 16.3.3` | **`16.3.3`** |
| `sharp` (dépendance transitive de Next Image Optimization) | `< 0.35.4` | **`0.35.4`** |

`16.3.5` (dist-tag npm `latest`, séquence stable confirmée `16.3.0/.1/.2` vulnérables → `.3/.4/.5` corrigées) a été retenue comme version cible — la plus récente stable raisonnablement qualifiable, au-delà du minimum `16.3.3` — conformément à l'instruction reçue.

**Lot isolé appliqué aux 3 apps** (GP, Colors, Tools) : `next` 16.2.12→16.3.5, `sharp` 0.35.3→0.35.4, `eslint-config-next` 16.2.12→16.3.5 (alignement de version standard). `npm ci` propre puis `npm install` incrémental (un bug connu de l'arborist npm 10.9.7, `Cannot read properties of null (reading 'edgesOut')`, empêchait une régénération de lockfile "from scratch" — contourné en partant d'un `npm ci` à l'état d'origine puis en laissant `npm install` résoudre la mise à jour de version de façon incrémentale).

**Revalidation complète, 3 apps** :

| Contrôle | GP | Colors | Tools |
|---|---|---|---|
| `npm ci`/`npm install` propre | OK | OK | OK |
| typecheck | **PASS** (0 erreur) | **PASS** (0 erreur) | **PASS** (0 erreur) |
| lint | **PASS**, 0 erreur (4 avertissements, voir ci-dessous) | **PASS**, 0 erreur | **PASS**, 0 erreur |
| tests | **PASS** 828/828 | **PASS** 27/27 | **PASS** 1991/1991 |
| build | **PASS** (Turbopack, "Compiled successfully") | **PASS** (19 pages générées) | Bloqué par `verify:public-env` (garde-fou pré-existant, sans rapport avec l'upgrade — variables Preview absentes) |
| `npm audit` | critique/high **résolus** ; restent 2 modéré + 1 high **sans rapport** (`@vitest/mocker`, `js-yaml` — dépendances de dev, hors périmètre) | critique/high **résolus** ; reste 1 high `js-yaml` (hors périmètre) | **0 vulnérabilité** |

**Changements transitoires/breaking observés** : un **nouvel avertissement ESLint** est apparu après l'upgrade (pas une erreur, ne bloque pas le gate) : `@next/next/no-location-assign-relative-destination` sur `src/components/AbonnementCountdown.tsx:19` (`window.location.assign()` vers une route interne — la règle recommande `redirect()`/`useRouter().push()`). Aucune autre régression de typecheck, lint, tests ou build constatée sur les 3 apps. Aucun changement de comportement fonctionnel identifié dans cette fenêtre de test (pas de test E2E live possible, cf. §0).

### 2. Fuite RPC `module_gestion_pro_actif_entreprise` — `SECURITY_BLOCKER_FIXED`

**Reproduction avant correction** (base locale rejouée, 2 tenants synthétiques A/B) : entreprise B dispose d'un module `stock` actif, sans rapport avec A. Utilisateur authentifié A (non membre de B) appelle directement `select public.module_gestion_pro_actif_entreprise('<ENT_B>','stock')` → **`true`** (fuite confirmée, capturée avant tout correctif).

**Cause racine** : la fonction (`SECURITY DEFINER`, `EXECUTE` accordé à `authenticated` par `20260903000257_modules_a_la_carte_r3_v1.sql`) ne contient aucune vérification d'identité de l'appelant, contrairement à ses sœurs `a_acces_application()`/`applications_autorisees()`. Deux usages légitimes existants devaient impérativement être préservés (découverts en relisant la suite pgTAP existante, pas supposés a priori) :
- un appel RPC direct **même-tenant** par un membre authentifié (test "10b" de `modules_a_la_carte_r3_v1.test.sql`, déjà dans la suite avant ce correctif) ;
- un appel **sans aucun contexte JWT** (`auth.uid()` nul), utilisé par les tests unitaires superuser de logique catalogue/forfait du même fichier, et par l'appelant interne `a_acces_module_gestion_pro()` (qui vérifie déjà lui-même `est_membre_actif()` avant d'appeler cette fonction).

Une première tentative de correctif (garde inconditionnelle, puis retrait pur et simple du `GRANT EXECUTE`) a été **rejetée après re-test** car elle cassait respectivement les tests unitaires superuser et le test "10b" — la suite pgTAP existante a servi de garde-fou réel contre une correction trop large.

**Correctif retenu** (migration `20260905000266_fix_module_gestion_pro_actif_entreprise_tenant_guard.sql`, corps de fonction inchangé au-delà d'une garde ajoutée en tête) : la vérification d'appartenance (`est_plateforme_admin() OR est_membre_actif(p_entreprise_id)`) ne s'applique **que si une identité JWT est présente** (`auth.uid() is not null`) — précisément le seul chemin par lequel la fuite est exploitable (un vrai appel RPC PostgREST authentifié).

**Témoins (rejoués après correctif, base locale)** :
| Témoin | Avant | Après |
|---|---|---|
| A (authentifié, non-membre de B) sur B | `true` (fuite) | **`false`** |
| A (authentifié) sur SA PROPRE entreprise A | `true` | **`true`** (inchangé, pas de régression) |
| Admin plateforme sur B | — | **`true`** (accès admin conservé) |
| Sans identité JWT (superuser/interne) | `true` | **`true`** (inchangé, tests unitaires préservés) |

**Non-régression** : nouveau fichier `supabase/tests/module_gestion_pro_actif_entreprise_tenant_guard.test.sql`, **5/5 assertions PASS**. Suite pgTAP complète rejouée : **54/55 fichiers verts, 1130/1130 assertions, zéro régression** (le seul fichier non exécutable reste `platform_stripe_state_attestation_r72.test.sql`, bloqué par l'écart `pgsodium` déjà documenté en §MIGRATIONS, sans rapport avec ce correctif).

### 3. Audit des RPC voisines — `SECURITY_BLOCKER_FIXED` (voir §FERMETURE DES 7 RPC)

Scan systématique : fonctions `SECURITY DEFINER`, argument nommé `entreprise_id`, `EXECUTE` accordé à `authenticated`, sans aucune référence à `auth.uid()` ni à un helper de garde connu → **20 candidates**. Chacune lue intégralement (corps de fonction, appelants applicatifs, migrations d'origine) : **13 faux positifs** (gardées par un mécanisme correctement implémenté mais différemment nommé — `peut_gerer_acces`, `a_permission`, `colors_action_autorisee`, `peut_pointer_pour_employe`, `plateforme_exiger_permission`, ou par nature une prédicat RLS public sans donnée sensible), **7 génuinement vulnérables** :

| Fonction | Effet exploitable par un utilisateur authentifié quelconque | Sévérité |
|---|---|---|
| `capacite_personnes_base` | Lecture : divulgue le palier d'abonnement/sièges inclus d'une entreprise tierce | Moyenne — contourne le wrapper `capacite_personnes_entreprise()` qui, lui, vérifie correctement `est_membre_actif` |
| `capacite_personnes_totale` | Lecture : divulgue la capacité totale de sièges achetée d'une entreprise tierce | Moyenne — même contournement |
| `compter_personnes_actives_entreprise` | Lecture : divulgue l'effectif actif d'une entreprise tierce | Moyenne — même contournement |
| `etat_capacite_personnes` | Lecture : divulgue si une entreprise tierce est à/au-dessus de sa limite de sièges | Moyenne — même contournement |
| `appliquer_baisse_capacite_planifiee_service` | **Écriture** : peut forcer/accélérer une baisse de capacité déjà planifiée sur une entreprise tierce | Moyenne — effet borné (n'exécute qu'une transition déjà programmée) mais écriture non autorisée sur un tenant tiers |
| `capacite_stripe_avancer_marqueur_evenement` | **Écriture** : peut avancer arbitrairement le repère de synchronisation Stripe d'une entreprise tierce, faisant ignorer silencieusement ses futurs webhooks Stripe réels | **Élevée** — sabotage persistant et silencieux de la synchronisation de facturation d'un tenant tiers |
| `obtenir_ou_creer_fournisseur_boutique` | **Écriture** : insère un fournisseur non sollicité dans la comptabilité d'une entreprise tierce | Faible-moyenne — écriture non autorisée mais effet métier limité |

**Deux anti-patterns identifiés, ni isolés ni généralisés à tout le schéma** :
1. *"Agrégateur gardé, briques non gardées"* — 4 des 7 cas : un wrapper correctement gardé existe (`capacite_personnes_entreprise`), mais les fonctions de niveau inférieur qu'il appelle sont **aussi** directement accordées à `authenticated`, permettant de contourner le wrapper en appelant la brique directement. Les 4 proviennent de la même migration (`20260903000256_active_person_capacity_r1_v1.sql`, fonctionnalité "capacité de sièges").
2. *"Fonctions destinées au `service_role` mais aussi accordées à `authenticated`"* — 2 cas (`appliquer_baisse_capacite_planifiee_service`, `capacite_stripe_avancer_marqueur_evenement`), nommées `_service`, appelées en pratique uniquement via le client `service_role` côté serveur, mais avec un `GRANT ... TO authenticated` explicite qui semble obsolète (justifié dans un commentaire de migration par un chemin d'appel serveur qui, en l'état actuel du code, n'existe pas).

Partout où le pattern `peut_gerer_acces`/`a_permission`/`est_membre_actif` est appliqué directement dans la fonction auditée (gestion des postes/permissions, pointage, stock Colors), la garde est correcte — le risque est concentré dans la fonctionnalité capacité de sièges/réconciliation Stripe et un helper boutique, pas répandu uniformément.

**Décision initiale** : conformément à l'instruction explicite "pas de refactor massif" reçue au moment de l'audit, ces 7 fonctions n'ont **pas** été corrigées dans le lot précédent — documentées comme blockers `SECURITY_BLOCKER_OPEN`, à traiter dans un lot dédié et scopé séparément. **Ce lot dédié a depuis été autorisé et exécuté — voir §FERMETURE DES 7 RPC ci-dessous.**

---

## FERMETURE DES 7 RPC (lot dédié, deuxième mise à jour)

Autorisation reçue : fermeture ciblée **uniquement** des 7 fonctions déjà identifiées par l'audit précédent — pas de nouvel audit large, pas de refactor massif. Toujours **aucun environnement distant** : pas de Preview, pas de Production, pas de Stripe Live, pas de fusion générale. Lot appliqué sur une branche isolée continuant la précédente : `claude/preview-rehearsal-security-fixes-v1-rpc-sweep` (commit `71565ed`, base `claude/preview-rehearsal-security-fixes-v1`), **non fusionnée**. `WORKING_REHEARSAL_BASE` reste `release/tools-store-preflight-v1` ; `FINAL_PREVIEW_CONVERGENCE_BASE` reste `DECISION_REQUIRED`.

**Méthode identique pour les 7** : (1) reproduction de l'accès/l'écriture non autorisé sur la base locale rejouée, avec effet visible avant correctif ; (2) identification du modèle attendu à partir du code applicatif réel (`grep` exhaustif de `src/`/`apps/` pour tout appel `supabase.rpc(...)`/`admin.rpc(...)` direct) et de la suite pgTAP existante (chaque référence existante vérifiée quant à son contexte de rôle — superuser, `authenticated`, `service_role`) ; (3) correctif minimal ; (4) témoins négatif/positif/interne ; (5) suite pgTAP rejouée en intégralité ; (6) audit final des grants.

**Résultat de l'identification de modèle** : **aucune des 7 fonctions n'avait d'usage légitime d'appel direct par `authenticated`** (contrairement à `module_gestion_pro_actif_entreprise`, qui avait un vrai usage même-tenant documenté dans la suite de tests). Le correctif retenu pour les 7 est donc systématiquement le plus simple des deux prévus par la consigne — **retrait du `GRANT EXECUTE` à `authenticated`**, sans toucher au corps d'aucune fonction ni les rendre "JWT-aware" — jamais l'ajout d'une garde. Migration unique : `20260905000267_revoke_authenticated_on_internal_capacity_boutique_rpcs.sql`.

| RPC | Vulnérabilité | Modèle attendu | Correctif | Test avant | Test après | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| `capacite_personnes_base(uuid)` | Lecture cross-tenant : divulgue le palier de sièges inclus d'une entreprise tierce | Brique interne du wrapper gardé `capacite_personnes_entreprise()` (vérifie déjà `est_membre_actif`/`est_plateforme_admin`) ; 0 appelant applicatif direct, 0 appel `authenticated` dans la suite pgTAP existante (uniquement superuser, avant tout `SET ROLE`) | `REVOKE EXECUTE ... FROM authenticated` | A (non-membre de B) → `3` (fuite confirmée) | A → `ERROR 42501 permission denied` ; wrapper `capacite_personnes_entreprise(A)` par un membre réel → fonctionne toujours | **`SECURITY_BLOCKER_FIXED`** |
| `capacite_personnes_totale(uuid)` | Lecture cross-tenant : divulgue la capacité totale de sièges achetée | Idem — brique interne du même wrapper | `REVOKE EXECUTE ... FROM authenticated` | A → `3` (fuite confirmée) | A → `ERROR 42501` ; wrapper inchangé | **`SECURITY_BLOCKER_FIXED`** |
| `compter_personnes_actives_entreprise(uuid)` | Lecture cross-tenant : divulgue l'effectif actif | Idem — brique interne du même wrapper | `REVOKE EXECUTE ... FROM authenticated` | A → `4` (fuite confirmée) | A → `ERROR 42501` ; wrapper inchangé | **`SECURITY_BLOCKER_FIXED`** |
| `etat_capacite_personnes(uuid)` | Lecture cross-tenant : divulgue si l'entreprise est à/au-dessus de sa limite de sièges | Idem — brique interne du même wrapper | `REVOKE EXECUTE ... FROM authenticated` | A → `over_capacity` (fuite confirmée) | A → `ERROR 42501` ; wrapper inchangé | **`SECURITY_BLOCKER_FIXED`** |
| `appliquer_baisse_capacite_planifiee_service(uuid)` | **Écriture cross-tenant** : force/accélère une baisse de capacité planifiée sur une entreprise tierce | `service_role` uniquement (appelée exclusivement via `deps.admin.rpc(...)` dans `src/lib/stripe-capacite-reconcile.ts:392`) ; grant `authenticated` obsolète, une pgTAP assertait explicitement (à tort) ce grant | `REVOKE EXECUTE ... FROM authenticated` (conserve `service_role`) | A (non-membre de B) → `true`, `capacite_personnes_supplementaire` de B passe de `5` à `1` (écriture réelle confirmée) | A → `ERROR 42501` ; `service_role` → `true`, écriture fonctionne toujours | **`SECURITY_BLOCKER_FIXED`** |
| `capacite_stripe_avancer_marqueur_evenement(uuid, timestamptz)` | **Écriture cross-tenant** : avance arbitrairement le marqueur de synchronisation Stripe, fait ignorer silencieusement les futurs webhooks réels de la victime | `service_role` uniquement (appelée exclusivement via `admin.rpc(...)` dans `src/lib/stripe-capacite-reconcile.ts:227`) | `REVOKE EXECUTE ... FROM authenticated` (conserve `service_role`) | A → `capacite_stripe_sync_evenement_at` de B avancé à 2036 (+10 ans, écriture réelle confirmée) | A → `ERROR 42501` ; `service_role` → fonctionne toujours | **`SECURITY_BLOCKER_FIXED`** |
| `obtenir_ou_creer_fournisseur_boutique(uuid)` | **Écriture cross-tenant** : insère un fournisseur non sollicité dans la comptabilité d'une entreprise tierce | Brique interne, appelée uniquement par `boutique_finaliser_commande_payee()` (elle-même gardée par un `stripe_checkout_id` Stripe non devinable, jamais par `entreprise_id` seul) ; 0 appelant applicatif direct | `REVOKE EXECUTE ... FROM authenticated` | A → insertion réussie, UUID du fournisseur retourné (écriture réelle confirmée) | A → `ERROR 42501` | **`SECURITY_BLOCKER_FIXED`** |

**Effet de bord découvert et corrigé en cours de route** : une assertion pgTAP existante (`supabase/tests/capacity_stripe_r2_b_v1.test.sql`, "RPC de service exposées à service_role + authenticated") vérifiait explicitement que `authenticated` avait `EXECUTE` sur `appliquer_baisse_capacite_planifiee_service` — c'est-à-dire qu'elle testait l'ancien grant, maintenant considéré à tort. Corrigée pour vérifier l'inverse (grant `service_role` conservé, `authenticated` exclu), avec commentaire renvoyant à la migration `20260905000267`.

**Non-régression** : nouveau fichier `supabase/tests/capacity_boutique_internal_rpc_grants_v1.test.sql` (11 assertions : 7 témoins négatifs `authenticated`, 1 témoin positif wrapper, 2 témoins positifs `service_role`, 1 audit final des grants inline) — **11/11 PASS**. Suite pgTAP complète rejouée : **55/56 fichiers verts, 1141/1141 assertions, zéro régression** (seul `platform_stripe_state_attestation_r72.test.sql` reste bloqué par l'écart `pgsodium` déjà documenté, sans rapport).

**Audit final des grants** (`information_schema.routine_privileges`, vérifié après correctif) :

| Fonction | `authenticated` | `service_role` | `postgres` |
|---|---|---|---|
| `capacite_personnes_base` | ❌ (retiré) | — | ✅ |
| `capacite_personnes_totale` | ❌ (retiré) | — | ✅ |
| `compter_personnes_actives_entreprise` | ❌ (retiré) | — | ✅ |
| `etat_capacite_personnes` | ❌ (retiré) | — | ✅ |
| `appliquer_baisse_capacite_planifiee_service` | ❌ (retiré) | ✅ (conservé) | ✅ |
| `capacite_stripe_avancer_marqueur_evenement` | ❌ (retiré) | ✅ (conservé) | ✅ |
| `obtenir_ou_creer_fournisseur_boutique` | ❌ (retiré) | — | ✅ |

Aucune des 7 n'était, et n'est, accessible à `anon`.

### Verdict de cette fermeture

# `RPC SECURITY BLOCKERS CLOSED`

Les 9 blockers de sécurité identifiés au total par cette répétition (2 initiaux + 7 par l'audit de systémicité) sont désormais tous **`SECURITY_BLOCKER_FIXED`**, testés (témoins + non-régression pgTAP complète à chaque étape), et documentés. Aucun n'a été fusionné, déployé, ni testé en conditions distantes réelles — ces preuves restent `NOT_PROVEN_REMOTE` jusqu'à un accès Preview réel. `FINAL_PREVIEW_CONVERGENCE_BASE` reste explicitement `DECISION_REQUIRED`.

---

## RELEASE GATE

Exécuté réellement dans le worktree de `WORKING_REHEARSAL_BASE` initialement, puis rejoué dans son intégralité sur le lot de correctifs isolé (`claude/preview-rehearsal-security-fixes-v1`) :

| Dimension | Commande | Résultat | Détail |
|---|---|---|---|
| Migrations | `npm run verify:migrations` | **PASS** | 264/264 valides (263 + la migration de correctif), noms/horodatages uniques |
| Secrets | `npm run verify:secrets` | **PASS** | 1765 fichiers suivis scannés, 0 secret détecté |
| Typecheck | `tsc --noEmit` (3 apps) | **PASS** | GP / Colors / Tools : 0 erreur chacune, y compris après upgrade Next.js |
| Lint | `eslint` (3 apps) | **PASS** | GP : 0 erreur, 4 avertissements mineurs (3 `no-img-element` pré-existants + 1 nouveau `no-location-assign-relative-destination` apparu avec l'upgrade Next, voir §FERMETURE DES BLOCKERS) ; Colors/Tools : 0 erreur |
| Tests unitaires | `vitest run` (3 apps) | **PASS** | GP 828/828 (93 fichiers), Tools 1991/1991 (174 fichiers), Colors 27/27 (6 fichiers) — inchangé après les deux correctifs |
| Tests DB (pgTAP) | `pg_prove` (55 fichiers) | **PASS** (avec 1 réserve documentée) | 54/55 fichiers verts, 1130/1130 assertions (dont les 5 du nouveau test de non-régression), 1 fichier toujours bloqué par l'écart `pgsodium` documenté (sans rapport avec les correctifs) |
| Build | `next build` (3 apps) | **PASS** (avec 1 garde-fou pré-existant inchangé) | GP : succès complet. Colors : succès complet (19 pages). Tools : **arrêté volontairement** par son garde-fou `verify:public-env` (variables Preview absentes — comportement correct et voulu, inchangé par les correctifs). |
| Dépendances (`npm audit`) | `npm audit` (3 apps) | **`SECURITY_BLOCKER_FIXED`** | CVE critique Next.js (GHSA-p293-qw3h-jr36 / GHSA-2xp9-vwfh-vxw4) et CVE `sharp` high **résolues** sur les 3 apps (`next@16.3.5`, `sharp@0.35.4`). Restent, sans rapport et hors périmètre : GP 2 modéré (`@vitest/mocker`) + 1 high (`js-yaml`, dev uniquement) ; Colors 1 high (`js-yaml`) ; Tools 0. |
| Env Preview réelles | — | `NOT_PROVEN_REMOTE` | Aucun credential dans ce sandbox |
| Secrets Preview réels | — | `NOT_PROVEN_REMOTE` | idem |
| DR hébergé | — | `NOT_PROVEN_REMOTE` (`HOSTED_SUPABASE_RESTORE`) | idem |
| Multi-tenant RPC (`module_gestion_pro_actif_entreprise`) | revue de code + repro + correctif + témoins + pgTAP | **`SECURITY_BLOCKER_FIXED`** | Voir §FERMETURE DES BLOCKERS — témoins négatif/positif/admin/interne tous corrects, 0 régression sur 1130 assertions |
| Multi-tenant RPC (7 fonctions sœurs) | audit systématique de 20 candidates, puis lot dédié de fermeture | **`SECURITY_BLOCKER_FIXED`** | 7 fonctions génuinement vulnérables au même pattern, toutes fermées (retrait du `GRANT authenticated`, 0 changement de corps de fonction) — voir §FERMETURE DES 7 RPC |
| CI existante | `.github/workflows/ci.yml` | **PASS (structurel)** | Un seul job `verification` = `npm run verify` (GP uniquement — **Colors et Tools n'y sont pas branchés**, écart de couverture CI à corriger, inchangé par les correctifs) |

**Verdict release gate global : `RPC SECURITY BLOCKERS CLOSED`** — les 9 blocages de sécurité identifiés au total (2 initiaux + 7 par l'audit de systémicité) sont désormais **`SECURITY_BLOCKER_FIXED`**, vérifiés et testés, poussés sur des lots isolés non fusionnés. Restent uniquement les `NOT_PROVEN_REMOTE` (accès distant absent) et `FINAL_PREVIEW_CONVERGENCE_BASE = DECISION_REQUIRED`.

---

## Verdict final

# `PREVIEW RELEASE PLAN READY`
### (sous-verdict sécurité RPC : `RPC SECURITY BLOCKERS CLOSED`)

*(Plafond imposé explicitement pour cette session : sans accès réel à Preview/Vercel/Supabase/Auth/Storage, le verdict global ne peut jamais être `PREVIEW QUALIFIED`. Il ne peut pas non plus être `PREVIEW DEPLOYMENT CANDIDATE` : même si les 9 blocages de sécurité identifiés (2 initiaux + 7 par l'audit de systémicité) sont désormais tous `SECURITY_BLOCKER_FIXED`, aucun n'a été porté/fusionné dans un train, et `FINAL_PREVIEW_CONVERGENCE_BASE` reste explicitement `DECISION_REQUIRED` — un train n'est "candidat au déploiement" que lorsque sa convergence finale est elle-même décidée, indépendamment de l'accès distant.)*

Ce qui est acquis : un plan de migration/backup/rollback précis et **réellement répété** (pas seulement rédigé) sur infrastructure PostgreSQL locale authentique ; 265/265 migrations rejouées sans erreur ; 1141/1141 assertions pgTAP réelles passantes ; isolation multi-tenant vérifiée par expérimentation réelle ; backup/restore local prouvé avec checksum ; gate de code/lint/typecheck/tests/secrets/build/audit entièrement vert sur les 3 apps ; **9 blocages de sécurité identifiés (2 initiaux + 7 par un audit de systémicité rigoureux, distinguant 7 vulnérabilités réelles de 13 faux positifs), tous reproduits, corrigés par le correctif minimal correspondant à leur modèle réel, testés (témoins négatifs/positifs/internes + non-régression pgTAP complète à chaque étape) et poussés sur des lots isolés non fusionnés**.

Ce qui manque pour passer à `PREVIEW DEPLOYMENT CANDIDATE` puis `PREVIEW QUALIFIED` : voir blockers ci-dessous — désormais uniquement la convergence du train et l'accès distant, plus aucun blocage de sécurité connu.

---

## Blockers indispensables avant la prochaine Preview

1. **`FINAL_PREVIEW_CONVERGENCE_BASE` = `DECISION_REQUIRED`** — décider quel train représente réellement l'intention de release (fusion `tools-store-preflight-v1` + `gp-v1-rc` + `gp-postcutover-precommercial-ops-v1` + `canonical-final-r73` + clôtures QA/rollback, ou un autre choix explicite) et clarifier la référence `integration/gp-external-pilot-readiness-v1@f2917b54` qui n'existe pas sur `origin`. **Inchangé par ces mises à jour** — `WORKING_REHEARSAL_BASE` reste une base de travail, pas la branche de déploiement. **C'est désormais le seul blocker non-sécurité de fond restant.**
2. ~~CVE critique Next.js~~ — **`SECURITY_BLOCKER_FIXED`** (branche `claude/preview-rehearsal-security-fixes-v1`, commit `bb42e1d`, non fusionnée).
3. ~~Fuite RPC `module_gestion_pro_actif_entreprise`~~ — **`SECURITY_BLOCKER_FIXED`** (même branche/commit).
4. ~~7 RPC sœurs vulnérables au même pattern~~ (`capacite_personnes_base`, `capacite_personnes_totale`, `compter_personnes_actives_entreprise`, `etat_capacite_personnes`, `appliquer_baisse_capacite_planifiee_service`, `capacite_stripe_avancer_marqueur_evenement`, `obtenir_ou_creer_fournisseur_boutique`) — **`SECURITY_BLOCKER_FIXED`** (branche `claude/preview-rehearsal-security-fixes-v1-rpc-sweep`, commit `71565ed`, non fusionnée).
5. **Les 3 lots de correctifs (`bb42e1d`, `71565ed` sur leurs branches respectives) restent à porter/fusionner** dans le train qui sera retenu comme `FINAL_PREVIEW_CONVERGENCE_BASE` — aucun merge général n'a été fait, conformément à la consigne.
6. **Accès réel manquant** : aucun credential Supabase Preview / Vercel Preview / Stripe Test dans cette session — nécessaire pour prouver `ACTUAL_PREVIEW_UPGRADE`, `HOSTED_SUPABASE_RESTORE`, et tous les tests Auth/Multi-tenant/Applications/GP/Storage/Commercial en conditions réelles.
7. **`apps/colors` non branché dans `npm run verify`/CI** — écart de couverture du gate à corriger (actuellement vérifié manuellement hors gate automatisé). Inchangé.
8. **Crypto Ed25519 (`pgsodium`, attestation Stripe r72/r73) non prouvable hors Supabase hébergé** — nécessite vérification sur Preview réelle ou `supabase db branch`. Inchangé.
9. **3 lacunes d'observabilité** — route `/monitoring` référencée mais inexistante, config Sentry client absente, échecs cron par-tenant silencieux (HTTP 200) — à corriger avant de s'appuyer sur la surveillance Preview. Inchangé.
10. **`logoutAction` en portée globale par défaut** — à confirmer intentionnel avant tout test fonctionnel supposant une isolation par session/appareil. Inchangé.
