# ELSATIA — Commercialization Readiness Gate V1 — résumé

- Généré : 2026-09-28T20:51:08.940Z · HEAD `35d4fb13` · base `integration/elsatia-canonical-train-v6` @ `9102ec80`
- Appels distants : **aucun** · preuves exécutées localement : oui (`--run-code`)
- Date d'activité déclarée : 2026-10-01 — date d'activité déclarée, utilisée uniquement comme repère de configuration existant ; elle n'implique aucune obligation de vendre à cette date

## Verdict

**ELSATIA COMMERCIALIZATION GATE NOT YET PASSED**

Points ouverts : 88 — P0 : 21 · P1 : 50 · P2 : 17. Aucun score global : une moyenne masquerait un NO-GO critique. Lire les catégories et la liste des P0.

## Catégories

| Catégorie | GO / applicables | % GO | État | NO-GO | DECISION | REMOTE | MANUAL | N/A | P0 ouverts |
|---|---|---|---|---|---|---|---|---|---|
| CODE | 7 / 8 | 87.5 % | OPEN | 1 | 0 | 0 | 0 | 0 | — |
| DATABASE | 7 / 9 | 77.8 % | **BLOCKED_P0** | 0 | 0 | 2 | 0 | 0 | DB-HOSTED-LEDGER |
| SECURITY | 6 / 14 | 42.9 % | **BLOCKED_P0** | 4 | 1 | 2 | 1 | 0 | SEC-STORAGE-HOSTED, SEC-BANK-KEY-VERSIONING |
| BILLING | 5 / 15 | 33.3 % | **BLOCKED_P0** | 1 | 4 | 4 | 1 | 0 | BILL-STRIPE-TEST-PRICES, BILL-STRIPE-TEST-WEBHOOKS, BILL-STRIPE-TEST-FLOWS, BILL-STRIPE-TAX, BILL-COMMERCIAL-LOCK, BILL-STRIPE-LIVE |
| EMAIL | 1 / 10 | 10 % | OPEN | 3 | 3 | 2 | 1 | 0 | — |
| LEGAL | 0 / 12 | 0 % | **BLOCKED_P0** | 2 | 5 | 0 | 5 | 1 | LEGAL-IDENTITY-IN-TRAIN, LEGAL-ADDRESS, LEGAL-VAT, LEGAL-STRIPE-SELLER |
| RGPD | 0 / 10 | 0 % | OPEN | 3 | 5 | 1 | 1 | 0 | — |
| BACKUP_DR | 1 / 8 | 12.5 % | **BLOCKED_P0** | 1 | 0 | 4 | 2 | 0 | DR-REMOTE-BACKUP, DR-HOSTED-STORAGE, DR-POST-RESTORE-PROCEDURE, DR-VOLUME-PASSPHRASE |
| PREVIEW | 1 / 5 | 20 % | **BLOCKED_P0** | 1 | 1 | 1 | 1 | 0 | PREVIEW-PACK-TARGETS-V6, PREVIEW-EXECUTED, PREVIEW-PROJECT-INVENTORY |
| OBSERVABILITY | 1 / 4 | 25 % | OPEN | 1 | 0 | 1 | 1 | 0 | — |
| PERFORMANCE | 2 / 3 | 66.7 % | OPEN | 0 | 0 | 1 | 0 | 0 | — |
| MOBILE | 1 / 6 | 16.7 % | OPEN | 0 | 0 | 0 | 5 | 0 | — |
| STUDIO | 2 / 5 | 40 % | OPEN | 1 | 1 | 1 | 0 | 0 | — |
| TOOLS_RELEVE | 1 / 5 | 20 % | OPEN | 1 | 2 | 1 | 0 | 0 | — |
| RESERVES | 1 / 3 | 33.3 % | OPEN | 1 | 0 | 1 | 0 | 1 | — |
| COLORS | 1 / 4 | 25 % | OPEN | 1 | 1 | 1 | 0 | 0 | — |
| OPERATIONS | 1 / 5 | 20 % | **BLOCKED_P0** | 1 | 1 | 2 | 0 | 0 | OPS-V6-PRODUCTION |

## Bloquants par classe

### BLOCKER_TECHNIQUE (21)

| ID | Prio | Statut | Point | Dépendance |
|---|---|---|---|---|
| CODE-POST-V6-CONVERGENCE | P1 | ⛔ NO-GO | Lots qualifiés post-V6 hors train (e-mail, identité légale, DR V2, pack Preview, Studio post-H/E2E, Relevé Lot 7, observabilité) | Train V7 : intégrer et requalifier les branches post-V6 (bases hétérogènes : V5 f6399f15, Lot 6 d734f255, Studio fb7082c6, et main 4d92ddbe pour identité légale et observabilité) |
| SEC-REDTEAM-RESIDUALS | P2 | ⛔ NO-GO | Résidus red team V3 non corrigés : oracle inter-tenant (RT-V3-P2-01), jeton de document anon (P3-02), pas de limitation de débit sur les partages publics (P3-03) | Lot sécurité : resserrer `acces_module_pour_permission`, revoir le grant anon de `document_commercial_par_token`, limiter le débit des routes de partage public |
| SEC-BANK-KEY-VERSIONING | P0 | ⛔ NO-GO | Clé BANK_DATA_ENCRYPTION_KEY sans identifiant de version : pas de rotation, perte = IBAN/BIC illisibles (F-DR-BANK-KEY-VERSIONING) | Lot cryptographie : versionnement de clé (format chiffré avec identifiant) et procédure de rotation |
| SEC-ENV-P1-FINDINGS | P1 | ⛔ NO-GO | Constats P1 ouverts du manifeste : double usage de secrets HMAC, repli silencieux d'environnement, replis localhost, nom de clé service Studio | Lots code du manifeste : STRIPE_CONNECT_STATE_HMAC_KEY, clé d'état bancaire dédiée, refus d'environnement absent au déploiement, indicateur d'environnement dans Réserves/Studio |
| SEC-CI-COVERAGE | P2 | ⛔ NO-GO | pgTAP du projet partagé (red team, D-01, Stripe) et recettes Playwright GP/Réserves/Relevé/Colors absents de la CI | Job CI PostgreSQL 16 + pgTAP sur supabase/tests (comme `studio-dedicated`) et job Playwright sur piles locales |
| BILL-WEBHOOK-RETRY-RESIDUAL | P1 | ⛔ NO-GO | Événement webhook réservé puis en échec : perdu au réessai suivant de Stripe (résidu D3) | Réessai après échec idempotent sur `stripe_webhook_events` (réarmement de la réservation en échec) |
| EMAIL-CODE-READY | P1 | ⛔ NO-GO | Architecture e-mail commune (garde Preview, origines par application, gabarit, journal sans fuite, lettre morte) : code prêt | Porter `claude/practical-ritchie-yvsg3f` (base V5 f6399f15) dans le train V7 et requalifier |
| EMAIL-SECURITY-FIXES | P1 | ⛔ NO-GO | Correctifs de sécurité du lot e-mail absents de V6 : open redirect du callback Réserves, jetons de partage envoyés à Sentry, échappement HTML | Même portage que EMAIL-CODE-READY (fichiers `apps/reserves/src/app/auth/callback/route.ts`, `src/lib/sentry-nettoyage.ts`) |
| EMAIL-FLOW-DEFECTS | P2 | ⛔ NO-GO | Défauts de flux ouverts : Studio consomme le jeton au GET (A-5), idempotence B1/B5 (A-6), relais Colors (A-7), repli localhost Réserves (A-9) | Correctifs P2 du rapport e-mail (A-5, A-6) et décisions A-7, A-9 |
| LEGAL-VISUALS | P2 | ⛔ NO-GO | Guides PDF et vidéos (output/) encore à la marque « Liria » ; icônes PWA de V6 déjà ELSATIA | Régénération des guides et vidéos ELSATIA avant toute diffusion (fichiers non servis par l'application) |
| RGPD-CGV-DELETION-PROMISE | P1 | ⛔ NO-GO | CGV : suppression des données 30 jours après la fin du contrat, sans tâche de production qui l'exécute | Planification de la purge (architecture V2 existante) ou modification de la clause CGV |
| RGPD-EMPLOYES-OVEREXPOSURE | P1 | ⛔ NO-GO | Table employes : e-mail, téléphone, notes (et colonnes de carte BTP / code de borne) lisibles par tout membre actif du tenant | Resserrer la policy SELECT de `employes` (vue `employes_annuaire` = fondation), migrer les 82 lectures `from("employes")` de src/ |
| RGPD-RESERVES-PURGE | P1 | ⛔ NO-GO | Aucune couverture RGPD des tables reserves_* (purge, fichiers de plans, mutations appliquées) | Étendre l'architecture de purge V2 à Réserves (G-05 fichiers `reserves-plans`, R-09 `reserves_mutations_appliquees`) |
| DR-TOOLING-IN-TRAIN | P1 | ⛔ NO-GO | Outillage DR V2 (`npm run dr:verify`, garde-fous) absent du train V6 | Porter `claude/determined-rubin-zdzpmy` (base V5) ; réconcilier ci.yml et le registre des seeds (§16 du rapport DR V2) |
| PREVIEW-PACK-TARGETS-V6 | P0 | ⛔ NO-GO | Le pack cible V5 (f6399f15) : son préflight refuse un train plus récent qualifié (V6) | Porter le pack sur le train retenu et mettre à jour `scripts/preview/qualification/train.json` par revue |
| OBS-HEALTH-LOGS | P1 | ⛔ NO-GO | Journaux structurés, /api/healthz, suivi des tâches planifiées : branche observabilité (PILOT INCIDENT READY) hors train | Porter `ops/observability-incident-readiness-v1` (base main 4d92ddbe, migration job_runs à renuméroter) puis requalifier |
| STUDIO-POST-V6-LOTS | P2 | ⛔ NO-GO | Studio post-H et banc E2E dédié (21/21 ×4, correctif F1) qualifiés hors train | Porter `claude/jolly-volta-doejq2` (inclut `claude/modest-pasteur-izfaqm`, base fb7082c6) ; Studio OFF au lancement |
| TOOLS-RELEVE-LOT7 | P2 | ⛔ NO-GO | Relevé Lot 7 (mobilier, équipements, calques) qualifié hors train | Porter `claude/nifty-edison-mevolm` (base Lot 6 d734f255) dans le train suivant |
| RES-MINOR-DEFECTS | P2 | ⛔ NO-GO | Défauts mineurs ouverts : R-06 auteur nul, R-07 nb_pages réécrivable, R-08 échappement de recherche | Correctifs P3 du rapport Réserves |
| COLORS-OPEN-ITEMS | P2 | ⛔ NO-GO | Colors : redirection des actions suspendues (R1, UX), écran /utilisateurs « ComingSoon » | §7 du rapport Colors V2 |
| OPS-PREFLIGHT-ENFORCEMENT | P1 | ⛔ NO-GO | Préflight d'environnement : « enforce » en Preview, pas encore en Production (F-PREFLIGHT-ENFORCEMENT) | Passer `preflight_enforcement_by_target.production` à enforce après vérification des variables Production |

### BLOCKER_REMOTE (24)

| ID | Prio | Statut | Point | Dépendance |
|---|---|---|---|---|
| DB-PGTAP-COMPLETE | P1 | 🌐 REMOTE_PROOF_REQUIRED | pgTAP complet : 143/152 fichiers propres, 0 régression ; 9 fichiers limités par le banc local | pgsodium réel (platform_stripe_state_attestation_r72) et amorce Supabase complète (cloud sync entitlement) : `supabase test db` sur un vrai projet Supabase ; les 7 suites Studio du projet partagé relèvent du projet dédié (543/543) |
| DB-HOSTED-LEDGER | P0 | 🌐 REMOTE_PROOF_REQUIRED | Migrations V6 appliquées sur Preview puis Production (ledger hébergé) | Exécution de la qualification Preview (sauvegarde validée puis `db push`), puis bascule Production ; V6 n'est déployé nulle part |
| SEC-AUTH-HOSTED | P1 | 🌐 REMOTE_PROOF_REQUIRED | Auth hébergée : AAL2/MFA réel, URLs de redirection par application, signup fermé sur GoTrue hébergé | Qualification Preview (étapes Auth du pack) ; réglages Supabase Dashboard par projet |
| SEC-STORAGE-HOSTED | P0 | 🌐 REMOTE_PROOF_REQUIRED | Policies Storage (19 buckets) jamais vérifiées sur un vrai service Storage | `preview:storage-smoke` (cross-tenant) pendant la qualification Preview |
| BILL-STRIPE-TEST-PRICES | P0 | 🌐 REMOTE_PROOF_REQUIRED | Existence et montants des Price IDs Stripe (verify:stripe-prices strict jamais vert) | Clé Stripe Test en lecture (`STRIPE_TEST_SECRET_KEY` CI ou poste opérateur) puis `npm run verify:stripe-prices` en mode strict ; dépend de BILL-PRICING-DECISIONS |
| BILL-STRIPE-TEST-WEBHOOKS | P0 | 🌐 REMOTE_PROOF_REQUIRED | Webhooks signés par Stripe Test réel, endpoints et événements abonnés, STRIPE_WEBHOOK_EXPECTED_MODE par déploiement | `preview:stripe-verify` + événements Stripe Test réels pendant la qualification Preview |
| BILL-STRIPE-TEST-FLOWS | P0 | 🌐 REMOTE_PROOF_REQUIRED | Checkout, essai, ordre et réabonnement contre Stripe Test réel (scripts préparés, jamais exécutés) | `scripts/qualification/stripe-{ordering,trial,resubscription}-test-mode.mjs` avec clé Stripe Test, sur Preview |
| BILL-CUSTOMER-PORTAL | P1 | 🌐 REMOTE_PROOF_REQUIRED | Portail client Stripe (configuration et bouton de reprise) non observé | `scripts/configurer-portail-stripe.mjs` sur Stripe Test puis observation du Portail pendant la Preview |
| EMAIL-BREVO-API-REAL | P1 | 🌐 REMOTE_PROOF_REQUIRED | Flux applicatifs Brevo (devis/factures, relances, abonnement, support, invitations Réserves) : aucun envoi réel | `smoke:email:preview --brevo-send` vers une adresse de l'allowlist Preview, après EMAIL-CODE-READY |
| EMAIL-PRODUCTION-ENV | P1 | 🌐 REMOTE_PROOF_REQUIRED | ELSATIA_APPLICATION_ENV=production sur GP et Réserves, EMAIL_PREVIEW_ALLOWLIST en Preview — action A-4 | Après portage du lot e-mail : sans la variable, la garde fail-closed bloque tous les e-mails Brevo |
| RGPD-PURGE-HOSTED | P1 | 🌐 REMOTE_PROOF_REQUIRED | Purge d'entreprise (architecture V2) qualifiée localement ; jamais exécutée sur un projet hébergé | Rejeu de `purger-entreprise.mjs` sur Preview (tenant de recette), runbook RGPD V2 |
| DR-REMOTE-BACKUP | P0 | 🌐 REMOTE_PROOF_REQUIRED | Sauvegarde hébergée (PITR / sauvegardes Supabase) jamais restaurée ni vérifiée | Drill Preview autorisé : restauration de projet / PITR, puis `dr:verify --backup` sur la sauvegarde |
| DR-HOSTED-STORAGE | P0 | 🌐 REMOTE_PROOF_REQUIRED | Fichiers Storage hors des sauvegardes de base : copie S3 → S3 appariée au backup_id à mettre en place | Copie S3 → S3 vérifiée par SHA-256 (manifeste), mesurée sur Preview (R3 du rapport DR V2) |
| DR-HOSTED-AUTH-CONFIG | P1 | 🌐 REMOTE_PROOF_REQUIRED | Configuration Auth hébergée hors base (clés JWT, SMTP, gabarits, hooks, MFA, URLs de redirection) non sauvegardée | Export documenté de la configuration par projet et procédure de révocation globale validée sur Preview |
| DR-RTO-RPO | P1 | 🌐 REMOTE_PROOF_REQUIRED | RTO/RPO hébergés non mesurés ; aucun objectif fixé (mesures locales ≠ SLA) | Objectifs RTO/RPO décidés puis drill Preview mesuré (R8 du rapport DR V2) |
| PREVIEW-EXECUTED | P0 | 🌐 REMOTE_PROOF_REQUIRED | Qualification Preview distante réellement exécutée (V4 : BLOCKED ; pack V1 : NOT EXECUTED) | `npm run preview:qualification -- --mode full --apply-migrations` depuis un poste avec réseau et identifiants ; rendre artifacts/preview-qualification.json |
| OBS-SENTRY-PRODUCTION | P1 | 🌐 REMOTE_PROOF_REQUIRED | Sentry branché et reçu sur l'environnement Production | DSN posé et événement de test observé en Production |
| PERF-V6-CAPACITY | P1 | 🌐 REMOTE_PROOF_REQUIRED | Capacité GP sur V6 : REMOTE/LOCAL PROOF PENDING (dernier rapport mesuré sur release/gp-v1-rc@8caef21, verdict PILOT CAPACITY READY, pas « 40 utilisateurs ») | Aucun rapport Performance en cours disponible sur origin : rejouer `scripts/perf` sur V6 localement, puis mesurer sur Preview (pooler, latence réelle) |
| STUDIO-HOSTED | P2 | 🌐 REMOTE_PROOF_REQUIRED | Projet Supabase Studio dédié hébergé et contrôles H1-H6 non exécutés | Projet dédié provisionné (décision B + I1 tranchée), checklist H1-H6 ; Studio OFF au lancement |
| TOOLS-ENTITLEMENT | P1 | 🌐 REMOTE_PROOF_REQUIRED | Contournement d'entitlement cloud-sync fermé localement (16/16), jamais rejoué sur Supabase réel | pgTAP `elsatia_tools_cloud_sync_entitlement_closure_v1` sur un vrai projet Supabase (erreurs d'amorce localement) |
| RES-HOSTED | P1 | 🌐 REMOTE_PROOF_REQUIRED | Storage réel (S3), GoTrue réel et e-mails d'invitation non couverts par la pile locale (H-01) | Qualification Preview Réserves (projet Vercel à créer, voir PREVIEW-PROJECT-INVENTORY) |
| COLORS-PREVIEW | P1 | 🌐 REMOTE_PROOF_REQUIRED | Colors Preview : domaine 13 « Preview config » non prouvé, 73 e2e à rejouer sur Preview, supabase test db réel | Projet Vercel Colors (PREVIEW-PROJECT-INVENTORY), option « fichiers hors racine », rejeu e2e |
| OPS-ROLLBACK | P1 | 🌐 REMOTE_PROOF_REQUIRED | Go-live et rollback Production documentés, jamais répétés sur la lignée V6 | Répétition du rollback applicatif (Vercel) et du correctif base forward-only sur Preview |
| OPS-V6-PRODUCTION | P0 | 🌐 REMOTE_PROOF_REQUIRED | Production (app.elsatia.fr) sur une lignée antérieure : V6 jamais déployé | PREVIEW-EXECUTED vert, puis bascule Production selon le runbook de cutover |

### BLOCKER_LEGAL (8)

| ID | Prio | Statut | Point | Dépendance |
|---|---|---|---|---|
| LEGAL-IDENTITY-IN-TRAIN | P0 | ⛔ NO-GO | Identité officielle (EI, 850 559 873 R.C.S. Strasbourg, elsatia.fr) absente des pages légales de V6 | Porter l'alignement d'identité de `claude/awesome-franklin-se2s33` — branche partie de main 4d92ddbe, pas de V6 : portage manuel des seules corrections d'identité, puis requalification |
| LEGAL-ADDRESS | P0 | 🟨 DECISION_REQUIRED | Adresse de publication (mentions légales et factures Stripe) : adresse retenue à l'immatriculation ou domiciliation | Décision écrite de l'exploitant (aucune adresse n'est choisie par le gate), puis mentions légales et Stripe alignés |
| LEGAL-VAT | P0 | 🟨 DECISION_REQUIRED | Régime de TVA (franchise « 293 B » ou assujettissement) : prix affichés HT, mention TVA « à confirmer » | Régime confirmé, puis NEXT_PUBLIC_LEGAL_TVA, CGV, /tarifs, Stripe Tax et pied de facture alignés |
| LEGAL-CONTACT | P1 | 🟨 DECISION_REQUIRED | Boîte de contact publiée dans le pack juridique (support@ ou contact@elsatia.fr) | Même décision que EMAIL-CONTACT-ADDRESS |
| LEGAL-STRIPE-SELLER | P0 | ✋ MANUAL_REQUIRED | Identité vendeur Stripe (entreprise, public details, libellé bancaire, pied de facture, CGV/confidentialité) | Checklist opérateur §6 de l'audit d'identité ; dépend de LEGAL-ADDRESS et LEGAL-VAT |
| LEGAL-SHOP | P1 | 🟨 DECISION_REQUIRED | Boutique matériel : vente de biens hors activité déclarée, Checkout sans `invoice_creation` (aucune facture émise) | Décision juridique avant toute activation (Boutique OFF au lancement) |
| LEGAL-PROVIDERS-PUBLIC | P1 | ✋ MANUAL_REQUIRED | Sous-traitants (OpenAI, Sentry, Powens) : garanties et localisation à vérifier avant publication | Vérification juridique ; voir RGPD-PROVIDERS |
| LEGAL-LAWYER-REVIEW | P1 | ✋ MANUAL_REQUIRED | Relecture avocat du pack juridique (brouillons, pas un conseil juridique) | Pack aligné (LEGAL-IDENTITY-IN-TRAIN, LEGAL-ADDRESS, LEGAL-VAT) puis relecture |

### DECISION_REQUIRED (20)

| ID | Prio | Statut | Point | Dépendance |
|---|---|---|---|---|
| SEC-SUSPENSION-CROSS-APP | P1 | 🟨 DECISION_REQUIRED | Abonnement GP suspendu : accès coupé (pas de lecture seule) et accès Colors/Tools/Réserves couplé au statut GP (RT-V3-P2-02) | Décision produit explicite demandée par le red team V3 ; puis `a_acces_application()` et `est_membre_actif` alignés et testés |
| BILL-PRICING-DECISIONS | P1 | 🟨 DECISION_REQUIRED | Grille tarifaire Stripe : contrats de Price divergents (modules, comptes supplémentaires, options IA, générations historiques, bloc stockage) | 5 décisions STRIPE-* du manifeste, puis création des Price IDs et `verify:stripe-prices` |
| BILL-STRIPE-TAX | P0 | 🟨 DECISION_REQUIRED | Stripe Tax / STRIPE_AUTOMATIC_TAX_ENABLED : bloqué tant que le régime de TVA n'est pas confirmé | LEGAL-VAT (régime de TVA), puis paramétrage Stripe Tax et affichage HT/TTC aligné |
| BILL-GRACE-PERIOD | P1 | 🟨 DECISION_REQUIRED | Délai de grâce après impayé (STRIPE_DELAI_GRACE_PAIEMENT_JOURS, défaut 0 = suspension immédiate) | Valeur écrite puis variable posée par environnement |
| BILL-COMMERCIAL-LOCK | P0 | 🟨 DECISION_REQUIRED | Ouverture des souscriptions publiques (verrou ABONNEMENTS_PUBLICS_OUVERTS ; aucune garde de date dans V6) | Décision d'ouverture après levée des P0 ; variable posée en Production. La garde de date du 01/10/2026 n'existe que sur la branche identité légale (non portée) |
| EMAIL-CONTACT-ADDRESS | P1 | 🟨 DECISION_REQUIRED | Adresse de contact affichée : support@elsatia.fr (registre P14B) ou contact@elsatia.fr (runbook SMTP, audit identité) — action A-3 | Choix écrit, puis SUPPORT_EMAIL, EMAIL_FROM_ADDRESS et pack juridique alignés |
| EMAIL-AUTH-ROUTING | P1 | 🟨 DECISION_REQUIRED | Routage Auth par application (reset Tools atterrit sur GP) — action A-1 | Option 1/2/3 du rapport e-mail, puis implémentation |
| EMAIL-PROVIDERS | P2 | 🟨 DECISION_REQUIRED | Fournisseurs e-mail : SMTP du projet Studio, Brevo API + SMTP (DPA), secours éventuel — action A-8 | Décision fournisseurs ; Studio OFF au lancement |
| LEGAL-TRADEMARK | P2 | 🟨 DECISION_REQUIRED | Dépôt de la marque ELSATIA non vérifié | Vérification ; ne pas parler de marque déposée d'ici là |
| RGPD-CONTRACT-RETENTION | P1 | 🟨 DECISION_REQUIRED | Conservation des contrats acceptés : A durée, B point de départ (B1/B2), C photos — rien d'activé (fail-closed) | Décision écrite dans docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md (aucune durée choisie par le gate), puis activation propriétaire et mise à jour confidentialité/registre/DPA |
| RGPD-LIFECYCLE-DECISIONS | P1 | 🟨 DECISION_REQUIRED | Décisions de cycle de vie ouvertes : tables RETAIN et durée comptable, photos GPS/pointage, pseudonymisation du journal, purge self-service, anonymisation clients | LEGAL_DECISION_REQUIRED 1-5 (P1-6, P1-7 des décisions propriétaire) |
| RGPD-LOG-RETENTION | P1 | 🟨 DECISION_REQUIRED | Rétention des journaux techniques (Vercel, Supabase, Sentry) et des journaux opérateur non définie ni vérifiée | Durées décidées puis vérifiées chez chaque fournisseur |
| RGPD-STUDIO-INVITATIONS | P2 | 🟨 DECISION_REQUIRED | Invitations Studio : aucune analyse RGPD dans le train (lot post-H hors V6) | Lot Studio post-H porté (STUDIO-POST-V6-LOTS) puis classement des données d'invitation ; Studio OFF au lancement |
| RGPD-STUDIO-SHARED-WORKSPACES | P2 | 🟨 DECISION_REQUIRED | Effacement Studio : espaces partagés d'un compte supprimé (D3), contenus dans l'espace d'autrui (D4), délai (D1), conservation du journal (D2) | Décisions D1-D5, D7 du lot Studio B ; exécution d'effacement `off` d'ici là ; Studio OFF au lancement |
| PREVIEW-PROJECT-INVENTORY | P0 | 🟨 DECISION_REQUIRED | Projets Preview : réutiliser elsatia-preview (limite de 2 projets) ; aucun projet Vercel pour Colors, Tools, Réserves, Studio | Décision propriétaire (P0-1 des décisions finales) avant toute exécution Preview |
| STUDIO-DECISIONS | P2 | 🟨 DECISION_REQUIRED | Décisions Studio ouvertes : mode d'inscription en Production, hébergeur du worker vidéo | Avant toute ouverture de Studio (OFF au lancement) |
| TOOLS-DOWNGRADE-READ | P1 | 🟨 DECISION_REQUIRED | Utilisateur rétrogradé : perte de lecture des projets synchronisés (choix conservateur à confirmer, DECISION_REQUIRED-04) | Confirmation explicite du comportement avant vente de l'offre Tools Pro |
| TOOLS-VOLUME-PIECE | P2 | 🟨 DECISION_REQUIRED | Volume de la pièce non calculé (colonne réservée) | DECISION_REQUIRED:V6-VOLUME-PIECE |
| COLORS-LICENSED-CHART | P2 | 🟨 DECISION_REQUIRED | Nuancier sous licence / OCR (DPA requis) | P2-10 des décisions propriétaire |
| OPS-CRONS-FAIL-OPEN | P1 | 🟨 DECISION_REQUIRED | FEATURE_CRONS_ENABLED fail-open (absent = tâches planifiées actives) | DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN (poser la variable avant tout déploiement si fail-closed) |

### MANUAL_VALIDATION (15)

| ID | Prio | Statut | Point | Dépendance |
|---|---|---|---|---|
| SEC-LEGACY-DEMO-CREDENTIALS | P1 | ✋ MANUAL_REQUIRED | Rotation des identifiants de démo historiques signalée « rotation requise » par l'audit de sécurité | Confirmer par écrit la suppression du compte de démo et la rotation ; mettre à jour docs/AUDIT_SECURITE.md (daté du 18/07/2026, antérieur à la fermeture de l'accès anonyme) |
| BILL-STRIPE-LIVE | P0 | ✋ MANUAL_REQUIRED | Compte Stripe Live : activation, Price IDs Live, endpoints webhook Live | LEGAL-STRIPE-SELLER, BILL-PRICING-DECISIONS, BILL-STRIPE-TAX ; `docs/organisation/P15_STRIPE_LIVE_PREPARATION.md` |
| EMAIL-HOSTED-TEMPLATES | P1 | ✋ MANUAL_REQUIRED | Gabarits Supabase neutres à reporter dans le Dashboard (Preview et Production) — action A-2 | EMAIL-CODE-READY (gabarits versionnés), puis report manuel dans les deux projets Supabase |
| LEGAL-SIRET | P1 | ✋ MANUAL_REQUIRED | SIRET (SIREN + NIC) non connu du dépôt : NEXT_PUBLIC_LEGAL_SIRET vide | Avis de situation SIRENE, puis NEXT_PUBLIC_LEGAL_SIRET par environnement (aucune valeur inventée) |
| LEGAL-OTHER-APPS | P1 | ✋ MANUAL_REQUIRED | Identité légale de Tools, Colors, Réserves, Studio et du site vitrine non auditée ; pack juridique limité à « ELSATIA Gestion Pro » | Audit d'identité par application (référence : audit V1) et extension des CGU/confidentialité aux applications vendues |
| RGPD-PROVIDERS | P1 | ✋ MANUAL_REQUIRED | Registre des sous-traitants : région Sentry à confirmer ; hébergeur worker Studio et Redis absents ; réévaluation avant Boutique/Powens | Confirmer la région Sentry ; compléter le registre au choix de DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER |
| DR-POST-RESTORE-PROCEDURE | P0 | ✋ MANUAL_REQUIRED | Procédure post-restauration obligatoire : rejeu Stripe (droits rouverts), révocation des sessions et rotation JWT (mots de passe/bans ressuscités) | Intégrer R1/R2/R6 du rapport DR V2 au runbook DR et les valider sur Preview |
| DR-VOLUME-PASSPHRASE | P0 | ✋ MANUAL_REQUIRED | Passphrase du volume DR (seul dépôt de secrets) sans garde documentée (F-DR-VOLUME-PASSPHRASE) | Deux dépositaires documentés et un test de restauration du volume |
| PREVIEW-MANUAL-CONFIRMATIONS | P1 | ✋ MANUAL_REQUIRED | Confirmations manuelles de la Preview (réception des e-mails, parcours humains) | Après PREVIEW-EXECUTED : cocher les confirmations de summary.md |
| OBS-ALERTING-UPTIME | P1 | ✋ MANUAL_REQUIRED | Alerting et surveillance de disponibilité : aucun fournisseur connecté, aucune astreinte définie | Moniteur externe + canal d'alerte + personne d'astreinte, après OBS-HEALTH-LOGS |
| MOB-IPHONE-PHYSICAL | P1 | ✋ MANUAL_REQUIRED | iPhone physique : aucun test | Recette sur un vrai iPhone contre la Preview HTTPS (après PREVIEW-EXECUTED) |
| MOB-IPAD-PHYSICAL | P1 | ✋ MANUAL_REQUIRED | iPad physique : aucun test (Relevé tablette : MOBILE EMULATED ONLY) | Recette Relevé et Réserves sur un vrai iPad contre la Preview |
| MOB-SAFARI-IOS | P1 | ✋ MANUAL_REQUIRED | Safari / WebKit iOS réel : non testé (seul WebKit desktop piloté par Playwright) | Parcours clés (connexion, capture photo, hors ligne, PWA) dans Safari iOS réel |
| MOB-FIELD | P1 | ✋ MANUAL_REQUIRED | Terrain réel : rechargement hors ligne Réserves non exécutable localement, installation PWA réelle non testée | Recette terrain (réseau dégradé, hors ligne, PWA installée) sur appareils réels |
| MOB-NATIVE-STORES | P2 | ✋ MANUAL_REQUIRED | Tools natif : installation sur appareil réel non cochée (TestFlight / Google Play) | Distribution magasins d'applications (hors vente web) |

## Détail

### CODE

- ✅ **CODE-BUILD** GO — Build des 5 applications (GP, Tools, Colors, Réserves, Studio)
- ✅ **CODE-TYPECHECK** GO — Typecheck (racine + apps)
- ✅ **CODE-LINT** GO — Lint (0 erreur ; 15 avertissements préexistants)
- ✅ **CODE-TESTS** GO — Tests unitaires Vitest (GP 2 300, Tools 2 118, Colors 431, Réserves 186, Studio 291)
- ✅ **CODE-MIGRATIONS** GO — Migrations : 358 valides, cibles partagé / Studio dédié, attendus du train synchronisés
- ✅ **CODE-SEEDS** GO — Seeds : registre complet et 16/16 seeds actifs qualifiés sur 358 migrations
- ✅ **CODE-TOOLING-TESTS** GO — Outillage hors réseau (pack Preview, manifeste, scripts Stripe test-mode)
- ⛔ **CODE-POST-V6-CONVERGENCE** NO-GO · P1 · BLOCKER_TECHNIQUE — Lots qualifiés post-V6 hors train (e-mail, identité légale, DR V2, pack Preview, Studio post-H/E2E, Relevé Lot 7, observabilité)

### DATABASE

- ✅ **DB-FRESH** GO — Base neuve : 358/358 migrations, 0 erreur (PostgreSQL 16)
- ✅ **DB-UPGRADE** GO — Upgrade V5 → V6 avec données réalistes : 0 écart de lignes, 91/91 empreintes, 28/28 contrôles métier
- ✅ **DB-RLS** GO — RLS : sonde réelle 51 utilisateurs × 29 tables, 0 écart ; aucune table publique sans RLS
- ✅ **DB-POLICIES** GO — Policies : 639 → 639, aucune supprimée, modifiée ou ajoutée par V6
- ✅ **DB-GRANTS** GO — Grants et EXECUTE : inchangés ; 37 RPC techniques réservées au service_role
- ✅ **DB-VERIFY-LOCAL** GO — DB verify Preview rejoué sur base V6 neuve : GO (29 contrôles, préflight 21 / 0 bloquant, 19 buckets, 37/37)
- 🌐 **DB-PGTAP-COMPLETE** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — pgTAP complet : 143/152 fichiers propres, 0 régression ; 9 fichiers limités par le banc local
- 🌐 **DB-HOSTED-LEDGER** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Migrations V6 appliquées sur Preview puis Production (ledger hébergé)
- ✅ **DB-DR-LOCAL** GO — Restauration base : backup strict restauré à l'identique (0 écart), 4 sinistres, compatibilité schéma V6

### SECURITY

- ✅ **SEC-MULTI-TENANT** GO — Isolation multi-tenant : red team V3 (3 failles corrigées), remédiation des bloqueurs, sonde RLS V6
- ⛔ **SEC-REDTEAM-RESIDUALS** NO-GO · P2 · BLOCKER_TECHNIQUE — Résidus red team V3 non corrigés : oracle inter-tenant (RT-V3-P2-01), jeton de document anon (P3-02), pas de limitation de débit sur les partages publics (P3-03)
- ✅ **SEC-READ-ONLY-RESERVES-D01** GO — Lecture seule Réserves D-01 (hôte suspendu) : pgTAP 97, Playwright 7/7 sur V6
- ✅ **SEC-READ-ONLY-STUDIO** GO — Lecture seule Studio appliquée en base (garde d'écriture centrale, 22 RPC refusées, 42501)
- 🟨 **SEC-SUSPENSION-CROSS-APP** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Abonnement GP suspendu : accès coupé (pas de lecture seule) et accès Colors/Tools/Réserves couplé au statut GP (RT-V3-P2-02)
- ✅ **SEC-AUTH-LOCAL** GO — Auth sur GoTrue réel local : jetons valides/expirés/bannis/révoqués, identité Studio B + I1 73/73 ×3
- 🌐 **SEC-AUTH-HOSTED** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Auth hébergée : AAL2/MFA réel, URLs de redirection par application, signup fermé sur GoTrue hébergé
- 🌐 **SEC-STORAGE-HOSTED** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Policies Storage (19 buckets) jamais vérifiées sur un vrai service Storage
- ✅ **SEC-SECRETS** GO — Aucun secret reconnu dans les fichiers suivis (verify:secrets, CI)
- ✅ **SEC-DEPENDENCIES** GO — Audit des dépendances (npm audit --audit-level=high) en CI hebdomadaire
- ✋ **SEC-LEGACY-DEMO-CREDENTIALS** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — Rotation des identifiants de démo historiques signalée « rotation requise » par l'audit de sécurité
- ⛔ **SEC-BANK-KEY-VERSIONING** NO-GO · P0 · BLOCKER_TECHNIQUE — Clé BANK_DATA_ENCRYPTION_KEY sans identifiant de version : pas de rotation, perte = IBAN/BIC illisibles (F-DR-BANK-KEY-VERSIONING)
- ⛔ **SEC-ENV-P1-FINDINGS** NO-GO · P1 · BLOCKER_TECHNIQUE — Constats P1 ouverts du manifeste : double usage de secrets HMAC, repli silencieux d'environnement, replis localhost, nom de clé service Studio
- ⛔ **SEC-CI-COVERAGE** NO-GO · P2 · BLOCKER_TECHNIQUE — pgTAP du projet partagé (red team, D-01, Stripe) et recettes Playwright GP/Réserves/Relevé/Colors absents de la CI

### BILLING

- ✅ **BILL-LOCAL-SECURITY** GO — Sécurité facturation self-service : contournement RLS fermé, 3DS ne suspend jamais, colonnes commerciales verrouillées
- ✅ **BILL-LOCAL-ORDERING** GO — Ordre des événements Stripe : désordre, rejeu, doublons et 100 courses convergent
- ✅ **BILL-LOCAL-TRIAL** GO — Essai : trial_end borné à l'essai local, double Checkout concurrent bloqué
- ✅ **BILL-LOCAL-RESUBSCRIPTION** GO — Réabonnement après annulation : 120/120 ordres convergent, Playwright 6/6 ×2 sur V6
- ✅ **BILL-LOCAL-CONNECT-BOUTIQUE** GO — Webhooks Connect/Boutique et idempotence de la Boutique (Boutique et Connect OFF au lancement)
- 🌐 **BILL-STRIPE-TEST-PRICES** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Existence et montants des Price IDs Stripe (verify:stripe-prices strict jamais vert)
- 🌐 **BILL-STRIPE-TEST-WEBHOOKS** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Webhooks signés par Stripe Test réel, endpoints et événements abonnés, STRIPE_WEBHOOK_EXPECTED_MODE par déploiement
- 🌐 **BILL-STRIPE-TEST-FLOWS** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Checkout, essai, ordre et réabonnement contre Stripe Test réel (scripts préparés, jamais exécutés)
- 🌐 **BILL-CUSTOMER-PORTAL** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Portail client Stripe (configuration et bouton de reprise) non observé
- 🟨 **BILL-PRICING-DECISIONS** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Grille tarifaire Stripe : contrats de Price divergents (modules, comptes supplémentaires, options IA, générations historiques, bloc stockage)
- 🟨 **BILL-STRIPE-TAX** DECISION_REQUIRED · P0 · DECISION_REQUIRED — Stripe Tax / STRIPE_AUTOMATIC_TAX_ENABLED : bloqué tant que le régime de TVA n'est pas confirmé
- ⛔ **BILL-WEBHOOK-RETRY-RESIDUAL** NO-GO · P1 · BLOCKER_TECHNIQUE — Événement webhook réservé puis en échec : perdu au réessai suivant de Stripe (résidu D3)
- 🟨 **BILL-GRACE-PERIOD** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Délai de grâce après impayé (STRIPE_DELAI_GRACE_PAIEMENT_JOURS, défaut 0 = suspension immédiate)
- 🟨 **BILL-COMMERCIAL-LOCK** DECISION_REQUIRED · P0 · DECISION_REQUIRED — Ouverture des souscriptions publiques (verrou ABONNEMENTS_PUBLICS_OUVERTS ; aucune garde de date dans V6)
- ✋ **BILL-STRIPE-LIVE** MANUAL_REQUIRED · P0 · MANUAL_VALIDATION — Compte Stripe Live : activation, Price IDs Live, endpoints webhook Live

### EMAIL

- ⛔ **EMAIL-CODE-READY** NO-GO · P1 · BLOCKER_TECHNIQUE — Architecture e-mail commune (garde Preview, origines par application, gabarit, journal sans fuite, lettre morte) : code prêt
- ⛔ **EMAIL-SECURITY-FIXES** NO-GO · P1 · BLOCKER_TECHNIQUE — Correctifs de sécurité du lot e-mail absents de V6 : open redirect du callback Réserves, jetons de partage envoyés à Sentry, échappement HTML
- ✅ **EMAIL-AUTH-SMTP-PROD** GO — SMTP Brevo du projet Supabase Production, domaine elsatia.fr authentifié (DKIM), reset testé de bout en bout (lignée pré-V6)
- 🌐 **EMAIL-BREVO-API-REAL** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Flux applicatifs Brevo (devis/factures, relances, abonnement, support, invitations Réserves) : aucun envoi réel
- ✋ **EMAIL-HOSTED-TEMPLATES** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — Gabarits Supabase neutres à reporter dans le Dashboard (Preview et Production) — action A-2
- 🌐 **EMAIL-PRODUCTION-ENV** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — ELSATIA_APPLICATION_ENV=production sur GP et Réserves, EMAIL_PREVIEW_ALLOWLIST en Preview — action A-4
- 🟨 **EMAIL-CONTACT-ADDRESS** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Adresse de contact affichée : support@elsatia.fr (registre P14B) ou contact@elsatia.fr (runbook SMTP, audit identité) — action A-3
- 🟨 **EMAIL-AUTH-ROUTING** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Routage Auth par application (reset Tools atterrit sur GP) — action A-1
- 🟨 **EMAIL-PROVIDERS** DECISION_REQUIRED · P2 · DECISION_REQUIRED — Fournisseurs e-mail : SMTP du projet Studio, Brevo API + SMTP (DPA), secours éventuel — action A-8
- ⛔ **EMAIL-FLOW-DEFECTS** NO-GO · P2 · BLOCKER_TECHNIQUE — Défauts de flux ouverts : Studio consomme le jeton au GET (A-5), idempotence B1/B5 (A-6), relais Colors (A-7), repli localhost Réserves (A-9)

### LEGAL

- ⛔ **LEGAL-IDENTITY-IN-TRAIN** NO-GO · P0 · BLOCKER_LEGAL — Identité officielle (EI, 850 559 873 R.C.S. Strasbourg, elsatia.fr) absente des pages légales de V6
- 🟨 **LEGAL-ADDRESS** DECISION_REQUIRED · P0 · BLOCKER_LEGAL — Adresse de publication (mentions légales et factures Stripe) : adresse retenue à l'immatriculation ou domiciliation
- 🟨 **LEGAL-VAT** DECISION_REQUIRED · P0 · BLOCKER_LEGAL — Régime de TVA (franchise « 293 B » ou assujettissement) : prix affichés HT, mention TVA « à confirmer »
- ✋ **LEGAL-SIRET** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — SIRET (SIREN + NIC) non connu du dépôt : NEXT_PUBLIC_LEGAL_SIRET vide
- 🟨 **LEGAL-CONTACT** DECISION_REQUIRED · P1 · BLOCKER_LEGAL — Boîte de contact publiée dans le pack juridique (support@ ou contact@elsatia.fr)
- ✋ **LEGAL-STRIPE-SELLER** MANUAL_REQUIRED · P0 · BLOCKER_LEGAL — Identité vendeur Stripe (entreprise, public details, libellé bancaire, pied de facture, CGV/confidentialité)
- 🟨 **LEGAL-SHOP** DECISION_REQUIRED · P1 · BLOCKER_LEGAL — Boutique matériel : vente de biens hors activité déclarée, Checkout sans `invoice_creation` (aucune facture émise)
- ⛔ **LEGAL-VISUALS** NO-GO · P2 · BLOCKER_TECHNIQUE — Guides PDF et vidéos (output/) encore à la marque « Liria » ; icônes PWA de V6 déjà ELSATIA
- ✋ **LEGAL-PROVIDERS-PUBLIC** MANUAL_REQUIRED · P1 · BLOCKER_LEGAL — Sous-traitants (OpenAI, Sentry, Powens) : garanties et localisation à vérifier avant publication
- ✋ **LEGAL-LAWYER-REVIEW** MANUAL_REQUIRED · P1 · BLOCKER_LEGAL — Relecture avocat du pack juridique (brouillons, pas un conseil juridique)
- ✋ **LEGAL-OTHER-APPS** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — Identité légale de Tools, Colors, Réserves, Studio et du site vitrine non auditée ; pack juridique limité à « ELSATIA Gestion Pro »
- 🟨 **LEGAL-TRADEMARK** DECISION_REQUIRED · P2 · DECISION_REQUIRED — Dépôt de la marque ELSATIA non vérifié
- · **LEGAL-ACTIVITY-DATE** NOT_APPLICABLE — Date d'activité déclarée 01/10/2026

### RGPD

- 🟨 **RGPD-CONTRACT-RETENTION** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Conservation des contrats acceptés : A durée, B point de départ (B1/B2), C photos — rien d'activé (fail-closed)
- 🟨 **RGPD-LIFECYCLE-DECISIONS** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Décisions de cycle de vie ouvertes : tables RETAIN et durée comptable, photos GPS/pointage, pseudonymisation du journal, purge self-service, anonymisation clients
- ⛔ **RGPD-CGV-DELETION-PROMISE** NO-GO · P1 · BLOCKER_TECHNIQUE — CGV : suppression des données 30 jours après la fin du contrat, sans tâche de production qui l'exécute
- ⛔ **RGPD-EMPLOYES-OVEREXPOSURE** NO-GO · P1 · BLOCKER_TECHNIQUE — Table employes : e-mail, téléphone, notes (et colonnes de carte BTP / code de borne) lisibles par tout membre actif du tenant
- 🌐 **RGPD-PURGE-HOSTED** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Purge d'entreprise (architecture V2) qualifiée localement ; jamais exécutée sur un projet hébergé
- ⛔ **RGPD-RESERVES-PURGE** NO-GO · P1 · BLOCKER_TECHNIQUE — Aucune couverture RGPD des tables reserves_* (purge, fichiers de plans, mutations appliquées)
- ✋ **RGPD-PROVIDERS** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — Registre des sous-traitants : région Sentry à confirmer ; hébergeur worker Studio et Redis absents ; réévaluation avant Boutique/Powens
- 🟨 **RGPD-LOG-RETENTION** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Rétention des journaux techniques (Vercel, Supabase, Sentry) et des journaux opérateur non définie ni vérifiée
- 🟨 **RGPD-STUDIO-INVITATIONS** DECISION_REQUIRED · P2 · DECISION_REQUIRED — Invitations Studio : aucune analyse RGPD dans le train (lot post-H hors V6)
- 🟨 **RGPD-STUDIO-SHARED-WORKSPACES** DECISION_REQUIRED · P2 · DECISION_REQUIRED — Effacement Studio : espaces partagés d'un compte supprimé (D3), contenus dans l'espace d'autrui (D4), délai (D1), conservation du journal (D2)

### BACKUP_DR

- ✅ **DR-LOCAL** GO — DR local : backup vérifié par restauration stricte, 4 sinistres, Storage et Auth réels (GoTrue, storage-api) — ELSATIA DR LOCALLY QUALIFIED
- ⛔ **DR-TOOLING-IN-TRAIN** NO-GO · P1 · BLOCKER_TECHNIQUE — Outillage DR V2 (`npm run dr:verify`, garde-fous) absent du train V6
- 🌐 **DR-REMOTE-BACKUP** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Sauvegarde hébergée (PITR / sauvegardes Supabase) jamais restaurée ni vérifiée
- 🌐 **DR-HOSTED-STORAGE** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Fichiers Storage hors des sauvegardes de base : copie S3 → S3 appariée au backup_id à mettre en place
- 🌐 **DR-HOSTED-AUTH-CONFIG** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Configuration Auth hébergée hors base (clés JWT, SMTP, gabarits, hooks, MFA, URLs de redirection) non sauvegardée
- 🌐 **DR-RTO-RPO** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — RTO/RPO hébergés non mesurés ; aucun objectif fixé (mesures locales ≠ SLA)
- ✋ **DR-POST-RESTORE-PROCEDURE** MANUAL_REQUIRED · P0 · MANUAL_VALIDATION — Procédure post-restauration obligatoire : rejeu Stripe (droits rouverts), révocation des sessions et rotation JWT (mots de passe/bans ressuscités)
- ✋ **DR-VOLUME-PASSPHRASE** MANUAL_REQUIRED · P0 · MANUAL_VALIDATION — Passphrase du volume DR (seul dépôt de secrets) sans garde documentée (F-DR-VOLUME-PASSPHRASE)

### PREVIEW

- ✅ **PREVIEW-PACK-READY** GO — Pack opérateur Preview distante : commande unique, 35 étapes, protection Production, 27 tests hors réseau
- ⛔ **PREVIEW-PACK-TARGETS-V6** NO-GO · P0 · BLOCKER_TECHNIQUE — Le pack cible V5 (f6399f15) : son préflight refuse un train plus récent qualifié (V6)
- 🌐 **PREVIEW-EXECUTED** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Qualification Preview distante réellement exécutée (V4 : BLOCKED ; pack V1 : NOT EXECUTED)
- 🟨 **PREVIEW-PROJECT-INVENTORY** DECISION_REQUIRED · P0 · DECISION_REQUIRED — Projets Preview : réutiliser elsatia-preview (limite de 2 projets) ; aucun projet Vercel pour Colors, Tools, Réserves, Studio
- ✋ **PREVIEW-MANUAL-CONFIRMATIONS** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — Confirmations manuelles de la Preview (réception des e-mails, parcours humains)

### OBSERVABILITY

- ✅ **OBS-SENTRY-CODE** GO — Sentry câblé (serveur, edge, navigateur), sendDefaultPii=false, désactivé sans DSN
- 🌐 **OBS-SENTRY-PRODUCTION** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Sentry branché et reçu sur l'environnement Production
- ⛔ **OBS-HEALTH-LOGS** NO-GO · P1 · BLOCKER_TECHNIQUE — Journaux structurés, /api/healthz, suivi des tâches planifiées : branche observabilité (PILOT INCIDENT READY) hors train
- ✋ **OBS-ALERTING-UPTIME** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — Alerting et surveillance de disponibilité : aucun fournisseur connecté, aucune astreinte définie

### PERFORMANCE

- 🌐 **PERF-V6-CAPACITY** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Capacité GP sur V6 : REMOTE/LOCAL PROOF PENDING (dernier rapport mesuré sur release/gp-v1-rc@8caef21, verdict PILOT CAPACITY READY, pas « 40 utilisateurs »)
- ✅ **PERF-RESERVES-LOCAL** GO — Réserves : recette performance V6 5/5 (2 000 réserves) sur pile locale
- ✅ **PERF-RELEVE-LOCAL** GO — Relevé : 500 murs + 300 ouvertures (next dev), recette V6 16/16

### MOBILE

- ✅ **MOB-EMULATED** GO — Profils émulés : WebKit iPhone 13 / iPad (gen 7), Pixel 7, colors-mobile 73/73, Réserves V4 mobile 6/6
- ✋ **MOB-IPHONE-PHYSICAL** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — iPhone physique : aucun test
- ✋ **MOB-IPAD-PHYSICAL** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — iPad physique : aucun test (Relevé tablette : MOBILE EMULATED ONLY)
- ✋ **MOB-SAFARI-IOS** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — Safari / WebKit iOS réel : non testé (seul WebKit desktop piloté par Playwright)
- ✋ **MOB-FIELD** MANUAL_REQUIRED · P1 · MANUAL_VALIDATION — Terrain réel : rechargement hors ligne Réserves non exécutable localement, installation PWA réelle non testée
- ✋ **MOB-NATIVE-STORES** MANUAL_REQUIRED · P2 · MANUAL_VALIDATION — Tools natif : installation sur appareil réel non cochée (TestFlight / Google Play)

### STUDIO

- ✅ **STUDIO-OFF-AT-LAUNCH** GO — Studio OFF pour la première Preview (aucune migration Studio dans le projet partagé, STUDIO_ACCESS_MODE=closed)
- ✅ **STUDIO-LOCAL** GO — Chaîne Studio dédiée : 14 migrations, 543 pgTAP, 0 table GP, identité B + I1 73/73 ×3
- ⛔ **STUDIO-POST-V6-LOTS** NO-GO · P2 · BLOCKER_TECHNIQUE — Studio post-H et banc E2E dédié (21/21 ×4, correctif F1) qualifiés hors train
- 🌐 **STUDIO-HOSTED** REMOTE_PROOF_REQUIRED · P2 · BLOCKER_REMOTE — Projet Supabase Studio dédié hébergé et contrôles H1-H6 non exécutés
- 🟨 **STUDIO-DECISIONS** DECISION_REQUIRED · P2 · DECISION_REQUIRED — Décisions Studio ouvertes : mode d'inscription en Production, hébergeur du worker vidéo

### TOOLS_RELEVE

- ✅ **TOOLS-RELEVE-LOCAL** GO — Relevé & Métré Lots 2-6 + Atelier : Playwright 68/68, pgTAP Relevé propres, surface pièce serveur 32/32
- 🌐 **TOOLS-ENTITLEMENT** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Contournement d'entitlement cloud-sync fermé localement (16/16), jamais rejoué sur Supabase réel
- 🟨 **TOOLS-DOWNGRADE-READ** DECISION_REQUIRED · P1 · DECISION_REQUIRED — Utilisateur rétrogradé : perte de lecture des projets synchronisés (choix conservateur à confirmer, DECISION_REQUIRED-04)
- ⛔ **TOOLS-RELEVE-LOT7** NO-GO · P2 · BLOCKER_TECHNIQUE — Relevé Lot 7 (mobilier, équipements, calques) qualifié hors train
- 🟨 **TOOLS-VOLUME-PIECE** DECISION_REQUIRED · P2 · DECISION_REQUIRED — Volume de la pièce non calculé (colonne réservée)

### RESERVES

- ✅ **RES-LOCAL** GO — Réserves : 59/59 Playwright, D-01 7/7, GP ↔ Réserves 5/5 ×3 sur V6
- 🌐 **RES-HOSTED** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Storage réel (S3), GoTrue réel et e-mails d'invitation non couverts par la pile locale (H-01)
- ⛔ **RES-MINOR-DEFECTS** NO-GO · P2 · BLOCKER_TECHNIQUE — Défauts mineurs ouverts : R-06 auteur nul, R-07 nb_pages réécrivable, R-08 échappement de recherche
- · **RES-SENTRY** NOT_APPLICABLE — Télémétrie Sentry absente de Réserves

### COLORS

- ✅ **COLORS-LOCAL** GO — Colors : 442 pgTAP, 431 Vitest, Playwright 73/73 (V6) — COLORS LOCALLY QUALIFIED
- 🌐 **COLORS-PREVIEW** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Colors Preview : domaine 13 « Preview config » non prouvé, 73 e2e à rejouer sur Preview, supabase test db réel
- ⛔ **COLORS-OPEN-ITEMS** NO-GO · P2 · BLOCKER_TECHNIQUE — Colors : redirection des actions suspendues (R1, UX), écran /utilisateurs « ComingSoon »
- 🟨 **COLORS-LICENSED-CHART** DECISION_REQUIRED · P2 · DECISION_REQUIRED — Nuancier sous licence / OCR (DPA requis)

### OPERATIONS

- ✅ **OPS-SUPPORT** GO — Processus support premiers clients (support@elsatia.fr, priorités P0-P3, fil in-app, aucun SLA promis)
- 🌐 **OPS-ROLLBACK** REMOTE_PROOF_REQUIRED · P1 · BLOCKER_REMOTE — Go-live et rollback Production documentés, jamais répétés sur la lignée V6
- 🌐 **OPS-V6-PRODUCTION** REMOTE_PROOF_REQUIRED · P0 · BLOCKER_REMOTE — Production (app.elsatia.fr) sur une lignée antérieure : V6 jamais déployé
- ⛔ **OPS-PREFLIGHT-ENFORCEMENT** NO-GO · P1 · BLOCKER_TECHNIQUE — Préflight d'environnement : « enforce » en Preview, pas encore en Production (F-PREFLIGHT-ENFORCEMENT)
- 🟨 **OPS-CRONS-FAIL-OPEN** DECISION_REQUIRED · P1 · DECISION_REQUIRED — FEATURE_CRONS_ENABLED fail-open (absent = tâches planifiées actives)
