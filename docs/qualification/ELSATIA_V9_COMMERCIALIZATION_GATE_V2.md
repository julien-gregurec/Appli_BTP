# ELSATIA — Gate de commercialisation V2, fondé sur le train V9 FINAL

| | |
|---|---|
| Date | 2026-10-02 |
| Train de référence | **V9 FINAL** `6392131aa02cecc9991358915963068de8292d24` : 389 migrations, dernière `20261002001113`, verdict `ELSATIA CANONICAL TRAIN V9 FINAL LOCALLY QUALIFIED` (`ELSATIA_CANONICAL_TRAIN_V9_FINAL_CONVERGENCE_V1.md`) |
| Remplace | `ELSATIA_COMMERCIALIZATION_READINESS_GATE_V1.md` (base V6 `9102ec80`, 28/09) et `ELSATIA_GP_COMMERCIALIZATION_READINESS_GATE_V1.md` (base V8 `53b4bc7`, 01/10). Ces deux rapports ne sont **plus** une source de vérité : chacune de leurs lignes a été revérifiée sur V9 ou marquée STALE |
| Branche | `claude/youthful-cori-j4y3ci` = V9 FINAL + ce rapport, **sans aucune autre modification** |
| Actions distantes | **Aucune.** Pas de Production, pas de Stripe Live, pas d'écriture en Preview, pas de merge |
| Accès hébergé | **Refusé depuis cette session.** Le proxy sortant renvoie `CONNECT 403` vers `elsatia-preview.vercel.app`, `app.elsatia.fr` et `pgvvpqyjziyapbbkydmc.supabase.co` (relevé du 02/10). L'état hébergé est donc repris des rapports cités et reste **non vérifié** ici |

## Méthode et règle de preuve

- **V9.** Une preuve produite sur V9 FINAL est reprise telle quelle : rapport de convergence, pgTAP, Playwright, concurrence, drill. Les travaux déjà qualifiés ne sont **pas** refaits.
- **Antérieure.** Une preuve sur V6, V7 ou V8 seulement est marquée **STALE** et ne vaut pas GO, sauf si le code concerné est inchangé et rejoué dans V9.
- **Hébergé.** Ce qui dépend de l'hébergé n'est jamais GO sans preuve hébergée.
- **Nouvelles preuves de cette mission** (locales, PostgreSQL 16 réel) :
  - `rebuild_db.sh gate_v9_fresh` → **`OK: 389 migrations applied cleanly`** ;
  - interrogation du catalogue `pg_proc` / `pg_policy` / `pg_trigger` de cette base, pour l'inventaire `*_service` (§C) et pour SEC-4 (§D) ;
  - lecture du code à `6392131`, avec références `fichier:ligne`.
- **Statuts.** Exactement `GO`, `PARTIAL`, `BLOCKED`, `DECISION_REQUIRED`, `NOT_IN_SCOPE`.
- **Priorités.**
  - P0 : bloque la commercialisation web (gate B).
  - P1 : nécessaire rapidement (avant ou juste après l'ouverture).
  - P2 : amélioration post-lancement.

---

## 0. Tableau de synthèse

Abréviations des colonnes : **Pilote ?** = bloquant pour le gate A ; **Commercial ?** = bloquant pour le gate B. Les identifiants `Bxx`, `Dxx` et `Exx` renvoient aux listes du §R.

| # | Domaine | Statut | Preuve (V9 sauf mention) | Pilote ? | Commercial ? | Action |
|---|---|---|---|---|---|---|
| 1 | CANONICAL TRAIN | **GO** | V9 FINAL `6392131`, verdict LOCALLY QUALIFIED ; rejoué ici : 389/389 | Non | Non | D06 : désigner la branche canonique, clore `pensive-bohr`, retirer le 813 non original `23153716` |
| 2 | MIGRATIONS | **PARTIAL** | 389/389, ledger 9/9. Mais **11 RPC appelées par le code sont absentes du schéma** (§C, catalogue réel) | Non (si relances auto, push et import paie restent OFF) | **Oui** | **B01** |
| 3 | UPGRADE | **PARTIAL** | 372 → 389 : 0 écart, 117/117 empreintes, contrôles 47/47 + 33/33. **Aucun harnais** Production (ledger 210) → 389 | Non | **Oui** | **B04** |
| 4 | MULTI-TENANT / RLS | **GO** (local) | sonde 2 499 cellules, 51 baisses toutes expliquées par Security V2 ; S03 et S04 ; pgTAP 8 917 ok. SEC-4 résiduel, P1 (§D) | Non | Non | RLS hébergée à prouver par B02 |
| 5 | AUTH | **PARTIAL** | GoTrue réel : scénarios pilote verts. B1 (`…1113`) **fail-closed** : sans la migration ou sans `RATE_LIMIT_HMAC_KEY`, **toute connexion est refusée** (`src/lib/login-rate-limit.ts:94-100`) | **Oui** (config) | **Oui** (config) | E01, E04 ; migration poussée **avant** le code |
| 6 | AAL2 plateforme | **GO** (code / local) | `plateforme_exiger_session_aal2()` (`20260826000237`), 77 appels ; proxy `/plateforme` → MFA (`src/lib/supabase/proxy.ts:135-150`) ; enrôlement `MfaSecurityPanel` | Non | Non | E01 : TOTP activé sur le projet hébergé |
| 7 | PER-APP ENTITLEMENTS | **GO** (local) | concurrence Per-App 27/27 sur V9 ; suspension commerciale par application (`…0804`) | Non | Non | — |
| 8 | GESTION PRO | **GO** (local) | Playwright **85/85** ; bancs PostgREST 89 / 50 / 5 / 4 / 24 ; recette backend 69 PASS / 1 FAIL / 1 MANUAL. **PE-04 = artefact de harnais** (§F) | Non | Non | Relances auto et push : voir 17 et 18 |
| 9 | COLORS | **PARTIAL** | Vitest 431 et build sur V9 ; qualification fonctionnelle STALE (branche à 321 migrations) ; rien en hébergé | Non | Non (hors gate B) | Gate C |
| 10 | TOOLS | **PARTIAL** | Vitest 2 150 et build sur V9 ; entitlement cloud-sync STALE ; Relevé Lots 10-11 **hors V9, non promis** (§H) | Non | Non | Gate C |
| 11 | RÉSERVES | **PARTIAL** | Vitest 226 et build sur V9 ; qualification STALE (V2/V3) ; Storage, GoTrue et e-mail hébergés non prouvés | Non | Non | Gate C |
| 12 | STUDIO | **NOT_IN_SCOPE** | OFF au lancement ; projet dédié (23 migrations), Vitest 343 sur V9 ; hébergeur du worker non décidé | Non | Non | — |
| 13 | BILLING | **PARTIAL** | pgTAP Stripe 23 + lifecycle ; concurrence 22/20/7/15 sur V9. Contrats 69/199/399 non rapprochés ; comptes supplémentaires cassés (RPC absente, B01) | Non (D04) | **Oui** | D08, D09, D10, B01 |
| 14 | STRIPE TEST | **PARTIAL** | Code P1-P5 et P7 en place (§A). **Jamais exécuté en strict contre Stripe Test sur V9** : dernière preuve verte au 08/09, lignée antérieure | Non | **Oui** | **B03** |
| 15 | STRIPE LIVE READINESS | **BLOCKED** | `identite-vendeur.ts:61-66` : adresse et TVA en DECISION_REQUIRED ; `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE=false` ; aucun Price ni webhook Live | Non | **Oui** | D01, D02, D03, B06, E06 |
| 16 | EMAIL | **PARTIAL** | transport Brevo fail-closed (`packages/email/src/brevo.ts:21-23,110`) ; smoke 13/13. Sans `ELSATIA_APPLICATION_ENV=production`, aucun envoi Brevo ; gabarits Auth à reporter dans le Dashboard | **Oui** (config) | **Oui** (config) | E01, E02, E09 |
| 17 | CRON / RELANCES | **BLOCKED** | `CRON_SECRET` fail-closed (GO). Relances **automatiques** cassées : 3 RPC absentes. `FEATURE_CRONS_ENABLED` encore **fail-open** (`src/lib/preview-features.ts:5-7`). Relances **manuelles** OK (chemin session) | Non (relances auto OFF) | **Oui** | B01, D07, E03 |
| 18 | PUSH | **BLOCKED** | web push GP : 4 RPC `push_*_service` absentes ; VAPID et webhook de base non configurés. Push natif : inexistant | Non | Non si non promis (corrigé par B01) | B01, E10 |
| 19 | DOCUMENTS / PDF | **GO** (local) | PDF Chromium **24/24** sur V9 ; file PDF bornée. SEC-5 (DoS anonyme), P1 | Non | Non | E12 (budget PDF), SEC-5 |
| 20 | STORAGE | **PARTIAL** | 19 buckets et policies prouvés en local (storage-api réelle, STALE V8) ; **jamais vérifiés sur le Storage hébergé** | Oui (via B02) | Oui (via B02) | `storage-smoke` dans B02 |
| 21 | RGPD | **PARTIAL** | purge et rétention **fail-closed** (`duree_requise`, planificateur OFF) ; export **entreprise** présent (`api/rgpd/export`) ; lot export RGPD ultérieur **non inclus** (§G) | Non | Non (P1) | D11 |
| 22 | LEGAL CONSENT | **GO** (technique) | `…0901` : versions CGU 1.0, CGV 1.0, DPA 2026-08-24 ; acceptation atomique à la création (`src/app/actions/entreprise.ts:54-71`) et avant Stripe (`abonnement.ts:78`) ; pgTAP 45/45, LG01 | Non | Non | D12 : comptes existants, salariés, ré-acceptation |
| 23 | CGU | **PARTIAL** | texte versionné, page `/cgu` ; marqué « brouillon à faire relire » (`docs/juridique/README.md:5`) | Non | Non (relecture P1) | E13 |
| 24 | CGV | **BLOCKED** | placeholder `[EDITEUR_MENTION_TVA]` (`cgv.md:29`) → « à confirmer » ; prix HT vs régime non décidé | Non | **Oui** | D02 → B05 |
| 25 | DPA | **PARTIAL** | publié `/dpa` ; renvoie à un registre interne non publié | Non | Non (P1) | B05, E13 |
| 26 | SELLER IDENTITY | **DECISION_REQUIRED** | EI Julien GREGUREC, SIREN 850 559 873, RCS Strasbourg, SIRET …00011 : PROUVÉS. **Adresse** : DECISION_REQUIRED (`identite-vendeur.ts:61-64`), alors que `mentions-legales.md:10` publie déjà une adresse « à revérifier » | Non | **Oui** | D01 |
| 27 | TVA | **DECISION_REQUIRED** | `regimeTva` et n° de TVA en DECISION_REQUIRED (`identite-vendeur.ts:65-66`) ; `LEGAL_TVA_REGIME_CONFIRME=false` ; `tax_id_collection` absent | Non | **Oui** | D02 → B05, B06 |
| 28 | INCIDENT RESPONSE | **GO** (local) | drill **91/91** sur V9 ; mode sûr en base ; RBAC AAL2 | Non | Non | exercice hébergé P2 |
| 29 | BACKUP / RESTORE | **PARTIAL** | DR guard 10/10 sur V9 ; restauration locale DR V2 STALE (V5) ; **aucune sauvegarde hébergée restaurée** ; passphrase du volume DR sans dépositaire (P0 du manifeste) | **Oui** (minimum : sauvegarde managée active) | **Oui** | **B07**, E08 |
| 30 | MONITORING | **PARTIAL** | Sentry câblé (`sentry.server.config.ts`), `/api/health` 503 sur panne ; DSN hébergé, alertes et sonde externe non prouvés | Non | Non (P1) | E07 |
| 31 | PERFORMANCE | **PARTIAL** | B1, B2 et B4 fermés dans V9 (bancs > 1 000 lignes) ; B3 sous conditions (heap, `PDF_CONCURRENCE`) ; aucune mesure hébergée ; `V8-PERF-C1` ouvert | Non | Non (P1) | E12 |
| 32 | MOBILE / SAFARI / IPAD / IPHONE | **PARTIAL** | émulation WebKit Playwright seulement ; aucun appareil réel. V9-01 et V9-02 classés au §E | Non | Non (P1) | test sur appareil réel |
| 33 | ONBOARDING | **PARTIAL** | parcours signup → entreprise + consentement → essai : OK. **Impasse** : ni « Se déconnecter » ni « Retour à l'accueil » pour un utilisateur non rattaché (§E) | Non (pilote accompagné) | Non (**P1**) | correctif P1-01 |
| 34 | SUPPORT / EXPLOITATION | **PARTIAL** | `support@elsatia.fr` marqué PROUVÉ (configuré en Production le 05/09, STALE) ; 16 runbooks et 12 runbooks incident | Non | Non | E07 |
| 35 | DOMAINS / DNS | **PARTIAL** | `app.elsatia.fr` existe (Production, ancienne lignée) ; DKIM Brevo OK, **DMARC `p=none`** ; sous-domaines des autres applications non provisionnés | Non | Non (P1) | E09 |
| 36 | PREVIEW | **BLOCKED** | Preview déclarée à **372** (V8 + 813) : 17 migrations V9 en attente (`db push` sans `--include-all`). Pack repointé 389 / `…1113` / 38. **Non vérifiable d'ici** (403) | **Oui** | **Oui** | **B02** |
| 37 | PRODUCTION CUTOVER | **BLOCKED** | Production sur ledger **210** (ancienne lignée) ; `verify-cutover-docs.mjs:13-21` épinglé sur `996be15` ; aucun harnais 210 → 389 | Non (si pilote hors Production, D05) | **Oui** | **B04** |
| 38 | STORE MOBILE | **NOT_IN_SCOPE** | Tools : comptes Apple et Google absents, signature absente (`docs/mobile-stores/tools/…READINESS_V1.md:14-24`) | Non | Non | gate C ultérieur |

**Décompte des statuts (38 domaines) : 8 GO, 20 PARTIAL, 6 BLOCKED, 2 DECISION_REQUIRED, 2 NOT_IN_SCOPE.**

- GO : 1, 4, 6, 7, 8, 19, 22, 28. Toutes ces preuves sont **locales** sur V9 : **aucune preuve hébergée sur V9**.
- BLOCKED : 15, 17, 18, 24, 36, 37.
- DECISION_REQUIRED : 26, 27.
- NOT_IN_SCOPE : 12, 38.

---

## A. Stripe (lot « Stripe ciblé » `2de34959`, migrations `…1002` et `…1003`)

Il n'existe **aucun rapport de qualification dédié** au lot dans V9. Son plan (`ELSATIA_STRIPE_READINESS_PORT_PLAN_V1.md`) n'est que sur `claude/elegant-turing-b4ewbp`. Preuves dans V9 : pgTAP `stripe_readiness_v9` 23/23, concurrence 27 / 22 / 20 / 7 / 15, Vitest webhook, cron et rapprochement (rapport V9 FINAL §0, §5).

| Point | Objet | Statut | Preuve |
|---|---|---|---|
| P1 | Prix contractuel selon la périodicité (offre **et** périodicité du Price facturé) | GO | `20261002001002…:131-136`. Nuance : le montant enregistré vient du catalogue actif, pas de l'`unit_amount` du Price |
| P2 | Live : aucune facture finale sans identité vendeur ni TVA confirmées | GO (garde) | `src/app/api/stripe/abonnement/webhook/route.ts:309-318` : `invoice.created` Live en brouillon → `suspendreFinalisationFacture` |
| P3 | Verrou d'ouverture enrichi pour le Live | GO (fermé) | `src/lib/commercialisation-abonnements.ts:65-67` ; `ABONNEMENTS_PUBLICS_OUVERTS=false`, `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE=false` (`.env.example:129-132`) |
| P4 | Périodes lues sur `items[]` (API basil) | GO | `src/lib/stripe-abonnement-synchronisation.ts:44-48` |
| P5 | Rapprochement quotidien Stripe → base | PARTIAL | `src/lib/stripe-abonnement-rapprochement.ts:46-70`, idempotent par jour. N'est exécuté que si `FEATURE_CRONS_ENABLED` l'est (D07) |
| P6 | Rejeux automatisés Test Clock | **exclu** du lot | outil de qualification, nécessite une clé Test ; rejeux réels **manuels** (fait partie de B03) |
| P7 | Facture d'essai à 0 € | GO | `20261002001003…:138-158` : `sans_effet / facture_essai_sans_montant` |

| Contrôle demandé | Statut | Preuve |
|---|---|---|
| Prix mensuels | GO | `src/lib/tarification.canonical.json` (CANONICAL-V4-2026-09), `tarification.ts:95-146` : 79 / 249 / 449 / 599 € HT |
| Annuel = mensuel × 10 | GO (code et fichier Test) | 790 / 2 490 / 4 490 / 5 990 € ; `verify-stripe-prices.mjs:195` contrôle le facteur ×10. **Environnements hébergés** : non vérifiables d'ici (le runbook du 06/09 signalait 4 variables `*_ANNUEL` à ×12, corrigées le 08/09 selon le rapport P0) |
| Essai total de 30 jours | GO | `DUREE_ESSAI_JOURS = 30` (`src/lib/acces-socle-essai.ts:41`) ; `trial_end` absolu = min(essai_fin, début + 30 j) (`src/lib/stripe-essai-checkout.ts:79-116`) |
| Pas de double essai | GO | `trial_period_days` n'est jamais envoyé (`stripe-abonnement.ts:505-508`) ; aucun essai s'il reste moins de 48 h ; concurrence essai 7/7 |
| Suspension actuelle | GO | `past_due`, `unpaid`, `incomplete` et `paused` donnent `suspendu`, immédiatement ; suspension par application (`…0804`) ; essai échu fermé en base (`…0803`) |
| Ordre des événements | GO | réservation, filigrane, contrôle du mode Test/Live (`webhook/route.ts:247-284`) ; ordre 15/15 |
| Rapprochement | PARTIAL | voir P5 |
| Facture 0 € pendant l'essai | GO | P7 |
| Contrat selon le Price facturé | GO, avec nuance | P1 |
| Configuration Test | PARTIAL | `config/stripe-prices.test.json` : 27 Price IDs Test réels (`livemode=false`). **Il manque les Prices `STRIPE_PRICE_COMPTE_SUP_<PLAN>_*`** que lit le runtime (`stripe-abonnement.ts:860`). `verify:stripe-prices` sans clé = SKIP (exit 0), donc le « ✅ » du rapport V9 n'est **pas** une exécution stricte |

**Blockers Live** (aucun n'a été levé dans V9) :

| Élément | État | Référence |
|---|---|---|
| Identité vendeur | prouvée, sauf l'adresse | `identite-vendeur.ts:36-67` |
| Adresse vendeur | DECISION_REQUIRED | D01 |
| Régime de TVA et n° de TVA | DECISION_REQUIRED | D02 |
| Ouverture commerciale explicite | `false` | D03 |
| Price IDs Live | absents du dépôt (fichier Test seulement) | E06 |
| Webhook Live | non provisionné, non documenté | E06 |
| Pied de facture | posé **seulement à la création** du client Stripe (`stripe-abonnement.ts:368-377`). Les clients existants gardent leur ancien pied ; aucun `custom_fields` | B06 |
| Anciens clients Stripe et contrats 69/199/399 | **non résolu** : la `…1002` n'écrit aucune donnée et ne réévalue un contrat qu'au prochain changement d'offre | D09 |
| Stripe Tax | `STRIPE_AUTOMATIC_TAX_ENABLED` branché sur le Checkout seulement ; `tax_id_collection` absent | B06 après D02 |
| Portail | `scripts/configurer-portail-stripe.mjs` **ne refuse pas** une clé Live (message seulement, l.24) | P2-04 |

## B. Email

| Point | Statut | Preuve |
|---|---|---|
| `BREVO_API_KEY` | GO (code), configuration requise | absente → `brevoEstConfigure()` faux, boutons masqués, actions en erreur (fail-closed). Exception : la notification d'échec de paiement ne fait que `console.warn` (`abonnement-notifications.ts:52-55`) |
| Garde d'environnement | GO (code) | production seulement si `ELSATIA_APPLICATION_ENV=production` (`environnement.ts:73-91`) ; hors production, `EMAIL_PREVIEW_ALLOWLIST` obligatoire (vide = aucun envoi) |
| Gabarits Auth | PARTIAL | `supabase/templates/confirm_signup.html`, `reset_password.html` (`config.toml:248-254`) ; à reporter dans le Dashboard de chaque projet (A-2) ; invitation et magic link non personnalisés |
| Site URL | config | `site_url` local `127.0.0.1:3000` ; Site URL hébergée = origine GP (runbook Preview V3 :117-118) |
| E-mails Auth | config | inscription, reset GP / Colors / Tools par SMTP Supabase |
| E-mails applicatifs | GO (code) | B1 devis/facture avec lien (`documents-envoi.ts:137`), B3/B4 relance manuelle, B5 CRM, B6 échec de paiement, B7 support, R1/R2 Réserves. **B2 relance automatique cassée** (B01) |
| Multi-application | DECISION_REQUIRED (gate C) | A-1 : Tools redirige encore vers `window.location.origin` ; le gabarit Supabase pointe vers `/auth/confirm` de GP |
| A-5 (jeton Studio consommé au GET), A-6 (idempotence B1/B5) | ouverts en code | P2 (Studio OFF) / P1-07 |

## C. Cron et fonctions `*_service` : inventaire refait sur V9 389

**Preuve.** Base neuve `gate_v9_fresh` (389/389). Les 30 noms `*_service` appelés par `.rpc('…')` dans `src/`, `apps/*/src` et `packages/` ont été confrontés à `pg_proc` :

- **19 présentes**, toutes exécutables par `service_role` seul (`anon = false`, `authenticated = false`) ;
- **11 ABSENTES** du schéma (et de tout fichier `supabase/`).

| RPC absente | Appelant | Effet |
|---|---|---|
| `relances_auto_parametres_service` | `src/lib/relances-config.ts:51` | cron des relances automatiques en échec |
| `relances_auto_candidats_service` | `src/lib/relances-moteur.ts:124` | idem |
| `relance_document_service` | `src/lib/relances-moteur.ts:114` | idem |
| `relance_nouveau_lien_partage_service` | `src/lib/documents-partage.ts:32` | lien des relances automatiques |
| `push_notifications_en_attente_service` | `src/app/api/cron/notifications-push/route.ts:20` | cron push |
| `push_preparer_notification_service` | `src/lib/push.ts:63` | envoi push |
| `push_supprimer_abonnement_service` | `src/lib/push.ts:81` | nettoyage push |
| `push_marquer_notification_envoyee_service` | `src/lib/push.ts:86` | envoi push |
| `compter_comptes_application_service` | `src/lib/stripe-abonnement.ts:866` | facturation des comptes supplémentaires. Si `STRIPE_PRICE_COMPTE_SUP_<PLAN>_*` est posée, `reconcilierAbonnementStripe` lève une erreur, y compris dans le webhook `checkout.session.completed` (`webhook/route.ts:326`, sans `catch`) : le statut est appliqué mais l'événement échoue et Stripe le relivre. Variable absente : les comptes supplémentaires ne sont jamais facturés |
| `paie_import_preparer_bulletin_service` | `src/app/api/paie/import/route.ts:37` | import de paie en échec |
| `paie_import_enregistrer_bulletin_service` | `src/app/api/paie/import/route.ts:51` | idem |

- **Origine.** La migration ACL `20260902000255` a retiré les lectures directes de `service_role`. Le code a été adapté (commit `02f39d78`), mais la migration compagnon n'a **jamais été numérotée** : elle existe seulement en `docs/migrations-proposees/service-role-flux-acl-v1.sql.proposed` (+ `.pgtap.sql.proposed`), documentée par `docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md` (« Bloquant cutover ») et re-signalée par la red team V3 (l.283-306).
- **Déjà corrigé.** Les fonctions Stripe Connect et Boutique que la V3 signalait absentes **existent** désormais (`…0326`, `…0506`).
- **Ce qui marche.** Les relances **manuelles** passent par le chemin session (RLS) et ne sont pas touchées (`relances-moteur.ts:102-105`).
- **Conclusion.** Le problème **existe toujours sur V9**. Effet : aucune corruption (chaque appelant lève une erreur), mais 4 fonctions vendables sont non fonctionnelles.

**Crons.**

| Cron | Planning | Garde | État |
|---|---|---|---|
| `/api/cron/abonnements` | 03:15 (`vercel.json`) | `CRON_SECRET` absent → 503 | `marquer_factures_en_retard` toujours exécuté ; le reste (rapprochement, suspensions, paie, capacité, purge) derrière `FEATURE_CRONS_ENABLED`, **fail-open** (`!== "false"`), constat `F-FLAG-CRONS-FAIL-OPEN` |
| `/api/cron/notifications-push` | 03:45 | `CRON_SECRET` | cassé (B01) |
| Réserves `/api/cron/notifications` | 04:30 (`apps/reserves/vercel.json`) | `CRON_SECRET`, comparaison à temps constant | GO (code) |
| Relances automatiques | dans le cron abonnements | `FEATURE_RELANCES_AUTO_ENABLED` **fail-closed** | cassées (B01) ; la page `parametres/relances` permet pourtant de les régler |

## D. Sécurité : SEC-4, SEC-5 et SEC-6

| ID | Ce que c'est | Classement | Contre-preuve | Gravité | Priorité |
|---|---|---|---|---|---|
| SEC-4 | Policy UPDATE de `utilisateurs` sans `WITH CHECK` : un utilisateur peut écrire n'importe quel `entreprise_active_id` | **STILL_OPEN** | catalogue V9 : policy « un utilisateur modifie son profil », `USING (id = auth.uid())`, **`<NO WITH CHECK>`** ; seul trigger : `incident_garde_ecriture`. La `…1001` ne la touche pas | faible à moyenne. La RLS métier ne s'y fie pas (`est_membre_actif` passe par `utilisateurs_entreprises`), mais `contexte_abonnement_courant()` (SECURITY DEFINER, `…0804:446-458`) renvoie le nom, la référence, le logo et le statut d'abonnement du tenant visé, si l'on en connaît l'UUID | P1 |
| SEC-5 | Pas de limitation de débit sur le PDF de partage anonyme | **STILL_OPEN** | `politiquesRateLimitPour` renvoie `[]` sans session hors Stripe (`src/lib/security/rate-limit.ts:42`) ; Chromium démarre **avant** la validation du jeton (`api/documents/partage/[token]/pdf/route.ts:13-23`) | déni de service : une rafale anonyme sature la file PDF (503) pour tous les tenants. Pas de risque de deviner les jetons (256 bits) | P1 |
| SEC-6 | Import de paie : secret global, tenant pris dans le corps | **STILL_OPEN** | `api/paie/import/route.ts:5-17,30` | vecteur de fraude à la paie si le secret fuite (atténué : 30 req/5 min, bulletins `a_verifier`). **Route cassée de toute façon** (B01) | P1, ou NOT_IN_SCOPE si l'import n'est pas ouvert au lancement (D13) |

- **Autres résidus.** RT-V3 P2/P3 toujours ouverts : oracle `acces_module_pour_permission`, route QR sans contexte, `document_commercial_par_token` accordé à anon. Tous P2.
- **Fermé dans V9.** RT-02 en lecture (Security V2 `…1001`, contrôle S04) et RT-01 (redirections résiduelles).

## E. Onboarding et UX V9

- **Impasse d'onboarding — PARTIAL, P1.**
  - Le constat : aucune page `src/app/onboarding/{page,besoins,demarrage}` n'offre « Se déconnecter » ni « Retour à l'accueil », et il n'existe pas de `onboarding/layout.tsx`. `/` et `/login` renvoient vers `/dashboard`, qui renvoie vers `/onboarding`.
  - Échappatoires cachées : saisir l'URL `/en-attente` ou `/abonnement-suspendu` (bouton de déconnexion), ou effacer les cookies. Les sessions ne s'éteignent pas d'elles-mêmes (rotation du refresh, timebox commentée).
  - Gravité commerciale : aucune perte de données, aucun risque de sécurité. Mais tout visiteur inscrit qui ne crée pas d'entreprise (prospect, salarié qui attend une invitation, mauvais compte) est **bloqué**, d'où charge support et image dégradée en self-service.
  - Correctif : un formulaire `logoutAction` et un lien d'accueil.
  - **Non bloquant pilote** (pilote accompagné). **Fortement recommandé avant l'ouverture** web, sans être P0 : un contournement existe et rien n'est perdu.
- **V9-01 : `datetime-local` et fuseau du serveur — PARTIAL, P1.** Aucun `TZ` n'est posé et aucune conversion Paris → UTC n'est faite.
  - **Non affectés.** Les pointages : `declarer_pointage_oublie` convertit avec `at time zone 'Europe/Paris'`.
  - **Décalés de 1 à 2 h :**
    - échéance d'appel d'offres (`appels-offres/page.tsx:31`) : la plus sensible pour l'utilisateur ;
    - rappel CRM (`crm/page.tsx:32`) ;
    - date de réception des e-mails de chantier ;
    - fenêtres d'accès aux applications et communications côté plateforme (`actions/multi-app.ts:16-21`).
  - Non bloquant pilote. Non P0 commercial : aucune donnée financière n'est touchée.
- **V9-02 : Safari, impossible d'effacer une date de fin — PARTIAL, P2.**
  - Aucun contrôle « effacer » n'existe.
  - Champs concernés : `pause_jusqu_au` des relances (contournement : saisir une date passée), `carte_btp_expiration`, échéance plateforme, fin de remise.
  - Non vérifié sur appareil réel.

## F. Recette GP : PE-04

Le seul FAIL de la recette backend (69 / 1 / 1, identique à V8) est **un artefact de harnais** :

- `run_pilot_acceptance_v2.mjs:430` fait `update employes … returning carte_btp_numero`.
- Or `carte_btp_numero` est **fermé en lecture directe** par le durcissement Employés `…0701` (privilèges de colonne). Le `RETURNING` exige ce droit de lecture et échoue donc.
- L'application écrit sans `RETURNING` et relit par `employes_fiche` (`src/app/actions/employes.ts:273-287`).
- Le scénario est couvert par Playwright Employés 15/15 sur V9.

Priorité P2 : corriger le harnais.

## G. RGPD dans le train 389 (lot export RGPD ultérieur exclu)

- **Présent.**
  - Purge DELETE / ANONYMIZE / RETAIN avec journal et reprise ; planificateur **OFF** par défaut ; mode `execute` subordonné à `RGPD_PURGE_DECISION_REF`.
  - Rétention **fail-closed** (`duree_requise`).
  - Export **entreprise** (`exporter_donnees_entreprise`, `api/rgpd/export`, `parametres/donnees`) ; suppression d'entreprise avec 30 jours de grâce ; anonymisation d'un salarié.
  - Politique de confidentialité et registre des sous-traitants (Supabase eu-west-3, Vercel fra1, Stripe, Brevo, Sentry « région à confirmer », OpenAI US `store:false`).
- **Absent dans 389.** Export par utilisateur ou par salarié (lot `…1201-1202` non retenu par décision du 02/10).
- **Écart.** La CGV promet la suppression 30 jours après la fin, mais aucune purge planifiée n'est active (décision D11).
- **Statut.** PARTIAL. **Non bloquant** pour le pilote ou pour l'ouverture, parce que tout est fail-closed (rien n'est supprimé à tort). P1 : D11.

## H. Relevé Lots 10-11

Les lots `…1114-1116` sont **volontairement hors V9 FINAL**. Rien dans la grille commerciale de Gestion Pro (`tarification.canonical.json`) ne les promet. Ils ne sont **pas** classés blockers GP : NOT_IN_SCOPE pour les gates A et B, candidat V10 pour le gate C.

## I. Preview et Production : état réel connu

| Élément | État | Source |
|---|---|---|
| Ledger Preview hébergé | **372** (V8 + 813 original) déclaré ; 17 migrations V9 en attente | V9 FINAL, en-tête et §0 |
| Hotfix 813 | issu d'une erreur **observée sur la Preview hébergée** (25006 sur `/plateforme`) | commit `de50245a` |
| Pack Preview | attendus 389 / `…1113` / 38 ; en-tête qui cite encore une réf. V8 | `ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md` |
| Production | ancienne lignée, ledger **210** ; cible de cutover épinglée `996be15` | `scripts/verify-cutover-docs.mjs:13-21`, runbook préflight |
| Vérification dans cette mission | **impossible** : `CONNECT 403` | — |

---

## P. Priorités

### P0 : bloque la commercialisation web (gate B)

Sept P0, B01 à B07. Le détail est au §R.

| ID | Sujet |
|---|---|
| B01 | 11 fonctions `*_service` absentes |
| B02 | V9 non déployé ni qualifié en hébergé (Preview) |
| B03 | Stripe Test bout en bout jamais exécuté sur V9 |
| B04 | Montée de la Production 210 → 389 sans harnais |
| B05 | Placeholders légaux (CGV, mentions) |
| B06 | Facturation conforme : TVA et pied de facture vendeur, y compris pour les clients existants |
| B07 | Sauvegarde hébergée prouvée par une restauration |

Absences volontaires dans cette liste (pas de faux P0) :
- l'impasse d'onboarding ;
- SEC-4, SEC-5 et SEC-6 ;
- V9-01 ;
- la relecture par un avocat ;
- les apps Colors, Tools et Réserves ;
- Studio ;
- le mobile réel.

### P1 : nécessaire rapidement

| ID | Sujet | Type |
|---|---|---|
| P1-01 | Onboarding : « Se déconnecter » + « Retour à l'accueil » | code |
| P1-02 | SEC-4 : `WITH CHECK` (ou trigger) d'appartenance active sur `entreprise_active_id` | code (migration) |
| P1-03 | SEC-5 : limitation de débit anonyme sur `/api/documents/partage/*`, `/imprimer/partage/*` et `/document/*`, et validation du jeton avant Chromium | code |
| P1-04 | SEC-6 : secret d'import de paie par tenant (si l'import est ouvert, D13) | code |
| P1-05 | V9-01 : conversion Europe/Paris des `datetime-local` (appels d'offres, CRM, e-mails de chantier, plateforme) | code |
| P1-06 | `FEATURE_CRONS_ENABLED` fail-closed (`F-FLAG-CRONS-FAIL-OPEN`) | code + décision D07 |
| P1-07 | Idempotence des envois B1 et B5 (A-6) ; notification d'échec de paiement silencieuse quand Brevo est absent | code |
| P1-08 | Monitoring hébergé : DSN Sentry, alertes, sonde de disponibilité externe | config (E07) |
| P1-09 | Performance : heap Node, `PDF_CONCURRENCE`, préchauffage, mesure hébergée | config (E12) |
| P1-10 | Relecture des CGU, CGV, DPA et de la politique de confidentialité par un avocat | externe (E13) |
| P1-11 | RGPD : durées de conservation, photos et GPS, activation du planificateur de purge | décision D11 |
| P1-12 | Consentement : entreprises existantes, salariés, ré-acceptation | décision D12 |
| P1-13 | Test sur iPhone, iPad et Safari réels (GP en PWA) | manuel |
| P1-14 | DMARC au-delà de `p=none` ; SPF et DKIM vérifiés | config (E09) |

### P2 : après le lancement

| ID | Sujet |
|---|---|
| P2-01 | V9-02 : bouton « effacer la date » |
| P2-02 | RT-V3 P2/P3 : oracle, route QR, RPC anon |
| P2-03 | Comparaison `CRON_SECRET` à temps constant dans les crons GP |
| P2-04 | Le script du Portail refuse une clé Live |
| P2-05 | Harnais PE-04 |
| P2-06 | `V8-PERF-C1` |
| P2-07 | Exercice du mode sûr en hébergé |
| P2-08 | Rejeux Stripe P6 automatisés |
| P2-09 | Essai par SIREN, collecte du SIREN et de la TVA client (D16) |

---

## Gates

### GATE A — Pilote client (Gestion Pro, client accompagné)

Le code est prêt en local : GP 85/85 Playwright, recette backend verte hors artefact, Billing, Per-App et RLS qualifiés sur V9. **Il manque un environnement hébergé V9 prouvé.**

Conditions restantes :
- **B02**, avec E01 à E04 ;
- E08 au minimum : sauvegarde managée active ;
- décisions **D04** (facturation du pilote : essai, abonnement manuel ou hors ligne) et **D05** (environnement du pilote).

B01 n'est **pas** requis à une condition : garder `FEATURE_RELANCES_AUTO_ENABLED=false`, ne pas configurer le push ni l'import de paie, et le dire au pilote.

### GATE B — Ouverture commerciale web limitée (Gestion Pro)

Il faut le gate A, plus :
- les blockers **B01, B03, B04, B05, B06 et B07** ;
- les décisions **D01, D02, D03, D06, D07, D08, D09, D10 et D13** ;
- les configurations **E05, E06, E09 et E11**.

### GATE C — Écosystème complet (GP + Colors + Tools + Réserves)

Il faut le gate B, plus :
- des projets Vercel et des domaines par application ;
- des preuves hébergées pour Colors, Tools et Réserves (Storage, GoTrue, e-mail) ;
- les produits Stripe par application ;
- les décisions **D14 et D15** ;
- la configuration **E14**.

Studio, le store mobile et Relevé 10-11 restent hors périmètre.

---

## R. Résultat final

```
PILOT_GATE             = BLOCKED   (code prêt en local ; manque : V9 hébergé prouvé B02 + E01-E04, E08 minimal, décisions D04 et D05)
WEB_COMMERCIAL_GATE    = BLOCKED   (7 blockers P0 B01-B07 ; décisions D01-D03, D06-D10, D13 ; configurations E05, E06, E09, E11)
ELSATIA_ECOSYSTEM_GATE = BLOCKED   (gate B + preuves hébergées Colors, Tools, Réserves ; D14, D15 ; E14)

BLOCKERS_REMAINING              = 7
DECISIONS_REQUIRED              = 16
EXTERNAL_CONFIGURATION_REQUIRED = 14
```

### Blockers (P0)

Chaque ligne donne la nature du travail, sa dépendance, s'il peut avancer en parallèle et son rang dans l'ordre recommandé (« Ordre »).

| ID | Tâche | Dépendance | Code ou config | En parallèle ? | Ordre |
|---|---|---|---|---|---|
| **B01** | Numéroter `service-role-flux-acl-v1.sql.proposed` après `20261002001113`, sans les parties Boutique et Connect déjà présentes : les 11 fonctions, `service_role` seul. Rejouer son pgTAP, mettre à jour les attendus (390), puis requalifier le train : fresh, upgrade 372 → 390, pgTAP, cron des relances et du push contre PostgREST réel | aucune | **code** (1 migration + tests) | oui, dès maintenant, en parallèle de B04, B05 et B06 et des décisions | 1 |
| **B02** | Déployer V9 (ou V9 + B01) sur la Preview : `preview:backup`, lecture du ledger (372 attendu), `db push` (17 ou 18 migrations, **migrations avant code** pour B1), build Vercel, puis `db-verify`, `env-check`, `http-smoke`, `storage-smoke` et la recette pilote distante | D05, D06 ; E01 à E04 ; un poste opérateur avec réseau et identifiants (session cloud refusée) | **exécution** + configuration | oui avec B05 et B06 ; en série après B01 si l'on veut un seul passage | 2 |
| **B03** | Stripe Test bout en bout sur la Preview V9 : `verify:stripe-prices --strict`, webhook signé réel (`STRIPE_WEBHOOK_EXPECTED_MODE=test`), Checkout avec essai de 30 jours, facture d'essai à 0 €, échec de paiement → suspension, Portail, réabonnement, rejeux manuels (P6), rapprochement par cron | B02 ; E05 ; D07 (crons actifs) ; D08 (Prices des comptes supplémentaires) | **exécution** + configuration | oui avec B05, B06 et B07 | 3 |
| **B04** | Harnais de montée de la Production : copie du ledger 210 → 389 (ou 390), répétition sur une copie restaurée, contrôles d'empreintes et de RLS, mise à jour de `verify-cutover-docs.mjs` et du runbook de cutover, plan de retour arrière | lecture du ledger Production (opérateur) ; B07 (sauvegarde restaurable) | **code** (harnais) + **exécution** | harnais en parallèle de B01 ; exécution en dernier | harnais 1 ; exécution 7 |
| **B05** | Renseigner `[EDITEUR_MENTION_TVA]`, `[EDITEUR_SIRET]` et `[EMAIL_SUPPORT]` (`cgv.md:29`, `mentions-legales.md:12-14`), aligner l'adresse publiée sur la décision, publier une nouvelle version des documents légaux (`documents_legaux_versions`) | **D01, D02** | **code / texte** (+ E11) | oui | 4, dès D01 et D02 |
| **B06** | Facturation conforme : régime de TVA dans Stripe (Stripe Tax, ou mention 293 B sur les factures), `tax_id_collection` si assujetti, pied de facture vendeur appliqué **aussi aux clients Stripe existants**, test sur une facture Test | **D02**, D01 ; B03 pour la vérification | **code** + configuration (E06) | oui avec B05 | 5 |
| **B07** | Sauvegarde hébergée prouvée : sauvegardes managées ou PITR actives, copie du Storage, **restauration réelle** sur un projet jetable avec contrôle d'empreintes, dépositaire de la passphrase du volume DR (`F-DR-VOLUME-PASSPHRASE`) | E08 ; B02 pour l'environnement de test | **configuration + exécution** | oui avec B03 | 6 |

L'ordre recommandé tient en trois vagues :
1. **Tout de suite, en parallèle** : B01, le harnais B04 et les décisions D01 à D10.
2. **Ensuite** : B02, puis B03 et B07 en parallèle, pendant que B05 et B06 avancent dès que D01 et D02 sont prises.
3. **Pour finir** : provisionnement Live (E06), exécution de B04, puis ouverture (D03).

### Décisions propriétaire (16)

| ID | Décision | Débloque | Gate |
|---|---|---|---|
| D01 | Adresse vendeur publiée : adresse personnelle ou domiciliation | B05, B06, Live | B |
| D02 | Régime de TVA : franchise 293 B ou assujettissement (+ n° intracommunautaire) ; cohérence avec l'affichage HT | B05, B06, Stripe Tax, Live | B |
| D03 | Ouverture commerciale : `ABONNEMENTS_PUBLICS_OUVERTS`, `ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, date | Live | B |
| D04 | Facturation du pilote : prolonger l'essai, abonnement manuel ou hors ligne (`V8-PILOTE-ESSAI-ECHU`) | gate A | A |
| D05 | Environnement du pilote et inventaire Preview (`PREVIEW-PROJECT-INVENTORY`, plan Supabase) | B02 | A |
| D06 | Branche canonique V9 (`V9F-INTEGRATION-BRANCH`) ; clore ou rebaser `pensive-bohr` ; retirer le 813 non original `23153716` | B02 | A/B |
| D07 | `FEATURE_CRONS_ENABLED` fail-closed ; relances automatiques et push vendus au lancement ou non | B03, P1-06 | B |
| D08 | Comptes supplémentaires : modèle par rôle ou par forfait (`STRIPE-SUPPLEMENTARY-ACCOUNTS`) et Prices correspondants | B03 | B |
| D09 | Anciens contrats 69/199/399 et anciens clients Stripe (`BILLING-CONTRATS-PRIX-69`) | Live | B |
| D10 | Changement de plan vers le bas par le Portail (`BILLING-DESCENTE-PORTAIL`) | B03 | B |
| D11 | Durées de conservation (contrat A/B/C, matrice), photos et GPS de pointage, activation de la purge | P1-11 | B (P1) |
| D12 | Consentement des entreprises existantes, des salariés, ré-acceptation, conservation des preuves | P1-12 | B (P1) |
| D13 | Import de paie ouvert au lancement ou non (SEC-6) | P1-04 | B |
| D14 | Routage Auth par application (A-1) et relais Colors (A-7) | gate C | C |
| D15 | Grilles Stripe des autres modules : `STRIPE-MODULE-PRICE-MODEL`, `IA-OPTIONS`, `LEGACY-GENERATIONS`, `STORAGE-BLOCK` | gate C | C |
| D16 | Essai unique par SIREN ; collecte du SIREN et de la TVA client (`BILLING-ESSAI-PAR-SIREN`, `BILLING-DONNEES-CLIENT`) | P2-09 | P2 |

### Configurations externes : prestataire, secret ou réglage (14)

| ID | Configuration | Où | Gate |
|---|---|---|---|
| E01 | Projet Supabase V9 actif ; Auth : Site URL, URLs de redirection, TOTP, SMTP Brevo, gabarits (A-2) | Dashboard Supabase | A |
| E02 | `ELSATIA_APPLICATION_ENV`, `EMAIL_PREVIEW_ALLOWLIST` (Preview), `BREVO_API_KEY`, `EMAIL_FROM_*`, `SUPPORT_EMAIL` | Vercel | A |
| E03 | `CRON_SECRET` (GP et Réserves), `FEATURE_CRONS_ENABLED`, `FEATURE_RELANCES_AUTO_ENABLED`, plannings | Vercel | A |
| E04 | `RATE_LIMIT_HMAC_KEY` ; migration `…1113` appliquée **avant** le code | Vercel + Supabase | A |
| E05 | Stripe Test : `STRIPE_SECRET_KEY` test, `STRIPE_WEBHOOK_ABONNEMENT_SECRET`, `STRIPE_WEBHOOK_EXPECTED_MODE=test`, `STRIPE_PRICE_*` (fichier Test + comptes supplémentaires), endpoint webhook, Portail | Stripe Test + Vercel | B |
| E06 | Stripe Live : KYC, identité et branding vendeur, pied de facture, Prices Live, webhook Live, clés Live en Production seulement, Stripe Tax selon D02 | Stripe Live + Vercel Production | B |
| E07 | DSN Sentry, alertes, sonde de disponibilité externe, astreinte | Sentry + outil de supervision | B (P1) |
| E08 | Plan Supabase avec sauvegardes quotidiennes et PITR ; copie du Storage ; dépositaire de la passphrase DR | Supabase + stockage externe | A (minimum) / B |
| E09 | DNS : SPF et DKIM vérifiés, DMARC au-delà de `p=none`, `app.elsatia.fr` vers le déploiement V9 | registrar + Brevo + Vercel | B |
| E10 | Web push : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, Database Webhook sur `notifications_utilisateurs`, `NOTIFICATIONS_WEBHOOK_SECRET` (après B01) | Vercel + Supabase | B si le push est vendu (D07) |
| E11 | `NEXT_PUBLIC_LEGAL_SIRET` (Preview), `NEXT_PUBLIC_LEGAL_TVA`, `LEGAL_TVA_REGIME_CONFIRME` (après D02) | Vercel | B |
| E12 | `NODE_OPTIONS` (heap), `PDF_CONCURRENCE`, mémoire des fonctions | Vercel | B (P1) |
| E13 | Relecture juridique des CGU, CGV, DPA et de la politique de confidentialité | avocat | B (P1) |
| E14 | Projets Vercel et domaines `colors.`, `tools.`, `reserves.` ; comptes Apple et Google (Tools, plus tard) | Vercel, registrar, stores | C |

---

## Ce que ce gate n'affirme pas

- **Hébergé.** Rien n'a été vérifié en hébergé (proxy 403). L'état de la Preview (372) et de la Production (210) est celui des rapports cités.
- **Tests repris.** Les chiffres de tests V9 (pgTAP, Playwright, concurrence, drill) viennent du rapport V9 FINAL et n'ont pas été rejoués. Seuls la reconstruction 389/389 et les requêtes de catalogue ont été exécutées ici.
- **Appareils.** Aucun appareil réel n'a été utilisé.
- **Durées.** Aucune durée n'est estimée. L'ordre et les dépendances ci-dessus sont la seule planification fournie.
