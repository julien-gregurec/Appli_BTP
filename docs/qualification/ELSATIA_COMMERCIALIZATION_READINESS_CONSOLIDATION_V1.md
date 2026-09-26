# ELSATIA — Consolidation de l'état de commercialisation V1

**Date** : 2026-09-26
**Nature** : consolidation documentaire. **Aucun code, aucun déploiement, aucune action distante.**
**Méthode** : `git fetch --all --prune` (279 branches distantes). Les ~290 rapports `ELSATIA*` ont été indexés sur toutes les branches, et pour chaque sujet seule la version la plus récente a été retenue. Un constat ancien n'est repris que si aucun rapport plus récent ne le ferme. Chaque affirmation « sur le train » a été revérifiée par `git grep` sur `origin/integration/elsatia-canonical-train-v1`.

**Règle de preuve appliquée partout** : une preuve **locale** (PostgreSQL natif, pgTAP, GoTrue/PostgREST compilés localement, passerelle ou mock Storage, `next dev`, Playwright local) **n'est jamais comptée comme preuve distante**. À la date de ce document, **aucun rapport ne contient de preuve distante sur le code actuel** : pas de Vercel déployé, pas de Supabase hébergé, pas d'appel Stripe réel, pas d'e-mail réellement délivré.

---

## 0. Verdict

```
NOT READY FOR PREVIEW
```

Les trois raisons, toutes vérifiées :

1. **Aucune référence Git unique ne porte tout le code qualifié.**
   - Le train canonique V1 (`integration/elsatia-canonical-train-v1`, verdict `CANONICAL TRAIN LOCALLY QUALIFIED`) a été produit le 26/09.
   - Les **cinq missions du même jour** ont été faites **à côté** de ce train (voir §1.2) :
     - Pilot Remaining Fails V2 ;
     - Colors V2 ;
     - Studio V3 ;
     - Data Retention ;
     - Preview Prep V3.
   - Leurs migrations entrent en **collision numérique** avec le train et entre elles : `20260923000330` ×2, `…331` ×2, `…332` ×2.
2. **La branche préparée pour la Preview (Preview Prep V3) ne contient pas le train.** Il lui manque RGPD V2, Billing V3, les réconciliations GP et le Pilot V3/Quick Wins. Inversement, le train ne contient pas les correctifs Preview : preflight bloquant, `build:gestion-pro`, et la route webhook Tools que le proxy redirige vers `/login`.
3. **Les décisions de cible Preview (quel projet Supabase, quels projets Vercel) et les identifiants ne sont pas fournis.** Aucune étape distante du runbook V3 n'a été exécutée.

**Pourquoi ce n'est pas un échec produit** :
- aucun P0 de sécurité n'est ouvert sur le train ;
- le socle passe tous ses gates locaux :
  - base neuve 328/328 ;
  - montée de version avec données, schéma identique à une base neuve ;
  - 5 applications au vert ;
  - pilote à 130/143 sur le train, 135/143 sur la branche satellite.

L'écart restant est de la **convergence**, des **décisions** et de la **preuve distante**, pas de la réécriture.

---

## 1. Sources retenues

### 1.1 Rapports les plus récents par sujet

| Sujet demandé | Rapport retenu | Branche | Date | Verdict du rapport | Sur le train ? |
|---|---|---|---|---|---|
| Canonical Train V1 | `ELSATIA_CANONICAL_TRAIN_EXECUTION_V1` (+ `…MERGE_PLAN_V1`) | `integration/elsatia-canonical-train-v1` | 26/09 | `CANONICAL TRAIN LOCALLY QUALIFIED` | c'est le train |
| Canonical Train V2 | **n'existe pas** | — | — | — | — |
| Pilot Remaining Fails V2 | `ELSATIA_PILOT_REMAINING_FAILS_CLOSURE_V2` | `claude/festive-tesla-xl5out` | 26/09 | `PILOT LOCALLY QUALIFIED WITH MANUAL/REMOTE CASES` | **non** (base Quick Wins) |
| Colors Full Qualification V2 | `ELSATIA_COLORS_FULL_QUALIFICATION_V2` | `claude/quirky-franklin-mb6eth` | 26/09 | `COLORS LOCALLY QUALIFIED` | **non** (base Studio Worker V2) |
| Reserves | **aucun rapport récent dédié**. Sources : `ELSATIA_RESERVES_RECETTE_V4` (07/09), `…TURBOPACK_SENTRY_ISOLATION_V1` et `…PREVIEW_BLOCKERS_RESERVES_URL…_V1` (21/09) | divers | ≤ 21/09 | `RESERVES TURBOPACK ISOLATED` | oui (build, garde d'URL) |
| Studio Final V3 | `ELSATIA_STUDIO_FINAL_LOCAL_QUALIFICATION_V3` | `claude/festive-knuth-z26hq9` | 26/09 | `STUDIO ARCHITECTURE DECISION REQUIRED` | **non** (tests seulement) |
| Data Retention | `ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1` | `claude/hopeful-tesla-r6hbea` | 26/09 | `DATA RETENTION REQUIRES LEGAL DECISIONS` | **non** (base RGPD V2, 181 migrations) |
| Preview Prep V3 | `ELSATIA_PREVIEW_EXECUTION_PREP_V3` (+ runbook V3) | `claude/fervent-dirac-eez6pk` | 26/09 | `PREVIEW LOCALLY PREPARED / CREDENTIALS REQUIRED` | **non** (base T0 + Worker V2) |
| Billing V3 | `ELSATIA_SELF_SERVICE_BILLING_SECURITY_CLOSURE_V3` | `claude/great-mayer-bzxad6` | 22/09 | `BILLING SECURITY CLOSED / COMMERCIAL DECISION REMAINS` | **oui** (STEP 5, renumérotation 332/333) |
| Boutique | `ELSATIA_BOUTIQUE_PAYMENT_IDEMPOTENCY_CLOSURE_V1` + `ELSATIA_STRIPE_CONNECT_BOUTIQUE_WEBHOOK_CLOSURE_V1` | `magical-mccarthy` (tronc T0) | 22/09 | `… BLOCKER CLOSED LOCALLY` | **oui** (tronc) |
| RGPD | `ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2` (+ V1 E2E, Lifecycle V3) | `claude/brave-planck-bzsvda` | 22/09 | `RGPD PURGE ARCHITECTURE LOCALLY QUALIFIED` | **oui, mais cassé sur le train** (§2, R-1) |
| Tools | `ELSATIA_TOOLS_ENTITLEMENT_CLOUD_SYNC_CLOSURE_V1` | `claude/quirky-wozniak-pacjtb` | 22/09 | `TOOLS ENTITLEMENT BLOCKER CLOSED LOCALLY` | **oui** (ancêtre vérifié) |
| DR | `ELSATIA_DR_EXACT_TIP_V2` (remplace `…HOSTED_DR_READINESS_V1`) | `claude/brave-brahmagupta-d54rpe` | 21-22/09 | `DR EXACT-TIP LOCALLY PROVEN / HOSTED NOT PROVEN` | outillage `scripts/dr/` présent |
| Décisions propriétaire | `ELSATIA_OWNER_DECISIONS_FINAL_V1` (remplace le registre du 22/09) | `claude/kind-allen-68wk2i` | 23/09 | 10 décisions ouvertes | — |
| Sécurité multi-tenant | `ELSATIA_SECURITY_TENANT_RED_TEAM_V3` | `claude/elsatia-redteam-v3` | 21/09 | `SECURITY BLOCKERS OPEN`, P0 fermés ensuite | **oui** |

### 1.2 Position des branches du 26/09 par rapport au train (vérifié `git merge-base`)

| Branche | Commits propres | Retard sur le train | Migrations ajoutées | Conflit avec le train |
|---|---|---|---|---|
| `claude/festive-tesla-xl5out` (Pilot Fails V2) | 2 | 43 | `20260923000328` FA-08, `…329` PL-03, `…330` PT-08, `…331` PE-07, `…332` NF-01 | **`331` et `332` déjà pris par le train** (purge V2, colonnes commerciales) ; `330` pris par Colors |
| `claude/quirky-franklin-mb6eth` (Colors V2) | 3 | 44 | `20260923000330_proteger_suspension_entreprise` | **`330` pris par PT-08** |
| `claude/hopeful-tesla-r6hbea` (Data Retention) | 1 | **615** (lignée RGPD sur l'ancienne base) | `20260923000400` | numéro libre, mais **interaction avec R-1** (§2) |
| `claude/festive-knuth-z26hq9` (Studio V3) | 3 | 43 | aucune (suite pgTAP + scripts) | aucun |
| `claude/fervent-dirac-eez6pk` (Preview Prep V3) | 2 | 43 | aucune | `package.json`, `config/env-manifest.json`, `src/lib/supabase/proxy.ts` (touché aussi par Pilot Fails V2) |

Les rapports Pilot Fails V2 et Colors V2 concluent `verify:migrations` au vert, **sur leur propre branche**. Aucun des deux ne mentionne le train.

---

## 2. Supersession : ancien constat → constat plus récent → statut actuel

Légende du statut actuel :

| Statut | Signification |
|---|---|
| **FERMÉ-TRAIN** | fermé et présent sur le train |
| **FERMÉ-SATELLITE** | fermé localement sur une branche du 26/09, pas encore sur le train |
| **OUVERT** | toujours ouvert |
| **DÉCISION** | ouvert, en attente d'une décision du propriétaire |
| **CADUC** | l'affirmation d'origine était fausse ou n'a plus d'objet |

### 2.1 Sécurité

| Ancien constat | Constat plus récent | Statut actuel |
|---|---|---|
| REDTEAM-V3-01 P0 : auto-octroi de capacité Stripe | corrigé (`…323` red-team, renuméroté à la convergence) | **FERMÉ-TRAIN** |
| REDTEAM-V3-02 P1 : `capacite_stripe_finaliser_op_convergente` cross-tenant | corrigé | **FERMÉ-TRAIN** |
| REDTEAM-V3-03 P0 : commande Boutique payée sans paiement | revoke + trigger ; résidu d'expiration fermé par la clôture Connect | **FERMÉ-TRAIN** |
| Red-team §6 P1 : webhooks Connect/Boutique cassés par la migration 255 | `GRANT INSERT` + 3 RPC (Connect closure) | **FERMÉ-TRAIN** (local) |
| « 8 flux cassés par la 255 » (Connect closure, 21/09) | Checklist V2 : 4 flux + `/document/[token]` portés via `fix/service-role-flux-acl-255-v1` | **OUVERT partiel** : Powens et `journal_activite` non confirmés |
| Boutique : rejeu concurrent de `boutique_finaliser_commande_payee` (P1, post-fix) | `…330` `for no key update` ; concurrence réelle rejouée sur le train (stock 10→7) | **FERMÉ-TRAIN** (local) |
| Billing V2 #2 : un client s'auto-attribue un abonnement via RLS | V3 `…184` → train `20260923000332` (UPDATE par colonne) ; pgTAP 9/9 | **FERMÉ-TRAIN** |
| Final Tip V3 : Tools Free/Pro contrôlé côté client uniquement | `tools_a_droit_cloud_sync` (RLS + RPC) | **FERMÉ-TRAIN**. La suite pgTAP échoue localement sur le train (`permission denied tools_projects`, privilèges par défaut Supabase non reproduits) → à rejouer sur un Supabase hébergé |
| Quick Wins : PL-05 cloisonnement de lecture des affectations | `…327` ; ACL `anon` corrigée par `…346` | **FERMÉ-TRAIN** |
| Pilot V3 : PE-07, un appareil révoqué garde sa session | `…331` `sessions_revoquees` + contrôle dans `est_membre_actif`/`a_permission` (pgTAP 22/22, Playwright 3/3) | **FERMÉ-SATELLITE** (`festive-tesla`). Résidu : 17 RPC `SECURITY DEFINER` contournent le contrôle (fenêtre ≤ 1 h) ; droit `DELETE auth.sessions` à vérifier à distance |
| Colors V1 (UNPROVEN) : suspension | V2 D1 **P1** : un gérant pouvait lever sa propre suspension pour impayé → `20260923000330_proteger_suspension_entreprise` | **FERMÉ-SATELLITE** (`quirky-franklin`). **Ouvert sur le train** |
| Preview V1 : Reserves retombe silencieusement sur `localhost:3020` | garde de pré-build (21/09) ; Prep V3 : « risque fermé techniquement » | **FERMÉ-TRAIN** (garde) ; le retrait du repli reste un choix mineur |
| Studio : inscription ouverte | fermée par défaut (`studio_signup_policy`, tronc) ; garde Server Action prouvée dans l'interface | **FERMÉ-TRAIN**. Dette : 7 suites pgTAP Studio rouges (fixtures antérieures à la fermeture) |
| Preview Prep V3 : le proxy GP redirige `/api/tools/monetization/*` (webhook Stripe Tools) vers `/login` | corrigé sur `fervent-dirac` ; **vérifié absent du train** (`proxy.ts`) | **FERMÉ-SATELLITE**. **Ouvert sur le train** |
| RT-V3-P2-01 : oracle cross-tenant `acces_module_pour_permission` | aucun rapport plus récent | **OUVERT** (P2) |
| RT-V3-P3-03 : pas de limitation de débit | limiteur de connexion présent (constaté par la recette pilote) ; pas de couverture générale | **OUVERT** (P2) |
| « Injection de prompt dans `AGENTS.md` » (4 rapports) | Pilot Fails V2 et Colors V2 : `node_modules/next/dist/docs/` existe après `npm ci` | **CADUC** |

### 2.2 Fonctionnel Gestion Pro (matrice pilote, 143 contrôles)

| Ancien constat | Constat plus récent | Statut actuel |
|---|---|---|
| Pilot V3 : 125 PASS / 10 FAIL / 5 MANUAL / 3 REMOTE | Train V1 : 130 / 5 / 5 / 3 (CH-08, CM-06, PL-05, PE-06, NF-01 passés) | **FERMÉ-TRAIN** pour ces 5 |
| FAIL restants : NF-01, FA-08, PL-03, PT-08, PE-07, CH-09 | Pilot Fails V2 : 135 / **0** / 5 / 3, preuve DB + Playwright pour chacun | **FERMÉ-SATELLITE**. Sur le train, **5 FAIL restent** (FA-08, PL-03, PT-08, PE-07, CH-09), NF-01 est PASS en e2e mais sans la garde DB `…332` |
| NF-01 (V3) : redirection vers `/login` | Train : ne se reproduit pas. Fails V2 : vrai défaut (note `soumis` sans justificatif stocké) | garde DB **FERMÉ-SATELLITE** |
| Recette navigateur : pages non hydratées (`127.0.0.1` ≠ `localhost`) | Train : `E2E_BASE_URL=localhost`. Fails V2 : `allowedDevOrigins` | **FERMÉ** (outillage), deux solutions à unifier |
| PE-06 FAIL | Quick Wins : faux positif d'automatisation ; train : PASS e2e | **FERMÉ-TRAIN** |
| PL-02 FAIL | trigger `…334` | **FERMÉ-TRAIN** |
| Final Tip V3 : migration `20260921000300` casse une base avec factures émises | `bold-cannon` (atomique) ; train G8 : montée de version avec données sans erreur | **FERMÉ-TRAIN** |
| Numérotation au-delà de 999/9999, deadlock encaissement | `PILOT CAPACITY READY` (21/09) | **FERMÉ-TRAIN** |
| « Communications NOT READY : devis et factures envoyés par `mailto:` » (20/09) | train : `documents-envoi.ts`, relances et abonnements passent par l'API Brevo ; `smoke-email-preview.mjs` (Prep V3) | **FERMÉ-TRAIN (code)**. Délivrabilité réelle **non prouvée** |
| GP 195 : verrou `chantier_id` d'un devis accepté vs `associerDevisChantierAction` | train : verrou conservé, l'action échoue pour un devis accepté | **DÉCISION** (OD-12) |

### 2.3 Billing, Stripe, Boutique

| Ancien constat | Constat plus récent | Statut actuel |
|---|---|---|
| Commercialisation V2 P0-1 : grille tarifaire en base divergente | migration tarifs ; train : catalogue canonique V4 | **FERMÉ-TRAIN** |
| Commercialisation V2 P0-2 : acceptation CGU/CGV non capturée | migration de capture | **FERMÉ-TRAIN** |
| Billing V2 #1 : pas d'upgrade/downgrade dans l'application | V3 : le Portail Stripe est le contrat ; **le train lit `STRIPE_PORTAL_CONFIGURATION_ID`** (vérifié) | **FERMÉ-TRAIN**. L'affirmation de Prep V3 « aucun code ne lit… » était faite sur une base sans Billing V3 : **CADUC** |
| Billing V2 #3 : 3-D Secure et échec de paiement suspendent immédiatement | train : 3-DS ne suspend plus ; `invoice.paid` efface l'impayé ; échec de paiement = suspension immédiate (délai de grâce non porté) | **DÉCISION** (OD-6) |
| Billing V2 #5 « −20 % », registre D1 | V3 corrigé ; train : « 2 mois offerts » | **CADUC** |
| Billing V2 #7 : événements hors ordre | train : relecture Stripe à chaque événement (colonne `…333` sans effet) | **FERMÉ-TRAIN** |
| Remise annuelle Entreprise (~10 % contre 0 %) | aucun rapport plus récent | **DÉCISION** (OD-7) |
| Prep V3 : les 8 prix `STRIPE_PRICE_COMPTE_SUP_*` lus au runtime manquent dans la table des prix Preview | non traité | **OUVERT** (préalable Stripe Test) |
| D3 : idempotence d'une nouvelle tentative après échec métier (`stripe_webhook_events`) | caractérisé par 2 assertions, décision historique confirmée | **OUVERT** (P1 résiduel, accepté historiquement) |
| Stripe réel (clés test, Price IDs, endpoints, Portail) | jamais exécuté ; `verify:stripe-prices` en SKIP sur le train | **OUVERT — aucune preuve distante** |

### 2.4 Données, RGPD, DR

| Ancien constat | Constat plus récent | Statut actuel |
|---|---|---|
| RGPD E2E V1 : F1–F8 (F3 critique) | Purge Architecture V2 : F1–F8 corrigés (46/46 pgTAP, `SIGKILL` puis reprise, `pg_restore`) | **FERMÉ** sur la lignée RGPD |
| — | **Train §6 : la purge V2 échoue (sans danger) dès qu'une facture émise référence la ligne purgée** (`verrouiller_facture_emise`). Correctif prototypé : drapeau `elsatia.purge_en_cours`, 26/26 | **OUVERT — R-1**, **DÉCISION** (OD-2) |
| Lifecycle V3 P0 : aucune purge à 30 jours | Data Retention V1 : planificateur livré, **désactivé par défaut** ; F9 corrigé (notes de frais immuables reclassées RETAIN) ; A1–A4 | **FERMÉ-SATELLITE** (`hopeful-tesla`, base antérieure au train) ; activation = **DÉCISION** |
| Data Retention V1 × train | Data Retention **ne connaît pas R-1**. Sa garde A3 (plus d'annulation une fois la purge commencée), portée telle quelle, laisserait une entreprise qui a émis des factures **à moitié purgée, sans annulation possible**, relancée chaque jour en `incomplete` | **OUVERT — R-1 bis** : porter `…400` **avec** le correctif R-1, jamais sans |
| Commercialisation V2 P0-4 : l'anonymisation ignore `pointages` (GPS/photo) | reclassé en décision juridique (P1-7, D5) | **DÉCISION** (OD-8) |
| Durées de rétention, anonymisation des `clients`, journal pseudonymisé | Owner Final P1-6/P1-7 ; Data Retention §10 | **DÉCISION** (OD-8) |
| DR Hosted V1 (178 migrations) | DR Exact-Tip V2 : 3 cycles de sauvegarde et restauration sans divergence (313 migrations) ; `HOSTED NOT PROVEN` | outillage **FERMÉ** ; hébergé **OUVERT** |
| Les textes juridiques promettent des « sauvegardes automatiques régulières » alors que le PITR n'est pas confirmé | Data Retention V1 : 4 textes à modifier ou PITR à souscrire | **DÉCISION** (OD-9) |
| `BANK_DATA_ENCRYPTION_KEY` : pas de rotation ni de séquestre | aucun rapport plus récent | **OUVERT** |
| Checklist V2 : `employes.email/telephone/notes` lisibles par tout membre actif | aucun rapport plus récent (non revérifié) | **OUVERT** (P2) |

### 2.5 Préparation Preview et opérations

| Ancien constat | Constat plus récent | Statut actuel |
|---|---|---|
| `PREVIEW-PROJECT-INVENTORY` (« aucun projet connu ») | Prep V3 : le dépôt documente Vercel `elsatia-preview` (GP seule) et Supabase `pgvvpqyjziyapbbkydmc` (eu-west-3, plan gratuit, organisation à 2/2 projets), Brevo, un endpoint Stripe Test | fait établi ; **choix** réutiliser, réinitialiser ou créer = **DÉCISION** (OD-1) |
| Preflight en mode `report` (fail-open) | Prep V3 : `enforce` en Preview + `prebuild` des 4 sous-apps | **FERMÉ-SATELLITE** ; Production encore en `report` (OD-10) |
| Le build racine échoue sur Vercel | `build:gestion-pro` | **FERMÉ-SATELLITE** |
| Checklist V2 : `ELSATIA_APPLICATION_ENV` et `NEXT_PUBLIC_TOOLS_ENV` | Prep V3 : doivent valoir `preview` | **FERMÉ** (documentation) |
| Observabilité absente | `PILOT INCIDENT READY` : Sentry, `job_runs`, `/api/healthz` | **FERMÉ-TRAIN** (code) ; Reserves sans télémétrie |
| Crons fail-open (`FEATURE_CRONS_ENABLED`) | FA-08 (bascule en retard) dépend désormais du cron | **DÉCISION** (OD-10) |
| pgTAP absent de la CI | aucun rapport plus récent | **OUVERT** (dette) |

---

## 3. État par application

Chaque case renvoie au rapport retenu. **L** = preuve locale. **R** = preuve distante (hébergée). **S** = prouvé seulement sur une branche satellite, pas sur le train.

### 3.1 Gestion Pro

| Catégorie | État | Preuve |
|---|---|---|
| FUNCTIONAL | 130/143 PASS sur le train (L) ; 135/143 sur `festive-tesla` (L, S). 5 MANUAL_EXPECTED, 3 REMOTE_ONLY (appels LLM réels : DV-11, MS-04, DOC-02) | L |
| SECURITY | P0 red-team fermés sur le train. PE-07 fermé seulement en S. Résidus P2 : oracle `acces_module_pour_permission`, contacts `employes` | L |
| DATA | Purge RGPD **échoue sur le train** pour une entreprise ayant émis des factures (R-1). Rétention non décidée. DR local prouvé | L |
| BILLING | Billing V3 + Boutique sur le train ; 340 Vitest, pgTAP, concurrence réelle. Délai de grâce et prix `COMPTE_SUP` ouverts | L |
| E2E | Playwright 32/32 (train) ; `pilot-remaining-fails-v2` (S) | L |
| PREVIEW | jamais déployée pour ce code ; runbook V3 prêt (S) | — |
| PRODUCTION | `app.elsatia.fr` et le Supabase `elsatia-production` existent sur une **ancienne** ligne (`release/commercialisation-v1`, 26/08). Leur état actuel n'est pas vérifiable depuis ce dépôt. Aucun cutover du train | — |
| COMMERCIAL | grille canonique V4 en code ; aucun Stripe réel ; entité juridique, CGV et DPA non relues (dernière source : 09/09, jamais fermée depuis) | — |

### 3.2 Colors

| Catégorie | État | Preuve |
|---|---|---|
| FUNCTIONAL | 17 domaines, dont la suspension, l'entitlement et la session, PROVEN en local (S). `/utilisateurs` en `ComingSoon` (à régler avant de vendre). R1 P2 : une action serveur après suspension affiche l'écran d'erreur Next | L, S |
| SECURITY | D1 P1 (lever sa propre suspension) fermé **en S uniquement**. 442 assertions pgTAP, cloisonnement entre entreprises V17 | L, S |
| DATA | conservation documentée ; Storage réel jamais testé | — |
| BILLING | **pas de tarif propre** ; accès dérivé du statut de l'entreprise GP | — |
| E2E | 73/73 Playwright sur 4 passes, via une passerelle locale (S) | L, S |
| PREVIEW | non déployée ; exige « Include files outside the Root Directory » | — |
| PRODUCTION | néant | — |
| COMMERCIAL | « PRÊT SOUS CONDITIONS » (21/09) ; offre limitée au RAL (nuancier sous licence et OCR : OD-15) | — |

### 3.3 Tools

| Catégorie | État | Preuve |
|---|---|---|
| FUNCTIONAL | PWA hors ligne, 1 992/1 992 tests, build (sur le train) | L |
| SECURITY | entitlement Free/Pro côté serveur (train). **Route webhook Stripe Tools redirigée vers `/login` par le proxy GP sur le train** (corrigé en S) | L |
| DATA | synchronisation cloud contrôlée ; décision « un utilisateur rétrogradé perd aussi la lecture » ouverte (OD-16) | L |
| BILLING | prix Stripe propres (`STRIPE_TOOLS_PRICE_*`), clé et webhook dédiés ; jamais exécutés en réel ; webhook inatteignable sur le train | — |
| E2E | pas de recette navigateur récente dédiée | — |
| PREVIEW | non déployée | — |
| PRODUCTION | néant | — |
| COMMERCIAL | produit autonome vendable techniquement une fois le webhook corrigé et Stripe prouvé | — |

### 3.4 Reserves

| Catégorie | État | Preuve |
|---|---|---|
| FUNCTIONAL | Recette V4 (07/09) : impression et hors ligne mesurés. Absents : signature électronique, procès-verbal de réception ; double envoi de photo possible hors ligne. **Aucune qualification récente dédiée** | L (ancienne) |
| SECURITY | garde d'URL au build ; pas de red-team dédié récent ; pgTAP Reserves test 26 rouge dans l'`e2e-gate` (Studio V3) | L |
| DATA | projection du chantier GP par snapshot (contrat d'intégration) | — |
| BILLING | **pas de tarif propre** | — |
| E2E | aucun | — |
| PREVIEW | non déployée | — |
| PRODUCTION | néant | — |
| COMMERCIAL | pas prêt à la vente autonome ; utilisable en pilote accompagné une fois la Preview faite | — |

### 3.5 Studio

| Catégorie | État | Preuve |
|---|---|---|
| FUNCTIONAL | 260/260 tests, build ; Playwright 4 PASS / 7 FAIL (pas d'encodeur H.264 dans Chromium) / 20 non exécutés | L |
| SECURITY | inscription fermée (garde de l'espace de travail) ; en Supabase partagé, le worker détiendrait le `service_role` de toute la plateforme (OD-3) | L |
| DATA | lot post-H (7 migrations : suppression de compte, partages…) **non intégré** ; suppression de compte non réconciliée avec les cascades RGPD de GP | — |
| BILLING | aucun | — |
| E2E | partiel | L |
| PREVIEW | exclu par défaut (runbook V3) | — |
| PRODUCTION | néant ; worker : `docker build` jamais abouti, hébergeur non choisi (OD-4) | — |
| COMMERCIAL | non commercialisable avant OD-3 et OD-4 | — |

---

## 4. Scores de préparation (grille explicable)

### 4.1 Barème par critère (0 à 4 ; demi-points autorisés quand la justification est écrite)

| Niveau | Fonctionnel / Tests / Sécurité / Billing / Data | Remote proof | Operations |
|---|---|---|---|
| 0 | absent ou cassé | rien | rien |
| 1 | code présent, non prouvé | infrastructure identifiée seulement | runbooks seulement |
| 2 | prouvé en local **hors train**, ou un P1 ouvert sur le train | Preview déployée | runbooks + outillage répétés en local |
| 3 | prouvé en local **sur le train**, sans P1 ouvert | Preview avec smoke, pgTAP hébergé, e-mail et Stripe Test prouvés | répétés sur l'hébergé (restauration, alertes) |
| 4 | prouvé à distance (hébergé) | Production prouvée | Production surveillée, restauration hébergée exercée |

**Plafond structurel** : sans preuve distante, les cinq premiers critères ne peuvent pas dépasser 3.

**Poids** :

| Critère | Poids |
|---|---|
| Fonctionnel | 20 |
| Tests | 15 |
| Sécurité | 20 |
| Billing | 10 |
| Data | 10 |
| Remote proof | 15 |
| Operations | 10 |
| **Total** | **100** |

**Calcul** : Score global = Σ(note × poids) / 4. Technical readiness = mêmes notes, limitées aux 5 critères locaux, rapportées au plafond local 3 : Σ(note × poids) / (75 × 3).

### 4.2 Notes par application

| App | Fonc. | Tests | Sécu. | Billing | Data | Remote | Ops | **Global** | **Technical** |
|---|---|---|---|---|---|---|---|---|---|
| Gestion Pro | 2,5 | 2,5 | 2 | 2 | 2 | 0,5 | 1,5 | **48 %** | **74 %** |
| Tools | 2,5 | 2 | 2 | 1,5 | 2 | 0 | 1,5 | **43 %** | **69 %** |
| Colors | 2 | 2 | 1,5 | 1 | 1,5 | 0 | 1 | **34 %** | **56 %** |
| Reserves | 1,5 | 2 | 1,5 | 0,5 | 1,5 | 0 | 1 | **30 %** | **49 %** |
| Studio | 1,5 | 1,5 | 1 | 0 | 1 | 0 | 0,5 | **22 %** | **37 %** |

**Justification des notes** :

- **Gestion Pro**
  - Fonctionnel 2,5 : 130/143 sur le train, 135 seulement en S.
  - Tests 2,5 : 106/117 fichiers pgTAP, 9 rouges hérités.
  - Sécurité 2 : PE-07 hors train.
  - Billing 2 : délai de grâce, prix `COMPTE_SUP`.
  - Data 2 : R-1.
  - Remote 0,5 : projets identifiés ; une ancienne Preview GP (14/09) a existé sur une autre ligne.
  - Ops 1,5 : Sentry et healthz dans le code, DR local, PITR non confirmé.
- **Tools**
  - Sécurité 2 et Billing 1,5 : webhook bloqué par le proxy sur le train.
  - Tests 2 : la suite pgTAP d'entitlement n'est pas rejouable localement sur le train.
- **Colors**
  - Sécurité 1,5 : D1 ouvert sur le train.
  - Fonctionnel et Tests 2 : preuves en S.
  - Billing 1 : pas de tarif.
- **Reserves**
  - aucune qualification récente, pas de télémétrie, pas de tarif.
- **Studio**
  - architecture non décidée, lot post-H non intégré, worker non déployable.

**Technical readiness de l'écosystème** : pondération commerciale GP 50 %, Tools 15 %, Colors 15 %, Reserves 10 %, Studio 10 %.

0,5×74 + 0,15×69 + 0,15×56 + 0,1×49 + 0,1×37 = **64 %**

### 4.3 Préparation par étape (portes binaires)

Chaque porte vaut 1, ou 0,5 quand la justification est écrite. Pourcentage = portes satisfaites / portes de l'étape. Les étapes sont **cumulatives** : chaque étape reprend les portes de la précédente.

**Pilot readiness** (pilote gratuit ou accompagné sur une Preview ; GP + Tools + Colors + Reserves, Studio exclu)

| # | Porte | État |
|---|---|---|
| G1 | Une référence unique contient tout le code qualifié | 0 |
| G2 | Aucune collision de migration | 0 |
| G3 | Matrice pilote ≥ 95 % PASS sur cette référence | 0,5 (135/143 en S ; 130/143 sur le train) |
| G4 | Aucun P0 de sécurité ouvert | 1 |
| G5 | Cible Preview décidée (projet Supabase et projets Vercel) | 0,5 (projets identifiés, choix non fait) |
| G6 | Preview déployée, preflight `enforce` GO | 0 |
| G7 | Smoke fonctionnel + pgTAP sur Supabase hébergé | 0 |
| G8 | E-mails prouvés (Brevo + SMTP Auth) | 0 |
| G9 | Sauvegarde avant `db push` et restauration maîtrisée | 0,5 (outillage DR local prouvé) |
| G10 | Procédures manuelles des 5 MANUAL_EXPECTED rédigées | 1 |

→ **4,5 / 10 = 45 %**

**Paid assisted customer readiness** (portes G1–G10 + 8 portes)

| # | Porte | État |
|---|---|---|
| P1 | Entité juridique facturante (régime, TVA, SIRET) | 0 (dernière source 09/09 : ouvert) |
| P2 | CGV, CGU, confidentialité et DPA relues par un avocat | 0 |
| P3 | Code du train en Production (cutover GO/NO-GO) | 0 |
| P4 | Encaissement opérationnel (Stripe Live **ou** facturation manuelle légale) | 0 |
| P5 | Purge RGPD aboutissant sur le train (R-1) | 0 |
| P6 | Rétention décidée (P1-6, P1-7) | 0 |
| P7 | PITR souscrit **ou** textes juridiques corrigés | 0 |
| P8 | Sortie du mode prototype confirmée (D8) | 0,5 (`DISABLE_EMAIL_LOGIN=false` par défaut sur le train ; `sortie_mode_prototype` non revérifié) |

→ **5 / 18 = 28 %**

**Self-service readiness** (portes G + P + 8 portes)

| # | Porte | État |
|---|---|---|
| S1 | Parcours inscription → paiement Stripe Test de bout en bout, à distance | 0 |
| S2 | Délai de grâce décidé et câblé (webhook + RPC) | 0,5 (choix conservateur appliqué : suspension immédiate) |
| S3 | Modèle de prix (P2-9), remise Entreprise, prix `COMPTE_SUP` synchronisés | 0 |
| S4 | Portail Stripe configuré en Live | 0 |
| S5 | Dépendance multi-app au statut GP décidée (RT-V3-P2-02) | 0,5 (suspension Colors protégée en S) |
| S6 | Colors, Reserves et Studio : tarif propre **ou** exclusion explicite du self-service | 0 |
| S7 | Crons fail-closed + planificateur de purge activé | 0 |
| S8 | `ABONNEMENTS_PUBLICS_OUVERTS` décidé | 0 |

→ **6 / 26 = 23 %**

**Public production readiness** (portes G + P + S + 8 portes)

| # | Porte | État |
|---|---|---|
| X1 | Restauration hébergée exercée (DB + Storage binaire + secrets) | 0 |
| X2 | Preflight `enforce` en Production (D-PREFLIGHT) | 0 |
| X3 | Observabilité hébergée (DSN Sentry, alertes sur healthz, `job_runs`) | 0,5 (code prêt) |
| X4 | pgTAP dans la CI | 0 |
| X5 | Test de charge sur l'hébergé | 0 |
| X6 | Studio décidé ou exclu publiquement | 0 |
| X7 | Surface publique durcie (limitation de débit, 17 RPC PE-07, RT-V3-P2-01) | 0 |
| X8 | 30 jours de pilote payant sans incident P0/P1 | 0 |

→ **6,5 / 34 = 19 %**

### 4.4 Synthèse

| Indicateur | Valeur | Formule |
|---|---|---|
| **Technical readiness** | **64 %** | §4.2, local uniquement, plafond local |
| **Pilot readiness** | **45 %** | 4,5 / 10 portes |
| **Paid assisted customer readiness** | **28 %** | 5 / 18 portes |
| **Self-service readiness** | **23 %** | 6 / 26 portes |
| **Public production readiness** | **19 %** | 6,5 / 34 portes |

L'écart entre 64 % (technique) et 45 % (pilote) mesure exactement ce qui manque : une référence convergée et **toute** la preuve distante.

---

## 5. Vrais blockers uniquement

Critère : un **P0** empêche l'étape suivante (Preview ou premier client payant). Un **P1** empêche une étape ultérieure, ou crée un risque réel sur des données ou de l'argent. La dette de tests et les sujets UX sont exclus.

### P0 (5)

| ID | Blocker | Bloque | Sortie |
|---|---|---|---|
| **P0-A** | **Pas de référence unique.** Les 5 branches du 26/09 sont hors du train ; collisions `20260923000330/331/332` ; `proxy.ts`, `package.json` et le manifeste touchés en parallèle | Preview | Canonical Train V2 (§7, M1) |
| **P0-B** | **Zéro preuve distante sur le code actuel.** Preview jamais déployée ; cible (OD-1) et identifiants absents | Preview et tout ce qui suit | Exécution du runbook Preview V3 sur le train V2 |
| **P0-C** | **R-1 : la purge RGPD ne peut pas aboutir** pour une entreprise ayant émis des factures (verrou de facture). Aggravé par la garde A3 de Data Retention si elle est portée seule | premier client payant (droit à l'effacement) | OD-2, puis correctif prototypé (`…347`) + ajustement de l'invariant F3, porté **avec** `…400` |
| **P0-D** | **Cadre juridique et commercial absent** : entité facturante, régime et TVA, SIRET ; CGV, CGU et DPA non relues ; textes qui promettent des sauvegardes non prouvées | premier client payant | OD-14, OD-9 |
| **P0-E** | **Stripe jamais exécuté en réel** : aucun prix, endpoint ni Portail vérifié en mode Test ; `verify:stripe-prices` en SKIP ; 8 prix `COMPTE_SUP` absents de la table Preview | encaissement carte (payant assisté par carte, self-service) | STEP 12 du runbook, puis configuration Live |

### P1 (10)

| ID | Blocker | Statut actuel |
|---|---|---|
| **P1-1** | PE-07 : session d'un appareil révoqué toujours valide | corrigé en S uniquement ; résidu de 17 RPC `SECURITY DEFINER` (≤ 1 h) ; droit `DELETE auth.sessions` à vérifier en hébergé |
| **P1-2** | Colors D1 : un gérant lève sa propre suspension pour impayé | corrigé en S uniquement (`…330` Colors) |
| **P1-3** | Tools : le webhook Stripe `/api/tools/monetization/*` est redirigé vers `/login` par le proxy GP | corrigé en S uniquement (Prep V3) ; **présent sur le train** |
| **P1-4** | FA-08, PL-03, PT-08, NF-01 (garde DB), CH-09 | corrigés en S uniquement ; 5 FAIL sur la matrice du train |
| **P1-5** | Sauvegardes hébergées non prouvées (PITR non confirmé) ; `BANK_DATA_ENCRYPTION_KEY` sans séquestre ni rotation | OUVERT |
| **P1-6** | Rétention et anonymisation non décidées (pointages GPS et photos, `clients`, durées) ; planificateur de purge désactivé | DÉCISION (OD-8) |
| **P1-7** | Crons fail-open ; FA-08 et les relances en dépendent en Production | DÉCISION (OD-10) |
| **P1-8** | Billing : délai de grâce, remise Entreprise, modèle de prix (P2-9) | DÉCISION (OD-6, OD-7) |
| **P1-9** | Dépendance multi-app : la suspension GP coupe Colors, Reserves et Tools | DÉCISION (OD-11) |
| **P1-10** | Flux résiduels cassés par la migration 255 (Powens, `journal_activite`) + D3 (nouvelle tentative après échec métier des webhooks) | OUVERT, non confirmé |

Hors liste parce qu'ils ne touchent qu'une application non commercialisée : **Studio**. Architecture Supabase (OD-3), hébergement du worker (OD-4), lot post-H. Ils deviennent P0 le jour où Studio entre dans le périmètre commercial.

---

## 6. Décisions propriétaire réellement ouvertes

Registre dédoublonné. Les décisions **fermées ou caduques** ont été retirées :
- `RESERVES-URL-FAIL-CLOSED` : fermée techniquement ;
- `STUDIO-SIGNUP-DEFAULT` : prémisse corrigée, il ne reste que la valeur Production (reportée en OD-17) ;
- D1 « −20 % » : caduc ;
- D9 « monorepo » : caduc ;
- `PREVIEW-PROJECT-INVENTORY`, partie factuelle : établie ;
- « Portail non lu » : caduc ;
- `STRIPE-*` : fusionnés dans OD-7 ;
- Colors P6 : fusionnée.

La numérotation **OD-n** est propre à ce document ; l'identifiant d'origine est indiqué pour chaque décision.

| ID | Question | Origine | Défaut actuel | Recommandation de ce document | Bloque |
|---|---|---|---|---|---|
| **OD-1** | Preview : réutiliser ou réinitialiser Supabase `pgvvpqyjziyapbbkydmc` et Vercel `elsatia-preview`, ou créer de nouveaux projets ? (organisation Supabase à 2/2 projets sur le plan gratuit) | Prep V3 D1/D2, Owner Final P0-1 | rien | réinitialiser `pgvvpqyjziyapbbkydmc` (aucune donnée de valeur, quota) ; créer 4 projets Vercel sous-app | **Preview** |
| **OD-2** | La purge RGPD peut-elle délier une facture émise (`SET NULL` + `purge_snapshot`), toutes les autres colonnes restant verrouillées ? | Train `RGPD-PURGE-VS-FACTURE-EMISE` | verrou conservé, purge en échec sans danger | **oui** : conforme à la conservation légale (le snapshot garde la pièce comptable) ; correctif déjà mesuré | premier client payant |
| **OD-3** | Studio : Supabase partagé ou dédié ? | Owner Final P0-2 | partagé de fait | dédié (coût minimal aujourd'hui ; isole le `service_role` du worker) | Studio seulement |
| **OD-4** | Hébergeur du worker vidéo Studio, ou rendu exclu ? | Owner Final P0-3, Prep V3 D4 | exclu | exclu de la Preview | Studio seulement |
| **OD-5** | Boutique dans le périmètre Preview (`FEATURE_BOUTIQUE_ENABLED`) ? | Prep V3 D5 | désactivée | désactivée pour la première Preview | — |
| **OD-6** | Durée du délai de grâce après un échec de paiement, et son portage dans la RPC de synchronisation | Billing V3, train | suspension immédiate | 7 jours ; lot dédié webhook + RPC | self-service |
| **OD-7** | Modèle de prix (10 ou 40 variables), remise annuelle Entreprise (~10 % contre « 2 mois offerts »), IA, prix historiques, stockage | Owner Final P2-9, Billing V3 | contrat à 10 variables | à trancher avant la configuration Stripe Live | payant par carte, self-service |
| **OD-8** | Rétention : RETAIN/DELETE par domaine, durées, anonymisation des `clients`, GPS et photos de pointage, pseudonymisation du journal, comptes après purge, activation du planificateur | Owner Final P1-6/P1-7, registre D4–D7, Data Retention §10 | rien n'est détruit | avis juridique, puis décision | payant |
| **OD-9** | Sauvegardes : souscrire le PITR (≈ +100 $/mois) **ou** réécrire les 4 textes juridiques et l'interface | DR V2, Data Retention | textes non conformes à la réalité | trancher avant le premier contrat signé | payant |
| **OD-10** | Crons fail-closed et preflight `enforce` en Production | Owner Final P1-4/P1-8 | fail-open, `report` | fail-closed et `enforce` | Production |
| **OD-11** | Une suspension de l'abonnement GP doit-elle couper Colors, Reserves et Tools ? | RT-V3-P2-02, Commercialisation P0-3 | oui (`est_membre_actif`) | acceptable en pilote ; à revoir avant de vendre les apps séparément | self-service |
| **OD-12** | Un devis **accepté** peut-il être réaffecté à un autre chantier ? | Train (GP 195) | refusé en base, action UI en échec | trancher, puis aligner l'UI ou le verrou | — (UX pilote) |
| **OD-13** | Règles métier récentes : CM-06 (suppression d'une commande seulement en brouillon ou annulée) ; PL-05 (le poste Administration ne voit que ses affectations) ; PT-08 (Administration sans `gerer_pointage`) | Quick Wins, Fails V2 | gardes actives | reconfirmer avec un utilisateur pilote | — |
| **OD-14** | Entité juridique : régime, TVA, SIRET, mentions légales ; relecture avocat des CGV, CGU, confidentialité et DPA | Launch readiness J1–J5 (09/09, **aucune clôture trouvée depuis**) | non fait | priorité absolue hors code | **payant** |
| **OD-15** | Colors : nuancier fabricant sous licence, OCR d'étiquette ; `/utilisateurs` avant la vente | Owner Final P2-10, Colors V2 | RAL seul, OCR inactif | offre RAL pour le pilote | vente Colors |
| **OD-16** | Tools : un utilisateur rétrogradé perd-il la **lecture** de ses projets cloud ? Quotas ? | Tools Entitlement D-04/D-05 | perte de lecture, pas de quota | garder la lecture seule | self-service Tools |
| **OD-17** | Studio : corriger les fixtures des 7 suites pgTAP (correctif refusé par la garde de session) ; valeur de la politique d'inscription en Production | Studio V3 | suites rouges ; fermée | autoriser le correctif des fixtures | Studio |
| **OD-18** | Ouverture de l'abonnement public (`ABONNEMENTS_PUBLICS_OUVERTS`) | Commercialisation V2 | fermé | après S1–S7 | self-service |

---

## 7. Ordre d'exécution des missions restantes

### Jalon « Preview »

| # | Mission | Type | Entrées | Sortie attendue |
|---|---|---|---|---|
| **M0** | Décisions OD-1, OD-2, OD-5 (+ confirmer Studio et le worker exclus : OD-3, OD-4) | propriétaire | ce document | décisions écrites |
| **M1** | **Canonical Train V2** : sur `integration/elsatia-canonical-train-v1`, intégrer dans cet ordre `festive-tesla`, `quirky-franklin`, `fervent-dirac`, `festive-knuth` puis `hopeful-tesla` | local | M0 (OD-2) | un seul HEAD ; `verify:migrations` ; base neuve + montée de version avec données ; matrice 143 **rejouée sur le train** (cible 135) ; Colors 73/73 ; pgTAP Studio V3 34/34 ; 5 builds |
| **M2** | Exécution Preview, runbook V3 STEPs 1–11 (base, Auth, Vercel ×5 ou ×4, variables, preflight live) | **distant** | M1, identifiants | Preview déployée, preflight GO |
| **M3** | Qualification Preview distante, STEPs 12–17 | **distant** | M2 | preuves **R** |

Détail de M1 :
- Renuméroter les migrations Pilot en `…347+` et celle de Colors à la suite, contenu SQL inchangé.
- Unifier `proxy.ts` : `allowedDevOrigins` et route Tools.
- Ajouter la migration R-1 (`purge_en_cours`) et porter `…400` après elle, avec l'invariant F3 ajusté.

Détail de M3 :
- Stripe Test : 4 endpoints, `EXPECTED_MODE=test`, prix `COMPTE_SUP` ajoutés.
- E-mails : Brevo et `--auth-recovery`.
- Smoke fonctionnel.
- pgTAP sur Supabase hébergé : lève les doutes Tools `tools_projects` et AAL2.
- GO/NO-GO.

→ verdict visé : **READY FOR PREVIEW** à la fin de M1, **Preview qualifiée** à la fin de M3.

### Jalon « premier client payant (assisté) »

| # | Mission | Type |
|---|---|---|
| **M4** | Recette pilote **distante** sur la Preview : matrice 143 (y compris les 3 REMOTE_ONLY avec une vraie clé LLM), Colors e2e sans passerelle, Storage réel, droit `DELETE auth.sessions` (PE-07) | distant |
| **M5** | Hors code, en parallèle dès maintenant : OD-14 (entité, avocat), OD-9 (PITR ou textes), OD-8 (rétention) | propriétaire / juridique |
| **M6** | Durcissement pré-Production : séquestre et rotation de `BANK_DATA_ENCRYPTION_KEY`, résidus des flux 255 (Powens, `journal_activite`), OD-10 (crons fail-closed, preflight `enforce` en Production) | local + distant |
| **M7** | Cutover Production du train V2 : la Production existante tourne sur `release/commercialisation-v1`. Sauvegarde, GO/NO-GO, rollback prêt | distant |
| **M8** | Onboarding du premier client **assisté** : compte créé par l'opérateur, encaissement Stripe Live (après OD-7) ou facture manuelle | opération |

→ verdict visé : **READY FOR ASSISTED PAID PILOT** après M4 + M5 + M6. Premier client après M7.

### Jalon « self-service »

| # | Mission |
|---|---|
| **M9** | Billing self-service : OD-6 (délai de grâce câblé webhook + RPC), OD-7 (grille Live, 3 sources de prix synchronisées), Portail Live, parcours inscription → paiement → Portail → échec → suspension → paiement, **à distance** |
| **M10** | Multi-app : OD-11, tarification ou exclusion de Colors et Reserves (S6), OD-16 ; activation du planificateur de purge (OD-8) |
| **M11** | Ouverture `ABONNEMENTS_PUBLICS_OUVERTS` (OD-18) après 2 à 4 semaines de clients assistés sans P0/P1 |

→ verdict visé : **READY FOR SELF-SERVICE**.

### Jalon « Production publique »

| # | Mission |
|---|---|
| **M12** | Restauration hébergée exercée : DB + Storage binaire + secrets ; RPO et RTO mesurés |
| **M13** | Durcissement de la surface publique : limitation de débit, 17 RPC PE-07, RT-V3-P2-01, contacts `employes` ; test de charge hébergé ; pgTAP en CI |
| **M14** | Studio : OD-3, OD-4, OD-17, lot post-H, cascades RGPD — ou exclusion publique déclarée |
| **M15** | GO public après 30 jours d'exploitation payante surveillée |

→ verdict visé : **READY FOR PUBLIC PRODUCTION**.

---

## 8. Ce que ce document ne prétend pas

- Il n'a exécuté aucun test. Chaque chiffre vient d'un rapport cité, et les affirmations « sur le train » ont été contrôlées par lecture Git.
- Il ne peut pas constater l'état réel de la Production `app.elsatia.fr`, ni des projets Vercel et Supabase : aucun accès distant.
- Les notes du §4 sont des jugements appliqués à un barème écrit. Changer une note se fait en citant la preuve qui la justifie.

```
VERDICT : NOT READY FOR PREVIEW
Prochaine action : M0 (OD-1, OD-2, OD-5), puis M1 Canonical Train V2.
```
