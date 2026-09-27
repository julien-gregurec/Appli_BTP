# ELSATIA — Canonical Train V4 : Preview Candidate, convergence finale

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `integration/elsatia-canonical-train-v3` @ `ef7443c0` (verdict `CANONICAL TRAIN V3 READY FOR REMOTE PREVIEW EXECUTION` ; 340 migrations, dernière `20260926000505`) |
| Branche | `integration/elsatia-canonical-train-v4` |
| Migrations | **352**, dernière **`20260927100000`** (+12 ; séquence monotone, une collision résolue §3) |
| Moteur | PostgreSQL 16.13 réel + pgTAP 1.3, amorce `scripts/local-postgres-bootstrap` (sans Docker) ; Node 22 ; Chromium Playwright |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge vers `main`. Seule `integration/elsatia-canonical-train-v4` est poussée. |

## 0. Verdict

**`CANONICAL TRAIN V4 LOCALLY QUALIFIED`** (provisoire : recettes Playwright §14 en cours)

Rapport en cours de finalisation : toutes les portes base de données, applications et pack Preview sont vertes ; le verdict final dépend des recettes Playwright (§14).

---

## 1. Branches intégrées

| Lot | Branche | Tip | Verdict d'origine | Intégration V4 |
|---|---|---|---|---|
| A. GP ↔ Réserves V3 | `claude/gracious-cori-npu846` | `d82f8831` | GP RESERVES V3 LOCALLY QUALIFIED | merge `--no-ff` (5 commits) |
| B. Studio V3 Foundation | `claude/kind-mendel-wmcqt3` | `f762d613` | STUDIO V3 FOUNDATION LOCALLY QUALIFIED | merge `--no-ff` (5 commits) ; **Studio OFF** (§8) |
| C. Stripe Ordering (historique) | `claude/amazing-cannon-fc7l3f` | `7253dfda` | STRIPE ORDERING LOCALLY QUALIFIED | **non mergée : SUPERSEDED** par le port `af709660` de D (base V2, migration `…0926 401` identique octet pour octet à `…0927 506`) |
| D. Stripe Trial Synchronization | `claude/zen-goldberg-abwptn` | `6ec71eb5` | STRIPE TRIAL LOCALLY QUALIFIED | merge `--no-ff` (3 commits : port de C + essai + exclusivité Checkout) |
| E. RGPD Purchase Orders | `claude/amazing-johnson-d7nzps` | `e64fe252` | RGPD PURCHASE ORDER BLOCKER TECHNICALLY CLOSED | **IDENTICAL** : ancêtre de F, intégrée via F |
| F. RGPD Residual Debt | `claude/hopeful-lamport-qsqd8h` | `cc230de8` | RGPD RESIDUAL TECHNICAL DEBT CLOSED | merge `--no-ff` (E + 1 commit) |
| G. Relevé & Métré Lot 2 | `claude/friendly-cori-c3tw3n` | `e122384e` | (qualifié dans le rapport Lot 2) | **IDENTICAL** : ancêtre de H et I |
| H. Relevé & Métré Lot 3 | `claude/tender-gauss-inpj33` | `7caf23e6` | RELEVE METRE LOT 3 LOCALLY QUALIFIED | **IDENTICAL** : ancêtre de I |
| I. Relevé & Métré Lot 4 | `claude/zealous-pascal-wjxh2u` | `004f0510` | RELEVE METRE LOT 4 LOCALLY QUALIFIED | merge `--no-ff` : Lot 2 → Lot 3 → Lot 4 dans l'ordre de l'historique linéaire (22 commits) |

Ordre des merges : F (RGPD) → D (Stripe) → A (GP ↔ Réserves) → I (Relevé 2→3→4) → B (Studio), puis
correctifs V4 propres (§3, §9, §15). Toutes les branches A, B, D, F, G, H, I partent exactement de
`ef7443c0` (tip V3) ; C part de `819ebe56` (V2).

## 2. Déduplication

### 2.1 Par commit

| Commit | Lot | Statut | Note |
|---|---|---|---|
| `e64fe252` RGPD commandes fournisseurs engagées | E/F | **NEW** | migration `…0926 506`, fixture, 2 suites pgTAP, harnais |
| `cc230de8` RGPD dette résiduelle | F | **NEW** | migration `…0927 507` → **renumérotée `…508`** (§3), seeds pilote + DR corrigés |
| `7253dfda` Stripe ordering (V2) | C | **SUPERSEDED** | remplacé par `af709660` ; 8 fichiers identiques, les autres ré-écrits par D |
| `af709660` port Stripe ordering sur V3 | D | **NEW** | migration `…0927 506` (= `…0926 401` de C), webhooks ordonnés |
| `395b7021` essai Stripe = reliquat ELSATIA | D | **NEW** | migration `…0927 507` |
| `6ec71eb5` exclusivité Checkout | D | **NEW** | `stripe-checkout-exclusivite` (+11 tests) |
| `ccff1f32` synchro GP → Réserves | A | **NEW** | migration `…0927 402` |
| `b2c28171` bloc Réserves fiche chantier GP | A | **NEW** | |
| `c438b981` recette e2e GP ↔ Réserves | A | **TEST_ONLY** | |
| `372fcecd`, `d82f8831` rapports GP ↔ Réserves | A | **DOC_ONLY** | |
| `bf9cc6e7` audit Relevé (lot 1) | G | **DOC_ONLY** | |
| `6ab889d2`, `9a113234`, `ceb6044f` fondation Lot 2 | G | **NEW** | `9a113234` (« wip ») fait partie de l'historique qualifié, conservé tel quel |
| `7c67855a` renumérotation Lot 2 → 601/602 | G | **NEW** | déjà sur la séquence post-V3 |
| `6ffcf93f` purge RGPD Relevé (pgTAP 13) | G | **TEST_ONLY** | |
| `8195283f` (603), `4b1cf23b` (604), `6a289a81` URL signée | G | **NEW** | |
| `e122384e` rapport Lot 2 | G | **DOC_ONLY** | |
| `a2d99ec9` (701), `85a2a5fa`, `38889382` Lot 3 | H | **NEW** | |
| `5f42bd4c` tests adaptateur Lot 3 | H | **TEST_ONLY** | |
| `ca7e0d88` contrat produit « Relevé Pro inclut Tools Pro » | H | **DOC_ONLY** | |
| `7caf23e6` `apps/tools/AGENTS.md`, `CLAUDE.md` (générés par `next dev`) | H | **DOC_ONLY** | inoffensif, conservé |
| `56d808b5`, `7c52db35` (801), `9004140e`, `68ed8c7e`, `71231f28` Lot 4 | I | **NEW** | |
| `004f0510` rapport Lot 4 | I | **DOC_ONLY** | |
| `1d96d5aa`, `496641b5`, `701f60c3`, `ab126e22` fondation Studio B + I1 | B | **NEW** | GP : routes d'identité **fail-closed (503)** sans configuration (§8) |
| `f762d613` rapport Studio V3 | B | **DOC_ONLY** | |

### 2.2 Fichiers en conflit (résolus)

| Fichier | Lots | Statut | Résolution |
|---|---|---|---|
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` (CTE `attendu_train`) | A, B, D, F | **CONFLICT** (généré) | valeur régénérée (`sync:train-expectations`) ; contrôle 18 (D) conservé ; contrôles 19-23 ajoutés (§15) |
| `ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` (marqueurs `<!--train:…-->`) | A, B, D, F | **CONFLICT** (généré) | régénérés ; textes mis à jour vers la ref V4 |
| `ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md` | A, B | **SUPERSEDED** | rapport **historique** : restauré à l'état V3 et **figé** (340, `20260926000505`, 17) — le générateur réécrivait ses chiffres avec ceux du train courant |
| `tsconfig.json`, `vitest.config.ts` (alias) | B, I | **CONFLICT** | union : `@elsatia/releve-domain` **et** `@elsatia/identity` |
| `package.json` | B, D | auto | union (scripts Stripe + garde des cibles de migration) |

Aucun fichier source applicatif n'était en conflit entre lots.

## 3. Migrations

Dernière migration réelle V3 : `20260926000505`. Aucune migration V3 modifiée (vérifié :
`git diff origin/integration/elsatia-canonical-train-v3 -- supabase/migrations` ne contient que
des ajouts).

**Collision** : `20260927000507` portée à la fois par Stripe (`…stripe_trial_synchronization_v1`)
et par la dette RGPD (`…rgpd_dette_residuelle_…`). `supabase_migrations.schema_migrations` a pour
clé la version : la seconde aurait été refusée au `db push`. Choix conservateur : **une seule
renumérotation**, la dette RGPD (aucune dépendance Stripe), en `…508` ; les autres versions
d'origine sont déjà uniques, monotones et toutes postérieures à `…0926 505`.

| SOURCE | OLD_VERSION | V4_VERSION | STATUS | DEPENDENCY | REASON |
|---|---|---|---|---|---|
| RGPD Purchase Orders (E/F) | `20260926000506` | `20260926000506` | NEW | `…326` (CM-06), `…331` (purge V2), `…0926 501-505` | verrou des commandes engagées, instantané minimisé, garde-fou comptable |
| GP ↔ Réserves (A) | `20260927000402` | `20260927000402` | NEW | `…0926 503` (gardes Réserves), `…268` (import GP) | synchro GP → Réserves idempotente, contacts, plans |
| Stripe Ordering (C → D) | `20260926000401` (C) / `20260927000506` (D) | `20260927000506` | NEW (C : SUPERSEDED, contenu identique) | train V3 | ordre et rejeu des webhooks |
| Stripe Trial (D) | `20260927000507` | `20260927000507` | NEW | `…0927 506` | essai Stripe borné au reliquat ELSATIA |
| RGPD Residual Debt (F) | `20260927000507` | **`20260927000508`** | NEW, **RENUMÉROTÉE** | `…0926 506` | collision avec Stripe `…507` ; historique des affectations en un passage, identité du bon de commande figée à l'envoi |
| Relevé Lot 2 (G) | `20260927000601` | `20260927000601` | NEW | train V3 (entitlements Tools) | fondation Relevé & Métré (déjà renumérotée 401/501 → 601 par le lot) |
| Relevé Lot 2 (G) | `20260927000602` | `20260927000602` | NEW | `…601` | niveau chantier, versions, offres |
| Relevé Lot 2 (G) | `20260927000603` | `20260927000603` | NEW | `…602` | policy SELECT par ligne (PostgREST) |
| Relevé Lot 2 (G) | `20260927000604` | `20260927000604` | NEW | `…603` | contrat des éléments v2 |
| Relevé Lot 3 (H) | `20260927000701` | `20260927000701` | NEW | `…604` | structure terrain |
| Relevé Lot 4 (I) | `20260927000801` | `20260927000801` | NEW | `…701` | capture photo & média, redéfinit `manifeste_fichiers_entreprise` |
| Studio Foundation (B) | `20260927100000` | `20260927100000` | NEW | aucune (auth.users) | broker d'identité (tables fermées, triggers sur ban/suppression seulement) |
| Studio dédié (B) | `apps/studio/supabase/migrations/…0926 120000`, `…0927 110000` | inchangées | NEW, **hors train partagé** | projet Supabase Studio | vérifié par `verify-migration-targets` (T1-T8) |

Redéfinitions croisées vérifiées : aucune fonction n'est redéfinie par deux lots différents
(les `create or replace` de chaque lot portent sur des fonctions disjointes ; `manifeste_fichiers_entreprise`
n'est redéfinie que par `…801` ; `purger_table_entreprise`, `preuve_purge_entreprise`,
`tables_conservees_purge` que par `…0926 506`). `npm run verify:migrations` : **352 valides, noms
et horodatages uniques** ; cibles : partagé 352 · Studio dédié 11 (9 copies gelées + 2 dédiées).

Références à `…507` (dette RGPD) alignées sur `…508` : `src/lib/commande-document.ts`,
`src/app/imprimer/commandes/[id]/page.tsx`, `src/lib/rgpd-purge-planificateur.test.ts`,
`supabase/tests/rgpd_dette_residuelle_v1.test.sql`, `supabase/production/seed_entreprise_pilote_btp.sql`,
`scripts/dr/03_seed_synthetic_dataset.sql`, `scripts/qualification/rgpd-residual-debt-v1.sh`,
`scripts/qualification/pdf/bon-commande-pdf.qualif.test.ts`. Les rapports de lot (historiques) ne
sont pas réécrits : ils décrivent l'état de leur branche.

## 4. Tools Relevé & Métré

Intégré Lot 2 → Lot 3 → Lot 4 (historique linéaire de `zealous-pascal`, qui contient
`friendly-cori` puis `tender-gauss`). Préservé et prouvé sur V4 :

| Exigence | Preuve V4 |
|---|---|
| Relevé Pro inclut Tools Pro | `tools_offres_catalogue.releve_pro.offres_incluses = {tools_pro}` ; DB verify **22** ; pgTAP `lot2_complements` 66/66 |
| Non activé commercialement | contrainte `tools_offres_releve_pro_non_commercial` + trigger `tools_releve_metre_non_commercial` (aucune source d'achat) ; `releve_pro` = `reference`, `commercialement_active = false` ; DB verify **22** |
| Structure terrain bâtiment / étage / zone / pièce | pgTAP `lot3_structure_terrain` 70/70 |
| Autosave, versioning | pgTAP `foundation` 74/74, `lot2_complements` ; Vitest Tools |
| Photos, annotations, métadonnées Storage | pgTAP `capture_media_v1` 40/40, `lot4_hierarchie_media` 74/74 ; bucket privé `tools-releves` (50 Mo, MIME bornés) |
| Préparation file hors ligne | domaine `@elsatia/releve-domain` (Vitest) ; Playwright Lot 2/3/4 (§14) |
| RGPD (export/purge d'entreprise) | pgTAP `rgpd_purge_v1` 13/13, `recovery_v2` 21/21 |

Les 7 suites pgTAP Relevé sont **propres sur fresh V4 et sur la base upgradée V3 → V4** (§11).

## 5. GP ↔ Réserves

Port V3 qualifié intégré (`…0927 402`, bloc Réserves de la fiche chantier GP, action « Utiliser dans
ELSATIA Réserves »). Rejoué sur V4 — `reserves_gp_integration_completion_v1` **106/106** :

| Exigence | Assertions |
|---|---|
| Idempotence ×10 | 2.01-2.10 : 10 synchronisations → 1 chantier, 2 entreprises, 5 contacts, 2 plans, 2 fichiers, aucune copie refaite ; 1.16 rejeu de confirmation idempotent |
| Plans | 1.09-1.15, 3.06-3.16 (v2 GP, plan portant une réserve jamais remplacé, jamais de plan vide) |
| Contacts | 1.07-1.08, 3.04, 3.21, 5.02, 5.05, 6.18 (aucune habilitation créée par un contact) |
| R-04 | 7.06 : chantier Réserves détaché, réserves/plan/entreprise/contacts intacts |
| Cross tenant | 8.01-8.03 : B ne synchronise ni ne lit un chantier de A |
| Résumé GP | résumé mis à jour à chaque étape ; résumé historique (`…268`) toujours servi |
| Parcours complet | Playwright `gp-reserves-integration.spec.ts` (§14) |

## 6. Stripe

| Exigence | Preuve V4 |
|---|---|
| Ordering, replay protection | pgTAP `stripe_event_ordering_v1` **137/137** ; harnais de concurrence (§6.1) |
| Même seconde | `stripe_event_ordering_v1` (égalité de `created`) ; concurrence C4a/C4b |
| Anti-double Checkout | Vitest `stripe-checkout-exclusivite` (11) ; pgTAP `stripe_trial_checkout_exhaustive_v1` **24/24** |
| Essai ELSATIA → Stripe (reliquat seulement) | pgTAP `stripe_trial_synchronization_v1` **82/82** ; trigger `borner_essai_entreprise` ; DB verify 18 |
| 3-D Secure | `invoice.payment_action_required` : trace seule, **jamais** de changement d'accès (pgTAP ordering) |
| Pas de période de grâce, suspension immédiate | `invoice.payment_failed` applicable → `suspendu` immédiatement ; `STRIPE_DELAI_GRACE_PAIEMENT_JOURS` lu par aucun code (décision `BILLING-GRACE-PERIOD` inchangée) |
| Scripts Stripe Test (sans réseau, `sk_live` refusée) | `test:stripe-ordering-script`, `test:stripe-trial-script` (CI) |

### 6.1 Concurrence réelle sur V4 (deux sessions PostgreSQL et plus)

| Harnais | Résultat |
|---|---|
| `scripts/qualification/stripe-ordering-concurrency.sh ordre_conc 40` (copie du fresh V4) | ✅ **15/15** : `failed`/`paid` concurrents (la 2e session attend le verrou ligne, décision périmée/appliquée selon la chronologie), ordre inverse (C3), **égalité de seconde** (C4a/C4b), stress 40 courses (0 écart à la chronologie), **100 livraisons concurrentes du même événement → 1 `applique` + 99 `deja_traite`**, une seule facture |
| `scripts/qualification/stripe-trial-concurrency.sh essai_conc` | ✅ **7/7** : 60 livraisons journalisées une fois (6 appliquées, 54 périmées), **une seule subscription rattachée**, l'autre refusée (42501) à chaque livraison, fenêtre d'essai finale dans la contrainte, jamais prolongée |

## 7. RGPD

| Exigence | Preuve V4 |
|---|---|
| Factures (immuables, conservées) | pgTAP `rgpd_*facture*` propres ; E2E §7.1 : factures **INCHANGÉES** dans tous les cas |
| Contrats minimisés, politique `conserver_contrat_minimise` | DB verify 14 : politique retenue, **durée non validée → fail-closed** (`DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT`) |
| Commandes fournisseurs engagées | `…0926 506` ; pgTAP `rgpd_purge_commandes_fournisseurs_v1` **75/75** ; `cm06_…` 13/13 ; DB verify 19 |
| Règlements fournisseurs conservés | garde-fou comptable (`empreinte_comptable_fournisseurs_entreprise`), pgTAP 75/75 |
| Instantané du bon de commande | `…508` : `fournisseur_snapshot` figé en quittant le brouillon ; pgTAP `rgpd_dette_residuelle_v1` **48/48** ; DB verify 20 |
| `affectations_historique` en un passage | `…508` (`trg_historiser_affectation`) ; pgTAP 48/48 |

### 7.1 RGPD de bout en bout sur la base upgradée V3 → V4

`scripts/qualification/rgpd-end-to-end-v3.sh upg_v3_v4` (sauvegarde → purge → restauration → rejeu,
par tenant, politique livrée puis activée avec une durée de TEST posée dans la base jetable) :

| Cas | Tenant | Politique livrée (`duree_requise`) | Politique activée (durée de test) |
|---|---|---|---|
| S1 | Colors, sans contrat | `complete`, purgé | `complete`, purgé |
| S2 | pilote GP (factures, 6 devis acceptés, **commandes engagées**) | `incomplete` — **fail-closed** `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` ; 6 devis conservés | `complete`, 6 preuves figées |
| S3 | factures, devis acceptés, avenant, photo, note vocale | `incomplete` — fail-closed ; contrats et 8 fichiers conservés | `complete`, 4 preuves figées, 2 fichiers conservés |
| Tous | | factures **INCHANGÉES** ; `pg_restore` 0 erreur ; **rejeu = purge d'origine (empreintes identiques)** ; autres tenants **INCHANGÉS** ; relance sur tenant déjà purgé : état inchangé | idem |

Sur V3, le tenant pilote (commandes confirmées/reçues) n'était **jamais** marqué purgé
(constat `RGPD-PURGE-VS-COMMANDE-FOURNISSEUR`) : sur V4 il l'est dès que la politique contrats est
activée — le blocage commandes est levé, la seule porte restante est la durée de conservation.

### 7.2 Harnais commandes fournisseurs rejoué dans le dépôt V4

`scripts/qualification/rgpd-purchase-orders-v1.sh po_v3` (base = copie du V3 fresh, 340) :

| Étape | Résultat |
|---|---|
| T0 (V3 sans `…0926 506`) | blocage reproduit : `COMMANDE_SUPPRESSION_STATUT_INTERDIT`, commandes vidées de leurs lignes et montants (défaut V3 d'origine) |
| Upgrade + `…0926 506` avec données | ✅ 0 warning ; 59/59 empreintes métier identiques ; RLS, 599 policies, droits, EXECUTE existants inchangés ; sonde RLS 40 utilisateurs 0 écart ; 16 fonctions nouvelles, **aucune** exécutable par `anon`/`authenticated` |
| DR par tenant (A, pilote) × politique (livrée, activée) | livrée : `incomplete`, **fail-closed** sur la durée des contrats ; activée : `complete`, commandes remplacées par **3 instantanés minimisés** ; **factures fournisseurs + règlements INCHANGÉS** (empreintes), factures clients inchangées, autres tenants inchangés, `pg_restore` 0 erreur, **rejeu = purge d'origine**, relance sans effet |
| pgTAP ciblé (fresh V4) | ✅ **18/18 propres, 649 ok** (commandes, CM-06, réception, dette, export, contrats ×4, factures, purge ×3, isolation ×2, numérotation) |

Artefact connu : l'étape « schéma upgrade = schéma fresh » de ce harnais compare « V3 + `…0926 506` »
au fresh **du dépôt courant** (352 migrations) ; dans le dépôt V4 l'écart (3 618 lignes) est donc
attendu. L'égalité de schéma V4 est prouvée par `upgrade-v3-v4.sh` (§11).

## 8. Studio

Décision appliquée : **B + I1** — Studio sur un projet Supabase **dédié**, passage d'identité par
jeton signé (ES256) émis par GP.

| Élément | Intégré | État première Preview |
|---|---|---|
| `packages/elsatia-identity` (émetteur, vérificateur, JWKS, broker, outbox) | oui | inerte |
| `apps/studio` (échange, cycle de vie, mode mot de passe interdit en Preview/Production) | oui | **non déployé** |
| Chaîne `apps/studio/supabase/migrations` (projet dédié) + garde `verify-migration-targets` (T1-T8) | oui | non poussée (projet Studio absent) |
| `…0927 100000_elsatia_identity_broker` (projet partagé) | oui | tables **fermées** (RLS sans policy, **0 droit** d'API, RPC `service_role` seules), **0 sujet** ; triggers sur `auth.users` limités aux changements de `banned_until` / `deleted_at` (jamais à la connexion) et sans effet sans sujet |
| Routes GP `/identity/studio/handoff`, `/api/elsatia-identity/jwks`, `/api/cron/elsatia-identity` | oui | **503 fail-closed** sans `ELSATIA_STUDIO_EXCHANGE_URL` / clés / `CRON_SECRET`+destinataire ; `next=` de login accepté **uniquement** vers `/identity/…` ; CSP `form-action` élargie **uniquement** sur la route de passage **et** si l'URL Studio est configurée |
| Variables d'environnement | 14 nouvelles, toutes `CONDITIONAL` « dès que Studio est déployé » ou `OPTIONAL` | aucune requise pour GP/Tools/Colors/Réserves |

Justification (DECISION_REQUIRED → choix conservateur) : intégrer la fondation plutôt que la
différer, parce que (1) chaque effet côté GP est conditionné à une configuration absente de la
Preview, (2) le broker ne réagit à aucune connexion, (3) l'upgrade V3 → V4 prouve **0 écart** RLS,
droits et données (§11), (4) toutes les portes GP/Tools/Colors/Réserves restent vertes. Contrôle
DB verify **23** pour le vérifier en Preview.

Projet dédié rejoué : `apps/studio/scripts/dedicated-db-check.sh` — 11 migrations, 0 table non
Studio, **10 suites propres** (admission 10, fondation dédiée 58, politique d'inscription 14,
analyse 45, éditeur 22, médias 40, projets 105, rendu 45, gabarits 18, timeline 52).

## 9. Seeds

Les verrous V3 (devis accepté, lignes de facture émise) et V4 (commande engagée, `…0926 506` ;
identité figée, `…508`) interdisent d'écrire les lignes **après** le statut. Patron appliqué :
insertion en brouillon → lignes → passage au statut final.

| Seed | Avant V4 | V4 | Preuve |
|---|---|---|---|
| Pilote `supabase/production/seed_entreprise_pilote_btp.sql` | corrigé par F (S1) | ✅ | fresh V4 : OK |
| DR `scripts/dr/03_seed_synthetic_dataset.sql` | corrigé par F (S2) | ✅ | fresh V4 : OK |
| **Preview** `scripts/seed-elsatia-preview-year.mjs` | **non corrigé (S3)** : commandes `recue`/`confirmee`/`annulee` insérées avant leurs lignes ; **et** 22 devis `accepte` avant leurs lignes (verrou V3) | ✅ **corrigé V4** : devis et commandes insérés en brouillon, étapes `quoteFinalization` / `commandFinalization` après les lignes (idempotentes, collision = arrêt sûr), reprise distante tolérant brouillon ou statut final | `node --test` 37/38 (+1 test dédié) ; le seul échec (`garde-fous … liaison Vercel locale absente`) échoue **identiquement sur V3** (exige `.vercel/project.json` local) ; `--dry-run` validé |
| Recette `seed_entreprise_test_5_ans.sql` | **échouait déjà sur V3** (S4 : verrou devis accepté) | ✅ corrigé : devis, factures et commandes en brouillon puis statut | fresh V4 : 300 devis (180 acceptés), 240 commandes, 0 erreur |
| Recette `seed_juju_6_mois.sql` | **échouait déjà sur V3** (`raise exception U&'…'` invalide) | ✅ corrigé (même patron + `raise exception '%', U&'…'`) | fresh V4 : 42 devis, 30 commandes, 0 erreur |
| Recette `seed_entreprise_test_tous_onglets.sql` | dépend du 5 ans | ✅ | fresh V4 après 5 ans : 0 erreur |
| Recette `seed_entreprise_test_suivi_terrain.sql` | — | ✅ | fresh V4 : 0 erreur |
| Témoins `docs/qualification/witnesses/10_seed_tenants.sql` | — | ✅ | fresh V4 : 0 erreur |
| E2E Relevé `releve_e2e_seed.sql` | — | ✅ (paramétré par `releve_e2e_stack.sh`) | Playwright Relevé (§14) |
| `creer_entreprise_demo_18_mois.sql` | **échoue identiquement sur V3** (`employes.taux_horaire` retiré par `…0922 328`) | non corrigé | hors périmètre V4 (aucune commande) — `DECISION_REQUIRED:SEED-DEMO-18M-TAUX-HORAIRE` |
| `seed_purge_qualification_v2.sql` | **échoue identiquement sur V3** (`CAPACITE_PERSONNES_ATTEINTE`) | non corrigé | jeu de qualification V2 historique, hors périmètre V4 |

Le test d'empreinte `src/lib/migration-prefixe-qr-els.test.ts` (seed Preview « inchangé ») est mis
à jour, commenté : aucune ligne liée aux préfixes QR n'a changé.

## 10. Fresh

`scripts/local-postgres-bootstrap/rebuild_db.sh v4_fresh` : **352/352 migrations, 0 erreur**
(PostgreSQL 16.13 neuf). V3 rejoué à l'identique : 340/340.

## 11. Upgrade V3 → V4

Harnais **nouveau et reproductible** : `scripts/qualification/upgrade-v3-v4.sh` (base aux 340
migrations V3 → jeu réaliste chargé avec les fichiers **de la ref V3** → instantané → 12 migrations
V4 → instantané → `upgrade_compare.py` → schéma comparé au fresh).

Jeu (13 entreprises, 49 utilisateurs) : fixtures isolation A/B, facture émise, contrats acceptés ;
recette Réserves V3/V4/V6 (chantiers, **plans**, réserves, **photos**, historique, intervenants) ;
seed pilote GP V3 (28 salariés, **devis**, **factures**, affectations, pointages, notes de frais,
**commandes fournisseurs** écrites directement à leur statut comme sur une vraie base V3, stock) ;
**Colors** ; Boutique et **entitlements** (V1→V2) ; **Tools** + client/abonnement **Stripe** Test
(V2→V3) ; nouveau `upgrade_v3_v4_seed_complement.sql` : 7 entreprises à différents états d'essai /
abonnement **Stripe** (J0, J10, J29, expiré, converti, suspendu, annulé), journal
`abonnement_evenements`, 6 commandes **engagées** avec lignes, dépenses et règlements, objets
**Storage** de plans et photos.

| Contrôle | Résultat |
|---|---|
| Application des 12 migrations V4 | ✅ 0 erreur |
| Row counts (248 tables public/platform/auth/storage) | ✅ **2 écarts, tous voulus** : `roles_applications_elsatia` 12 → 15 (3 rôles Relevé), `storage.buckets` 19 → 20 (`tools-releves`) ; 19 tables nouvelles (vides sauf `tools_offres_catalogue` : 2 offres de référence) |
| Checksums métier (59 tables, colonnes V3) | ✅ **59/59 identiques** (factures, devis, commandes, lignes, règlements, affectations, entitlements, Colors, Réserves, Tools, `abonnement_evenements`, …) |
| États métier | ✅ `entreprises` identique (statuts d'abonnement, fenêtres d'essai) ; commandes : statuts et montants identiques |
| RLS — flags | ✅ 0 table existante modifiée ; 18 tables publiques nouvelles, **toutes RLS** |
| Policies | ✅ 599 → 637 : **0 supprimée, 0 modifiée**, 38 ajoutées (tables nouvelles + Storage `tools-releves`) |
| RLS — sonde réelle (48 utilisateurs × 20 tables, `set local role authenticated`) | ✅ **0 écart / 960 cellules** |
| ACL — droits de table anon/authenticated/service_role | ✅ 0 retiré, 0 ajouté sur table existante ; 29 sur tables nouvelles |
| EXECUTE — fonctions existantes | ✅ 0 modifié, 0 supprimé ; 96 nouvelles, dont 40 exécutables par `anon` ou `authenticated` : 36 par `authenticated` seul (RPC Relevé / GP ↔ Réserves, sous garde de rôle et d'entreprise) et 4 aussi par `anon` : `reserves_gp_champ`, `reserves_gp_champ_conserve`, `reserves_gp_email`, `reserves_gp_texte` — utilitaires `IMMUTABLE`, **non** `SECURITY DEFINER`, sans accès aux tables (39 cas analogues déjà sur V3) |
| Entitlements | ✅ checksums identiques (`acces_applications_entreprises`, `entitlements_utilisateurs_elsatia`, `habilitations_applications_utilisateurs`, Tools) |
| Schéma upgrade vs fresh V4 (`pg_dump -s`, 29 236 lignes) + ACL (1 903 GRANT/REVOKE) | ✅ **identiques** |
| DB verify sur la base upgradée | ✅ 23/23 contrôles SQL ; `db-verify.mjs` : 3 écarts **tous dus au jeu de test** (bucket public `logos` créé par la fixture pgTAP `rgpd_tenant_facture_emise`, correctement détecté) |
| pgTAP V4 rejouées sur la base upgradée | ✅ Relevé 7/7 propres, Stripe ordering 137/137, Checkout 24/24, lifecycle 44/44, Connect 32/32, CM-06 13/13, Réserves V5 18/18 ; les autres suites rechargent **les mêmes fixtures** que le jeu (clés dupliquées dès la première ligne) : non applicables à une base peuplée, toutes propres sur fresh |

## 12. pgTAP complet

Une base neuve par fichier (`scripts/qualification/pgtap-run-v3.sh`), V3 et V4 dans les mêmes conditions :

| | Fichiers | Propres | ok | not ok |
|---|---|---|---|---|
| V3 (340) | 133 | 124 | 3 181 | 14 |
| **V4 (352)** | **146** | **137** | **4 018** | **14** |

Comparaison fichier par fichier sur les 133 fichiers communs : **0 régression**. Écarts : 3 suites
enrichies par les lots (plans augmentés, toujours propres) — `cm06_suppression_commande_fournisseur_statut`
11 → 13, `gp_reception_commande_stock_transactionnel_v1` 65 → 66, `stripe_subscription_webhook_acl_v1`
47 → 51. 13 suites nouvelles, **toutes propres** : Relevé ×7 (358), `reserves_gp_integration_completion_v1`
(106), `rgpd_dette_residuelle_v1` (48), `rgpd_purge_commandes_fournisseurs_v1` (75),
`stripe_event_ordering_v1` (137), `stripe_trial_synchronization_v1` (82),
`stripe_trial_checkout_exhaustive_v1` (24).

Les 9 fichiers non propres sont **exactement les mêmes sur V3 et V4** (dette connue du tronc) :
7 suites Studio du projet partagé (« inscription fermée » ; elles passent sur le projet dédié, §8),
`platform_stripe_state_attestation_r72` (pgsodium réel absent de l'amorce),
`elsatia_tools_cloud_sync_entitlement_closure_v1` (erreurs d'amorce, 8/8 assertions exécutées ok).

## 13. Applications

| App | typecheck | lint | Vitest | build |
|---|---|---|---|---|
| Gestion Pro (racine) | ✅ | ✅ 0 erreur (15 avertissements, tous dans des fichiers non touchés par V4) | ✅ **2 209** passés, 32 ignorés (183 fichiers) | ✅ `next build` (garde d'env `--auto`) |
| Tools | ✅ | ✅ | ✅ **2 031** (179 fichiers) | ✅ (`NEXT_PUBLIC_TOOLS_ENV=local`, comme la CI) |
| Colors | ✅ | ✅ | ✅ **431** (39) | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Réserves | ✅ | ✅ | ✅ **178** (13) | ✅ (`ELSATIA_APPLICATION_ENV=local`) |
| Studio | ✅ | ✅ | ✅ **281** (18) | ✅ |
| Paquets `elsatia-identity`, `releve-domain` | — | — | ✅ 235 passés, 32 ignorés (GoTrue réel requis) | — |

Sans variables publiques, les gardes de build Tools/Colors/Réserves **refusent** le build
(« mode production ») : comportement voulu, inchangé depuis V3.

Autres portes : `verify:migrations` ✅ · `verify:train-expectations` ✅ (352, `20260927100000`,
23) · `test:preview-pack` ✅ 27/27 · `test:preflight-preview` ✅ 5/5 · `verify:env-manifest` ✅
(14 DECISION_REQUIRED non bloquantes) · `test:env-manifest` ✅ 67/67 · `verify:secrets` ✅ (2 935
fichiers) · `test:migration-targets` ✅ 7/7.

## 14. Playwright

_En cours d'exécution — résultats ajoutés à la finalisation._

## 15. Pack Preview

| Élément | V3 | V4 |
|---|---|---|
| Migrations / dernière | 340 / `20260926000505` | **352 / `20260927100000`** (générés, `sync:train-expectations`) |
| DB verify | 17 contrôles (18 avec Stripe) | **23** : + 19 commandes fournisseurs RGPD, 20 dette RGPD, 21 GP ↔ Réserves, 22 Relevé non commercial (Relevé Pro ⊃ Tools Pro), 23 identité Studio fermée/inerte ; lecture dynamique : sur une base V3 le script ne casse pas, il répond NO-GO contrôle par contrôle |
| Buckets attendus | 18 | **19** (`tools-releves`, privé) — DB verify, `db-verify.mjs` (`buckets_total`), `preflight-preview.mjs`, `storage-smoke.mjs`, tests |
| RPC service-role only | 20 | **33** (+ 6 ordre Stripe, + 7 identité Studio) |
| Inventaire d'environnement | 211 variables | **225** (régénéré ; Studio : 14 nouvelles, toutes conditionnelles) |
| Pack / runbook | ref V3 | ref **`integration/elsatia-canonical-train-v4`**, périmètre de la première Preview |
| CI (`ci.yml`) | | inchangée hors lots : `verify` complet, `verify:train-expectations`, `test:preview-pack`, scripts Stripe (D) ; `studio-foundation.yml` : garde des cibles de migration (B) |

Faux positifs évités en Preview : sans ces mises à jour, `db-verify.mjs` aurait déclaré **NO-GO**
sur une Preview V4 saine (`buckets_total 19 ≠ 18`).

Preuve locale : `db-verify.mjs --local-harness --before-owner` sur fresh V4 → **`GO : base Preview
conforme.`** (23 contrôles SQL, préflight sécurité 21 contrôles / 0 anomalie bloquante, RLS, 19
buckets, 33/33 RPC service-only) ; sur V3 : NO-GO explicite sur 18-23.

## 16. Périmètre de la première Preview

| IN | OUT |
|---|---|
| Gestion Pro, Tools (dont Relevé & Métré **non commercial**), Colors, Réserves (dont GP ↔ Réserves) | **Studio** (aucun projet Vercel, aucun projet Supabase dédié, aucune variable `ELSATIA_STUDIO_*` / `ELSATIA_IDENTITY_*`), **worker Studio**, **Boutique**, **Stripe Connect** |

Les migrations Studio/Boutique/Connect du projet partagé sont appliquées (train unique) mais
inertes : DB verify 10 (`studio_signup_policy = closed`) et 23 (identité fermée, 0 sujet).

## 17. Décisions et constats ouverts

| ID | Nature | État | Effet |
|---|---|---|---|
| `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` | juridique (durée seule) | ouvert | purge des contrats acceptés refusée (fail-closed) ; activation = 1 ligne |
| `DECISION_REQUIRED:V4-MIGRATION-COLLISION-507` | technique | **décidé** (conservateur) | dette RGPD → `…508`, une seule renumérotation |
| `DECISION_REQUIRED:V4-STUDIO-FOUNDATION-SCOPE` | produit / technique | **décidé** (conservateur) | fondation intégrée, inerte, Studio OFF (§8) ; retrait possible = ne jamais poser les variables Studio |
| `DECISION_REQUIRED:SEED-DEMO-18M-TAUX-HORAIRE` | outillage | ouvert, **préexistant V3** | `creer_entreprise_demo_18_mois.sql` échoue sur `employes.taux_horaire` (retiré en `…0922 328`) ; hors seeds officiels de la Preview |
| `BILLING-GRACE-PERIOD` | produit | décidé : aucune | suspension immédiate |
| Seeds Preview : exécution réelle | exécution distante | NOT PROVEN localement (API Supabase) | logique prouvée par tests et SQL équivalent |
| Storage réel, GoTrue réel, e-mail, Stripe Test réel | exécution distante | NOT PROVEN localement | à prouver par le pack Preview |

## 18. Reproduire

```bash
git fetch --all --prune && git checkout integration/elsatia-canonical-train-v4 && npm ci
for a in tools colors reserves studio; do npm ci --prefix apps/$a; done
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl

scripts/local-postgres-bootstrap/rebuild_db.sh v4_fresh                        # 352/352
scripts/qualification/pgtap-run-v3.sh v4_fresh                                 # 137/146 propres
scripts/qualification/upgrade-v3-v4.sh upg_v3_v4 v4_fresh                      # §11
scripts/qualification/rgpd-end-to-end-v3.sh upg_v3_v4                          # §7.1
apps/studio/scripts/dedicated-db-check.sh                                      # projet dédié Studio
npm run typecheck && npm run lint && npm test && npm --prefix apps/studio run test
npm run verify:migrations && npm run verify:train-expectations && npm run test:preview-pack
ELSATIA_PREVIEW_DB_URL=postgresql://…@127.0.0.1/v4_fresh node scripts/preview/db-verify.mjs --local-harness --before-owner
```

## 19. Fichiers V4 (hors lots portés)

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260927000508_rgpd_dette_residuelle_…sql` | renommé depuis `…507` (contenu inchangé) |
| `scripts/seed-elsatia-preview-year.mjs` (+ test) | seed Preview compatible avec les verrous |
| `supabase/production/seed_entreprise_test_5_ans.sql`, `seed_juju_6_mois.sql` | recettes compatibles |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | contrôles 19-23, 19 buckets |
| `scripts/preview/db-verify.mjs`, `storage-smoke.mjs`, `scripts/preflight-preview.mjs` (+ tests) | 19 buckets, 33 RPC |
| `scripts/qualification/upgrade-v3-v4.sh`, `scripts/local-postgres-bootstrap/upgrade_v3_v4_seed_complement.sql`, `upgrade_compare.py`, `upgrade_snapshot.py` | harnais d'upgrade |
| `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md`, `preview-pack/ENV_INVENTORY_PREVIEW_V1.generated.md` | ref V4, attendus, inventaire |
| `docs/qualification/ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md` | chiffres historiques figés |
| `src/lib/migration-prefixe-qr-els.test.ts` | empreintes du seed Preview |
| références `…507` → `…508` | §3 |
