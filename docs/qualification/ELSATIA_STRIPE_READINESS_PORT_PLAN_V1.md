# ELSATIA — Plan de portage Stripe Readiness vers le train courant (V1)

- Date : 2 octobre 2026
- Nature : **analyse seule**. Aucun portage, aucune fusion, aucun cherry-pick, aucun déploiement, aucune clé Stripe, aucun Stripe Live, aucune Preview, aucune Production.
- Branche source : `claude/elegant-turing-b4ewbp`
- SHA source : `b9eb1bf` (base `4d92ddb` = `main`, 178 migrations)

## Verdict courant (mise à jour du 2 octobre 2026, après décisions propriétaire)

**CANONICAL_BASE_813_REQUIRED**

Toutes les décisions sont prises (§ 9). Le portage reste bloqué pour une seule raison : la base canonique qui contient `20261002000813_plateforme_annuaire_lecture_pure.sql` n'est pas disponible pour comparaison.

Contrôle refait après `git fetch --prune` : cette migration est absente des 362 branches distantes. Elle n'apparaît pas non plus dans l'historique (`git log --all`). Or, d'après la décision 1, la migration 813 doit précéder toute nouvelle migration, et la Preview hébergée est à 372/372. Les nouvelles migrations du portage (P1, éventuellement P5 et P7) ne peuvent donc être ni numérotées ni comparées tant que cette base n'est pas poussée.

Ce qui ne dépend pas de 813 (code applicatif P2, P3, P4, harness P6) pourrait techniquement être préparé sur V8. La consigne reste pourtant « aucun portage pour l'instant ».

**Condition de levée** : pousser sur le dépôt distant la branche canonique `V8 → 813`, puis l'intégration de `20261002000901` (Legal Consent). Le verdict passera alors à `READY_FOR_PORT_ON_CANONICAL_BASE`, après une comparaison rapide de 813 avec les fichiers Billing (l'annuaire ne devrait pas en toucher, à vérifier).

### Verdict initial de l'analyse (conservé)


**PORT_CONFLICTS_FOUND**

Trois constats :

1. **Doublons.** Environ 80 % du lot source existe déjà dans V8, sous une autre forme : RPC SQL ordonnées, filigrane d'accès, réservations d'événements, exclusivité du Checkout, reliquat d'essai, flux de réabonnement, grille ×10, harness Test Clock, Prices Test versionnés.
2. **Conflits.** Les 12 fichiers applicatifs communs ont été réécrits dans V8 (de +10 à +602 lignes chacun). Un portage textuel est impossible. Certains éléments concurrencent directement des mécanismes V8 :
   - deux verrous d'ouverture commerciale ;
   - deux jeux de variables d'identité légale ;
   - deux moteurs de synchronisation ;
   - deux générateurs de catalogue Stripe Test.
3. **Base cible ambiguë.** La migration hébergée annoncée, `20261002000813_plateforme_annuaire_lecture_pure.sql`, **n'existe sur aucune branche du dépôt distant** (362 branches inspectées après `git fetch --prune`). La seule branche à 372 migrations est `claude/bold-allen-7mx7xz`, mais sa 372ᵉ migration est `20261002000901_acceptations_documents_legaux_v1`, pas `…000813`.

Un portage **sémantique et restreint** reste justifié : 5 apports nets, plus 2 à concevoir (§ 4.2). Il demande d'abord les décisions du § 9.

## 1. Base cible réelle trouvée

| Candidat | SHA | Migrations | Dernière migration | Descend de V8 |
|---|---|---:|---|---|
| `integration/elsatia-canonical-train-v8` (= `gp-preview-v8`) | `53b4bc76` | 371 | `20260928000812_devis_recalc_totaux_par_instruction_v1` | — |
| `claude/fervent-bell-1tbhc5` (« Lot 10 porté sur V8 ») | `0dc3a656` | 373 | `20260930001402_tools_releve_metre_estimation_coefficients_v1` | oui |
| `claude/bold-allen-7mx7xz` (consentement légal) | `a9a38927` | 372 | `20261002000901_acceptations_documents_legaux_v1` | oui |
| `claude/optimistic-hopper-0ytout` | `f77966f2` | 382 | `20260930000404_gp_options_selecteurs_v1` | oui |
| attendu par la mission | ? | 372 | `20261002000813_plateforme_annuaire_lecture_pure` | **introuvable** |

Base de comparaison retenue : **V8 `53b4bc76`**, le train canonique qualifié présent dans le dépôt. Il est 810 commits devant `4d92ddb`.

Points d'attention :

- `claude/bold-allen-7mx7xz` modifie aussi `src/app/actions/abonnement.ts` et `src/app/(app)/abonnement/page.tsx` : acceptation CGU/CGV/DPA exigée avant le Checkout. Le portage devra s'intercaler avec ce lot.
- `20261002000901` (bold-allen) est numérotée **après** `…000813`. Si `…000813` est hébergée, la convergence devra ordonner les deux.

## 2. Fichiers concernés et classement

| Fichier source | État dans V8 | Classement | Détail |
|---|---|---|---|
| `src/lib/tarification.ts` (+ test) | grille 79/249/449/599, annuel = 10 × mensuel, `tarification.canonical.json` | **déjà présent** | aucun portage |
| `src/app/tarifs/page.tsx` | annuel issu du catalogue ; CTA via `destinationCtaOffreTarifaire` | **déjà présent** | `revalidate = 600` utile seulement si une règle d'ouverture **datée** est portée (§ 4.2) |
| `src/app/onboarding/besoins/page.tsx` | « 2 mois offerts » | **déjà présent** | — |
| `src/app/paiement/abonnement/succes/page.tsx` | variante réabonnement sans essai (`?reabonnement=1`) | **déjà présent** | — |
| `src/lib/plateforme.test.ts` | adapté | **déjà présent** | — |
| `src/lib/stripe-abonnement.ts` | +602 lignes : `offreFactureeDepuisSubscription` (B-3), exclusivité du Checkout, reliquat d'essai, configuration de portail, allowlists | **conflit** | ne porter que `piedDeFacture` et `suspendreFinalisationFacture` (§ 4.1, P2) |
| `src/lib/stripe-abonnement-synchro.ts` (nouveau) | `stripe-abonnement-synchronisation.ts` + RPC `synchroniser_abonnement_stripe_ordonne_service` | **obsolète** | moteur concurrent ; ne pas introduire |
| `src/app/api/stripe/abonnement/webhook/route.ts` | +322/−128 : réservation par RPC, contrôle du mode, relecture sous verrou, filigrane, journal sans effet | **conflit** | ne porter que la garde `invoice.created` Live (P2) |
| `src/app/api/stripe/abonnement/webhook/route.test.ts` | existe déjà (569 lignes) | **à adapter** | ne porter que les scénarios absents (§ 6), dans le style du test V8 |
| `src/app/actions/abonnement.ts` | verrou `abonnementsPublicsOuverts()`, exclusivité, réabonnement ; bold-allen ajoute l'acceptation légale | **conflit** | P3 seulement, après décision |
| `src/app/(app)/abonnement/page.tsx` | +352 lignes | **obsolète** | — |
| `src/app/api/cron/abonnements/route.ts` | +89 lignes, aucune relecture du statut Stripe | **à adapter** | P5 (§ 4.2) |
| `src/lib/stripe-billing-config.ts` (+ test) | absent ; équivalents partiels : `commercialisation-abonnements.ts`, `NEXT_PUBLIC_LEGAL_SIRET/TVA`, `STRIPE_WEBHOOK_EXPECTED_MODE` | **à adapter** | réécrire sur les variables V8 (P2/P3) ; abandonner `LIRIA_VENDEUR_*` et la marque « Liria » |
| `src/test/fake-supabase.ts`, `src/test/fake-stripe.ts` | V8 a son propre harnais | **obsolète** | à réutiliser seulement si le style du test V8 le permet |
| `scripts/stripe-test/catalogue.mjs` | Prices Test existants et versionnés (`config/stripe-prices.test.json`, génération `CANONICAL-V4-2026-09`, `pricing_generation`) ; portail via `configurer-portail-stripe.mjs` | **obsolète, à ne pas exécuter** | créerait une seconde génération de Prices aux métadonnées `liria_*` incompatibles avec `verify:stripe-prices` |
| `scripts/stripe-test/preflight.mjs` | `verify:env-manifest` (`check-env-manifest.mjs`) | **obsolète** | — |
| `scripts/stripe-test/qualification.mjs` | `scripts/qualification/stripe-ordering-test-mode.mjs`, même scénario Test Clock, rejeux par commandes manuelles `stripe events resend` | **à adapter** | P6 |
| `scripts/stripe-test/commun.mjs` | — | **obsolète** | — |
| `.env.local.example` | +153 lignes ; contient déjà `ABONNEMENTS_PUBLICS_OUVERTS`, `STRIPE_AUTOMATIC_TAX_ENABLED` | **conflit** | ne porter que les variables effectivement retenues |
| `package.json` | scripts `verify:stripe-prices`, `test:stripe-*-script` | **conflit** | ne pas ajouter `stripe:test:*` |
| `docs/qualification/ELSATIA_STRIPE_TEST_COMMERCIALIZATION_READINESS_V1.md` | — | **à adapter** | à requalifier sur la base cible ; une grande partie des § 1, 2, 6, 10 y est déjà couverte |

## 3. Migrations concernées

| Migration source | Équivalent V8 | Classement |
|---|---|---|
| `20261002000184_tarifs_annuels_dix_mois.sql` | `20260928000802_billing_lifecycle_plans_catalogue_canonical_v1.sql` (B-2) : mêmes cibles 79/790, 249/2 490, 449/4 490, 599/5 990, versions précédentes désactivées, `abonnements_entreprises` intact, idempotente | **obsolète, à NE PAS porter** |

Ce numéro ne sera donc **jamais** réutilisé.

Une seule migration **nouvelle** serait nécessaire au portage (P1). Elle sera **numérotée strictement après la dernière migration du train cible au moment de la convergence** : aucun numéro n'est réservé ici, puisque `…000813` et `…000901` ne sont pas ordonnées dans le dépôt. Son contenu serait un `create or replace` de `synchroniser_abonnement_stripe_service`, avec signature, propriétaire et grants inchangés, et **sans aucune écriture** dans `abonnements_entreprises` ou `entreprises`.

## 4. Classement des changements Stripe

### 4.1 À porter (apports nets confirmés)

**P1 — Prix contractuel lors d'un changement de périodicité.**
V8 décide « même contrat » sur le seul `code_offre` (`v_meme_offre`, migration 507, reprise par 801). Un passage Pro mensuel → Pro annuel garde donc 249 € comme prix contractuel avec `periodicite = 'annuel'`.
- Correctif : comparer aussi la périodicité.
- Effet : uniquement sur les **futurs** changements demandés par le client. Aucun contrat existant n'est réécrit par la migration.
- Preuves à apporter : pgTAP dans `billing_subscription_lifecycle_v1`, plus un test webhook.

**P2 — Aucune facture finale Live sans identité légale ni TVA confirmées.**
Absent de V8 : aucun `auto_advance`, aucun `invoice_settings[footer]`.
- En Live, si l'identité ou la TVA ne sont pas confirmées, `invoice.created` passe à `auto_advance=false`.
- Pied de facture client : identité, mention TVA, mention « Stripe Test : sans valeur ».
- Le tout réécrit sur `NEXT_PUBLIC_LEGAL_SIRET` / `NEXT_PUBLIC_LEGAL_TVA` (§ 9, décisions 3 et 4).

**P4 — Compatibilité API Stripe 2025-03-31 (basil) pour l'échéance et la fin de période.**
`stripe-abonnement-synchronisation.ts` lit seulement `abonnement.current_period_end`, que basil ne fournit plus au niveau de la subscription. `stripe-capacite-reconcile.ts` applique déjà le bon repli sur les lignes : il suffit de reprendre ce repli.

### 4.2 À adapter (sous décision ou conception)

**P3 — Règle d'ouverture commerciale.**
V8 a un booléen unique, `ABONNEMENTS_PUBLICS_OUVERTS`. La source ajoutait :
- en Live, une date d'ouverture, l'identité et la TVA confirmées ;
- en Test, une ouverture explicite pour la qualification.

À greffer, si retenu, dans `abonnementsPublicsOuverts()`. Ne pas créer de second verrou. À combiner avec l'acceptation légale de bold-allen.

**P5 — Rattrapage d'un webhook manquant.**
V8 reprend les **réservations orphelines** (808), mais ne relit jamais un abonnement dont aucun événement n'est arrivé.
- À concevoir au-dessus de `synchroniserAbonnementCoordonne` : quelle date d'événement donner à une relecture pour le filigrane, et comment éviter d'écraser l'état commercial par application (804).
- Le code source `resynchroniserAbonnementsStripe` n'est **pas** portable tel quel : il contourne la RPC ordonnée.

**P6 — Rejeux automatisés dans le harness Test Clock.**
Il s'agit d'ajouter à `stripe-ordering-test-mode.mjs` :
- le renvoi re-signé de **vrais** événements : doublon, ordre inversé, `invoice.paid` après résiliation ;
- l'étape réabonnement ;
- l'appel du cron.

Ces ajouts respectent les garde-fous V8 (`--execute`, `--confirm-test`, `--entreprise`). Ils remplacent les commandes `stripe events resend` aujourd'hui manuelles.

**P7 — Facture d'essai à 0 € pendant l'essai : à vérifier.**
- V8 arbitre l'égalité **à la seconde** en faveur de la relecture `trialing`.
- Si l'`invoice.paid` à 0 € est horodaté 1 s après, la cible devient `actif` pendant l'essai. L'essai expiré (803) ne s'appliquerait alors plus et l'affichage serait faux.
- Risque faible : l'accès est le même et Stripe facture à la fin de l'essai.
- À trancher par un pgTAP, avant tout correctif.

### 4.3 Déjà présents dans V8 (aucun portage)

Grille 79/249/449/599 et annuel ×10 (code, base, `verify:stripe-prices`) · droits issus du Price facturé (B-3) · `invoice.paid` après résiliation sans réactivation (801, B-1, y compris la variante C3) · ordre inversé et rejeu (506, filigrane) · doublons (`reserver_evenement_abonnement_service`) · réservations orphelines (808) · contrôle Test/Live (`STRIPE_WEBHOOK_EXPECTED_MODE`) · exclusivité du Checkout et refus d'un second abonnement vivant · essai = reliquat de l'essai local, jamais un second essai (507) · réabonnement (201) · essai expiré appliqué en base (803) · suspension commerciale par application (804) · configuration de portail versionnée · `invoice.subscription` en API basil · statut de facture non rétrogradé (`appliquer_evenement_facture_abonnement_v2_service`) · texte de la page de succès.

### 4.4 Obsolètes

Migration 184 · `stripe-abonnement-synchro.ts` · `catalogue.mjs` · `preflight.mjs` · `commun.mjs` · faux Supabase/Stripe · variables `LIRIA_VENDEUR_*`, `LIRIA_TVA_*` et `STRIPE_BILLING_QUALIFICATION_TEST` (sauf si P3 la retient) · modifications de `abonnement/page.tsx` · fenêtre d'idempotence Checkout de 10 min (V8 a sa propre clé, avec essai et renouvellement).

## 5. Chevauchements avec les travaux historiques

| Sujet | Travaux V8 | Relation avec la source |
|---|---|---|
| Lifecycle billing | `ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1` (B-1…B-5), migrations 801-803, pgTAP `billing_subscription_lifecycle_v1` | recouvre les points 3, 4 et 9 de la source, sauf P1 |
| Prix 79/249/449/599 | `TARIFICATION_CANONIQUE.md`, `tarification.canonical.json`, 802 | identique ; 184 obsolète |
| Annuel ×10 | idem, plus `verify:stripe-prices --strict` | identique. Le runbook de cutover note encore (P1-1) des `STRIPE_PRICE_*_ANNUEL` d'**environnement** à ×12 : point externe |
| `invoice.paid` après résiliation | 801 (B-1 et variante C3) | équivalent ; implémentation V8 en SQL |
| Essai expiré | 507 (reliquat), 803 (appliqué en base) | V8 plus complet ; P7 à vérifier |
| Portail et droits | B-3 `offreFactureeDepuisSubscription`, `configurer-portail-stripe.mjs` | équivalent. V8 se replie sur les métadonnées de la subscription (génération précédente) ; la source se repliait sur les métadonnées du Price. Écart mineur, non porté |
| Suspension commerciale par application | 804, pgTAP `per_app_commercial_suspension_v1` | non touchée par la source ; contrainte pour P5 |
| Ouverture commerciale | `ABONNEMENTS_PUBLICS_OUVERTS`, plus acceptation légale (bold-allen 901) | concurrence directe avec la source : P3 |
| Identité vendeur / TVA | `NEXT_PUBLIC_LEGAL_SIRET` (provisionnée en production selon le runbook), `NEXT_PUBLIC_LEGAL_TVA` absente avec repli neutre | concurrence de variables ; P2 à réécrire dessus |

## 6. Conflits

1. **Textuels** : les 12 fichiers modifiés par la source et présents dans V8.
2. **Sémantiques** :
   - deux verrous d'ouverture ;
   - deux schémas de variables d'identité ;
   - deux moteurs de synchronisation (TypeScript direct contre RPC ordonnées) ;
   - deux générations de Prices Test (`liria_*` contre `pricing_generation`) ;
   - deux harness Test Clock.
3. **Marque** : les textes source disent « Liria » ; le train est « ELSATIA ».
4. **Concurrence de lot** : bold-allen modifie la même action de souscription (acceptation légale).
5. **Numérotation** : `…000813` hébergée mais absente du dépôt, et `…000901` en attente.

## 7. Tests à rejouer sur la base cible après portage

- **Vitest** : `src/app/api/stripe/abonnement/webhook/route.test.ts`, `src/lib/stripe-abonnement.test.ts`, `src/lib/tarification.test.ts`, `src/lib/stripe-checkout-exclusivite.test.ts`, `src/components/DocumentLegal.test.ts`, plus la suite complète.
- **Scénarios source à ajouter**, seulement s'ils manquent : changement mensuel → annuel (P1) ; facture brouillon Live bloquée (P2) ; périodes lues sur les lignes (P4) ; facture d'essai à 0 € (P7).
- **pgTAP** : `billing_subscription_lifecycle_v1`, `stripe_event_ordering_v1`, `stripe_trial_synchronization_v1`, `stripe_trial_checkout_exhaustive_v1`, `stripe_resubscription_flow_v1`, `stripe_subscription_lifecycle_closure_v1`, `stripe_subscription_webhook_acl_v1`, `stripe_webhook_reservations_orphelines_v1`, `per_app_commercial_suspension_v1`, `essai_30_jours_modules_catalogue_v1`, `platform_stripe_*`, `capacity_stripe_*`.
- **Concurrence** : `scripts/qualification/{billing-lifecycle,stripe-ordering,stripe-trial,stripe-resubscription}-concurrency.sh`.
- **Scripts** : `test:stripe-ordering-script`, `test:stripe-trial-script`, `test:stripe-resubscription-script`.
- **Contrôles du dépôt** : `verify:migrations`, `verify:secrets`, `verify:env-manifest`, `test:env-manifest`, `verify:stripe-prices` (hors `--strict` sans clé), `typecheck`, `lint`, `build`, `build:reserves`, `build:colors`.

## 8. Scripts Stripe Test réutilisables

| Script | Statut |
|---|---|
| `scripts/qualification/stripe-ordering-test-mode.mjs` (V8) | **référence** ; à enrichir par P6 |
| `scripts/qualification/stripe-trial-test-mode.mjs`, `stripe-resubscription-test-mode.mjs` (V8) | réutilisables tels quels |
| `scripts/configurer-portail-stripe.mjs` (V8) | réutilisable ; remplace la partie portail de `catalogue.mjs` |
| `scripts/verify-stripe-prices.mjs` + `config/stripe-prices.test.json` (V8) | réutilisables ; remplacent la création de Prices de `catalogue.mjs` |
| `scripts/preview/stripe-test-verify.mjs`, `scripts/check-env-manifest.mjs` (V8) | réutilisables ; remplacent `preflight.mjs` |
| `scripts/stripe-test/qualification.mjs` (source) | source d'inspiration pour P6 (fonction `rejouer()` re-signée, étapes 7, 9, 10, 11, 14), pas à porter comme fichier |
| `scripts/stripe-test/catalogue.mjs` (source) | **à ne jamais exécuter** sur le compte Test V8 |

## 9. Décisions propriétaire (prises le 2 octobre 2026)

| # | Sujet | Décision | Conséquence pour le portage |
|---|---|---|---|
| 1 | Base cible et ordre | Référence fonctionnelle : V8 `53b4bc76`. Ordre : **V8 → `20261002000813` annuaire lecture pure → `20261002000901` acceptations légales → nouvelles migrations sécurité / Stripe**. Ne créer aucune migration tant que la base contenant 813 n'est pas disponible | Toute migration Stripe est numérotée strictement après `20261002000901` (ou après la dernière migration de la base canonique effective au moment du portage). Bloquant : 813 introuvable dans le dépôt |
| 2 | Ouverture commerciale | Conserver `ABONNEMENTS_PUBLICS_OUVERTS`. En Live, le compléter par : ouverture commerciale explicite, identité vendeur confirmée, régime TVA confirmé. La qualification Stripe Test reste possible sans ouvrir le Live. Aucune date d'ouverture fixée | P3 : enrichir `abonnementsPublicsOuverts()` dans `src/lib/commercialisation-abonnements.ts`, sans second verrou. **Pas de condition de date** : la règle datée et `revalidate = 600` sur `/tarifs` sont abandonnés. Le mode est déterminé par la clé et par `STRIPE_WEBHOOK_EXPECTED_MODE`, déjà présents dans V8 |
| 3 | TVA | Confirmation explicite, **distincte** du texte affiché. Ni un numéro de TVA, ni une mention légale, ni `STRIPE_AUTOMATIC_TAX_ENABLED` ne valent validation du régime. `STRIPE_AUTOMATIC_TAX_ENABLED` reste un paramètre technique indépendant. Aucun régime déduit | Nouvelle variable de confirmation booléenne, non affichée, à côté de `NEXT_PUBLIC_LEGAL_TVA`. Nom à aligner sur la convention V8 et à déclarer dans le manifeste d'environnement (`check-env-manifest`). `STRIPE_AUTOMATIC_TAX_ENABLED` n'est pas modifié |
| 4 | Garde-fou Live P2 | **Accepté.** En Live, aucun Checkout ni aucune finalisation commerciale tant que les prérequis légaux configurés ne sont pas confirmés. Réutiliser l'identité ELSATIA de V8 ; pas de `LIRIA_VENDEUR_*` ; rien d'inventé | P2 : refus du Checkout en Live (via P3) et `auto_advance=false` sur `invoice.created` en Live si les prérequis ne sont pas confirmés. Identité lue depuis les sources V8 (`NEXT_PUBLIC_LEGAL_SIRET`, identité de marque `BRAND`/`BRAND_SERVER`, mentions juridiques). Pied de facture limité aux informations **déjà confirmées** |
| 5 | P1 périodicité | **Accepté.** Périodicité et prix contractuel suivent le Price Stripe réellement facturé (Pro mensuel → Pro annuel = prix annuel canonique). Rien de rétroactif | Nouvelle migration `create or replace` de `synchroniser_abonnement_stripe_service` : « même contrat » = même offre **et** même périodicité. Aucune écriture de données dans la migration. pgTAP : mensuel → annuel, annuel → mensuel, offre et périodicité inchangées (prix historique conservé) |
| 6 | P5 rattrapage | **Retenu.** Rapprochement quotidien idempotent : Stripe source de vérité, relecture de l'abonnement réel, passage par les protections d'ordre V8, jamais de réactivation d'un abonnement terminal, corrections journalisées, aucune double facturation | Fonction greffée sur `/api/cron/abonnements`, passant par `synchroniserAbonnementCoordonne` (RPC ordonnée) avec un type d'observation dédié (« relecture de rapprochement »). Lecture seule côté Stripe : aucune écriture, aucun Checkout, aucune ligne de facture. Journal dans le flux d'ordre existant. État commercial par application (804) jamais écrasé. Une migration est possible si la RPC doit accepter ce type d'observation (numérotée selon la décision 1) |
| 7 | Délai de grâce | **Suspension immédiate** après un échec de paiement. Pas de délai de grâce | Aucun changement : comportement V8 conservé (« décision produit conservée ») |
| 8 | P7 facture d'essai à 0 € | Contre-épreuve sur V8 d'abord. Si l'essai ne passe pas à tort en « actif », `ALREADY_SAFE`, aucun changement. Sinon, correctif minimal | pgTAP à écrire dans `billing_subscription_lifecycle_v1` : relecture `trialing` à t, puis `invoice.paid` 0 € à t+1 s, puis t+60 s. Correctif seulement si le défaut est reproduit |
| 9 | Harness | Réutiliser le harness V8. N'ajouter que ce qui manque : rejeux, ordre inversé, événements tardifs, mensuel ↔ annuel, abonnement concurrent, paiement échoué, résiliation, Test Clock si pertinent. Pas de second moteur de catalogue ou de synchronisation | P6 : enrichir `scripts/qualification/stripe-ordering-test-mode.mjs` (garde-fous `--execute` / `--confirm-test` / `--entreprise` conservés), avec son test `node --test`. `scripts/stripe-test/*` et `src/lib/stripe-abonnement-synchro.ts` de la branche source ne sont **pas** portés |
| 10 | Pour l'instant | Aucun portage, aucune migration, aucune Preview, aucune Production, aucun Stripe Live | Respecté : seul ce rapport est modifié |

### Points résiduels (non bloquants, à traiter pendant le portage)

- **Identité vendeur.** Dans V8, seul le SIRET a une variable confirmée en production (selon le runbook de cutover). L'adresse et les mentions de paiement sont-elles déjà portées par les documents juridiques V8 ? À constater sur la base canonique, sans rien inventer. Si un élément exigé n'existe pas, le Live reste fermé (comportement voulu).
- **Variables d'environnement.** Les `STRIPE_PRICE_*_ANNUEL` d'environnement encore à ×12 (runbook P1-1) relèvent d'une action opérateur, hors portage.

## 10. Plan d'exécution (dès que la base 813 est disponible)

1. Récupérer la branche canonique `V8 → 813 → 901`. Vérifier le ledger (372 migrations, puis 373 avec 901) et l'absence de recouvrement entre 813 et 901 d'une part, et les fichiers Billing d'autre part. Créer une nouvelle branche de portage depuis cette base.
2. **P7, contre-épreuve d'abord** (pgTAP). Si `ALREADY_SAFE`, consigner sans rien changer ; sinon, correctif minimal.
3. **P4** : repli de période sur les lignes (`items`), avec tests Vitest.
4. **P1** : migration renumérotée après la dernière migration de la base, et pgTAP.
5. **P3 + P2** : verrou Live enrichi, confirmation TVA distincte, garde `invoice.created` Live, pied de facture limité aux informations confirmées ; tests Vitest ; manifeste d'environnement.
6. **P5** : rapprochement quotidien sur la RPC ordonnée, avec tests (relecture terminale, ancien événement, aucune écriture Stripe, état par application préservé).
7. **P6** : enrichissement du harness V8 et de son test `node --test`, sans exécution réelle sans clé Test.
8. Rejouer l'intégralité du § 7 et produire le rapport de qualification du lot.
