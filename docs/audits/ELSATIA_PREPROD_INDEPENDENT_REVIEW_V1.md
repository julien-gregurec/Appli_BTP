# ELSATIA — Revue indépendante de pré-production V1

Date : 2026-09-02. **Audit strictement en lecture seule.** Aucun code, migration, branche,
commit, push ; aucune action Production / Vercel / Stripe / Supabase distant / MFA / ACL.

---

## 0. Résultat immédiat

**La branche canonique d'intégration de pré-production n'existe pas encore.**

- `feat/elsatia-canonical-integration-preprod-v1` : **absente** de `origin`
  (`github.com/julien-gregurec/Appli_BTP`).
- **Aucune branche existante ne contient les trois lots validés** (MFA `b4fe1303` +
  ROOT QA `01720b66` + ACL 255 `d4dee2fa`) : vérifié par `git merge-base --is-ancestor`
  sur toutes les branches distantes → 0 résultat.
- Chaque lot vit **uniquement sur sa propre branche** (`git branch -r --contains` → une seule
  branche par SHA).

→ Conformément au § 23 du cadrage : **mode « review plan only »**. Ce document fournit la grille
de revue complète, les éléments déjà vérifiables en lecture seule, et la liste exacte des
contrôles à relancer dès que Codex publie le SHA de la branche d'intégration.

**Verdict : `EN ATTENTE`.**

---

## 1. Branche auditée

| Attendu | Constat |
|---|---|
| `feat/elsatia-canonical-integration-preprod-v1` (ou nom exact Codex) | **Inexistante** |
| Branche créée par Claude ? | **Non** (interdit, § 1 / § 23) |

Branches d'« intégration canonique » **préexistantes** (toutes antérieures aux 3 lots du 02-09,
donc ne les contiennent pas) :

| Branche | HEAD | Date | Contient les 3 lots ? |
|---|---|---|---|
| `feat/elsatia-canonical-integration-v1` | `95a1bbb` | 2026-08-27 | Non |
| `feat/elsatia-canonical-integration-r73-v1` | `24c944d` | 2026-08-28 | Non |
| `feat/elsatia-canonical-final-r73-v1` | `e65fc05` | 2026-09-02 18:21 | Non (242 migrations, pas 253) |
| `codex/elsatia-colors-canonical-integration-v1` | `a4c01ea` | 2026-08-27 | Non |

---

## 2. État vérifié de chaque lot d'entrée (lecture seule)

| Lot | Branche origin | SHA | Base (merge-base / Production `fcdd4e7c`) | Migrations (total) | Secret dur détecté |
|---|---|---|---|---:|---|
| **MFA / AAL2** | `codex/elsatia-mfa-aal2-v1` | `b4fe13035eea7800cdbb6cd42e21ac9f5aaa0eac` | `ca2f2a26` (2026-08-26) | 252 | Aucun |
| **ROOT QA** | `codex/elsatia-root-qa-closure-v1` | `01720b66d7fb2b4505e37f8096dc73d230d3bc50` | `ca2f2a26` (2026-08-26) | 252 | Aucun |
| **ACL 255** | `codex/elsatia-acl-reconciliation-v1` | `d4dee2fa6f2bf1de8acb1cd58b0163fcaeec4be1` | `ca2f2a26` (2026-08-26) | **253** | Aucun |
| **Tarification (app)** | `feat/tarification-canonical-alignment-v1` | `beb0ac5baa1e30de774cb2f88838dd9dfabb1a61` | `fcdd4e7c` Production, via base `e65fc05` | 242 | Aucun |
| **Tarification (site)** | `elsatia-site` `feat/pricing-canonical-alignment-v1` | `7c47d3d448ea78a9ac50828ee9716ff005de78da` | `elsatia-site` main | n/a | Aucun |
| **Production actuelle** | `release/commercialisation-v1` | `fcdd4e7c90f32abb15502e825335659f9d57c9a1` | — | 211 | — |

Scan secrets effectué sur les 4 tips (`git grep` : `sk_live_`, `sk_test_`, `whsec_`,
`service_role…eyJ`, blocs `PRIVATE KEY`, hors `*.md`) → **0 correspondance**. Un scan
exhaustif (TOTP seed, QR secret, tokens applicatifs) devra être refait sur la branche
d'intégration finale (§ 14).

### Matrice « lot présent »

| Lot | SHA attendu | Présent sur origin | Intégré dans une branche | Risque |
|---|---|---|---|---|
| MFA | `b4fe1303` | ✅ (branche dédiée) | ❌ | Doit être mergé sans perte des guards AAL2 |
| ROOT QA | `01720b66` | ✅ (branche dédiée) | ❌ | Correctifs tsconfig/lint/deps à préserver |
| ACL 255 | `d4dee2fa` | ✅ (branche dédiée) | ❌ | Migration `…000255` + drift 0 à préserver |
| Tarification app | `beb0ac5` | ✅ (branche dédiée) | ❌ | Base `e65fc05` (242 mig.) ≠ base Codex (252/253) → **rebase requis** |
| Tarification site | `7c47d3d` | ✅ (dépôt site) | ❌ | Indépendant, dépôt séparé |

---

## 3. Graphe Git et inventaire des migrations — observations

- **Divergence de socle** : les 3 lots Codex partent de `ca2f2a26` (2026-08-26) et portent
  **252–253 migrations**. La branche tarifaire part de `e65fc05` (`feat/elsatia-canonical-final-r73-v1`)
  qui n'a que **242 migrations**. Ce sont **deux lignées canoniques différentes** — la
  tarification devra être **rebasée** sur la branche d'intégration Codex avant fusion.
- **Production `fcdd4e7c` = 211 migrations.** Les 42 migrations au-delà de Production (visibles
  sur ACL 255) incluent : `…000234_elsatia_multi_app_convergence_v1` … `…000254_migration_canonicalization_v2`
  … **`20260902000255_acl_reconciliation_v1.sql`** (présente uniquement sur `ACL255`, pas sur
  MFA/ROOTQA qui s'arrêtent à `…254`).
- **À vérifier sur la branche d'intégration finale** (contrôle non réalisable maintenant) :
  timestamps strictement croissants, unicité (`npm run verify:migrations` attendu ≥ 253),
  R7.4 (`…000252_residual_acl_hardening_r74`) et R7.5 (`…000253_support_message_author_guard_r75`)
  présentes, `migration_canonicalization_v2` présente, **aucune migration historique modifiée**
  (comparer octet à octet les migrations ≤ 211 avec Production).

---

## 4. Chevauchement de fichiers entre lots (prédiction de conflits d'intégration)

Chaque lot Codex re-intègre l'ensemble du socle canonique depuis `ca2f2a26` → les diffs sont
massifs (MFA 417 fichiers / +46 926 ; ROOT QA 399 / +46 393 ; ACL 255 401 / +47 833) et
**~398 fichiers sont communs aux trois** (socle Colors + rebrand + Tools + plateforme repris à
l'identique). Le chevauchement brut n'indique donc pas 398 conflits réels, mais impose une
**intégration ordonnée** plutôt que trois merges parallèles.

| Fichier / zone | MFA | ROOT QA | ACL 255 | Tarification | Conflit probable | Résolution recommandée (hors de ce lot) |
|---|:--:|:--:|:--:|:--:|---|---|
| `supabase/migrations/*` (nouvelles) | 41 | 41 | 42 | 0 (base ancienne) | **Élevé** si les 3 lignées ne sont pas rebasées sur un socle commun | Choisir ACL 255 (253 mig.) comme socle, y rejouer MFA puis ROOT QA |
| `src/lib/tarification.ts` | non | non | non | **oui** | Moyen (la branche Codex peut porter l'ancienne grille 69/199/399) | Rebaser la tarification en dernier ; `verify:stripe-prices` + tests grille comme garde-fou |
| `package.json` / lockfile | oui | oui | oui | oui | **Élevé** (scripts `verify:*`, deps browserslist/fast-uri) | Prendre ROOT QA comme référence deps, ré-ajouter `verify:stripe-prices` |
| `tsconfig.json` / `vitest.config.ts` | oui | oui | oui | non | Moyen | Référence = ROOT QA (périmètre TS, exclusion ciblée Naming Studio) |
| `src/lib/plateforme.ts` / `plateforme.test.ts` | oui (guards AAL2) | oui | oui | oui (test tarif ajouté) | Moyen | Base MFA pour les guards, ré-appliquer l'assertion `annuel = 10×mensuel` |
| `apps/colors/**`, `apps/tools/**` | repris | repris | repris | repris | Faible (identiques) | Vérifier build après intégration |
| `docs/**` | oui | oui | oui | oui | Faible (additifs) | Fusion additive |

Aucune résolution effectuée (§ 9).

---

## 5–20. Grille de revue à exécuter sur la branche d'intégration (dès SHA disponible)

> Chaque contrôle est **lecture seule**. Preuve = commande + sortie attendue.

### 5. Migrations
- `npm run verify:migrations` → « ≥ 253 migrations valides, noms et horodatages uniques ».
- `git diff <PROD>..<INT> -- supabase/migrations/` : toute ligne `-` sur une migration ≤ `…211`
  = **BLOQUANT** (modification historique).
- Présence de `…000252_residual_acl_hardening_r74`, `…000253_support_message_author_guard_r75`,
  `…000254_migration_canonicalization_v2`, `…000255_acl_reconciliation_v1`.

### 6. ACL (surface applicative)
- Rejouer l'inventaire ACL exhaustif (méthode `ELSATIA-SUPABASE-SYSTEM-DRIFT-AUDIT-V1` :
  `aclexplode` sur `pg_class`/`pg_proc`/`pg_namespace`/`pg_default_acl` + `pg_policies`) sur une
  base Fresh construite depuis la branche d'intégration.
- Attendu : **application drift = 0** (tables/colonnes/fonctions/séquences/default privileges
  pour `anon`, `authenticated`, `service_role`, `authenticator`, `elsatia_*`) ; **system
  exploitable drift = 0** ; les 532 écarts managés restent classés A/B/C (ne pas reclasser sauf
  nouvel écart).
- pgTAP : `supabase test db` → **870/870** Fresh, **870/870** Restore.

### 7. MFA / AAL2
- Lire `src/lib/…mfa…`, `src/app/(app)/plateforme/*`, l'action de challenge/verify.
- Contrôles : `enroll` / `challenge` / `verify` / `listFactors` / `unenroll` /
  `getAuthenticatorAssuranceLevel` présents ; guard `/plateforme` **fail-closed** (aucune
  session AAL1 ne passe) ; pas d'`open redirect` (paramètre `next`/`redirect` validé
  allowlist) ; **aucun `email === "…"` en dur** ; protection dernier admin total (déjà couverte
  par `platform_aal2_role_integrity_v1`) ; support **multi-facteurs**.
- Tests MFA : **39/39** attendus. Ne jamais utiliser un compte Production.

### 8. Autorisation plateforme
- Chaîne attendue : `auth.uid()` → `plateforme_admins.utilisateur_id` → `actif` → `role` →
  `AAL2`. `est_plateforme_admin()` doit être UID-based (migrations 235/236), **pas**
  `auth.email() in (...)`. Aucun bypass côté client (`page.tsx` ne doit pas décider seul).

### 9. Multitenant
- Rejouer les tests d'isolation cross-tenant (pgTAP `isolation_multitenant*`, e2e
  `roles-and-direct-access`, `security.spec`).
- Surfaces à sonder pour un passage A→B / B→A : `utilisateurs_entreprises`,
  `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, changement
  d'entreprise, Storage (`storage.foldername(name)[1]` = `entreprise_id`), RPC `SECURITY DEFINER`.
- Tout contournement = **NO-GO**.

### 10. Stripe / facturation (lecture seule)
- La branche d'intégration **ne doit pas réintroduire** : grille 69/199/399, annuel ×12, remise
  générique −20 %, exception Entreprise −10 %, mapping Stripe obsolète en dur, RPC de remise
  legacy (révoqués par `…000242_revoke_legacy_discount_rpcs_v1`), bypass d'attestation
  (`stripe_state_attestation_r72`).
- `grep -rnE "6_?900|19_?900|39_?900|69_?000|199_?000|94_?800|298_?800" src/lib/tarification.ts`
  → doit être vide (hors `SERVICES_MISE_EN_SERVICE` 199_000/69_000, faux positifs connus).

### 11. Tarification future — conflits avec `beb0ac5`
Matrice à produire sur la branche d'intégration :

| Fichier | Version canonique (INT) | Version tarification (`beb0ac5`) | Conflit probable | Résolution recommandée |
|---|---|---|---|---|
| `src/lib/tarification.ts` | à lire | 79/249/449/599, annuel ×10 | **oui** si INT porte l'ancienne grille | garder la version `beb0ac5` |
| `src/lib/tarification.canonical.json` | absent probable | présent | ajout | conserver |
| `src/lib/tarification.test.ts` | à lire | pins + `annuel = mensuel×10` | oui | garder `beb0ac5` |
| `src/lib/plateforme.test.ts` | guards AAL2 (MFA) | assertion tarif ajoutée | oui | fusion : garder les 2 blocs |
| `package.json` | scripts `verify:*` (ROOT QA) | + `verify:stripe-prices` | oui | union des scripts |
| `scripts/verify-stripe-prices.mjs` | absent | présent | ajout | conserver |
| `docs/juridique/cgv.md` | version INT | art. 4 aligné (offres, 2 mois offerts, TVA « À VALIDER ») | oui | garder `beb0ac5` |
| `docs/organisation/TARIFICATION_CANONIQUE.md`, `NE_PAS_DEPLOYER_MAIN.md` | absents | présents | ajout | conserver |

### 12. ROOT QA
- Vérifier la persistance des correctifs : périmètre `tsconfig.json` (exclusion **ciblée** de
  `docs/archive/naming-studio-recovery` et cadrage `apps/tools`), `browserslist` et `fast-uri`
  patchés (`npm audit` attendu **0** high), Tools vérifié séparément.
- `npm run typecheck && npm run lint && npm run test && npm run build` (Gestion Pro) →
  attendu PASS ; idem `apps/tools`.

### 13. Tools
- Impact du socle commun uniquement : `apps/tools` build + typecheck + deps ; **aucun
  changement métier involontaire** (diff `apps/tools/src` limité à l'intégration compte commun /
  ACL / entitlements). Migrations Tools R8/R9/R10 (`…000236/237/238/239`) présentes et non
  modifiées.

### 14. Colors
- L'intégration ne casse pas : socle compte commun, catalogue `applications_elsatia`,
  habilitations, `ApplicationSwitcher`, rôles Colors. Migrations Colors (`…000246–249`)
  présentes. `apps/colors` build OK. **Ne pas** intégrer/modifier le métier Colors.

### 15. Storage DR
- Schéma `storage` (13 buckets attendus : `bulletins-paie`, `chantier-documents`,
  `colors-seaux`, `devis-medias`, `documents-employes`, `documents-paie`, `entreprise-assets`
  (public), `factures-fournisseurs`, `fiches-techniques`, `messagerie-medias`, `notes-frais`,
  `notes-frais-exports`, `pointage-preuves`), 33 policies Storage (hash attendu
  `d4800a6d0c9138ffdbbdbd3a4193f217`), colonnes `*_storage_path` des ~15 tables métier,
  préfixe `entreprise_id`. L'intégration ne doit rien supprimer de tout cela. Scripts Ops DR
  = hors dépôt, hors périmètre.

### 16. Secrets (exhaustif)
- `git grep` sur le tip d'intégration : `STRIPE_SECRET_KEY`, `service_role` + JWT, `whsec_`,
  `sk_live_`/`sk_test_`, `-----BEGIN … PRIVATE KEY-----`, seed TOTP (`otpauth://`, base32 de
  32+), QR secret. + `npm run verify:secrets` (attendu « 0 secret reconnu »).

### 17. Documentation critique (go/no-go uniquement)
- Cohérence : `docs/audits/*readiness*`, `*acl-reconciliation*`, `*system-drift*`, MFA,
  `docs/organisation/{P15_STRIPE_LIVE_PREPARATION,TARIFICATION_CANONIQUE,NE_PAS_DEPLOYER_MAIN,
  CHECKLIST_LANCEMENT}.md`, runbook DR.
- Signaler (sans réécrire) toute doc historiquement fausse : ex. `P15` §5-6 (annuel ×12) déjà
  corrigé sur `beb0ac5` ; `TARIFS_V2_APP_PREVIEW.md` marqué obsolète sur `beb0ac5`.

### 18. Production release gap (`fcdd4e7c` → intégration)
Classer les écarts : **A** sécurité · **B** auth/MFA · **C** migration (211 → ~255) · **D**
billing/tarification · **E** multi-app (Colors/Tools, compte commun) · **F** QA/config · **G**
UI (rebrand ELSATIA, UI-V2 **non** appliquée) · **H** autres. Fournir un résumé lisible de ce
qui changera **réellement** en Production (surtout : +44 migrations dont ACL/MFA/attestation,
bascule marque Liria→ELSATIA sur les pages publiques, apparition Colors/Tools).

### 19. Risques de déploiement
Pour chacun : probabilité / impact / mitigation —
migration DB (44 nouvelles, dont ACL FORCE RLS / REVOKE massifs) ; Auth/MFA (sessions AAL1
existantes → re-challenge) ; ACL (rôles `anon`/`authenticated` restreints → régression PostgREST
possible) ; variables d'env (nouvelles `STRIPE_PRICE_*`, `verify:stripe-prices`) ; build ;
Stripe (mapping annuel non encore repointé côté Vercel — lot CODEX séparé) ; multi-app
(catalogue applications, entitlements) ; rollback ; ancien admin email-only ; ledger migrations.

### 20. Rollback
Vérifier l'existence d'un plan **par couche** : application (rollback Vercel vers `fcdd4e7c`),
**DB** (les migrations ACL/MFA appliquées ne se dé-appliquent pas par un simple rollback Vercel
→ besoin d'un snapshot/PITR pré-déploiement et d'une procédure de restauration testée), Storage,
Auth (facteurs MFA enrôlés), Stripe (aucun objet Live touché → n/a). **Ne pas** fabriquer un
rollback destructif (pas de `DROP` de migration en Production).

### 21. UI-V2 / R3
UI-V2 figée, **R3 non lancé**, **aucun travail UI dans ce lot**. La branche d'intégration ne
doit contenir **aucune** modification de `src/app/globals.css` / tokens / composants au titre de
R3.

---

## 22. Readiness matrix (préliminaire — à compléter sur la branche d'intégration)

| Domaine | État actuel (lots séparés) | Preuve | Bloquant | Action |
|---|---|---|---|---|
| Git / intégration | ❌ branche d'intégration absente | §0 | **P0 (structurel)** | Codex publie `…-integration-preprod-v1` avec MFA+ROOTQA+ACL255, tarif rebasé |
| Migrations | ✅ par lot (252/252/253) | §3 | — | `verify:migrations` sur l'intégration |
| ACL | ✅ par lot (drift 0, 870/870) sur ACL255 | audit V1 | — | rejouer sur l'intégration |
| MFA / AAL2 | ✅ par lot (39/39, AAL2 PASS) | contexte | — | relire sur l'intégration (§7) |
| ROOT QA | ✅ par lot (PASS, audit 0) | contexte | — | rejouer sur l'intégration |
| DR (DB/Storage/global) | ✅ GO | lots DR | — | non ré-audité ici |
| Multitenant | ✅ historiquement | pgTAP/e2e | — | rejouer sur l'intégration (§9) |
| Storage schéma | ✅ 13 buckets / 33 policies | audit DR | — | vérifier non-régression (§15) |
| Stripe TEST (Prices) | ✅ 8 Prices alignés | lot tarif | — | — |
| Tarification code | ✅ app `beb0ac5` + site `7c47d3d` poussés | lot tarif | — | rebase sur l'intégration |
| Tarification ENV Vercel | ❌ 4 var annuelles ×12 | lot CODEX séparé | **P1** | CODEX repointe (hors périmètre) |
| Juridique | ⚠️ régime/TVA non arbitré, pages « Document de travail », SIREN/SIRET en attente INPI | audit readiness/reconciliation | **P1** | arbitrage expert-comptable + avocat + INPI |
| Site vitrine | ⚠️ `legal.ts` « micro-entreprise », pas de robots.txt app | audit readiness | **P1/P2** | corrections site (lot séparé) |
| Production branch | ✅ `release/commercialisation-v1` @ `fcdd4e7c` ; ⚠️ `main` dangereuse | `NE_PAS_DEPLOYER_MAIN.md` | **P1** | protection branche `main` + check épinglage Vercel |
| Rollback | ⚠️ plan DB/Auth à confirmer | §20 | **P1** | snapshot/PITR pré-déploiement documenté et testé |

---

## 23. Blockers

### P0 — interdit Production tant que non levé
- **B-P0-1** : aucune branche canonique d'intégration réunissant MFA + ROOT QA + ACL 255
  (+ tarification rebasée). La revue de fond ne peut pas commencer.

### P1 — à fermer avant go-live
- **B-P1-1** : 4 variables Vercel `STRIPE_PRICE_*_ANNUEL` pointent encore sur les Prices ×12
  (lot `ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1`, CODEX).
- **B-P1-2** : régime fiscal/social EI + mention TVA non arbitrés ; pages légales publiques
  encore marquées « Document de travail » ; `legal.ts` dit « micro-entreprise » ;
  SIREN/SIRET/RCS en attente INPI.
- **B-P1-3** : plan de rollback **DB/Auth** (migrations ACL + facteurs MFA) à documenter et
  tester ; le rollback Vercel seul est insuffisant.
- **B-P1-4** : branche `main` obsolète et dangereuse — protection de branche + vérification de
  la Production Branch Vercel.
- **B-P1-5** : rebase de `feat/tarification-canonical-alignment-v1` (base `e65fc05`, 242 mig.)
  sur la lignée Codex (252/253 mig.) — non trivial.

### P2 — peut suivre après lancement
- `app.elsatia.fr` sans `robots.txt` / duplication SEO avec `elsatia.fr`.
- Quick wins UI vitrine (lien « Se connecter », `alt`, microcopy maquette) — **ne pas** les
  classer P0.
- Archivage des anciens Prices Stripe annuels ×12 et de la grille `elsatia_tarifs_v2_*`.
- Règle « compte supplémentaire annuel » à trancher.

---

## 24. Recommandation

1. **Codex** produit `feat/elsatia-canonical-integration-preprod-v1` : socle = ACL 255
   (`d4dee2fa`, 253 migrations), y rejoue MFA (`b4fe1303`) puis ROOT QA (`01720b66`), résout les
   conflits `package.json` / `tsconfig` / `plateforme.ts` selon la matrice § 4.
2. **Claude** rebase `feat/tarification-canonical-alignment-v1` sur cette branche (conflits
   attendus : `tarification.ts`, `plateforme.test.ts`, `package.json`, `cgv.md` — résolution
   § 11) et fait de même côté `elsatia-site`.
3. **Claude** relance alors la grille § 5–20 en lecture seule sur le SHA final et met à jour ce
   document (readiness matrix + P0/P1/P2 + verdict `VALIDÉ` ou `NO-GO`).
4. Les lots ENV Vercel (CODEX), juridique et site restent traités séparément.

Éléments déjà acquis à ne pas re-prouver sauf régression : MFA 39/39 + AAL2 ; ACL drift 0 +
870/870 Fresh/Restore ; ROOT QA PASS + `npm audit` 0 ; DR DB/Storage/global GO ; Stripe TEST
8 Prices alignés.

---

`ELSATIA-PREPROD-INDEPENDENT-REVIEW-V1 EN ATTENTE — BRANCHE CANONIQUE D'INTÉGRATION NON DISPONIBLE`
