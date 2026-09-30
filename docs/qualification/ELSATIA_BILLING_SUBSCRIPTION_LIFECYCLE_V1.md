# ELSATIA — Billing & Subscription Lifecycle Qualification V1

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v6` @ `9102ec80` (verdict `CANONICAL TRAIN V6 LOCALLY QUALIFIED`, 358 migrations) — **non modifiée** |
| Branche | `claude/busy-darwin-tlpi3p` (repartie de la base) |
| Migrations | **361** (+3, additives) : `20260928000701` (annulation terminale), `…702` (catalogue canonique), `…703` (essai expiré en base) |
| Moteur | PostgreSQL 16.13 réel + pgTAP 1.3 (`scripts/local-postgres-bootstrap`, sans Docker), Node 22 / Vitest 4, Playwright 1.62 + Chromium 1194, passerelle Supabase locale du dépôt (RLS réelle sous le rôle du JWT) |
| Stripe | **Aucun appel Stripe réel.** L'état Stripe est représenté par sa « vérité relue » (le webhook relit toujours la subscription) et appliqué par les RPC de service réelles. Aucune Preview, aucune Production, aucun merge. |

## 0. Verdict

```
ELSATIA BILLING LOCALLY QUALIFIED
```

…**sur cette branche**, après correction de **quatre blocages réels** présents dans V6 (§1). Sur
V6 tel quel, le verdict serait `ELSATIA BILLING BLOCKERS FOUND` : la nouvelle suite pgTAP y échoue
sur **30 assertions sur 190**, toutes imputables à ces quatre défauts. Elle passe **190/190** avec
les correctifs.

| # | Blocage (V6) | Conséquence commerciale | Correctif | Preuve rouge → vert |
|---|---|---|---|---|
| **B-1** | Une subscription **terminée** chez Stripe pouvait être rouverte : (a) un `invoice.paid` postérieur (vieille facture réglée via son lien, facture finale de prorata) remettait `annule` → `actif` ; (b) si Stripe livrait cet `invoice.paid` **avant** `customer.subscription.deleted`, le deleted était jugé « périmé » par le filigrane et ignoré | Accès métier complet, **indéfiniment**, sans subscription vivante ni renouvellement futur | `…701` : une facture ne lève jamais `annule` ; une subscription relue terminée s'applique même livrée en retard (l'état terminal Stripe est irréversible, le filigrane ne recule pas) | pgTAP §B1, W5, W8, L10 ; harnais de concurrence C3 (**8/20** entreprises annulées avant (b), **20/20** après) ; Playwright |
| **B-2** | Catalogue `plans_abonnement` **actif** = grille obsolète 69 / 199 / 399 (annuel 690 / 1 990 / 3 990) | Tout nouveau contrat enregistré avec un `prix_contractuel_ht` faux (Mini facturé 79 € par Stripe, enregistré 69 €), donc prix souscrit et MRR plateforme faux | `…702` : nouvelle version active = grille canonique 79 / 249 / 449 / 599, annuel ×10 ; historique conservé ; **aucun contrat existant touché** | pgTAP §B2, L2, L7 ; harnais C1, C5 ; DB verify contrôle 30 |
| **B-3** | Offre (donc droits) lue **uniquement** dans `subscription.metadata.offre`, figée au Checkout, alors que le Portail Stripe versionné autorise le changement de Price | Montée Mini → Business par le Portail : payée sans les droits. Descente Entreprise → Mini : droits Entreprise au prix Mini | `offreFactureeDepuisSubscription` : le Price de forfait courant reconnu fait autorité ; la metadata reste le repli (génération précédente, ambiguïté) ; une divergence est journalisée | Vitest : 10 cas purs + 2 sur le chemin webhook réel (**rouge sans le correctif**) |
| **B-4** | Essai expiré sans abonnement : bloqué **seulement** par l'interface GP. En base, `est_membre_actif` restait vrai | Données GP lisibles et modifiables par l'API après l'essai ; **Colors, Réserves et Tools** (qui ne décident qu'en base) restaient pleinement ouverts **sans limite de durée** | `…703` : la règle applicative existante (fin du jour UTC de `essai_fin`) portée en base ; même traitement qu'une entreprise suspendue ; chemin minimal de facturation conservé | pgTAP §M3/M4 (16 assertions) ; Playwright : API **2 chantiers → 0** (contre-épreuve rouge sans `…703`) |

Un cinquième écart, non bloquant pour l'accès mais trompeur pour le client, est corrigé :
**B-5**. `/abonnement` affichait « Essai gratuit de 30 jours » et « Démarrer l’essai » à un essai
expiré ou à moins de 48 h de sa fin, alors que Checkout facture immédiatement dans ces cas. Le
libellé suit maintenant exactement le calcul de Checkout (§4).

Restent hors du verdict local :
- **DECISION_REQUIRED** : TVA, identité vendeur, RCS/RNE, portée des suspensions par application, règle de prévente, politique de descente d'offre (§15) ;
- **exécution Stripe distante** : Portail, factures hébergées, branding. **NOT PROVEN** localement (§16).

---

## 1. Base et méthode

`9102ec80` est la tête d'`integration/elsatia-canonical-train-v6`. La branche de travail en est
repartie ; aucun commit V6 n'est réécrit. Baseline mesurée **avant** tout changement : pgTAP
**152 fichiers, 143 propres, 4 457 ok**. Les 9 fichiers non propres sont hérités et identiques à V6 :
`platform_stripe_state_attestation_r72` (stub `pgsodium`), 7 suites Studio (projet dédié) et
`elsatia_tools_cloud_sync_entitlement_closure_v1`.

Chaque droit est vérifié **deux fois** :
- en base, par pgTAP sous `set local role authenticated` avec `request.jwt.claims` (RLS réelle) ;
- dans un vrai navigateur **et** par l'API REST avec le jeton de session de l'utilisateur
  (Playwright). Ce second angle a révélé B-4 : l'interface bloquait déjà, l'API non.

## 2. Offres GP (référence : Mini 79, Pro 249, Business 449, Entreprise 599 €/mois ; annuel ×10)

| Surface | Fichier | Valeurs (V6) | Rôle à l'exécution | Conforme ? |
|---|---|---|---|---|
| Grille applicative | `src/lib/tarification.ts` (`OFFRES_TARIFAIRES`) + `tarification.canonical.json` | 79 / 249 / 449 / 599, annuel 790 / 2 490 / 4 490 / 5 990 | `/tarifs`, onboarding, `/abonnement`, comparatifs, quotas affichés | ✅ figé par `tarification.test.ts` |
| Décision humaine | `docs/organisation/TARIFICATION_CANONIQUE.md` | idem ; « 69 / 199 / 399 : obsolète » ; « toute divergence est un bug à corriger dans le sens de ce tableau » | référence | ✅ |
| Montant réellement facturé | Price Stripe de `STRIPE_PRICE_<OFFRE>_<PÉRIODICITÉ>` | contrôlé par `verify:stripe-prices` (montant = JSON canonique, annuel = 10 × mensuel, eur, `livemode=false`) | Checkout | ✅ en CI (SKIP ici : aucune clé Stripe) |
| Catalogue base | `public.plans_abonnement` (version active) | **69 / 199 / 399 / 599 ; 690 / 1 990 / 3 990 / 5 990** (migration `20260816000201`, antérieure à la décision canonique) | `prix_contractuel_ht` d'un nouveau contrat (webhook), `capacite_personnes_base` (quotas 3/15/30/50) | ❌ **B-2**, corrigé par `…702` |
| Contrats existants | `abonnements_entreprises.prix_contractuel_ht` | — | prix souscrit, MRR plateforme | **non modifiés** (aucune preuve de ce que Stripe a réellement facturé) |

La preuve exigée avant de modifier une offre est apportée par la décision humaine versionnée, le
code figé et le contrôle des Prices. Seule la version **active** du catalogue change ; les versions
69 € restent en historique (jamais supprimées), et les quotas et fonctionnalités sont recopiés.

À décider (§15) : les contrats créés entre le 16/08 et ce correctif portent 69/199/399 en base.
Leur prix réel n'est connu que de Stripe. **DECISION_REQUIRED:BILLING-CONTRATS-PRIX-69** :
rapprocher ces contrats des Prices Stripe avant toute correction de données.

Écart documentaire : `/plateforme/tarification` édite ce catalogue en laissant croire qu'il fixe
le prix public. Il ne fixe que le prix contractuel des nouveaux contrats.

## 3. Tools : Free, Pro, Relevé Pro

| Palier | Définition | Vente | Vérifié |
|---|---|---|---|
| Tools Free | repli de `tools_resoudre_entitlements()` (3 capacités) | — | palier effectif `free` quand l'accès entreprise est coupé (§M) |
| Tools Pro | `tools_capabilities_pro()` (18 capacités), SKU `tools_pro_monthly` / `_annual` | Checkout Stripe **mode Test uniquement** (`tools-monetization.ts` : `sk_test_` exigée, `livemode` refusé) | S1 : Tools past_due → Free, **GP intact** |
| Relevé Pro | capacité `releve-metre`, catalogue `releve_pro` (`offres_incluses = {tools_pro}`) | **non commercial** : CHECK SKU, déclencheur `tools_garde_releve_metre_non_commercial`, `isReleveMetrePurchasable() = false` | S3 : Relevé Pro ⊇ Tools Pro ; Tools Pro seul n'ouvre jamais Relevé. S4 : aucun SKU Relevé vendable |

Décision respectée : **Relevé Pro inclut Tools Pro**, et **Stripe Relevé Pro n'est pas activé**.
Aucune modification n'a été faite ici.

## 4. Essai

| Cas | Comportement | Preuve |
|---|---|---|
| Création | déclencheur `initialiser_essai_entreprise` : 30 jours, dates UTC | pgTAP L1 |
| Durée restante | Checkout = reliquat **absolu** de l'essai local (`trial_end`, jamais `trial_period_days`) ; `trial_end` Stripe au-delà de la fenêtre : borné et journalisé (`stripe_essai_ecarts`) | pgTAP L2 ; Vitest `stripe-essai-checkout` |
| < 48 h | aucun essai Stripe, facturation immédiate. **Désormais annoncé** : « se termine dans moins de 48 heures : paiement demandé dès la souscription » (B-5) | Vitest `stripe-essai-libelles` (frontière exacte 48 h : `…29T23:59:59Z` essai, `…30T00:00:00Z` paiement immédiat) ; Playwright |
| Dernier jour | ouvert jusqu'à 23:59:59 UTC du jour de fin (application **et** base) | pgTAP M2 ouvert, M3 (fin = hier) fermé |
| Expiré | **métier fermé en base** (B-4), toutes applications ; l'admin garde `/abonnement`, l'export RGPD et le support. Libellé « Souscrire (paiement immédiat) » | pgTAP M3/M4 ; Playwright (écran + API) |
| Aucun deuxième essai | subscription passée (liée ou non) → essai consommé ; au réabonnement, la fenêtre locale est close ; un membre ou `service_role` ne peut jamais prolonger l'essai | pgTAP L11, T1, T2 ; Vitest `stripe-checkout-exclusivite` |
| Resubscribe | aucun essai, même client | pgTAP L11 |

Limite, sans changement : l'unicité de l'essai est **par entreprise et par client Stripe**, pas
par SIREN. Une personne qui crée une seconde entreprise obtient un second essai.
**DECISION_REQUIRED:BILLING-ESSAI-PAR-SIREN**.

## 5. Checkout

Aucun changement de code. Couverture existante, rejouée deux fois :

| Cas | Garde | Preuve |
|---|---|---|
| Double clic / re-livraison | clé d'idempotence Stripe stable (`abonnement-checkout-<entreprise>-<offre>-<périodicité>-<essai>`) | Vitest `stripe-checkout-essai-simulation` |
| Deux onglets / concurrence | balayage `garantirSessionCheckoutUnique` (au plus une session payable) puis relecture Stripe | Vitest `stripe-checkout-exclusivite` (dont la contre-épreuve « deux subscriptions facturées sans balayage ») ; base : C1 (40 livraisons → 1 liaison, 1 contrat), C2 (deux subscriptions → une seule rattachée, l'autre 42501) |
| Abandonné / expiré | session rouverte ou recréée, essai = reliquat, jamais 30 jours | Vitest `stripe-checkout-exclusivite` |
| Mauvais client | client supprimé → `ClientStripeInvalide`, aucun nouveau client ; base : subscription d'un autre client → 42501 | Vitest ; pgTAP W6 |
| Mauvais Price | Price de génération fermée → `PrixGenerationHistoriqueNonVendable` avant tout appel réseau ; variables absentes → refus ; montant contrôlé en CI | Vitest `stripe-generations-cohabitation` |
| Verrou de commercialisation | `ABONNEMENTS_PUBLICS_OUVERTS !== "true"` → aucune session | Vitest `commercialisation-abonnements` |

## 6. Webhooks

| Cas | Décision | Preuve |
|---|---|---|
| Doublon | `reserver_evenement_abonnement_service` → 200 `duplicate` ; en base `deja_traite` | pgTAP W1, W2 ; C1, R4 |
| Rejeu | idem, aucune seconde notification d'échec | pgTAP W2 |
| Périmé | événement antérieur au filigrane d'accès → `perime`, accès inchangé | pgTAP W3 |
| Même seconde | paid contre failed : le paiement gagne ; relecture de subscription contre facture : la relecture gagne ; **deleted contre paid : annulé dans les deux ordres** (B-1) | pgTAP W5 ; C4 |
| Désordre | failed d'une facture déjà payée → périmé ; **paid final avant deleted → annulé** (B-1) | pgTAP W4, W8 ; C3, C6 |
| Événement manquant | facture d'une subscription pas encore rattachée → `differe` (503, Stripe re-livre), rien d'écrit | pgTAP W7 |
| Mauvais client | metadata d'une entreprise, client d'une autre → 422 (`rattachement_stripe_incoherent`) ; en base, 42501 | Vitest `route.test` ; pgTAP W6 |
| Mauvaise metadata | offre inconnue → offre du Price facturé (B-3), sinon offre inchangée ; `entreprise_id` mal formé → 422 | Vitest `stripe-offre-facturee`, `route.test` |

## 7. Échec de paiement

Décision Preview **conservée** : suspension **immédiate**, sans délai de grâce. Aucun délai n'a
été introduit.

| État | Statut local | Preuve |
|---|---|---|
| `invoice.payment_failed` appliqué | `suspendu`, notification unique | pgTAP L4 (`notifier_echec: true`, rejeu `false`) |
| `past_due` / `unpaid` (relecture) | `suspendu` | pgTAP L5 |
| `invoice.payment_action_required` (3-D Secure) | sans effet | pgTAP L4 |
| Régularisation (`invoice.paid`) | `actif`, impayé effacé | pgTAP L6 ; Playwright |

## 8. Portail

Chemins vérifiés, sans modification (Resubscription V1) : `cancel_at_period_end` mène à
« Reprendre l’abonnement » (Portail) ; `past_due`, `unpaid` et `incomplete` mènent à « Payer la
facture » (lien hébergé exact) et au Portail. Ces chemins sont **réservés à l'admin** et
n'apparaissent jamais pour un membre simple (Playwright). Changement d'offre par le Portail :
les droits suivent désormais le Price facturé (**B-3**).

**DECISION_REQUIRED:BILLING-DESCENTE-PORTAIL**. Le Portail versionné
(`configurer-portail-stripe.mjs`, `subscription_update: price`) permet une descente d'offre sans
contrôle de compatibilité (comptes, modules), alors que la FAQ de `/abonnement` annonce un
changement d'offre « pas encore en libre-service » et une vérification préalable. La FAQ et le
Portail doivent être alignés dans un sens ou dans l'autre ; ce choix relève du produit, et rien
n'a été modifié.

## 9. Résiliation

| Cas | Droits | Preuve |
|---|---|---|
| Résiliation fin de période | conservés jusqu'à l'échéance (`actif` + annulation programmée visible) | pgTAP L8 ; Resubscription Playwright |
| Fin de période (`deleted`) | `annule`, plus de droits | pgTAP L9 |
| Renouvellement empêché | aucune facture ne rouvre (**B-1**) | pgTAP B1 |
| Annulation immédiate | coupure immédiate ; facture finale payée ensuite : aucune réouverture | pgTAP L10 |

## 10. Réabonnement

Le travail qualifié de Resubscription Flow V1 est réutilisé tel quel. Vérifié ici : même client,
ancienne subscription terminée (sinon 42501), aucun second essai, factures et événements de
l'ancienne sans effet, rattachement concurrent (une seule gagne).

Le harnais `stripe-resubscription-concurrency.sh` a été **aligné** sur le chemin applicatif pour
R4. L'ancien R4 rattachait la nouvelle subscription **sans** la synchronisation que
`synchroniserAbonnementCoordonne` exécute toujours ensuite, puis attendait qu'un `invoice.paid`
lève `annule`. Depuis B-1, une facture ne lève plus jamais `annule`. R4 synchronise donc la
nouvelle subscription relue `incomplete` (premier paiement attendu, donc `suspendu`) avant les
40 re-livraisons de l'`invoice.paid`. L'intention est inchangée (une décision, droits rendus) :
**20/20 ×2**.

Conséquence assumée : si la synchronisation d'un réabonnement échoue après le rattachement (500,
re-livrée par Stripe), un `invoice.paid` arrivé entre-temps ne rouvre pas l'accès. La
re-livraison de l'événement de subscription le rouvre. La relecture Stripe reste la seule
autorité.

## 11. Droits effectifs par état

Mesurés par pgTAP sur 10 entreprises réelles (admin avec `gerer_parametres`, membre simple, Tools
Pro personnel, accès Tools, Colors et Réserves). La matrice de synthèse est au §20.

## 12. Portée des suspensions

| Incident | GP | Tools | Colors | Réserves | Studio | Preuve |
|---|---|---|---|---|---|---|
| Abonnement Tools `past_due` / expiré | ✅ intact | Free | ✅ | ✅ | ✅ | pgTAP S1 |
| Accès Tools retiré à l'entreprise | ✅ intact | ❌ | ✅ | ✅ | ✅ | pgTAP S2 |
| Suspension commerciale GP (impayé, annulé, essai expiré) | ❌ | ❌ (Free) | ❌ | ❌ (hôte) ; intervenant invité en lecture seule (D-01) | ✅ (projet dédié, sans entreprise) | pgTAP §M |
| Suspension plateforme / sécurité (`suspension_prevue_at` échue, session révoquée) | ❌ | ❌ | ❌ | ❌ | — | pgTAP M9 ; `session_courante_revoquee` |

- **Un incident Tools ne coupe pas GP.** ✅
- La suspension **commerciale GP** coupe toutes les applications d'entreprise, parce que
  `a_acces_application` exige `est_membre_actif`. C'est la règle en vigueur : décision D-01 de
  Réserves, écart connu RT-V3-P2-02 de Tools.
- Il n'existe **aucune suspension commerciale par application**, car aucune application autre
  que Tools (personnel, mode Test) n'a de facturation propre.
- La suspension plateforme / sécurité est distincte, mais elle emprunte aujourd'hui les mêmes
  colonnes (`suspension_prevue_at`) que l'impayé manuel.

**DECISION_REQUIRED:BILLING-SUSPENSION-PAR-APPLICATION** : faut-il qu'un impayé GP laisse Tools,
Colors ou Réserves ouverts, et la suspension de sécurité doit-elle avoir sa propre colonne ? Aucun
changement n'a été fait sans cette décision.

## 13. Accès admin d'une entreprise suspendue

| Besoin | Chemin | Admin | Membre simple |
|---|---|---|---|
| Voir l'état | `etat_reabonnement_entreprise` (SECURITY DEFINER, aucun identifiant Stripe) | ✅ | ✅ (lecture seule) |
| Payer | lien de facture hébergée + Portail | ✅ | ❌ (aucun bouton ; `peut_gerer=false`) |
| Réactiver | Checkout serveur (client admin) / Portail | ✅ | ❌ |
| Métier (chantiers, permissions de poste, fiche entreprise) | RLS | ❌ | ❌ |

Preuves : pgTAP §M (colonnes « facturation admin » et « membre ») et M7 (permissions de poste et
chantiers invisibles, aucun état d'une autre entreprise) ; Playwright, test « paiement échoué ».
L'essai expiré suit désormais le même chemin, avec `permissionsUtilisateur` étendu à
`essaiExpireSansOffre`.

## 14. Factures ELSATIA

Les factures d'abonnement sont **émises par Stripe** (page et PDF hébergés). ELSATIA ne stocke
qu'une trace (`factures_abonnement` : numéro, période, HT / TVA / TTC, devise en majuscules,
statut, URLs).

| Élément | État dans le dépôt | Statut |
|---|---|---|
| Identité vendeur | `docs/juridique/mentions-legales.md` : Julien GREGUREC, EI, nom commercial ELSATIA, adresse Rhinau, « à revérifier contre l'avis SIRENE » | **DECISION_REQUIRED:BILLING-IDENTITE-VENDEUR** (en attente d'immatriculation) |
| SIRET | jeton `[EDITEUR_SIRET]`, `NEXT_PUBLIC_LEGAL_SIRET` vide | **DECISION_REQUIRED** |
| RCS / RNE | non déterminé (P14C §151) | **DECISION_REQUIRED:BILLING-RCS-RNE** |
| Branding ELSATIA sur la facture | réglage du Dashboard Stripe, **non versionné** | REMOTE, NOT PROVEN |
| Devise | EUR : Prices contrôlés en CI, trace normalisée `upper()` | ✅ |
| Régime de TVA | P14C retient la **franchise en base** (« TVA non applicable, art. 293 B CGI »), mais ce n'est câblé nulle part : `STRIPE_AUTOMATIC_TAX_ENABLED=false`, aucun pied de facture, jeton `[EDITEUR_MENTION_TVA]` ; P14C affirme à tort que la mention est déjà présente | **DECISION_REQUIRED:BILLING-TVA** : aucun régime inventé |
| Données client | nom (raison sociale), e-mail, adresse, pays FR ; **ni SIREN ni TVA intracommunautaire collectés** (`tax_id_collection` absent) | **DECISION_REQUIRED:BILLING-DONNEES-CLIENT** |

## 15. Règle de prévente (aucun paiement avant le 01/10/2026 Europe/Paris)

**La règle ne fait pas partie de la branche intégrée.** Aucune date, aucun fuseau, aucun test de
frontière n'existe dans le code, les migrations ou la configuration. Le 01/10/2026 n'apparaît que
comme date de début d'activité (P14C) et comme date de fixture. Le seul verrou est le drapeau
`ABONNEMENTS_PUBLICS_OUVERTS` (fermé par défaut), sans composante temporelle. Ses chemins de
paiement sont tous en aval d'un Checkout, donc d'une subscription existante : Portail, capacité,
option IA.

Conformément à la consigne (« conserver la règle existante si elle fait partie de la branche »),
**aucune règle n'a été créée**. Aucun test de frontière temporelle n'est donc possible.
**DECISION_REQUIRED:BILLING-PREVENTE-DATE** : coder un verrou daté (serveur et SQL) ou garder le
drapeau d'environnement comme unique autorité ?

### Décisions requises (récapitulatif)

| Code | Sujet |
|---|---|
| `BILLING-CONTRATS-PRIX-69` | Rapprocher des Prices Stripe les contrats créés sous la grille 69/199/399 |
| `BILLING-ESSAI-PAR-SIREN` | Un essai par entreprise ou par SIREN |
| `BILLING-DESCENTE-PORTAIL` | Descente d'offre libre par le Portail contre la FAQ « contactez-nous » |
| `BILLING-SUSPENSION-PAR-APPLICATION` | Portée d'un impayé GP ; colonne distincte pour la suspension de sécurité |
| `BILLING-IDENTITE-VENDEUR`, `BILLING-RCS-RNE`, `BILLING-TVA`, `BILLING-DONNEES-CLIENT` | Mentions de facture, après immatriculation |
| `BILLING-PREVENTE-DATE` | Verrou daté ou drapeau seul |

## 16. Idempotence, concurrence, audit

**Idempotence** : chaque action critique est rejouable sans effet.
- Checkout : clé Stripe stable.
- Webhook : réservation puis `deja_traite` en base.
- Rattachement : `deja_lie`.
- Catalogue : `…702` rejouée, sans effet.
- `…701` et `…703` : `create or replace`.
- Reprise : aucune écriture de droit.

**Concurrence** : 40 sessions PostgreSQL réelles, **deux passes chacune** sur la base finale.

| Harnais | Passe 1 | Passe 2 |
|---|---|---|
| `billing-lifecycle-concurrency.sh` (nouveau : C1 liaison ×40, C2 deux onglets, C3 annulation contre factures tardives ×20 entreprises, C4 même seconde, C5 changement d'offre, C6 transitions) | **22/22** | **22/22** |
| `stripe-resubscription-concurrency.sh` (R4 aligné, §10) | **20/20** | **20/20** |
| `stripe-trial-concurrency.sh` | **7/7** | **7/7** |
| `stripe-ordering-concurrency.sh` | **15/15** | **15/15** |

Le harnais a trouvé la variante B-1(b) : **8/20** entreprises annulées avant le correctif, **20/20**
après.

**Audit** : chaque transition d'accès produit une ligne `stripe_evenements_ordre`, avec l'événement
Stripe, l'état avant et après, la décision (`applique`, `perime`, `sans_effet`, `deja_traite`) et
un motif pour tout refus. Nouveaux motifs : `abonnement_termine`, et `offre_metadata_divergente`
(journal applicatif). pgTAP A1-A4 : décisions typées, tout refus motivé, un événement pour une
décision.

## 17. Résultats des tests

| Porte | Résultat |
|---|---|
| Migrations | 361/361 base neuve (×3) ; montée V6 (358) → 361 : schéma **identique** au neuf (`pg_dump -s`, 0 ligne de diff), catalogue identique |
| pgTAP complet | passe 1 : 144/153 ; **passe 2 : 144/153, 4 647 ok** ; **passe 3 : 144/153, 4 647 ok**. Non propres = **les mêmes 9** qu'à la baseline, **0 régression** |
| pgTAP `billing_subscription_lifecycle_v1` | **190/190** (×3) ; sur V6 sans correctifs : **30 échecs** (B-1, B-2, B-4) |
| Suites Stripe et suspension existantes | resubscription 99/99, ordering 137/137, trial 82/82 + 24/24, lifecycle closure 44/44, webhook ACL 51/51, Réserves D-01 97/97, Colors v16 92/92, impayés 12/12 |
| Vitest | GP **2 319**, Tools 2 118, Réserves 186, Colors 431 : **0 échec** (deux passes GP) |
| Typecheck / lint | 0 erreur (4 applications) ; 15 avertissements préexistants, aucun dans les fichiers touchés |
| Playwright `billing-lifecycle` (nouveau, 6) + `stripe-reabonnement` (6) | **12/12 ×2** ; contre-épreuve B-4 : **rouge** sans `…703` (API : 2 chantiers au lieu de 0) |
| Playwright non-régression GP (`isolation-rest`, `roles-and-direct-access`, `security`) | 27/32 ; les 5 échecs sont les tests de l'assistant IA (`/api/assistant/chat` → 404 : IA désactivée sur la pile locale), sans rapport. Harnais : plafond de connexion 10 / 10 min remis à zéro pendant la passe (décompte `rate_limits_applicatifs`) |
| DB verify | **30 contrôles** (nouveau contrôle 30), tous verts sur la base finale ; contrôle 30 **rouge** sur V6 |
| Autres | `verify:migrations`, `verify:train-expectations` (361, 30 contrôles), `test:preview-pack` 29/29, `test:env-manifest` 67/67, `verify:env-manifest`, `verify:secrets`, scripts Stripe Test (ordering 5, trial 10, resubscription 6) ; `verify:stripe-prices` SKIP (aucune clé) |
| `next build` GP | **réussi** (§19) |

**NOT PROVEN localement**, et à rejouer en Stripe Test ou Preview :
- Portail réel (reprise, changement de Price, B-3 de bout en bout) ;
- factures hébergées et leur branding ;
- ordre réel des livraisons Stripe ;
- e-mail d'échec de paiement.

## 18. Avant la Preview

Requête d'impact de B-4, à exécuter avant la migration : entreprises qui perdront l'accès en base
(déjà bloquées dans l'interface GP).

```sql
select id, nom, abonnement_essai_fin from public.entreprises
where abonnement_statut = 'essai'
  and coalesce(abonnement_essai_fin, abonnement_essai_debut + 30) < (now() at time zone 'utc')::date;
```

## 19. Build

`next build` Gestion Pro : **réussi** (« Compiled successfully », 38/38 pages statiques générées).

## 20. Matrice : état Stripe → abonnement → droits

| État Stripe (relu) | `abonnement_statut` | GP métier | Tools | Colors | Réserves (hôte) | Studio | Accès facturation (admin) | Accès facturation (membre) |
|---|---|---|---|---|---|---|---|---|
| aucune subscription, essai en cours | `essai` | ✅ | ✅ (palier personnel) | ✅ | ✅ | indépendant | ✅ Checkout (essai = reliquat) | état visible |
| aucune subscription, essai < 48 h | `essai` | ✅ | ✅ | ✅ | ✅ | indépendant | ✅ Checkout **paiement immédiat** (annoncé) | état visible |
| aucune subscription, essai expiré | `essai` (fin dépassée) | ❌ (**B-4**) | Free (**B-4**) | ❌ (**B-4**) | ❌ (**B-4**) | indépendant | ✅ Checkout paiement immédiat | état visible |
| `trialing` | `essai` (borné à la fenêtre locale) | ✅ | ✅ | ✅ | ✅ | indépendant | ✅ Portail | état visible |
| `active` | `actif` | ✅ (offre = Price facturé, **B-3**) | ✅ | ✅ | ✅ | indépendant | ✅ Portail | état visible |
| `active` + `cancel_at_period_end` | `actif` + annulation programmée | ✅ jusqu'à l'échéance | ✅ | ✅ | ✅ | indépendant | ✅ « Reprendre » (Portail) | état visible |
| `past_due` / `unpaid` / `incomplete` / `payment_failed` | `suspendu` (immédiat) | ❌ | Free | ❌ | ❌ (intervenant : lecture seule) | indépendant | ✅ « Payer la facture » + Portail | état visible, aucun bouton |
| `canceled` / `incomplete_expired` | `annule` (terminal, **B-1**) | ❌ (jamais rouvert par une facture) | Free | ❌ | ❌ (intervenant : lecture seule) | indépendant | ✅ « Réactiver » (nouveau Checkout, même client, sans essai) | état visible, aucun bouton |
| `paused` / inconnu | `suspendu` / `annule` | ❌ | Free | ❌ | ❌ | indépendant | support | état visible |
| suspension plateforme échue | inchangé + `suspension_prevue_at` passée | ❌ | Free | ❌ | ❌ | indépendant | ✅ (état, Portail) | état visible |
| suspension plateforme programmée (future) | inchangé | ✅ | ✅ | ✅ | ✅ | indépendant | ✅ | état visible |

Studio : projet dédié sans entreprise ni abonnement (`studio_my_role`). Il n'est concerné par
aucun état commercial GP et reste **OFF** pour la première Preview (décision V6).

## 21. Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260928000701_billing_lifecycle_cancel_terminal_v1.sql` | B-1 : facture sans effet sur `annule` ; état terminal relu toujours appliqué |
| `supabase/migrations/20260928000702_billing_lifecycle_plans_catalogue_canonical_v1.sql` | B-2 : catalogue actif canonique, idempotent, sans effet rétroactif |
| `supabase/migrations/20260928000703_billing_lifecycle_trial_expiry_enforced_v1.sql` | B-4 : `est_membre_actif` et `est_membre_actif_reel` refusent l'essai expiré |
| `src/lib/stripe-abonnement.ts`, `src/lib/stripe-abonnement-synchronisation.ts` | B-3 : `offreFactureeDepuisSubscription`, appliquée par le webhook |
| `src/lib/permissions.ts` | B-4 : essai expiré, même périmètre de reprise que suspendu / annulé |
| `src/lib/stripe-essai-checkout.ts`, `src/app/(app)/abonnement/page.tsx` | B-5 : libellés de souscription fidèles à Checkout |
| `supabase/tests/billing_subscription_lifecycle_v1.test.sql` | 190 assertions : matrice, cycle de vie, webhooks, B-1, B-2, B-4, portée, audit |
| `scripts/qualification/billing-lifecycle-concurrency.sh` | harnais de concurrence C1-C6 |
| `scripts/qualification/stripe-resubscription-concurrency.sh` | R4 aligné sur le chemin applicatif |
| `tests/e2e/billing-lifecycle.spec.ts` | 6 parcours navigateur + API |
| `src/lib/stripe-offre-facturee.test.ts`, `stripe-abonnement-synchronisation-offre.test.ts`, `stripe-essai-libelles.test.ts`, `permissions-reprise-abonnement.test.ts`, mocks webhook | Vitest |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` (contrôle 30), pack Preview et runbook V3 (attendus régénérés : 361 migrations, 30 contrôles) | Preview |

## 22. Reproduire

```bash
git checkout claude/busy-darwin-tlpi3p && npm ci && for a in tools reserves colors; do npm ci --prefix apps/$a; done
pg_ctlcluster 16 main start; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl postgresql-plpython3-16 python3-nacl

scripts/local-postgres-bootstrap/rebuild_db.sh bill_final                     # 361/361
scripts/qualification/pgtap-run-v3.sh bill_final                              # 144/153 (= V6 + 1)
scripts/qualification/pgtap-run-v3.sh bill_final 'billing_subscription_lifecycle_v1.test.sql'   # 190/190
createdb -T bill_final conc && for s in billing-lifecycle stripe-resubscription stripe-trial stripe-ordering; do
  scripts/qualification/$s-concurrency.sh conc; done                          # 22 / 20 / 7 / 15
npm run typecheck && npm run lint && npm test
npm run verify:migrations && npm run verify:train-expectations && npm run test:preview-pack

# Navigateur : pile GP (tests/e2e/gp-reserves-pile-locale/preparer-base.sh gpres_e2e, passerelle,
# GP :3100, clés HS256 locales, STRIPE_* factices, ABONNEMENTS_PUBLICS_OUVERTS=true), puis
E2E_BILLING_DB_URL=… E2E_BILLING_ENTREPRISE=a0000000-0000-0000-0000-000000000001 \
E2E_BILLING_ADMIN_EMAIL=admin-a@invalid.local E2E_BILLING_MEMBRE_EMAIL=conducteur-a@invalid.local E2E_BILLING_MDP=test \
E2E_REABONNEMENT_DB_URL=… E2E_REABONNEMENT_EMAIL=dirigeant-a@invalid.local E2E_REABONNEMENT_MDP=test \
E2E_REABONNEMENT_ENTREPRISE=a0000000-0000-0000-0000-000000000001 \
  npx playwright test tests/e2e/billing-lifecycle.spec.ts tests/e2e/stripe-reabonnement.spec.ts --project=desktop-chromium --workers=1
```
