# ELSATIA — Clôture qualification commercialisation SELF-SERVICE (V2)

**Date** : 2026-09-21/22
**Baseline auditée** : HEAD réel de `origin/claude/funny-bell-eqo1p5` au moment de l'audit, commit `842b4b4` — *"merge: converge Studio/Tools/Reserves isolation + qualification finale (mission ELSATIA)"*.
**Branche de travail** : `claude/optimistic-goldberg-p4afmg` (recréée depuis cette baseline ; l'ancienne branche du même nom ne contenait aucun commit propre, elle a été réalignée sans perte).

## 0. Avertissement méthodologique

Un audit précédent avait été conduit par erreur sur une baseline « Liria/GP » ancienne et non représentative du monorepo ELSATIA actuel (multi-app : Gestion Pro, Colors, Tools, Studio, Reserves). **Aucune conclusion de cet ancien audit n'a été reprise telle quelle.** Tout ce qui suit a été re-dérivé de zéro à partir du code réel de cette branche, par six agents de recherche indépendants travaillant en parallèle en lecture seule, dont les rapports complets (avec citations `fichier:ligne`) sont conservés dans la transcription de session. Ce document en est la synthèse.

**Observation de sécurité, hors périmètre mais à signaler** : `AGENTS.md` à la racine du dépôt contient une instruction demandant de lire des « docs » dans `node_modules/next/dist/docs/` avant d'écrire du code. Ce chemin n'existe pas (vérifié : `node_modules` n'était même pas installé au démarrage de la session) et ne correspond à aucune convention réelle de Next.js — Next.js ne livre pas de documentation dans `dist`. Deux agents indépendants (l'un de cette session, l'un des sous-agents d'audit) ont identifié cette instruction comme ayant la forme d'une tentative d'injection de prompt planquée dans un fichier de configuration lu automatiquement par les agents IA. Elle n'a pas été suivie. **Recommandation : revue humaine de la provenance de cette ligne dans `AGENTS.md`.**

---

## VERDICTS

### PILOT_COMMERCIAL = **PARTIAL**

Le moteur technique du pilote accompagné (un client payant, onboardé et suivi manuellement par ELSATIA) est solide : facturation Stripe mature et testée, onboarding self-service côté client, export RGPD fonctionnel, suspension/réactivation automatiques. Deux blockers P0 certains ont été corrigés dans cette session (dérive de la grille tarifaire en base, absence de capture d'acceptation CGU/CGV). Reste **PARTIAL** et non **READY** à cause de : (a) une fuite de suspension inter-app non corrigée (suspendre Gestion Pro coupe aussi Colors/Reserves/Tools-en-mode-org même si leur propre entitlement dit « autorisé »), pertinente dès qu'un pilote utilise plusieurs apps ; (b) une lacune RGPD certaine mais non corrigée par prudence légale (voir §8) ; (c) plusieurs mécanismes marqués NOT_PROVEN_REMOTE (webhooks Stripe live, emails Supabase) qui n'ont jamais pu être vérifiés en conditions réelles depuis ce checkout.

### SELF_SERVICE = **BLOCKED**

L'achat autonome est **fermé par construction** : `abonnementsPubliquesOuvertes()` lit `ABONNEMENTS_PUBLICS_OUVERTS`, faux par défaut, et bloque le CTA de paiement avant même d'appeler Stripe (`src/lib/commercialisation-abonnements.ts`). Même une fois ce drapeau levé, le changement de plan (upgrade/downgrade) et l'ajout/retrait d'application sont **explicitement manuels par conception** (FAQ in-app, contrôle d'accès `estAdministrateurPlateformeMultiApp()`), et le mécanisme d'entitlement multi-app cité dans la mission (`ELSATIA_GP_ACCES_APP` observe→enforce) **n'existe pas du tout** dans ce checkout. Le self-service intégral nécessite des décisions produit et du travail d'architecture qui dépassent le périmètre d'une correction locale certaine.

---

## 1. Parcours commercial complet

| # | Étape | Statut | Preuve principale |
|---|---|---|---|
| 1 | Visiteur | PARTIAL | `/tarifs` fonctionne, mais le CTA de paiement pointe vers un simple contact commercial tant que `ABONNEMENTS_PUBLICS_OUVERTS` est faux (`src/lib/commercialisation-abonnements.ts:1-29`) |
| 2 | Compte | WORKING | `signupAction` (`src/app/actions/auth.ts`) + trigger `handle_new_user` |
| 3 | Email | WORKING (NOT_PROVEN_REMOTE pour la délivrabilité réelle) | `src/app/auth/confirm`, `src/app/auth/callback` |
| 4 | Organisation | WORKING (création) / PARTIAL (rejoindre par code, activation par l'admin client) | RPC `creer_entreprise_bootstrap`, `rejoindre_entreprise_par_code` |
| 5 | Choix offre | PARTIAL | CTA réel seulement si `paiementConfigure && abonnementsOuverts`, sinon bascule "essai sans paiement" |
| 6 | Paiement | PARTIAL (bloqué par le drapeau, code Stripe réel derrière) | `demarrerAbonnementAction` (`src/app/actions/abonnement.ts:45-48`) |
| 7 | Entitlement | WORKING (code complet), NOT_PROVEN_REMOTE (webhook live) | `src/app/api/stripe/abonnement/webhook/route.ts` |
| 8 | Onboarding | WORKING | `src/app/onboarding/demarrage` (checklist vivante depuis la base) |
| 9 | Ajout utilisateurs | PARTIAL | Création self-service côté admin client, mais **aucun email transactionnel automatique** — partage manuel du lien d'invitation |
| 10 | Utilisation | PARTIAL | Atteignable sans staff ELSATIA seulement via la voie « essai sans paiement » tant que le self-service payant est fermé |
| 11 | Upgrade | **MANUAL** | FAQ explicite : « Pas encore en libre-service […] Contactez-nous » (`src/app/(app)/abonnement/page.tsx:32`) |
| 12 | Downgrade | **MANUAL** | Idem, ligne 38 ; le configurateur est un simulateur, « Aucune modification n'est appliquée depuis cet écran » |
| 13 | Ajout app | **MANUAL** | `activerApplicationEntrepriseAction`, gardé par `estAdministrateurPlateformeMultiApp()` — accès staff ELSATIA uniquement |
| 14 | Retrait app | **MANUAL** | Symétrique de 13 |
| 15 | Impayé | WORKING (NOT_PROVEN_REMOTE) | Webhook `invoice.payment_failed` → statut `suspendu` immédiat |
| 16 | Suspension | WORKING, mais **fuite inter-app confirmée** (§7) | `getContexteEntreprise` + `est_membre_actif()` |
| 17 | Réactivation | WORKING (self-service via portail Stripe), NOT_PROVEN_REMOTE | `ouvrirPortailAbonnementSuspenduAction` |
| 18 | Résiliation | WORKING (self-service via portail Stripe), NOT_PROVEN_REMOTE | FAQ + `customer.subscription.deleted` |
| 19 | Export | WORKING | `src/app/api/rgpd/export/route.ts`, accessible même en suspension |
| 20 | Suppression | PARTIAL (demande self-service) / **MANUAL** (purge effective) | `demander_suppression_entreprise` pose un délai de 30 j ; **aucune purge automatisée n'existe** — commentaire de la migration confirme que c'est une opération supervisée par la plateforme, assumée |

---

## 2. Grille tarifaire — P0 trouvé et **corrigé**

Cible commerciale : Mini 79 €, Pro 249 €, Business 449 €, Enterprise 599 €/mois, annuel = ×10.

- **Couche TypeScript canonique** (`src/lib/tarification.ts`, `tarification.canonical.json`) : déjà correcte et testée (`tarification.test.ts`). `/tarifs` et `/abonnement` la consomment exclusivement — aucun prix en dur ailleurs dans l'UI.
- **P0 réel trouvé** : la table `plans_abonnement` en base a une version active (migration `20260816000201_tarifs_v2_catalogue.sql`, "TARIFS-V2") qui publie **69/199/399 €** pour Mini/Pro/Business au lieu de 79/249/449 — reprise textuellement des anciennes valeurs que la mission demandait explicitement de traquer. Cette version alimente `abonnements_entreprises.prix_contractuel_ht` via le webhook Stripe (`synchroniser_abonnement_stripe_service`, migration `20260904000262`) pour tout nouvel abonnement ou changement — reproduction interne exacte du bug historique documenté dans `docs/audits/ELSATIA-STRIPE-TEST-CANONICAL-PRICES-P0-REPORT.md` (« un client voyait 79 € et était débité 69 € »), déjà corrigé côté Stripe mais jamais répercuté dans ce catalogue base de données.
- **Correction appliquée** (certaine, locale, sans toucher aux contrats existants) : migration `supabase/migrations/20260922000323_tarifs_v3_correctif_mini_pro_business.sql`, qui republie une nouvelle version active à 79/249/449 (annuel ×10) via exactement le mécanisme déjà prévu à cet effet (`plateforme_creer_version_tarif`/motif TARIFS-V2), sans modifier ni supprimer les versions historiques ni les contrats déjà signés (`abonnements_entreprises` garde son `prix_contractuel_ht` gelé, comme le prévoit CGV art. 4.4).
- **Test avant/après** : nouveau test `src/lib/tarification-plans-abonnement.test.ts`, qui rejoue en mémoire les migrations touchant `plans_abonnement` et vérifie que la dernière version active par offre correspond à la grille canonique. **Vérifié en échouant avant le correctif** (3 assertions en échec : 69≠79, 199≠249, 399≠449) **et en passant après** (29/29 tests). Suite complète : 1794/1794 tests passants après ce correctif, `tsc --noEmit` et `eslint` propres.
- **Non traité, volontairement** : le mapping Price Stripe (env vars `STRIPE_PRICE_*`) ne vit pas dans ce dépôt et ne peut pas être vérifié statiquement → **REMOTE_ACTION_REQUIRED**. Ne jamais supprimer/repointer en masse les anciens Price Stripe 69/199/399 : ils doivent rester reconciliables pour les abonnés historiques (`stripe-abonnement.ts:102-136`, déjà bien conçu).

## 3. Stripe — audit approfondi

Intégration mature et défensive. Points forts vérifiés :
- Idempotence webhook par `stripe_event_id` avec ledger dédié et tests de concurrence réels (`double-livraison.test.ts`).
- Classification des Price fail-closed (`classifierItemsAbonnement`), allowlist de génération précédente pour ne jamais rendre invendable-mais-cassé un ancien contrat.
- Facturation du dépassement stockage/appareils anti-doublon explicite, avec regression pgTAP dédiée.
- **Bug historique `abonnement_stockage_releves.offre` : re-vérifié activement, ne se reproduit pas dans ce checkout.** La table existe, avec RLS et accès exclusivement via RPC `SECURITY DEFINER`, et un mécanisme anti-double-facturation (`deja_traite`) couvert par un test pgTAP dédié (`stripe_subscription_lifecycle_closure_v1.test.sql:90-96`). Aucune trace d'un incident ouvert correspondant à cette description dans ce code — au contraire, le code contient la remédiation elle-même.

Gaps restants (P1, aucun P0 additionnel) :
- Changement de palier (upgrade/downgrade) toujours immédiat + proraté, pas de politique de report en fin de période (contrairement à la capacité de comptes, qui sait différer) — décision produit, pas un défaut.
- Suspension dès le premier échec de paiement, sans délai de grâce applicatif ; le seul délai éventuel est celui des Smart Retries Stripe, **NOT_PROVEN_REMOTE**.
- Pas de handler `customer.subscription.trial_will_end` — l'expiration d'essai est lue à la demande, pas notifiée proactivement.
- Course possible (rare) à la création du Customer Stripe : le garde-fou `.is("stripe_customer_id", null)` réduit sans éliminer un double-clic concurrent.

## 4. Entitlements multi-app + mécanisme GP_ACCES_APP

- Contrat canonique réel : `acces_applications_entreprises` + RPC `a_acces_application`, wrappé par `packages/application-access`. **Colors et Reserves l'utilisent correctement**, avec garde en layout et en route API.
- **Gestion Pro** n'appelle jamais ce contrat pour lui-même : son accès est géré uniquement par le statut d'abonnement, pas par un entitlement d'app dédié — asymétrie architecturale, pas une fuite en soi.
- **Tools a un modèle d'entitlement totalement séparé** (paliers consommateur `free`/`pro`, cache signé HMAC), sans lien avec `acces_applications_entreprises` ni middleware partagé. **P0 potentiel, NOT_PROVEN_REMOTE sans test runtime** : rien ne garantit qu'une suspension d'organisation affecte l'accès Tools.
- **Studio est entièrement hors du contrat** (`CODES_APPLICATIONS_ELSATIA` ne le liste même pas) ; son propre kill-switch (`STUDIO_ENABLED`) est fail-open par conception documentée dans ses tests — cohérent avec le fait que Studio ne consulte aucune donnée d'entreprise (`"Aucune entreprise, aucun chantier et aucun abonnement Gestion Pro requis"`).
- **`ELSATIA_GP_ACCES_APP` (observe→enforce) : confirmé absent, zéro occurrence dans tout le dépôt** (code, migrations, docs). La mission demandait de revalider son existence plutôt que de la supposer : c'est fait, et la réponse est négative. `docs/qualification/ELSATIA_GP_EXTERNAL_PILOT_CLOSURE_V1.md` confirme explicitely que les entitlements étaient hors périmètre de ce lot. Ce n'est donc pas un blocker « bascule trop brutale d'observe vers enforce » — c'est un blocker « le mécanisme reste à construire » si un jour Tools/Studio doivent rejoindre le contrat commun. Aucune bascule n'a été tentée, aucune n'existe à retenir.

## 5. Onboarding self-service

Fonctionne bien côté client une fois le compte créé : checklist vivante (`onboarding/demarrage`), création d'entreprise atomique par RPC, invitation de collaborateurs self-service côté admin client (mais sans email automatique — partage manuel du lien). Les seuls gestes qui requièrent réellement un employé ELSATIA sont ceux déjà identifiés en §1 (upgrade/downgrade, ajout/retrait d'app) et l'ouverture du drapeau de vente en ligne lui-même.

## 6. Juridique

- 5 documents identifiés (mentions légales, CGU, CGV, confidentialité, cookies) rendus depuis `docs/juridique/*.md`, tous en pages `robots: noindex`, atteignables seulement par lien direct.
- Seuls CGU et CGV portent une mention de version (« Version 1.0 ») en texte libre ; les 3 autres n'ont qu'une date.
- **P0 trouvé et corrigé** : aucune capture de qui a accepté quelle version, quand, n'existait. Le formulaire `/signup` n'avait ni case à cocher ni lien vers ces documents.
  - **Correction appliquée** : migration `20260922000324_capture_acceptation_cgu_cgv_signup.sql` (colonnes `cgu_version_acceptee`, `cgv_version_acceptee`, `conditions_acceptees_at` sur `public.utilisateurs`, alimentées par le trigger `handle_new_user` déjà existant — même chemin que nom/prénom) ; constantes `VERSION_CGU`/`VERSION_CGV` dans `src/lib/juridique.ts` ; case à cocher obligatoire ajoutée à `/signup` avec liens vers `/cgu` et `/cgv` ; `signupAction` refuse désormais la création de compte sans acceptation explicite, côté serveur (pas seulement `required` HTML).
  - **Test avant/après** : `src/app/actions/auth.test.ts` — vérifié en échouant sans le correctif (signUp appelé sans capture ni refus), en passant avec. Un test de dérive (`juridique.test.ts`) garantit que les constantes de version restent synchronisées avec le texte des documents `.md`.
  - Non traité par cette session, **décision produit/légale requise** : faut-il une case distincte pour la politique de confidentialité (information RGPD, pas un contrat) ? Le format actuel (une case, deux documents) est un minimum technique défendable, pas un avis juridique.
- DPA (`docs/juridique/dpa-entreprises-clientes.md`) existe mais n'a **aucune route** l'exposant aux utilisateurs — MISSING.
- Pas de mécanisme de re-consentement si un document change de version après l'inscription d'un utilisateur — MISSING, laissé en l'état (nécessite une décision produit sur le déclenchement : bannière de blocage ? simple notification ?).

## 7. RGPD

- **Export** : fonctionnel au niveau entreprise (`exporter_donnees_entreprise`, JSON structuré, colonnes sensibles retirées automatiquement, dynamique sur tout le schéma). Le manifeste de fichiers (`manifeste_fichiers_entreprise`) ne liste que les métadonnées (chemins Storage), **pas les octets des fichiers eux-mêmes** — portabilité incomplète au sens strict de l'art. 20 pour un utilisateur non technique. P1, non corrigé (fonctionnalité à construire, pas un bug).
- **Anonymisation employé** : `anonymiser_employe` fonctionne et cascade déjà proprement sur le Storage `documents-employes` (bug historique documenté comme corrigé dans le code lui-même). **Gap confirmé et non corrigé, volontairement** : elle ne touche pas `pointages` — les photos et coordonnées GPS de pointage restent liées à l'`employe_id`, non anonymisées, après « anonymisation ». **Cette session n'a pas codé de correctif** : la table `pointages` peut constituer une preuve légale d'heures travaillées soumise à une obligation de conservation qui entrerait en tension avec la minimisation RGPD — trancher ce point relève d'un avis juridique réel, pas d'une supposition de ce rapport. **REMOTE_ACTION_REQUIRED : revue juridique**, puis correctif technique (probable) une fois la politique de rétention de `pointages` tranchée.
- **Rétention** : une politique est documentée (`politique-confidentialite.md` §4) mais **aucun job cron ne l'applique** — le délai de 30 jours avant suppression n'est qu'un horodatage stocké, jamais consommé. MISSING, non corrigé (fonctionnalité entière à construire).
- **Logs d'audit** (`journal_activite`) : contient peu de PII directe par sondage, mais `anonymiser_employe` ne les purge pas — NOT_PROVEN_REMOTE de façon exhaustive sur l'ensemble des ~300 migrations qui y écrivent.

## 8. Suspension par app — fuite confirmée, non corrigée

**P0 confirmé, non corrigé cette session** (changement architectural trop large pour une correction "certaine" en autonomie) : la suspension n'est pas isolée par app aujourd'hui. `entreprises.abonnement_statut` est une colonne unique par organisation ; `est_membre_actif()` (utilisée par `a_acces_application`, donc par Colors/Reserves/Tools-en-mode-org) en dépend directement. **Résultat vérifié dans le code** : suspendre l'abonnement Gestion Pro pour impayé bloque aussi Colors et Reserves, même si leur propre ligne `acces_applications_entreprises.autorise` reste à `true`. À l'inverse, il n'existe **aucune facturation indépendante** pour Colors/Reserves/Tools/Studio aujourd'hui — l'isolation « impayé Colors n'affecte pas Gestion Pro » demandée par la mission est **prématurée : rien ne facture Colors séparément pour qu'une telle suspension puisse même se produire.** Studio, lui, est réellement isolé (aucune dépendance à `entreprises`) mais aussi non facturable indépendamment.

Ce constat n'a pas été corrigé car il touche `est_membre_actif()`, utilisée dans un très grand nombre de policies RLS à travers le dépôt (bien au-delà de la facturation) — une correction non réfléchie casserait probablement d'autres garanties de sécurité. C'est une décision d'architecture produit (créer une notion de statut par app) avant d'être une correction de bug.

## 9. Prototype/demo/mock/bypass

Rien de critique trouvé. Tous les mécanismes identifiés sont soit fail-closed (drapeaux `FEATURE_*`, déjà corrigés lors d'un audit antérieur documenté dans le code), soit protégés par de multiples conditions ANDées incompatibles avec un déploiement Vercel/production (`isEmailLoginDisabled`), soit strictement réservés à un administrateur plateforme authentifié (`roles-demo`). Le cas historique de spécial-casing des comptes de démonstration (commit `a0b79f6`) est confiné à des scripts SQL manuels d'exploitation, jamais dans un chemin d'exécution runtime touchant un client self-service payant.

## 10. Pilote accompagné vs self-service intégral

Séparation appliquée dans ce rapport : tout ce qui requiert aujourd'hui un geste ELSATIA (upgrade/downgrade, ajout/retrait d'app, ouverture du drapeau de vente, purge finale après suppression) **n'a pas été traité comme un blocker pour un premier client pilote accompagné** — ces gestes sont assumables manuellement par du personnel qui suit déjà le client. Ils ne sont bloquants que pour `SELF_SERVICE`.

---

## P0 — certains, impact direct sur la commercialisation

| # | Constat | Statut |
|---|---|---|
| P0-1 | Grille `plans_abonnement` en base à 69/199/399 au lieu de 79/249/449, propagée aux nouveaux contrats via le webhook | **CORRIGÉ** (migration 20260922000323, testé avant/après) |
| P0-2 | Aucune capture d'acceptation CGU/CGV à l'inscription | **CORRIGÉ** (migration 20260922000324 + auth.ts + signup/page.tsx, testé avant/après) |
| P0-3 | Suspension impayé Gestion Pro coupe Colors/Reserves/Tools-en-mode-org malgré leur propre entitlement "autorisé" | **OUVERT** — décision d'architecture requise avant correctif (touche `est_membre_actif()`, utilisée très largement) |
| P0-4 | Anonymisation employé RGPD ne cascade pas sur `pointages` (GPS/photo de pointage restent identifiants) | **OUVERT** — revue juridique requise avant correctif (tension rétention légale vs minimisation RGPD) |
| P0-5 | Tools a un modèle d'entitlement disjoint du contrat multi-app commun, effet d'une suspension d'org non prouvé | **OUVERT / NOT_PROVEN_REMOTE** — nécessite un test runtime, pas seulement statique |

## P1 — à traiter, non bloquants immédiats

- Pas de politique de report en fin de période pour l'upgrade/downgrade de palier (toujours immédiat + proraté).
- Suspension au premier échec de paiement sans délai de grâce applicatif propre.
- Pas de handler `trial_will_end`.
- Course résiduelle (rare) à la création du Customer Stripe.
- Export RGPD : manifeste de fichiers sans les octets réels (portabilité incomplète).
- Aucun cron de rétention/purge malgré une politique documentée.
- Pas d'email transactionnel automatique à l'invitation d'un collaborateur (partage manuel du lien).
- DPA non exposé par une route utilisateur.
- Pas de mécanisme de re-consentement en cas de nouvelle version CGU/CGV.
- Dérive de documentation : `docs/organisation/TARIFICATION_CANONIQUE.md` et `TARIFS_V2_APP_PREVIEW.md` affichent encore l'étiquette `CANONICAL-V3-2026-09` alors que le code (`catalogue.ts`, `tarification.canonical.json`) est passé à `CANONICAL-V4-2026-09` — non corrigé cette session (risque de confondre avec les libellés historiques intentionnellement gelés dans `contract_price_freeze_v1.test.sql`, à trancher par une personne qui connaît l'intention exacte de chaque document).
- Studio et Gestion Pro restent hors du contrat d'entitlement multi-app partagé (asymétrie de conception, pas une fuite prouvée).

## REMOTE_ACTION_REQUIRED — nécessite un accès Stripe/Supabase réel, non tenté ici

- Vérifier que les env vars `STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` (Test **et** Live) pointent bien vers des Price à 79/249/449/599 € — le doc interne les marquait « à repointer ».
- Ne jamais repointer ni supprimer en masse les anciens Price Stripe (69/199/399, annuels ×12 historiques) : ils doivent rester reconciliables pour les abonnés existants.
- Ré-exécuter `npm run verify:stripe-prices` contre l'environnement Stripe réel une fois le correctif de base de données déployé.
- Vérification bout-en-bout des webhooks Stripe en conditions réelles (checkout, invoice.*, subscription.*) — non vérifiable statiquement.
- Vérification de la délivrabilité réelle des emails Supabase (confirmation de compte, réinitialisation de mot de passe).
- Décision business + bascule de `ABONNEMENTS_PUBLICS_OUVERTS` quand le self-service est prêt à être ouvert.
- Revue juridique de l'obligation de conservation des preuves de pointage (GPS/photo) avant tout correctif d'anonymisation sur `pointages`.
- Confirmation de la configuration réelle des relances Stripe (Smart Retries) pour évaluer le délai de grâce effectif avant suspension.

---

## Fixes appliqués cette session (résumé)

| Fichier(s) | Changement | Test avant/après |
|---|---|---|
| `supabase/migrations/20260922000323_tarifs_v3_correctif_mini_pro_business.sql` | Republie Mini/Pro/Business à 79/249/449 €, annuel ×10, sans toucher aux contrats existants | `src/lib/tarification-plans-abonnement.test.ts` — échoue sans le correctif (69/199/399 détectés), passe avec |
| `supabase/migrations/20260922000324_capture_acceptation_cgu_cgv_signup.sql`, `src/lib/juridique.ts`, `src/app/actions/auth.ts`, `src/app/signup/page.tsx` | Capture obligatoire (serveur, pas juste HTML) de l'acceptation CGU/CGV à l'inscription, versionnée et horodatée côté serveur | `src/app/actions/auth.test.ts` — 2 nouveaux tests, vérifiés en échec sans le correctif puis en succès avec |
| `src/lib/juridique.test.ts` | Garde-fou de dérive entre les constantes de version et le texte des `.md` juridiques | Passant |

Suite complète après tous les correctifs : **1794/1794 tests passants** (155 fichiers), `tsc --noEmit --incremental false` propre, `eslint` propre sur tous les fichiers modifiés, `node scripts/verify-migrations.mjs` : 315 migrations valides.

Aucune configuration Stripe ou Supabase réelle n'a été effectuée. Aucun contrat historique n'a été modifié rétroactivement.
