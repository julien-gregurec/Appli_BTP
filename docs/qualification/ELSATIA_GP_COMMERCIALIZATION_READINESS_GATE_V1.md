# ELSATIA GESTION PRO — Commercialization Readiness Gate (V1)

| | |
|---|---|
| Date | 2026-10-01 |
| Périmètre | **Gestion Pro (GP) uniquement**. Studio n'est pas évalué comme blocker GP. Les lots Tools futurs (Relevé Lots 10-11…) ne sont pas exigés |
| Base | `integration/elsatia-canonical-train-v8` @ `53b4bc7` (verdict `CANONICAL TRAIN V8 LOCALLY QUALIFIED`, 371 migrations, dernière `20260928000812`) |
| Branche du rapport | `claude/blissful-volta-eee359` (repositionnée sur V8, ce rapport seul en plus) |
| Méthode | lecture seule des rapports du train V8 et des branches qualifiées hors train (`git show`, `git merge-base --is-ancestor`), vérification ponctuelle du code V8 (grep). **Aucune action distante**, aucun code modifié, aucun test rejoué dans cette mission |
| Règle | un GO exige branche + rapport + test + preuve (locale ou hébergée). Un correctif hors train **ne ferme pas** un contrôle (§7 de la mission). Un blocker déjà corrigé dans V8 n'est pas conservé |

## 0. Verdict

# ELSATIA GP COMMERCIALIZATION GATE NOT YET PASSED

Le **produit** GP est fonctionnellement prêt en local : 135/143 contrôles du pack pilote PASS, 0 FAIL, et
train V8 qualifié de bout en bout (371 migrations, pgTAP 8 059 ok, upgrade V7→V8 sans perte silencieuse).
Ce qui empêche la commercialisation se répartit en quatre familles :

1. **Rien n'est prouvé en hébergé depuis le 2026-08-23.**
   - La base GP Preview `pgvvpqyjziyapbbkydmc` est **en pause** au relevé du 2026-10-01.
   - `elsatia-preview.vercel.app` répond **HTTP 500** sur toutes les routes.
   - Le ledger hébergé n'a jamais été lu.
   - La Production (`exhvuzegsefmoguxoiak`, `app.elsatia.fr`) tourne sur l'ancienne lignée (`main` = `4d92ddb`, 2026-07-29), **sans V8**.
2. **Correctifs qualifiés mais hors train**, donc non fermés :
   - B1 rate-limit de connexion ;
   - B2 troncature 1 000 lignes ;
   - B3 mémoire Next ;
   - B4 facture brouillon ;
   - exactitude de la Rentabilité et des agrégats financiers ;
   - versionnement des clés IBAN (P0 `F-DR-BANK-KEY-VERSIONING`).
3. **Facturation non prouvée contre Stripe réel** :
   - aucun parcours Stripe Test sur V8 ;
   - Stripe Live non activé ;
   - régime de TVA non décidé et non câblé ;
   - identité vendeur absente du train.
4. **Identité légale incomplète dans le train** :
   - SIRET, régime TVA et RCS/RNE absents ;
   - acceptation des CGU/CGV non capturée ;
   - textes en brouillon, non relus par un avocat.

Décompte (§3) : **115 contrôles distincts**, dont **46 GO**, **25 OPEN_P0**, **25 OPEN_P1**, **16 OPEN_P2** et **3 N/A**.

---

## 1. Sources retenues

### 1.1 Dans le train V8 (comptent pour un GO)

| Rapport (V8 `docs/qualification/`) | Verdict |
|---|---|
| `ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md` | CANONICAL TRAIN V8 LOCALLY QUALIFIED |
| `ELSATIA_PILOT_REMAINING_FAILS_CLOSURE_V2.md` (+ `ELSATIA_PILOT_QUICK_WINS_CLOSURE_V1.md`, `ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3.md`) | PILOT LOCALLY QUALIFIED WITH MANUAL/REMOTE CASES — 135 PASS / 0 FAIL / 5 MANUAL / 3 REMOTE_ONLY sur 143 |
| `ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1.md` | ELSATIA BILLING LOCALLY QUALIFIED |
| `ELSATIA_STRIPE_EVENT_ORDERING_HARDENING_V1.md`, `…_TRIAL_SYNCHRONIZATION_V1.md`, `…_RESUBSCRIPTION_FLOW_V1.md` | LOCALLY QUALIFIED (faux Stripe) |
| `ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1.md` | PER-APP SUSPENSION LOCALLY QUALIFIED |
| `ELSATIA_SELF_SERVICE_BILLING_SECURITY_CLOSURE_V3.md` | BILLING SECURITY CLOSED / COMMERCIAL DECISION REMAINS |
| `ELSATIA_MULTI_APP_SECURITY_RED_TEAM_V2.md` (+ intégration V8 §9) | F1-F10 intégrés, F11 superseded par Billing B-4 |
| `ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md`, `ELSATIA_SECURITY_BLOCKERS_REMEDIATION_V1.md` | blockers P1 remédiés ; P2/P3 listés ouverts |
| `ELSATIA_EMPLOYEE_PERSONAL_DATA_ACCESS_HARDENING_V1.md` | EMPLOYEE DATA ACCESS LOCALLY QUALIFIED |
| `ELSATIA_PRODUCTION_INCIDENT_RESPONSE_SAFE_MODE_V1.md` | INCIDENT RESPONSE LOCALLY QUALIFIED (drill 91/91 ×2 sur V8) |
| `ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md`, `ELSATIA_DR_EXACT_TIP_V2.md` | DR LOCALLY QUALIFIED / HOSTED NOT PROVEN (épinglé V5-V7, non rejoué sur V8) |
| `ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md` | DATA RETENTION REQUIRES LEGAL DECISIONS |
| `ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md`, `…_CONTRACT_RETENTION_PARAMETERIZATION_V2.md`, `…_INVOICE_IMMUTABILITY_…`, `…_PURCHASE_ORDERS_…`, `…_RESIDUAL_DEBT_…` | techniquement clos ; décisions légales ouvertes |
| `ELSATIA_TRANSACTIONAL_EMAIL_ARCHITECTURE_V1.md` | ELSATIA EMAIL ACTIONS REQUIRED |
| `ELSATIA_GP_PERFORMANCE_CAPACITY_V1.md` | PILOT CAPACITY READY (goulets listés §18) |
| `ELSATIA_GP_NUMBERING_OVERFLOW_FIX_V1.md` | NUMBERING OVERFLOW FIX QUALIFIED |
| `ELSATIA_SEED_COMPATIBILITY_HARDENING_V1.md` + V8 §15 | ALL ACTIVE SEEDS QUALIFIED — 16/16 sur 371 |

### 1.2 Hors train (qualifiés, **non intégrés** : `merge-base --is-ancestor` = faux pour tous)

| Lot (mission §6) | Branche @ tip | Base | Verdict | Effet sur ce gate |
|---|---|---|---|---|
| Pointages / Data Correctness | `claude/busy-ramanujan-cbyclu` @ `7797e8f` | **V7** | ELSATIA GP DATA CORRECTNESS LOCALLY QUALIFIED | ferme **B2** et **B4** une fois intégré. Migrations `20260930000101`, `…0102` |
| Rentabilité | `claude/festive-turing-7zqcce` @ `442c3fc` | **V7** | ELSATIA RENTABILITE DATA CORRECTNESS LOCALLY QUALIFIED | `/rentabilite`, copilote et fiche chantier exacts au-delà de 1 000 lignes. Migration `20260930000301` |
| Finance aggregates | `claude/confident-brown-sndsqb` @ `592fb32` | **V8** | ELSATIA FINANCE DATA CORRECTNESS LOCALLY QUALIFIED | exports comptables, TVA, trésorerie, dépenses, notes de frais, stock, planning et fiche chantier exacts ; ferme aussi **B2**. Migrations `…0813` à `…0816` |
| Memory | `claude/nice-goodall-3fk873` @ `6b4ef99` | **V7** | ELSATIA MEMORY BASELINE ESTABLISHED (sous condition du correctif Intl `7ac78cd`) | ferme **B3** sous conditions (heap explicite, budget PDF) |
| Bank Encryption | `claude/dazzling-turing-2q77nn` @ `2b7e367` | **V8** | ELSATIA BANKING ENCRYPTION LOCALLY QUALIFIED | ferme le P0 `F-DR-BANK-KEY-VERSIONING`. Migration `20260930000813`, DB verify 38 |
| (Perf B1) Login rate limit | `claude/gracious-curie-135pix` @ `2385345` | **V7** | ELSATIA LOGIN RATE LIMIT LOCALLY QUALIFIED | ferme **B1** en local. pgTAP **écrit mais non exécuté** |
| (RGPD) Export portabilité | `claude/kind-mayer-w4wfy6` @ `040ca1e` | **V6** | ELSATIA DATA EXPORT LOCALLY QUALIFIED | droit à la portabilité ; 11 DECISION_REQUIRED |
| Pack opérateur Preview V8 | `claude/modest-shannon-uhp2ic` @ `27f4241` | V8 | ELSATIA V8 PREVIEW PACK READY | outillage seul, sans code applicatif ni migration |
| Identité légale | `claude/awesome-franklin-se2s33` @ `13b1d7f` | base du 29/07 | — (audit) | `src/lib/identite-legale.ts`, verrou de commercialisation, audit légal ; **absents de V8** |
| Capture CGU/CGV | `claude/optimistic-goldberg-p4afmg` @ `f714541` | ancienne | — | migration de capture d'acceptation ; **absente de V8** |

Les lots Billing, Per-App, Security V2, Employee Data et Incident sont **intégrés à V8** (V8 §1) : ils
comptent pour un GO.

**Conflits d'intégration connus** (à résoudre dans un train V9) :
- collision de numéro `20260930000101` (busy-ramanujan × gracious-curie) ;
- deux correctifs B2 concurrents sur `src/app/(app)/pointage/gestion/page.tsx` (busy-ramanujan × confident-brown) ;
- fiche chantier chevauchante (festive-turing × confident-brown) ;
- `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` réécrit par 6 branches.

Les branches basées sur V6 ou V7 n'ont pas été requalifiées sur les 371 migrations.

---

## 2. Matrice par catégorie

Légende de preuve : **LP** = LOCAL_PROVEN, **HP** = HOSTED_PROVEN, **NP** = NOT_PROVEN.
« V8 » = `integration/elsatia-canonical-train-v8` @ `53b4bc7`. Rapports cités sans chemin : `docs/qualification/` de V8.

### 2.1 DB

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| DB-1 | Base neuve 371/371 | GO | LP | V8 · V8 §7 · `rebuild_db.sh v8_fresh` |
| DB-2 | Upgrade V7→V8 sans perte silencieuse | GO | LP | V8 · V8 §7 · `upgrade-v7-v8.sh` : 47/47 métier, 0 écart silencieux, ×2 |
| DB-3 | pgTAP complet | GO | LP | V8 · V8 §0 · 154/163 fichiers propres, 8 059 ok. Les 9 non propres sont hors GP : 7 Studio partagé, `platform_stripe_state_attestation_r72` (pgsodium d'amorce), cloud-sync Tools |
| DB-4 | DB verify 37 contrôles + 39 RPC service-role only | GO | LP | V8 · V8 §16 · `db-verify.mjs --local-harness --before-owner` → GO |
| DB-5 | Ledger hébergé Preview lu et aligné sur V8 | **OPEN_P0** | NP | handoff V2 §16 (`modest-shannon-uhp2ic`) : ledger jamais lu, migrations V8 jamais appliquées en hébergé |
| DB-6 | Production upgradée de l'ancienne lignée vers le train | **OPEN_P0** | NP | `main` = `4d92ddb` (2026-07-29) ne contient pas V8 ; aucun harnais d'upgrade Production → V8 n'existe |
| DB-7 | Intégration des lots data correctness hors train (§1.2) | **OPEN_P0** | LP hors train | cf. ACC-* §2.21 |

### 2.2 RLS

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| RLS-1 | Isolation tenant (sonde RLS 1 836 cellules, 0 écart silencieux) | GO | LP | V8 · V8 §7 · `upgrade_v7_v8_classify.py` |
| RLS-2 | Cloisonnement par rôle (CH-08, PL-05, CL-05, DV-09, AV-04) | GO | LP | V8 · `ELSATIA_PILOT_REMAINING_FAILS_CLOSURE_V2.md` · pgTAP `ch08_…` 9/9, `pl05_…` 12/12, e2e |
| RLS-3 | Données personnelles salariés (droits de colonnes, `employes_fiche`) | GO | LP | V8 · `ELSATIA_EMPLOYEE_PERSONAL_DATA_ACCESS_HARDENING_V1.md` · pgTAP 65/65, Playwright + PostgREST réel 15/15 |
| RLS-4 | Essai expiré fermé en base (F11 / B-4) | GO | LP | V8 · migration `20260928000803` · pgTAP lifecycle 190/190, Playwright REST 6/6 ×2 |
| RLS-5 | RLS vérifiée sur la base hébergée | **OPEN_P0** | NP | dépend de DB-5 (DB verify distant jamais exécuté) |
| RLS-6 | Coût RLS par ligne (`est_membre_actif` non mémoïsé) | OPEN_P2 | LP | `ELSATIA_GP_PERFORMANCE_CAPACITY_V1.md` §18.1 ; `DECISION_REQUIRED:V8-PERF-C1` (à redériver sur les corps V8) |

### 2.3 Auth

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| AUTH-1 | GoTrue réel, redirections sûres, révocation d'appareil (PE-07) | GO | LP | V8 · V8 §9 (F2/F3 36/36), pgTAP `pe07_…` · GoTrue v2.196 compilé |
| AUTH-2 | Réinitialisation du mot de passe + SMTP Brevo | GO (ancienne lignée) / à refaire sur V8 | HP 2026-08-17 | `codex/auth-recovery-v1` @ `ab0acc1` · `docs/organisation/AUTH_RECOVERY_V1_ELSATIA.md` · parcours humain sur `elsatia-preview` |
| AUTH-3 | Rate-limit de connexion (B1 : une agence derrière un NAT reçoit 429 dès la 11ᵉ connexion) | **OPEN_P1** | LP hors train | correctif `gracious-curie-135pix` non intégré ; son pgTAP n'a jamais été exécuté ; rate-limit GoTrue hébergé (IP Vercel) non vérifié (R-2) |
| AUTH-4 | Config Auth hébergée V8 (Site URL, redirections, gabarits, MFA) | **OPEN_P0** | NP | handoff V2 §9 |
| AUTH-5 | Routage Auth par application (A-1) | N/A pour GP seul | — | ne concerne que Tools, Colors et Réserves |

### 2.4 Billing (code)

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| BILL-1 | Cycle de vie complet B-1 à B-5 (annulation terminale, catalogue canonique 79/249/449/599, Portail, essai en base, libellés) | GO | LP | V8 · `ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1.md` · pgTAP 190/190, concurrence 22/22 ×2 |
| BILL-2 | Ordre des événements, essai, réabonnement | GO | LP | V8 · rapports STRIPE_* · ordre 15/15, essai 7/7, réabonnement 20/20 + Playwright 6/6 ×2 |
| BILL-3 | Suspension par application | GO | LP | V8 · `ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1.md` · pgTAP 2 925, concurrence 27/27 ×2 |
| BILL-4 | Webhooks idempotents, reprise des orphelins | GO | LP | V8 · V8 §10 · pgTAP 30/30, upgrade I05 |
| BILL-5 | Contrats au prix obsolète 69/199/399 | **OPEN_P1** | — | `DECISION_REQUIRED:BILLING-CONTRATS-PRIX-69` (LIFECYCLE l.68-70) : rapprocher des Prices Stripe avant toute correction |
| BILL-6 | Essai unique par SIREN | OPEN_P2 | — | `BILLING-ESSAI-PAR-SIREN` ; le SIREN client n'est pas collecté (`BILLING-DONNEES-CLIENT`) |
| BILL-7 | Changement de plan via le Portail incohérent avec la FAQ | **OPEN_P1** | — | `BILLING-DESCENTE-PORTAIL` (LIFECYCLE l.148-152) |
| BILL-8 | Fixture pilote en essai échu (28 membres bloqués sur GP) | **OPEN_P1** | LP | `DECISION_REQUIRED:V8-PILOTE-ESSAI-ECHU` (V8 §8) ; outillage `preview:pilot` sur `modest-shannon-uhp2ic` |
| BILL-9 | Grille des modules, comptes supplémentaires et options IA | **OPEN_P1** | — | env-manifest : STRIPE-MODULE-PRICE-MODEL, SUPPLEMENTARY-ACCOUNTS, IA-OPTIONS, LEGACY-GENERATIONS, STORAGE-BLOCK, et 3 contrats `STRIPE-CONTRACTS-DIVERGENT` |

### 2.5 Stripe (séparé selon §9 de la mission)

| # | Contrôle | Statut | Preuve | Détail |
|---|---|---|---|---|
| STR-CODE | Code billing | GO | LP | §2.4 BILL-1 à BILL-4 ; uniquement des faux Stripe locaux (« aucun appel Stripe réel », LIFECYCLE l.10) |
| STR-TEST-1 | Prices Test + webhook Test (ancienne lignée) | GO (ancienne lignée) | HP 2026-08-23 | `fix/comptes-supplementaires-v1c` @ `71b5a76` · `docs/organisation/COMPTES_SUPPLEMENTAIRES_V1.md` · smoke `sub_1U7XXN…` ; webhook `we_1Tziay…` documenté |
| STR-TEST-2 | Parcours Stripe Test sur V8 (Checkout, Portail, webhooks signés, échec de paiement, `preview:stripe-verify`) | **OPEN_P0** | NP | handoff V2 §10 ; `verify:stripe-prices` non exécuté (pas de clé, LIFECYCLE l.306) |
| STR-LIVE | Compte Live activé, Prices Live, webhook Live, clés Live en Production | **OPEN_P0** | NP | aucune clé ni Price Live dans le dépôt ; `verify-stripe-prices.mjs` refuse `sk_live` (l.72, l.183) |
| STR-TAX | Régime TVA appliqué sur les factures d'abonnement | **OPEN_P0** | NP | `STRIPE_AUTOMATIC_TAX_ENABLED=false` ; franchise 293 B « câblée nulle part » (LIFECYCLE l.237) ; pas de `tax_id_collection` ; `BILLING-TVA` (« aucun régime inventé ») |
| STR-SELLER | Identité vendeur sur les factures Stripe et dans les CGV | **OPEN_P0** | NP | `BILLING-IDENTITE-VENDEUR`, `BILLING-RCS-RNE` (LIFECYCLE l.232-235) ; branding des factures réglé dans le Dashboard, REMOTE NOT PROVEN |
| STR-PERAPP | Produits Stripe Colors, Réserves et Tools | N/A pour GP | — | `PER-APP-FACTURATION-STRIPE` ne bloque pas la vente de GP |

### 2.6 RGPD

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| RGPD-1 | Purge DELETE/ANONYMIZE/RETAIN, audit, reprise après interruption | GO | LP | V8 · `ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md` + DR V2 Disaster 3 |
| RGPD-2 | Factures immuables, bons de commande figés | GO | LP | V8 · rapports INVOICE_IMMUTABILITY / PURCHASE_ORDERS |
| RGPD-3 | Export filtré des données salariés | GO | LP | V8 · V8 §11 · E08, DB verify 33 |
| RGPD-4 | Durées de conservation (contrats, comptabilité, `journal_activite`) | **OPEN_P1** | — | décision légale : `RGPD-PARAMETRES-CONSERVATION-CONTRAT` ; purge fail-closed `duree_requise` (RETENTION_V2) |
| RGPD-5 | Photos de pointage et GPS (`pointage-preuves`) hors anonymisation | **OPEN_P1** | — | DATA_LIFECYCLE_CLOSURE_V3 l.346-357 ; P1-7 (OWNER_DECISIONS_FINAL_V1) |
| RGPD-6 | Purge automatique activée | OPEN_P2 | LP | mécanisme livré, **désactivé** (`RGPD_PURGE_PLANIFICATEUR_MODE`) ; défaut du pack : planificateur OFF |
| RGPD-7 | Portabilité (export entreprise) | OPEN_P1 | LP hors train | `kind-mayer-w4wfy6` (base V6) non intégré ; l'export historique restait ouvert pendant une session d'assistance |
| RGPD-8 | Anonymisation des clients personnes physiques | OPEN_P2 | — | aucune fonction (DATA_LIFECYCLE_V3) |

### 2.7 Legal

Uniquement les informations **réellement manquantes** dans V8 (`docs/juridique/*`, rendues par `src/components/DocumentLegal.tsx`).

| # | Contrôle | Statut | Constat |
|---|---|---|---|
| LEG-1 | SIRET éditeur | **OPEN_P0** | `[EDITEUR_SIRET]` ← `NEXT_PUBLIC_LEGAL_SIRET`, vide dans `.env.example` → la page affiche « en cours de finalisation ». Un SIREN et un RCS figurent sur la branche non intégrée `awesome-franklin-se2s33` (`src/lib/identite-legale.ts`), **pas dans V8** |
| LEG-2 | RCS / RNE | **OPEN_P0** | absent de V8 (même remarque) |
| LEG-3 | Régime TVA et mention TVA | **OPEN_P0** | `[EDITEUR_MENTION_TVA]` → « à confirmer » ; numéro de TVA intracommunautaire absent (README juridique l.24, « en attente de l'immatriculation ») ; l'audit `awesome-franklin` relève une contradiction : franchise dans les textes, prix « HT » dans la boutique |
| LEG-4 | Adresse de l'éditeur | **OPEN_P1** | présente dans V8 (`mentions-legales.md` l.10) mais annotée « à revérifier contre l'avis SIRENE » ; `awesome-franklin` la retient en LEGAL_REVIEW_REQUIRED |
| LEG-5 | Adresse e-mail de contact | **OPEN_P1** | `support@` ou `contact@elsatia.fr` : non tranché (A-3) ; SPF/DKIM non prouvés |
| LEG-6 | Acceptation des CGU/CGV capturée (version + horodatage) | **OPEN_P0** | aucune capture dans V8 (`signup/page.tsx`, `actions/auth.ts`, migrations) ; la capture existe sur `optimistic-goldberg-p4afmg`, non intégrée |
| LEG-7 | Relecture juridique des textes | **OPEN_P1** | README l.5 et `cgv.md` l.113 : « brouillons… à faire relire par un avocat » |
| LEG-8 | Promesse « sauvegardes régulières » (CGV l.59) sans sauvegarde récurrente prouvée | **OPEN_P1** | `ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md` l.118-128 : aucune sauvegarde récurrente dans le dépôt, procédures manuelles |
| LEG-9 | Sous-traitants manquants dans la politique de confidentialité (OpenAI, Sentry, Powens) | **OPEN_P1** | audit `awesome-franklin` §12 |
| LEG-10 | DPA Brevo | OPEN_P2 | A-8 |
| LEG-11 | Hébergeurs, directeur de publication, droit applicable, recours CNIL | GO | `mentions-legales.md` l.14-26, `cgv.md` l.106-108, `politique-confidentialite.md` l.68 (contenu présent ; preuve de rendu : pages Next de V8, build GP ✅) |
| LEG-12 | Médiateur de la consommation | N/A | CGV B2B uniquement (`cgv.md` l.11) |

### 2.8 Security

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| SEC-1 | Red team V2 F1-F10 + F11 | GO | LP | V8 · V8 §9 · pgTAP 9/9, 11 témoins sur la route Réserves fusionnée, Vitest |
| SEC-2 | Red team V3, P1 (webhooks Connect/Boutique) | GO | LP | V8 · `ELSATIA_STRIPE_CONNECT_BOUTIQUE_WEBHOOK_CLOSURE_V1.md` |
| SEC-3 | Scrubbing Sentry | GO | LP | V8 · `nettoyerEvenementSentry` dans `sentry.server.config.ts:12`, `sentry.edge.config.ts`, `src/instrumentation-client.ts` |
| SEC-4 | `entreprise_active_id` sans `WITH CHECK` (MEDIUM) | **OPEN_P1** | — | toujours présent : `20260710000001_comptes_entreprises.sql:197-198` |
| SEC-5 | Route PDF de partage sans rate-limit (MEDIUM) | **OPEN_P1** | — | toujours présent : `src/app/api/documents/partage/[token]/pdf/route.ts` |
| SEC-6 | Import de paie protégé par un secret global, tenant fourni dans le corps (MEDIUM) | **OPEN_P1** | — | toujours présent : `src/app/api/paie/import/route.ts:6,17` |
| SEC-7 | `logo_url` et chemins Storage non contraints | OPEN_P2 | — | durcissement (RT_V2 §7) |
| SEC-8 | Red team V3 P2/P3 : oracle `acces_module_pour_permission`, route QR, ancienne RPC encore accessible à anon | OPEN_P2 | — | `ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md` l.265-270 |
| SEC-9 | Versionnement et rotation des clés IBAN/BIC (P0 `F-DR-BANK-KEY-VERSIONING`) | **OPEN_P0** | LP hors train | `dazzling-turing-2q77nn` non intégré : pas d'identifiant de clé, `iban_hash` SHA-256 non salé, clé réutilisée comme secret HMAC Powens |
| SEC-10 | Policies Storage hébergées (19 buckets) | **OPEN_P0** | NP | jamais vérifiées sur Storage hébergé (ancien gate SEC-STORAGE-HOSTED) |

### 2.9 DR

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| DR-1 | Backup + restore, 4 désastres, Storage, Auth, garde-fous | GO | LP | V8 · `ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md` · `npm run dr:verify` ×2 (base V5), `test:dr-guard` 10/10 sur V8 |
| DR-2 | Drill DR rejoué sur V8 | OPEN_P2 | NP | V8 §17 : à adapter à `upgrade-v7-v8.sh` |
| DR-3 | Backup hébergé restauré au moins une fois | **OPEN_P0** | NP | aucun ; `preview:backup` n'a jamais été exécuté |
| DR-4 | Contenu Storage sauvegardé (pas seulement l'inventaire) | **OPEN_P1** | NP | `V8-STORAGE-CONTENT-BACKUP` (handoff V2) |
| DR-5 | Clés IBAN restaurables (versionnement) | **OPEN_P0** | — | = SEC-9 |

### 2.10 Incident Response

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| INC-1 | Mode sûr, gardes sur toutes les tables, journal, RBAC AAL2 | GO | LP | V8 · V8 §10 · pgTAP 131/131, convergence 32/32 |
| INC-2 | Drill complet de 15 scénarios | GO | LP | V8 · `npm run incident:drill` 91/91 ×2 |
| INC-3 | Mode sûr exercé en hébergé | OPEN_P2 | NP | à faire lors de la Preview |

### 2.11 Performance

Les blockers déjà corrigés **dans V8** sont retirés : C2 (recalcul des devis), C3 (planning) et C4 (médias).

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| PERF-1 | Recalcul des totaux de devis par instruction (C2) | GO | LP | V8 · migration `…0812` · pgTAP 12/12 ; insert 1 230 → 45 ms |
| PERF-2 | Planning (C3), médias de conversation (C4) | GO | LP (mesure source, non remesurée en V8) | V8 · Vitest `ModifierAffectationDiffere` 2/2 |
| PERF-3 | **B1** rate-limit par IP | **OPEN_P1** | LP hors train | = AUTH-3 |
| PERF-4 | **B2** troncature à 1 000 lignes sur `/pointage/gestion` (totaux faux) | **OPEN_P0** (exactitude) | LP hors train | `busy-ramanujan` **ou** `confident-brown` (choisir un correctif) |
| PERF-5 | **B3** mémoire Next (3,2 Go pour 25 utilisateurs) | **OPEN_P1** | LP hors train | `nice-goodall-3fk873` (correctif Intl) + `--max-old-space-size` + budget de concurrence PDF |
| PERF-6 | **B4** édition de facture brouillon en échec (`permission denied for function recalc_totaux_facture`) | **OPEN_P0** | LP hors train | toujours présent en V8 (`REVOKE` dans `20260902000255_acl_reconciliation_v1.sql:236` ; appel via `src/app/actions/factures.ts:47`) ; corrigé par `busy-ramanujan` |
| PERF-7 | Dashboard non borné (1,7 s), recherche sous RLS (1,76 s), vue pointage mensuelle (727 ms) | OPEN_P2 | LP | `ELSATIA_GP_PERFORMANCE_CAPACITY_V1.md` §18 |
| PERF-8 | Capacité mesurée en hébergé | OPEN_P2 | NP | toutes les mesures sont locales (`next dev` ou `next start`) |

### 2.12 Emails

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| MAIL-1 | Architecture transactionnelle, échappement HTML, garde de Preview | GO | LP | V8 · `ELSATIA_TRANSACTIONAL_EMAIL_ARCHITECTURE_V1.md` · `test:smoke-email` 13/13 |
| MAIL-2 | Envoi d'un devis ou d'une facture par e-mail avec PDF (ON-07, DV-03) | GO | LP | V8 · `src/lib/documents-envoi.test.ts` |
| MAIL-3 | Gabarits Auth hébergés (A-2) et `ELSATIA_APPLICATION_ENV=production` (A-4 : sinon tout envoi Brevo est bloqué) | **OPEN_P0** | NP | configuration hors dépôt |
| MAIL-4 | Expéditeur authentifié (SPF/DKIM elsatia.fr) et adresse de contact (A-3) | **OPEN_P1** | NP | |
| MAIL-5 | E-mails E1/E3/E7/E9/E13 réels sur V8 | **OPEN_P1** | NP | handoff V2 §10 |

### 2.13 Storage

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| STO-1 | 19 buckets, 1 public, policies de préfixe tenant (F9) | GO | LP | V8 · DB verify (19 buckets) · storage-api v1.79.22 réelle (Playwright Réserves et Employés) |
| STO-2 | Storage hébergé (policies, envoi TUS > 50 Mo) | **OPEN_P0** | NP | = SEC-10 |

### 2.14 Backups

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| BKP-1 | Outillage de backup avec manifeste et SHA-256 | GO | LP | V8 · `scripts/dr/` · DR V2 §3 |
| BKP-2 | Sauvegardes managées et PITR du plan Supabase Production, avec rétention connue | **OPEN_P1** | NP | non documenté ; le passage en plan Pro est « annoncé » pour l'organisation (Studio V4.1) |
| BKP-3 | Sauvegarde récurrente programmée (cohérente avec la CGV) | **OPEN_P1** | NP | = LEG-8 |

### 2.15 Monitoring

| # | Contrôle | Statut | Preuve | Branche / rapport / test |
|---|---|---|---|---|
| MON-1 | Sentry (production, `tracesSampleRate` 0.1) + `/api/health` (503 en cas de panne) + 9 runbooks | GO (code) | LP | V8 · `src/app/api/health/route.ts`, Vitest `incident/sante` |
| MON-2 | DSN Sentry et alerting configurés en hébergé | **OPEN_P1** | NP | aucune preuve |
| MON-3 | Sonde de disponibilité externe et astreinte | **OPEN_P1** | NP | aucune configuration (UptimeRobot ou autre) dans le dépôt |
| MON-4 | Crons (`/api/cron/abonnements`, FA-08) protégés et planifiés en hébergé | **OPEN_P1** | NP | `FLAG-CRONS-FAIL-OPEN` (env-manifest) ; « portes du cron » listées par PILOT_REMAINING_FAILS_V2 §5 |

### 2.16 à 2.25 Modules métier

Source commune : **V8**, `ELSATIA_PILOT_REMAINING_FAILS_CLOSURE_V2.md` (matrice des 143, annexe), plus les pgTAP et e2e cités.
Pour chaque module, le statut GO ne vaut que pour une preuve locale (LP).

| Module | # | Contrôles pilote | Statut | Preuve | Ouvert |
|---|---|---|---|---|---|
| **Clients** | CLI-1 | CL-01 à CL-06 PASS | GO | LP | — |
| | CLI-2 | Un comptable sans `acces_clients` reçoit « Client introuvable » | OPEN_P2 | LP | busy-ramanujan §9 |
| **Chantiers** | CHA-1 | CH-01 à CH-09 PASS (CH-08 isolation : pgTAP 9/9 + e2e ; CH-09 carte OSM) | GO | LP | — |
| | CHA-2 | Heures de la fiche chantier tronquées au-delà de 1 000 pointages | **OPEN_P0** | LP hors train | festive-turing, confident-brown |
| **Devis** | DEV-1 | DV-01 à DV-10 et DV-12 PASS ; C2 | GO | LP | — |
| | DEV-2 | DV-11 (devis assisté par IA) | OPEN_P2 | NP | REMOTE_ONLY : appel LLM réel |
| **Factures** | FAC-1 | FA-01 à FA-10 et AV-01 à AV-04 PASS (FA-08 : pgTAP 18/18 + cron 13/13 ; numérotation, idempotence des paiements) | GO | LP | — |
| | FAC-2 | B4 : modification d'une facture brouillon | **OPEN_P0** | LP hors train | = PERF-6 |
| **Planning** | PLA-1 | PL-01 à PL-05 PASS (PL-02 : pgTAP 9/9 ; PL-03 : 24/24 ; PL-05 : 12/12) | GO | LP | — |
| | PLA-2 | Lecture complète du planning au-delà de 1 000 lignes | **OPEN_P0** | LP hors train | confident-brown (`…0814`) |
| **Pointages** | POI-1 | PT-01 à PT-08 PASS (PT-08 régularisation) | GO | LP | — |
| | POI-2 | B2 : totaux de `/pointage/gestion` faux (38/38 salariés faux à 1 462 pointages) | **OPEN_P0** | LP hors train | = PERF-4 |
| **Rentabilité** | REN-1 | Écran fonctionnel sur un petit volume | GO | LP | V8 · build + Vitest GP 2 588 |
| | REN-2 | Exactitude au-delà de 1 000 pointages (12/14 chantiers faux à 5 000 ; heures sommées en flottant) | **OPEN_P0** | LP hors train | festive-turing |
| | REN-3 | DECISION_REQUIRED D1 à D6 (copilote limité aux pointages validés, signe des avoirs…) | OPEN_P2 | — | festive-turing §10 |
| **Comptabilité** | CPT-1 | Exports EX-* PASS (petit volume) | GO | LP | — |
| | CPT-2 | Exports comptables, TVA et trésorerie exacts (export TVA collectée toujours en erreur PGRST201, « à encaisser » à 0 €, centime perdu, troncature) | **OPEN_P0** | LP hors train | confident-brown §11 |
| **Notes de frais** | NDF-1 | DP et NF PASS (NF-01 justificatif stocké : migration `…0354` + pgTAP) | GO | LP | — |
| | NDF-2 | Export ZIP des notes de frais (`.in()` en échec, troncature) | **OPEN_P1** | LP hors train | confident-brown |
| **Employés** | EMP-1 | PE-01 à PE-07 PASS, données personnelles (§2.2 RLS-3) | GO | LP | — |
| | EMP-2 | PA-03 (anomalie de paie) | OPEN_P2 | — | MANUAL_EXPECTED |
| | EMP-3 | Secret global de l'import de paie | **OPEN_P1** | — | = SEC-6 |
| **Pilotage** | PIL-1 | Dashboard DB-01 à DB-03, alertes, délégation | GO | LP | — |
| | PIL-2 | Dashboard non borné (1,7 s à 5 000 devis) | OPEN_P2 | LP | = PERF-7 |
| | PIL-3 | Quota IA calculé exactement | OPEN_P2 | LP hors train | confident-brown `…0816` |

### 2.26 Déploiement (transverse, nécessaire au GO)

| # | Contrôle | Statut | Preuve | Détail |
|---|---|---|---|---|
| DEP-1 | Build GP V8 | GO | LP | V8 §13 |
| DEP-2 | Build Vercel de la Preview sur V8 | **OPEN_P0** | NP | les Preview construites depuis V7 échouent au preflight (`NEXT_PUBLIC_TOOLS_BILLING_API_URL` absente) ; il faut poser la variable ou passer la Build Command à `npm run build:gestion-pro` ; résultat du build `gp-preview-v8` non documenté |
| DEP-3 | Projet Supabase Preview actif | **OPEN_P0** | HP négatif | `pgvvpqyjziyapbbkydmc` INACTIVE au 2026-10-01 (limite de 2 projets actifs en Free) |
| DEP-4 | Verrou de pré-vente (`ABONNEMENTS_PUBLICS_OUVERTS`) | GO (code) | LP | `src/lib/commercialisation-abonnements.ts:11` ; `BILLING-PREVENTE-DATE` reste une décision |

---

## 3. Décompte

| Statut | Lignes de matrice | Contrôles distincts |
|---|---|---|
| GO | 46 | 46 |
| OPEN_P0 | 29 | **25** |
| OPEN_P1 | 28 | **25** |
| OPEN_P2 | 17 | 16 |
| N/A | 3 | 3 |
| **Total** | 123 | **115** |

Huit lignes renvoient à un autre contrôle (« = … ») et ne sont comptées qu'une fois dans les contrôles distincts :
DR-5, STO-2, FAC-2, POI-2 (P0) ; PERF-3, EMP-3, BKP-3 (P1) ; PIL-2 (P2).

| Preuve des GO | Nombre |
|---|---|
| LOCAL_PROVEN | 44 |
| HOSTED_PROVEN (ancienne lignée, avant les trains) | 2 (AUTH-2, STR-TEST-1) |
| HOSTED_PROVEN sur V8 | **0** |

---

## 4. GP Preview hébergée : état réel

| Élément | État | Source |
|---|---|---|
| Vercel `elsatia-preview` (GP seule) | existe ; l'alias stable sert le build du **2026-08-23** (`feat/remises-clients-v1` @ `cf490f5d`) et répond **HTTP 500 partout** | `claude/studio-preview-live-deploy-v2` : `ELSATIA_STUDIO_PREVIEW_DEPLOYMENT_V2.md` §9 |
| Supabase Preview `pgvvpqyjziyapbbkydmc` (eu-west-3) | **INACTIVE (en pause)** au 2026-10-01 | idem §2 |
| Ledger hébergé / migrations V8 | **jamais lu / jamais appliqué** | handoff V2 §16 |
| Branche `gp-preview-v8` | même SHA que V8 ; build Vercel non documenté | `git log` |
| Accès des sessions cloud | CONNECT 403 vers `api.supabase.com` et `api.vercel.com` | `claude/vigilant-fermi-tvd8jb`, `claude/cool-gauss-wjvmd8` |
| Production `exhvuzegsefmoguxoiak` + `app.elsatia.fr` | existe (lots P1 à P13B, 07 au 13/08) ; Stripe en Test ; code de l'ancienne lignée | V8 `docs/organisation/REGISTRE_CENTRAL.md` l.64-78 |
| Procédure prête | `npm run preview:backup`, `preview:v8-gate`, `preview:db-verify`, `preview:pilot` ; répétée en local | `claude/modest-shannon-uhp2ic` : `ELSATIA_V8_PREVIEW_OPERATOR_HANDOFF_V2.md` |

Il n'existe **aucune preuve hébergée** du train V8.

---

## 5. Données (§6 de la mission) : statut d'intégration

| Domaine | Intégré V8 ? | Statut gate |
|---|---|---|
| Pointages / Data Correctness | non (base V7) | OPEN_P0 (B2, B4) |
| Rentabilité | non (base V7) | OPEN_P0 (REN-2, CHA-2) |
| Finance aggregates | non (base V8) | OPEN_P0 (CPT-2, PLA-2) |
| Employee Data | **oui** | GO |
| Billing | **oui** | GO (code) |
| Per-App | **oui** | GO |
| Security V2 | **oui** | GO (sauf les points restés ouverts : SEC-4 à SEC-8) |
| Incident | **oui** | GO |
| Bank Encryption | non (base V8) | OPEN_P0 (SEC-9) |
| Memory | non (base V7) | OPEN_P1 (B3) |

Aucun de ces lots n'est déclaré « explicitement hors canon » : tous restent attendus dans le train.

---

## 6. Legal : informations réellement manquantes

1. **SIRET** (affiché « en cours de finalisation »).
2. **RCS ou RNE** : absent de V8. Une valeur figure sur une branche non intégrée, non reprise ici.
3. **Régime de TVA** (franchise 293 B ou assujettissement) et, si assujetti, **numéro de TVA intracommunautaire**.
4. **Adresse de l'éditeur confirmée** contre l'avis SIRENE.
5. **Adresse e-mail de contact** à retenir (support@ ou contact@).
6. **Durées de conservation** : contrats (durée, point de départ, photos), comptabilité, `journal_activite`.
7. **Sort des photos de pointage et du GPS** pour l'anonymisation.
8. **Sous-traitants** à déclarer : OpenAI, Sentry, Powens (Brevo : DPA).
9. **Relecture des textes par un avocat** (CGU, CGV, confidentialité, DPA).
10. **Texte sur les sauvegardes** à aligner avec la réalité, ou mise en place de sauvegardes récurrentes.

Pas de médiateur requis (CGV B2B), pas de capital social (entreprise individuelle).

---

## 7. Top 10 actions (ordre de dépendance technique)

| # | Ordre | Action | Ferme |
|---|---|---|---|
| 1 | bloque déploiement | **Train V9** : intégrer sur V8 busy-ramanujan, festive-turing, confident-brown, nice-goodall, dazzling-turing et gracious-curie (+ kind-mayer, optimistic-goldberg pour la capture CGU/CGV, modest-shannon pour l'outillage). Renuméroter la collision `…0930000101`, retenir **un** correctif B2, fusionner les deux correctifs de fiche chantier, `sync:train-expectations`, puis requalifier (fresh, upgrade V8→V9, pgTAP, Playwright pilote + Billing, DB verify 38) | DB-7, PERF-3/4/5/6, CHA-2, PLA-2, REN-2, CPT-2, NDF-2, SEC-9, RGPD-7, LEG-6 |
| 2 | bloque déploiement | **Réactiver la Preview** : restaurer `pgvv…` (plan Pro), corriger la build Vercel (`NEXT_PUBLIC_TOOLS_BILLING_API_URL` ou `build:gestion-pro`), puis `preview:backup` → `v8-gate --plan` (lecture du ledger) → `db push` → `db-verify` (depuis un poste avec réseau et identifiants) | DB-5, DEP-2, DEP-3, RLS-5, DR-3 (backup) |
| 3 | bloque déploiement | **Config hébergée** : Auth (Site URL, gabarits, MFA), Brevo + `ELSATIA_APPLICATION_ENV`, crons protégés, puis `env-check`, `http-smoke`, `storage-smoke` et Playwright distant | AUTH-4, MAIL-3, SEC-10/STO-2, MON-4 |
| 4 | bloque déploiement | **Plan de montée de la Production** de l'ancienne lignée (`main` 07/29) vers V9 : lire le ledger Production, construire un harnais d'upgrade, répéter sur une copie, sauvegarde managée/PITR | DB-6, BKP-2 |
| 5 | bloque sécurité | Corriger les 3 MEDIUM restants : `WITH CHECK` sur `entreprise_active_id`, rate-limit de la route PDF de partage, secret d'import de paie par tenant ; vérifier le rate-limit GoTrue hébergé (R-2) | SEC-4/5/6, AUTH-3 (hébergé) |
| 6 | bloque exactitude | **Stripe Test sur V9** : Prices Test, webhook signé réel, Checkout, Portail (trancher `DESCENTE-PORTAIL`), échec de paiement, `preview:stripe-verify` ; rapprocher les contrats à 69 € ; trancher l'abonnement du pilote (`PILOT_SUBSCRIPTION`) | STR-TEST-2, BILL-5, BILL-7, BILL-8 |
| 7 | bloque exactitude | **Identité légale et TVA** (après immatriculation et décision du régime) : renseigner SIRET, RCS et TVA (variables `NEXT_PUBLIC_LEGAL_*` ou `identite-legale.ts`), câbler le régime dans Stripe (`automatic_tax` ou mention 293 B sur les factures), branding vendeur des factures, collecte SIREN et TVA client | LEG-1/2/3/4, STR-TAX, STR-SELLER, BILL-6 |
| 8 | bloque exploitation | **Stripe Live** : activation du compte (KYC), Prices et webhook Live, clés en Production uniquement, contrôle `verify:stripe-prices` en Live, ouverture de `ABONNEMENTS_PUBLICS_OUVERTS` | STR-LIVE |
| 9 | bloque exploitation | **Observabilité et reprise** : DSN Sentry + alertes, sonde de disponibilité externe, sauvegarde du contenu Storage, drill DR rejoué sur V9, restauration d'un backup hébergé | MON-2/3, DR-2/3/4, BKP-3, INC-3 |
| 10 | confort | Décisions et textes : durées RGPD, photos et GPS, sous-traitants, relecture par un avocat, adresse de contact et SPF/DKIM ; puis P2 de performance (dashboard, recherche, C1 sur les corps V8) et P2 de sécurité | RGPD-4/5/6, LEG-5/7/8/9, MAIL-4/5, PERF-7, SEC-7/8 |

Les décisions juridiques des actions 7 et 10 sont des **dépendances externes**. Côté code, l'action 7 ne dépend
que de valeurs à injecter : la mécanique d'affichage existe déjà.

---

## 8. Durée restante (jours développeur, hors temps d'attente externe)

| Action | Meilleur cas | Réaliste |
|---|---|---|
| 1. Train V9 + requalification complète | 3 | 5 |
| 2-3. Preview hébergée réactivée, migrée, vérifiée | 1,5 | 3 |
| 4. Montée de la Production vers V9 (harnais + répétition + exécution) | 2 | 4 |
| 5. 3 MEDIUM sécurité + rate-limit GoTrue | 1 | 2 |
| 6. Stripe Test bout en bout + décisions billing | 1 | 2 |
| 7. Identité légale, TVA, vendeur, collecte SIREN | 1 | 2 |
| 8. Stripe Live | 0,5 | 1 |
| 9. Observabilité, sauvegardes, DR hébergé | 1 | 2 |
| 10. Textes et P2 (part dev seulement) | 0,5 | 2 |
| **Total** | **≈ 11,5 j** | **≈ 23 j** |

**Si blocage externe** : le chemin critique dépend de l'immatriculation (SIRET, RCS, TVA), de l'activation
KYC de Stripe Live, de la relecture par un avocat et de l'accès réseau/identifiants aux fournisseurs (les sessions cloud
reçoivent un 403). Les actions 1, 5 et 9 (partie code) avancent sans eux ; les actions 2 à 4 exigent un poste
opérateur avec identifiants. Estimation : **réaliste + 10 à 20 jours ouvrés calendaires d'attente**. Le travail
développeur n'augmente que d'environ 2 jours (requalification après un ajustement tardif de TVA ou de textes). Si
l'accès hébergé reste impossible, le gate **ne peut pas passer**, quelle que soit la durée de développement.

---

## 9. Ce que ce gate n'affirme pas

- Aucun test n'a été rejoué dans cette mission. Les chiffres viennent des rapports cités.
- Les rapports hors train basés sur V6/V7 ne valent pas pour V8 tant qu'ils ne sont pas requalifiés (action 1).
- L'état hébergé est celui relevé le 2026-10-01 par les rapports Studio Preview V2-V4.1. Il n'a pas été revérifié
  (aucun accès réseau aux fournisseurs depuis cette session).
- Studio, ainsi que Tools, Colors et Réserves, ne sont pas évalués.

## Verdict final

**ELSATIA GP COMMERCIALIZATION GATE NOT YET PASSED**
