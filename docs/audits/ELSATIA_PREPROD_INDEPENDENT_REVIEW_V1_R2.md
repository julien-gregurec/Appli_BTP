# ELSATIA — Revue indépendante de pré-production V1 — R2

Date : 2026-09-02. **Audit strictement en lecture seule.** Aucun commit, push, code, migration,
Stripe, Vercel, Supabase, MFA, ACL, historique Git.
Remplace le verdict `EN ATTENTE` de `ELSATIA_PREPROD_INDEPENDENT_REVIEW_V1.md` (la branche
canonique existe désormais).

## 1. SHA de référence

| Attendu | Constat |
|---|---|
| Branche | `feat/tarification-on-canonical-preprod-v1` ✓ |
| HEAD distant | `ac7bf050056c1bf74593c299112d68d2d26e9b45` — **= local, = attendu** ✓ (`git fetch` + `git ls-remote`) |
| Socle | `feat/elsatia-canonical-integration-preprod-v1` `9ad272907e5e337653896b0b522fbd950b3f6c50` (ancêtre direct) ✓ |

## 2. Graphe — lots présents

| Lot | Commit dans l'ascendance | Présent | Verdict |
|---|---|:--:|---|
| Release Production | `fcdd4e7 fix(stripe): cloisonner webhooks par environnement` | ✓ (ancêtre) | conservé |
| Lignée canonique | `6a814a2 fix(db): canonicalize migration history…` | ✓ (ancêtre) | conservé |
| Merge canonique préprod | `b08ab42 merge: integrate canonical lineage into preprod` | ✓ | conservé |
| **ACL 255** | `5773dd6 fix(security): reconcile canonical application ACL` | ✓ | contenu = lot Codex `d4dee2fa` |
| **Root QA** | `7b4ec6b chore(qa): close root typecheck lint and dependency blockers` | ✓ | contenu = lot Codex `01720b66` |
| **MFA / AAL2** | `9ad2729 feat(auth): add Supabase TOTP MFA and AAL2 guards` | ✓ | contenu = lot Codex `b4fe1303` |
| **Tarification (replay)** | `ac7bf05 feat(billing): align canonical Elsatia pricing` | ✓ | cherry-pick propre de `beb0ac5`, 17 fichiers, +400/−33 |

Les SHA Codex d'origine ne sont pas ancêtres directs (contenu ré-appliqué en commits propres),
mais chaque message et chaque delta sont tracés.

## 3. Migrations

| Contrôle | Résultat |
|---|---|
| Nombre | **253** (`git ls-tree` + `verify:migrations` : « noms et horodatages uniques ») |
| Doublons de timestamp | **0** |
| Migration 255 | `20260902000255_acl_reconciliation_v1.sql` **présente** |
| R7.4 / R7.5 réémises | `20260901000252_residual_acl_hardening_r74.sql`, `20260901000253_support_message_author_guard_r75.sql` **présentes** |
| `migration_canonicalization_v2` | `20260901000254_…` **présente** |
| Migration historique (≤ Production `fcdd4e7c`) modifiée | **Aucune** (`git diff fcdd4e7c..HEAD -- supabase/migrations/` : aucune migration existant déjà sur Production n'est touchée) |
| Impact du replay tarifaire sur les migrations | **0** (le cherry-pick `ac7bf05` ne touche aucune migration) |

**Écart = 0 → pas de P0.**

## 4. ACL

- Migration `20260902000255_acl_reconciliation_v1.sql` présente (append-only : ~366 `REVOKE
  EXECUTE`, ~840 `REVOKE` DML de table, 14 séquences, 14 `ALTER DEFAULT PRIVILEGES … REVOKE`).
- Référence figée par `ELSATIA-SUPABASE-SYSTEM-DRIFT-AUDIT-V1` (validé) : **drift applicatif = 0**
  (tables/colonnes/fonctions/séquences/default privileges pour `anon`, `authenticated`,
  `service_role`, `authenticator`, `elsatia_*`) ; **drift système exploitable = 0** ; **532
  écarts système managés** classés A/B/C + allowlist V1 ; pgTAP **870/870** Fresh et Restore.
- Le contenu de la migration 255 sur ce SHA est **identique** à celui audité (aucune
  modification depuis).
- **Réserve (non bloquante)** : le diff ACL Fresh↔Restore **live** et les 870/870 pgTAP **n'ont
  pas été rejoués dans cette revue** (pas d'accès BDD). À rejouer sur une base Fresh construite
  depuis `ac7bf05` **avant le déploiement réel** (contrôle de non-régression, P1).

**Aucune nouvelle surface exploitable identifiée → pas de P0.**

## 5. MFA / AAL2

| Élément | Constat (`src/lib/auth/mfa.ts`, `mfa-server.ts`, `src/app/mfa/*`, `api/auth/mfa/*`) |
|---|---|
| enroll / challenge / verify / listFactors / unenroll / assurance level | Présents (`facteursTotp`, `facteurTotpPourChallenge(facteurs, facteurId?)`, route `unenroll`, `decisionGardeMfa(etat)`) |
| **Fail-closed** | `decisionGardeMfa` : `aal2 → autoriser` ; `aal1+next aal2 → challenge` ; `aal1+next aal1 → enroler` ; **tout autre cas + erreur → `refuser`** |
| Guard `/plateforme` | `layout.tsx` → `exigerAal2Plateforme` (au niveau layout, pas par page) |
| **Dernier admin protégé** | `peutSupprimerFacteur` refuse si `aalActuel !== "aal2"` **et** prend en compte `nombreAdminsTotalActifs` + `rolePlateforme` |
| Multi-facteurs | Oui — les fonctions opèrent sur une **liste** de facteurs, avec sélection optionnelle d'un `facteurId` |
| **Aucun hardcode email** | `git grep` sur `src/lib/auth/`, `plateforme.ts`, `src/app/(app)/plateforme/` : aucune comparaison `=== "…@…"` ni `includes("…@…")` |
| **Open redirect** | `auth/callback/route.ts` : `destinationInterneSure(searchParams.get("next"), "/dashboard")` ; `mfa-server.ts` : `next` toujours `encodeURIComponent` d'un chemin interne ; idiome `retour.startsWith("/") && !retour.startsWith("//") && !retour.includes(":")` utilisé ailleurs |
| Timeout | `avecDelai(operation, 10_000)` sur les appels MFA |
| Tests | Vitest `src/lib/auth/mfa*` : **24/24** |

**Pas de P0.**

## 6. Stripe

| Contrôle | Constat |
|---|---|
| Barrière Test/Live | `stripe-webhook-environment.ts` : `STRIPE_WEBHOOK_EXPECTED_MODE` → `test`⇒`livemode:false`, `live`⇒`livemode:true`, sinon `{valide:false}` |
| Idempotence | `Idempotency-Key` sur **chaque** appel mutant (`abonnement-client-…`, `abonnement-checkout-…-<offre>-<periodicite>`, `remise-application-<sub>-<coupon>`, `abonnement-changement-…`, `facture-<id>-<montant>`, …) |
| Saga remise | `creerCouponRemise` / `appliquerCouponAbonnement` (`discounts[0][coupon]` remplace toute remise existante) / `retirerCouponAbonnement` ; `observerRemiseDepuisAbonnement` **fail-closed** (une référence `di_…` non développée, une source inconnue ou une cardinalité ≠ 1 lèvent `ObservationRemiseStripeInexploitable`, jamais « aucune remise ») |
| Observation discount ≥ R7.3 | `stripe-discount-consistency.ts` + `stripe-state-attestation.ts` (Ed25519) présents ; migration `…000244_stripe_state_attestation_r72` + `…000245_stripe_discount_observation_r73` dans le ledger |
| Logs sensibles | `verify:secrets` PASS (1265 fichiers) ; `git grep` de patterns durs (`sk_live_`, `sk_test_`, `whsec_`, `service_role…eyJ`, `PRIVATE KEY`, `otpauth://…secret=`) sur le SHA hors `*.md` : **0** |
| Tests | `src/lib/stripe*.test.ts` : **94/94** (8 fichiers) |

**ENV Vercel non modifié. Pas de P0.**

## 7. Tarification

| Offre | Mensuel (code) | Annuel (code) | = ×10 | Comptes inclus | Compte sup. |
|---|---:|---:|:--:|---:|---:|
| Mini | 79 € (7 900 c) | 790 € (79 000 c) | ✓ | 3 | 15 € |
| Pro | 249 € (24 900 c) | 2 490 € (249 000 c) | ✓ | 15 | 12 € |
| Business | 449 € (44 900 c) | 4 490 € (449 000 c) | ✓ | 30 | 9 € |
| Entreprise | 599 € (59 900 c) | 5 990 € (599 000 c) | ✓ | 50 | 9 € |

- `src/lib/tarification.ts` + `tarification.canonical.json` alignés ; invariant `annuel ===
  mensuel × 10` testé (`tarification.test.ts`, `plateforme.test.ts`).
- **Anciens prix absents du code actif** : aucun `6_900 / 19_900 / 39_900 / 199_000 / 94_800 /
  298_800 / 538_800 / 646_800` dans `src/` hors `SERVICES_MISE_EN_SERVICE` (199 000 / 69 000 =
  prix de prestations, faux positifs documentés). `elsatia-tarifs-v2` (69/199/399) : absent.
- Tests tarification ciblés : **94/94**. `npm run verify:stripe-prices --strict` (mapping cible
  = mensuels câblés `price_1Tzi6A0/j0/u0/710…` + annuels alignés `price_1UBJ9l0/m0/m0/n0…`) :
  **8/8, 0 divergence**.

## 8. Blocker Vercel (documenté, hors périmètre de ce lot)

4 variables `STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_ANNUEL` (Production + Preview) pointent
encore sur les Prices annuels **× 12** (`price_1Tzi6O0/q0/y0/750…`). Repointage vers les Prices
**× 10** déjà créés — lot **CODEX** `ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1`. Les 4
variables `_MENSUEL` sont déjà correctes.

**Le code tarifaire n'est PAS considéré divergent** : `verify:stripe-prices --strict` est vert
avec le mapping cible ; l'écart est purement une valeur d'environnement à basculer, non un
défaut de code. → classé **P1 commercial**, pas P0 technique.

## 9. Multitenant

- Tests applicatifs (RLS, permissions, habilitations apps, switch entreprise) inclus dans le
  Vitest GP : **686/686** ; Tools **107/107**.
- pgTAP `isolation_multitenant*`, e2e `roles-and-direct-access` / `security.spec` : **non
  rejoués ici** (pas d'accès BDD / navigateur) — état « PASS » hérité du socle canonique ;
  aucun fichier de surface multitenant touché par le replay tarifaire.
- Aucune surface cross-tenant introduite par `ac7bf05` (17 fichiers = tarification + docs).

**Pas de P0.** À rejouer pgTAP + e2e sur `ac7bf05` avant déploiement réel (P1 vérification).

## 10. Colors — socle commun

- `applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`,
  `roles_applications_elsatia` : présents, consommés par `src/lib/multi-app-server.ts`.
- `ApplicationSwitcherGestionPro` (app) et `apps/colors/src/components/ApplicationSwitcher` :
  câblés sur le même substrat.
- Migrations Colors `…000246–249` dans le ledger. **Aucune revue métier Colors approfondie**
  (hors périmètre). Socle compte commun **intact**.

## 11. Tools

- `npm ci apps/tools` + `npm --prefix apps/tools run {typecheck,lint,test,build}` : **tous
  PASS** (typecheck 0, lint 0, tests **107/107**, build **✓ Compiled 3.2s**).
- Nouvelles deps du socle (`@apple/app-store-server-library`, `google-auth-library` — monétisation
  native Tools) résolues après `npm ci`. Migrations Tools R8/R9/R10 (`…000236–239`) présentes.
- Aucune régression du socle commun.

## 12. Storage / DR

- **Database DR : GO · Storage DR : GO · Global DR : GO** (lots ELSATIA-*-DR, non rejoués ici).
- `ac7bf05` n'ajoute **aucune** migration ; le socle canonique n'a modifié **aucune migration
  storage historique** (seules de nouvelles migrations Colors/Tools ajoutées).
- Schéma attendu inchangé : 13 buckets, 33 policies Storage (hash `d4800a6d0…`), colonnes
  `*_storage_path`, préfixe `entreprise_id`.

## 13. Secrets

- `verify:secrets` : **1265 fichiers suivis, 0 secret**.
- `git grep` (SHA, hors `*.md`) : `sk_live_` / `sk_test_` / `whsec_` / `service_role…eyJ` /
  `-----BEGIN … PRIVATE KEY-----` / `otpauth://…secret=` → **0 correspondance**.
- `npm audit` : **0 vulnérabilité**.

## 14. Production gap (`fcdd4e7c` → `ac7bf05`)

**436 fichiers, +48 707 / −549.**

| Classe | Contenu | Volume |
|---|---|---|
| **A — sécurité** | ACL 255 (REVOKE massifs, FORCE RLS), R7.4/R7.5, attestation Ed25519, `residual_acl_hardening` | migrations 252-255 + tests |
| **B — auth / MFA** | TOTP MFA + guards AAL2, `/mfa/*`, `api/auth/mfa/*`, `exigerAal2Plateforme` | 6 fichiers `src/lib/auth` + routes |
| **C — migrations** | **211 → 253** (+42) : convergence multi-app, UID canonical admin, AAL2 role integrity, discount consistency, attestation, Colors `…246-249`, Tools R8/R9/R10, canonicalisation | 42 migrations |
| **D — billing / tarification** | grille **79/249/449/599**, annuel ×10, `tarification.canonical.json`, `verify:stripe-prices`, CGV art. 4 corrigé, P15 aligné | 17 fichiers (`ac7bf05`) |
| **E — multi-app** | app **Colors** v1.3 (`apps/colors`, 57 fichiers), app **Tools** R8-R10 + monétisation native (`apps/tools`, 180 fichiers), compte commun / catalogue applications | ~240 fichiers |
| **F — QA / config** | `package.json` : chaînage `apps/tools` sur build/lint/test/typecheck ; overrides `browserslist 4.28.7` / `fast-uri 3.1.6` ; `verify:stripe-prices` ; nouvelles deps | package.json + lock |
| **G — marque / UI** | rebrand **Liria → ELSATIA** complet (aucune chaîne « Liria » sur pages publiques) ; **UI-V2 non appliquée** (R3 non lancé) | pages publiques, `brand.ts`, `PiedLegal` |

**Ce qui changera réellement au déploiement** : +42 migrations (dont ACL/MFA à fort impact —
voir § 15), apparition des applications **Colors** et **Tools** dans le catalogue, exigence
**MFA/AAL2** sur `/plateforme` (les sessions AAL1 seront re-challengées), bascule **marque
ELSATIA** sur toutes les pages publiques, grille tarifaire **79/249/449/599** (affichage — le
montant facturé dépend encore des 4 variables Vercel annuelles, § 8).

## 15. Rollback

| Couche | Plan | Suffisant ? |
|---|---|---|
| Application (Vercel) | rollback vers le déploiement `fcdd4e7c` | ✅ pour le code/UI |
| **Base de données** | les 42 migrations (ACL FORCE RLS / REVOKE, MFA, attestation) **ne se dé-appliquent pas** par un rollback Vercel | ❌ **nécessite un snapshot / PITR Production pris juste avant migration + une procédure de restauration testée** |
| ACL | idem DB (REVOKE/GRANT non réversibles sans migration inverse ou restore) | ❌ → via restore DB |
| Auth / MFA | facteurs TOTP enrôlés en Production restent ; un rollback code laisse les guards absents mais les facteurs présents (sans effet néfaste) | ⚠️ documenter : pas de suppression de facteurs au rollback |
| Storage | aucun changement de schéma/policy dans ce SHA | ✅ n/a |
| Stripe | aucun objet Live touché | ✅ n/a |
| Sessions existantes | après déploiement, les sessions AAL1 des admins plateforme seront re-challengées (comportement voulu) ; un rollback rétablit l'accès AAL1 | ⚠️ à noter dans le runbook |

**Rappel : un rollback Vercel seul est insuffisant dès que les migrations ACL/MFA sont
appliquées.** → **P1 : plan de rollback DB/Auth documenté et testé (snapshot/PITR pré-migration)
avant le déploiement réel.**

## 16. Juridique (conclusions reprises de `ELSATIA-LEGAL-COMMERCIAL-READINESS-V1`)

| Catégorie | Élément | Bloque la revue technique ? | Bloque le GO commercial ? |
|---|---|:--:|:--:|
| **Technique** | pages `/mentions-legales`, `/cgv` rendues depuis `docs/juridique/*.md` — versions **canoniques corrigées** présentes sur ce SHA (EI + marqueurs « à confirmer », CGV offres/2-mois-offerts, TVA « À VALIDER ») | Non | — |
| Juridique externe | régime fiscal/social EI (micro *ou* réel) **non arbitré** → mention de TVA non tranchée | Non | **Oui** — expert-comptable |
| Juridique externe | relecture avocat du pack + rédaction clauses B2B manquantes (délai de paiement, pénalités, indemnité 40 €, escompte) | Non | **Oui** — avocat |
| Administratif externe | **SIRET/SIREN/RCS** non reçus | Non | **Oui** — INPI/INSEE |
| Technique (site) | `elsatia-site` : bandeau « Document de travail » + `legal.ts` « micro-entreprise » ; commit `7c47d3d` **non rebasé** sur le socle | Non (repo séparé) | **Oui** — lot site séparé |
| Technique (déployé) | Production actuelle affiche encore « micro » / « 293 B » / « −20 % » — **corrigé sur ce SHA**, disparaît au déploiement | Non | levé au déploiement |

**La revue technique n'est pas bloquée par un document juridique non arbitré**, mais ces points
restent des **blockers commerciaux**.

## 17. Readiness matrix

| Domaine | État | Preuve | P0/P1/P2 | Action |
|---|---|---|---|---|
| Git / SHA | ✅ | HEAD distant = `ac7bf05` = attendu ; graphe tracé | — | — |
| Migrations | ✅ | 253, uniques, 255 + R7.4/R7.5 présentes, 0 historique modifiée | — | rejouer `verify:migrations` en CI de déploiement |
| ACL | ✅ (statique) | migration 255 identique à l'audit V1 ; drift 0 / 532 allowlistés / 870-870 (audit V1) | **P1** | rejouer le diff Fresh↔Restore + pgTAP sur `ac7bf05` avant déploiement |
| MFA / AAL2 | ✅ | fail-closed, dernier admin protégé, multi-facteur, 0 hardcode email, redirect sanitisé, 24/24 | — | — |
| Stripe | ✅ | barrière mode, idempotence partout, saga remise fail-closed, 94/94 | — | ENV Vercel = P1 (§ 8) |
| Tarification | ✅ | grille 79/249/449/599 ×10, `verify:stripe-prices --strict` 8/8 | — | — |
| Multitenant | ✅ (applicatif) | 686/686 GP + 107/107 Tools ; 0 surface touchée par le replay | **P1** | rejouer pgTAP `isolation_*` + e2e sur `ac7bf05` |
| QA socle | ✅ | typecheck/lint GP+Tools PASS, vitest 686/686, Tools 107/107, builds ✓, npm audit 0, secrets 0 | — | — |
| DR (DB/Storage/global) | ✅ | GO (lots DR) ; schéma Storage non touché | **P2** | non ré-audité ici |
| Site vitrine | ⚠️ | `elsatia-site` `7c47d3d` non rebasé ; bandeaux brouillon ; `legal.ts` « micro » | **P1** | lot site séparé |
| Juridique | ⚠️ | régime/TVA non arbitrés ; SIRET INPI ; avocat | **P1 commercial** | H1 expert-comptable, H2 INPI, H3 avocat |
| Vercel ENV | ⚠️ | 4 var `_ANNUEL` en ×12 | **P1 commercial** | lot CODEX `ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1` |
| Rollback | ⚠️ | rollback Vercel ≠ rollback DB | **P1** | snapshot/PITR pré-migration + procédure testée |
| Branche `main` | ⚠️ | obsolète, « Liria », prix 79/249/449 ×12 | **P1** | protection de branche + check Production Branch Vercel (`NE_PAS_DEPLOYER_MAIN.md`) |

## 18. P0 / P1 / P2

### P0 — bloque le déploiement pré-production
**Aucun.** Tous les contrôles techniques exécutables sont verts, sans écart de sécurité ni
d'architecture.

### P1 — à fermer avant le déploiement réel / avant les premiers clients
- **P1-1** Rejouer sur `ac7bf05`, sur une base construite depuis Git : diff ACL Fresh↔Restore
  (attendu 0 applicatif) + pgTAP **870/870** + pgTAP `isolation_multitenant*` + e2e sécurité.
- **P1-2** Plan de **rollback DB/Auth** (snapshot/PITR pris juste avant l'application des 42
  migrations ; procédure de restauration testée). Le rollback Vercel seul est insuffisant.
- **P1-3** Repointer les **4 variables Vercel `_ANNUEL`** (lot CODEX).
- **P1-4** Rebaser/aligner le commit **`elsatia-site` `7c47d3d`** sur le socle + retirer les
  bandeaux « Document de travail » + « micro-entreprise » de `legal.ts`.
- **P1-5** **Juridique** : arbitrage régime EI/TVA (expert-comptable), relecture avocat +
  clauses B2B manquantes, SIRET/SIREN (INPI/INSEE).
- **P1-6** Protection de branche **`main`** + vérifier que la Production Branch Vercel ≠ `main`.
- **P1-7** Runbook de déploiement : ordre migrations → vérif sentinelles → re-challenge MFA des
  admins plateforme → smoke.

### P2 — post-lancement
- Ré-audit DR complet sur le SHA final ; communication publique DR.
- Quick wins SEO/UX du site (`robots.txt` app, canonical, « Se connecter », `alt`).
- Archivage des anciens Prices Stripe annuels ×12 + grille `elsatia_tarifs_v2_*`.
- CMP seulement si ajout futur d'un traceur soumis à consentement.
- Objectif de disponibilité indicatif dans la CGV/CGU ; mention Sentry sans cookie.

## 19. Verdict technique — TECHNICAL PREPROD READINESS

Le SHA `ac7bf05` intègre, de façon tracée et sans conflit, **ACL 255 + Root QA + MFA/AAL2 + la
tarification canonique** sur la lignée release. Tous les contrôles exécutables sont **verts** :
253 migrations sans modification historique, MFA fail-closed et dernier admin protégé, barrières
Stripe Test/Live et idempotence en place, grille tarifaire alignée avec `verify:stripe-prices
--strict` à 8/8, Vitest 686/686 (GP) et 107/107 (Tools), typecheck/lint/builds PASS, `npm
audit` 0, secrets 0. Les seules réserves techniques sont des **contrôles à rejouer avec un accès
BDD/e2e** (P1-1) et le **plan de rollback DB/Auth** (P1-2) — à traiter avant le déploiement
réel, pas des défauts du socle.

→ **GO PREPROD technique.**

## 20. Verdict commercial — COMMERCIAL GO-LIVE READINESS

**NO-GO commercial**, conditionné à : (a) repointage des 4 variables Vercel annuelles ; (b)
arbitrage du régime EI/TVA (expert-comptable) et relecture avocat + clauses B2B ; (c)
SIRET/SIREN (INPI/INSEE) ; (d) alignement + nettoyage du repo `elsatia-site` (bandeaux
brouillon, « micro-entreprise ») ; (e) plan de rollback DB testé ; (f) protection de la branche
`main`. Aucun de ces points n'est un défaut du code pré-production.

---

`ELSATIA-PREPROD-INDEPENDENT-REVIEW-V1-R2 VALIDÉ TECHNIQUEMENT — GO PREPROD — GO COMMERCIAL ENCORE CONDITIONNEL`
