# ELSATIA-MARKET-BUSINESS-MODEL-V1

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1` — Phases 7 et 8
Révision : **R2 — décisions produit fermées** (`ELSATIA-MARKET-R2-FINAL-PRODUCT-DECISIONS`)
Nature : étude. **Aucun tarif définitif, aucun prix Stripe, aucun objet Stripe créé, lu par API ou
modifié.**
Branche : `feat/market-architecture-legal-business-v1` — base `1fc1331` — R1 `281769b`

> **Tous les montants de ce document sont des ordres de grandeur d'étude.** Aucun n'est arbitré.
> Aucun ne doit être affiché, communiqué ou saisi dans Stripe. La grille canonique ELSATIA
> (`CANONICAL-V4-2026-09`) ne contient aucune offre Market, et ce document ne l'y ajoute pas.

---

## 1. Le cadre — désormais fermé

La R1 posait des questions ; la R2 y répond. Les décisions ci-dessous ne sont plus des
recommandations d'audit : ce sont des **décisions produit arrêtées**, et ce document en tire les
conséquences.

### 1.1 Qui paie

> **Abonnement vendeur obligatoire à partir de la première annonce publiée. Consultation et achat
> gratuits. Brouillons possibles avant souscription.**

C'est la formulation de référence. Elle remplace partout toute mention de « freemium vendeur », qui
n'a plus cours.

| Acteur | Paie |
|---|---|
| Particulier acheteur | **rien** |
| Professionnel acheteur qui ne publie pas | **rien** |
| Professionnel qui **publie** | **abonnement Market actif, obligatoire** |

**Règle d'implémentation, non contournable** : la **publication** est bloquée tant que l'abonnement
vendeur n'est pas actif. La **création et la préparation de brouillons** sont autorisées avant
souscription — c'est ce qui permet au vendeur d'évaluer l'outil sans que la plateforme se remplisse
d'annonces gratuites.

**Le modèle freemium — un palier gratuit permanent autorisant la publication — est écarté.** Il ne
sera pas proposé, ni comme recommandation, ni comme variante.

### 1.2 Encaissement des ventes

**ELSATIA ne touche pas l'argent de la vente en V1.** La V1 est une plateforme de **mise en
relation, de négociation et de réservation**. Le règlement se fait directement entre le vendeur et
l'acheteur, selon les moyens qu'ils conviennent.

Conséquences, toutes définitives pour la V1 :

| Conséquence | |
|---|---|
| Commission sur transaction | **aucune** |
| Reversement vendeur | **aucun** |
| Portefeuille | **aucun** |
| Séquestre | **aucun** |
| Remboursement traité par ELSATIA | **aucun** |
| Litige financier arbitré par ELSATIA | **aucun** |
| Stripe Connect pour encaisser les ventes | **non utilisé en V1** |
| Stripe | **uniquement** pour facturer l'abonnement vendeur Market |

### 1.3 Ce que ces deux décisions produisent ensemble

Un modèle économique **simple, prévisible et juridiquement léger** : un abonnement B2B classique,
facturé par ELSATIA à ses propres clients, sur une mécanique qu'elle maîtrise déjà. Aucun flux de
tiers, aucun KYC financier, aucune exposition aux chargebacks.

Le prix de cette simplicité est réel et doit être énoncé : **le revenu est déconnecté de la valeur
échangée**, et **l'amorçage n'est plus subventionné par un palier gratuit**. Le §3 traite ce second
point, qui est le vrai sujet.

---

## 2. Les trois modèles étudiés — et l'issue

L'étude R1 comparait trois modèles. La décision R2 en retient un et en écarte deux. Le comparatif
est conservé pour la traçabilité de la décision.

### 2.1 Modèle 1 — Abonnement vendeur pur — **RETENU**

Le vendeur paie un abonnement pour publier. Aucune commission, aucune observation des transactions.

| Avantages | Limites assumées |
|---|---|
| Revenu **prévisible et récurrent** | revenu déconnecté de la valeur créée : une vente à 40 000 € rapporte autant qu'une à 40 € |
| Statut juridique le plus simple — aucun encaissement de la vente | l'abonnement est **le premier poste coupé** dans une PME sous tension |
| Aucun KYC financier, aucune obligation d'établissement de paiement | plafond de revenu bas |
| **Coût opérationnel le plus faible des trois** : ni séquestre, ni litige de paiement, ni chargeback, ni TVA sur la transaction | **amorçage non subventionné** (§3) |
| Mécanique **déjà maîtrisée** par ELSATIA | |
| Aucune dépendance à Stripe Connect | |

### 2.2 Modèle 2 — Abonnement + commission sur transaction — **ÉCARTÉ**

Écarté par la décision 1.2. L'analyse qui y conduisait reste valable et mérite d'être conservée :

- **Contournement structurel** : la mise en relation faite, les deux parties ont un intérêt
  convergent à sortir de la plateforme. Sur des biens professionnels souvent lourds, retirés sur
  place et réglés par virement, ce risque est décisif.
- **Changement de nature juridique** : ELSATIA deviendrait intermédiaire de paiement — KYC/LCB-FT de
  tous les vendeurs, litiges, remboursements, chargebacks, TVA sur biens d'occasion, comptabilité de
  flux de tiers.
- **Aucune brique n'existe** : l'audit établit que le Connect en place n'a **ni `application_fee`,
  ni `transfer_data`, ni `on_behalf_of`**.
- Une commission est **très difficile à retirer** une fois annoncée.

### 2.3 Modèle 3 — Freemium encadré — **ÉCARTÉ PAR DÉCISION**

Écarté par la décision 1.1. Il proposait un palier gratuit permanent autorisant la publication, ce
que la décision produit exclut. L'argument qu'il portait — l'amorçage — reste entier et doit être
traité autrement : c'est l'objet du §3.

Ce que son abandon coûte, dit franchement : le catalogue ne se remplira pas tout seul, et le coût de
vérification et de modération sera supporté **uniquement** pour des vendeurs payants — ce qui est
d'ailleurs son seul avantage opérationnel.

### 2.4 Comparatif conservé

| Critère | **M1 — retenu** | M2 — écarté | M3 — écarté |
|---|:---:|:---:|:---:|
| Conformité aux décisions R2 | **totale** | non | non |
| Amorçage du catalogue | **difficile** | moyen | facile |
| Prévisibilité du revenu | **forte** | faible | moyenne |
| Plafond de revenu | bas | élevé | moyen |
| Complexité juridique | **faible** | élevée | faible |
| Coût opérationnel | **faible** | élevé | moyen |
| Charge de développement V1 | **faible** | élevée | faible à moyenne |
| Risque de contournement | **sans objet** | majeur | sans objet |
| Délai de mise sur le marché | **court** | long | court |

---

## 3. L'amorçage sans palier gratuit — le vrai sujet

Toute place de marché affronte le même obstacle : un acheteur ne vient que s'il y a des annonces, un
vendeur ne paie que s'il y a des acheteurs. Le palier gratuit était la réponse habituelle. Il est
écarté. **L'obstacle, lui, ne l'est pas.**

Trois atouts propres à ELSATIA l'atténuent :

| Atout | Portée |
|---|---|
| Base installée d'entreprises BTP déjà clientes | l'offre de départ peut naître du parc existant, sans acquisition |
| Compte ELSATIA commun (socle multi-app livré) | activer Market ne demande ni inscription, ni nouveau compte |
| Ponts Stock et Colors | le coût de publication d'une annonce est bas pour un client existant |

Ils ne suffisent pas. Cinq leviers restent disponibles, **tous compatibles avec la décision 1.1**, et
**tous relevant de l'arbitrage tarifaire (D-10)** :

| Levier | Description | Compatible 1.1 ? |
|---|---|:---:|
| **L1 — Période d'essai bornée** | souscription obligatoire, statut `essai`, durée limitée, échéance ferme. **Ce n'est pas du freemium** : il y a souscription, l'abonnement est actif, et l'essai **finit**. Le socle le sait déjà faire (`abonnements_entreprises.statut = 'essai'`, `initialiser_essai_entreprise()`). | **oui** |
| **L2 — Tarif d'entrée bas** | un premier palier à faible nombre d'annonces, payant mais peu cher | **oui** |
| **L3 — Offre de lancement à durée limitée** | remise sur les premiers mois pour les premiers vendeurs, avec une date de fin. Le socle le sait faire (`promotions_commerciales`, `plateforme_operations_remise`). | **oui** |
| **L4 — Inclusion temporaire pour les clients existants** | Market inclus un temps dans un abonnement Gestion Pro, avec une échéance annoncée | **oui**, mais crée une attente de gratuité — **à manier avec prudence** |
| **L5 — Amorçage manuel** | ELSATIA sollicite directement des vendeurs de son parc pour constituer un premier inventaire | **oui** |

**Recommandation d'étude : L1 + L2 + L5.** L'essai borné lève la friction du premier paiement sans
créer de palier gratuit permanent ; un premier palier bas rend la conversion crédible ; l'amorçage
manuel constitue l'inventaire initial, qui est la seule chose qu'aucun tarif ne peut acheter.

**L4 est signalé comme un piège** : ce qui a été inclus est très difficile à facturer ensuite, et
l'attente de gratuité survit longtemps à l'échéance annoncée.

**Aucun de ces leviers n'est arbitré ici. Aucune durée, aucun montant, aucun taux de remise n'est
proposé.** Ils relèvent de D-10.

### 3.1 Ce qu'il faudra tarifer — sans le tarifer ici

| Objet | Nature | Arbitrage |
|---|---|:---:|
| Paliers d'abonnement vendeur | volume d'annonces actives simultanées | **D-10** |
| Annonce supplémentaire | à l'unité, récurrente | **D-10** |
| Mise en avant | **achat ponctuel** — jamais un « /mois » | **D-10** |
| Page vendeur enrichie | option récurrente | **D-10** |
| Multi-sites, grands comptes | devis (`plans_abonnement.devis_obligatoire` existe déjà) | **D-10** |
| **Période d'essai** (L1) | durée, contenu, avec ou sans moyen de paiement | **D-10** |
| **Offre de lancement** (L3) | taux, durée, éligibilité | **D-10** |
| Périodicité annuelle | la règle maison est `annuel = 10 × mensuel` | à confirmer pour Market |

---

## 4. Phase 8 — Paiement et facturation

### 4.1 Deux flux, désormais tranchés

| | **Flux A — Abonnement Market** | **Flux B — Prix du bien vendu** |
|---|---|---|
| Qui paie | l'entreprise vendeuse | l'acheteur |
| Qui encaisse | **ELSATIA** | **le vendeur** |
| Nature | service d'ELSATIA | vente entre le vendeur et l'acheteur |
| Facture | ELSATIA → vendeur | vendeur → acheteur |
| TVA | TVA française sur un service, régime ELSATIA | régime du vendeur et du bien (§4.5) |
| Stripe | **oui — et uniquement pour ce flux** | **non** |
| Décision | fermée | **fermée : hors plateforme** |

### 4.2 Les six schémas — issue

| Schéma | Issue R2 |
|---|---|
| **S1 — Contact direct, aucun paiement intégré** | **RETENU** |
| **S5 — Paiement au retrait** | **RETENU** (c'est S1 appliqué au retrait) |
| **S6 — Facturation directe vendeur → acheteur** | **RETENU** (corollaire obligé de S1 et S5) |
| S2 — Réservation avec acompte | **écarté** : toute la complexité du paiement intégré, pour une fraction du montant. Le pire rapport valeur/complexité des six. |
| S3 — Paiement complet via la plateforme | **écarté** : détenir des fonds pour compte de tiers relève d'un régime réglementé |
| S4 — Stripe Connect | **écarté pour les ventes en V1.** La brique Standard existe (`entreprises.stripe_account_id`, OAuth câblé) et reste disponible pour une V2 **sans commission**, si le besoin est un jour démontré. Elle n'est pas utilisée par Market. |

### 4.3 Analyse des points exigés par la Phase 8, sous le modèle retenu

| Point | Sous S1 + S5 + S6 (V1, décidé) |
|---|---|
| **KYC vendeur** | vérification **professionnelle** (§5 de la spécification), **pas** un KYC financier |
| **Reversement** | sans objet |
| **Commission** | aucune |
| **Remboursement** | entre les parties ; ELSATIA n'en traite aucun |
| **Litige** | **médiation sur les faits tracés** (échanges, offres, réservations, remises), **jamais** arbitrage financier |
| **Chargeback** | sans objet |
| **TVA de la vente** | **entièrement au vendeur** |
| **Facture de vente** | par le vendeur |
| **Avoir** | par le vendeur |
| **Paiement partiel** | entre les parties |
| **Caution** | **non proposée** |
| **Annulation** | libération de la quantité engagée ; aucun flux financier |
| **Preuve de livraison** | **code de retrait** + photo et signature optionnelles |
| **Responsabilité ELSATIA** | **hébergement et mise en relation** |

> **Avertissement à ne jamais omettre** : le fait qu'ELSATIA n'encaisse pas la vente **ne la dispense
> pas** des obligations du DSA, du P2B, du Code de la consommation ni, éventuellement, de DAC7. Voir
> `ELSATIA-MARKET-LEGAL-COMPLIANCE-FRAMEWORK-V1.md` §0.2.

### 4.4 TVA

En V1, **ELSATIA n'a aucune obligation de TVA sur les ventes** : elle n'est pas partie à la vente. Sa
seule TVA est celle de son propre abonnement (Flux A).

Le vendeur, lui, affronte une matière complexe que le **modèle d'annonce doit savoir représenter**
sans que la plateforme la tranche : TVA normale, **régime de la marge** sur certains biens
d'occasion, exonérations, vente à un particulier (TTC affiché) ou à un professionnel (HT, avec
autoliquidation possible), ventes intracommunautaires.

D'où le champ `tva_applicable` du modèle d'annonce, et la règle d'affichage : **prix TTC pour un
acheteur particulier, prix HT pour un acheteur professionnel**, sans ambiguïté.

**ELSATIA ne calcule ni ne certifie la TVA d'une vente.**

---

## 5. Le modèle d'abonnement multiproduit ELSATIA

> **Décision R2 (§6)** : le modèle actuel `abonnements_entreprises.entreprise_id unique` ne convient
> pas à l'écosystème. Une entreprise doit pouvoir souscrire simultanément Gestion Pro, Tools, Colors,
> Réserves, Drone, Market, Contact/Card et d'autres produits futurs. **Ne pas simplement supprimer la
> contrainte unique sans plan de migration et tests.**

Cette section dépasse Market. Elle est pourtant ici parce que **Market est le premier produit qui
rend le défaut bloquant** : il doit pouvoir être souscrit par une entreprise déjà abonnée à Gestion
Pro, et par une entreprise qui ne l'est pas du tout.

### 5.1 L'état réel — trois modèles de monétisation incompatibles coexistent

L'audit établit un constat plus lourd que la seule contrainte d'unicité. L'écosystème ne possède pas
*un* modèle commercial à étendre : il en possède **trois, incompatibles**, plus un vide.

| Produit | Modèle commercial | Portée | Observations |
|---|---|---|---|
| **Gestion Pro** | `abonnements_entreprises` (+ `modules_entreprises`, `options_abonnement_entreprises`) | **entreprise**, `unique(entreprise_id)` | le seul modèle contractuel complet. `modules_entreprises` référence `modules_gestion_pro` : **il n'est pas générique**. |
| **Tools** | `tools_monetization_subscriptions` + `entitlements_utilisateurs_elsatia` | **utilisateur**, multi-fournisseur (`stripe`, `apple`, `google`) | modèle entièrement distinct, imposé par les stores mobiles. Ne connaît pas la notion d'entreprise. |
| **Colors** | **aucun** | — | seul `acces_applications_entreprises` porte le droit d'usage. Aucune trace commerciale. |
| **Réserves** | **aucun** | — | idem. |
| **Drone, Contact/Card, Market** | **aucun** | — | produits non développés ou non monétisés. |

Deux conséquences :

1. **Le problème n'est pas « lever une contrainte unique »**, c'est **unifier trois représentations
   du fait commercial**. Supprimer l'unicité produirait un modèle où Gestion Pro serait multi-lignes
   pendant que Tools resterait par utilisateur et Colors sans rien : le désordre serait plus grand
   qu'avant.
2. **`entitlements_utilisateurs_elsatia` est le seul élément déjà générique par
   `application_code`** — mais il décrit un **droit d'usage par personne** (`niveau ∈ {free, pro}`),
   pas un **contrat commercial**. Il ne peut pas tenir ce rôle.

### 5.2 Le principe directeur : séparer le contrat, la ligne produit et l'autorisation

L'écosystème possède déjà une couche d'autorisation propre et bien conçue :
`acces_applications_entreprises` (droit d'usage de l'organisation) et
`habilitations_applications_utilisateurs` (habilitation de la personne), avec la fonction de décision
`a_acces_application()`. Le commentaire de la migration 234 est explicite : *la source commerciale
reste configurable et ne participe pas directement à la décision d'autorisation.*

**Cette séparation est saine et doit être préservée.** Le modèle commercial **alimente**
l'autorisation ; il ne la remplace pas.

```
   ┌─────────────────────────────────────────────────────────────┐
   │  COUCHE COMMERCIALE            (ce qui est vendu et facturé) │
   │                                                             │
   │  contrat commercial d'entreprise                            │
   │    └─ ligne d'abonnement produit  (une par produit souscrit)│
   │         ├─ modules                                          │
   │         ├─ options                                          │
   │         └─ remises                                          │
   └────────────────────────────┬────────────────────────────────┘
                                │  alimente (source, référence)
                                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  COUCHE D'AUTORISATION        (ce qui est réellement permis) │
   │                                                             │
   │  acces_applications_entreprises      — EXISTANT, inchangé    │
   │  habilitations_applications_utilisateurs — EXISTANT, inchangé│
   │  a_acces_application()               — EXISTANT, inchangé    │
   └─────────────────────────────────────────────────────────────┘
```

**Règle** : aucune décision d'accès ne lit la couche commerciale. Un impayé, une résiliation ou une
fin d'essai agissent en **écrivant** dans la couche d'autorisation, jamais en la court-circuitant.
C'est ce qui permet aussi d'accorder un accès sans vente (essai, geste commercial, usage interne) —
ce que le socle sait déjà faire via `acces_applications_entreprises.source`.

### 5.3 Le modèle recommandé

#### (a) Catalogue produit — un `produit_id` stable

Un référentiel de **produits commercialisables**, distinct de `applications_elsatia`.

| Pourquoi ne pas réutiliser `applications_elsatia` | |
|---|---|
| Un produit vendu n'est pas toujours une application | formations, cartes NFC, prestations de mise en service (`catalogue_services_mise_en_service` existe déjà) |
| Une application n'est pas toujours vendue séparément | une application peut être incluse dans une offre |
| Le catalogue applicatif porte des URL et un statut technique | le catalogue produit porte une nature commerciale et un cycle de vie propre |

Le `code` produit est **stable et définitif** : `gestion_pro`, `colors`, `reserves`, `tools`,
`market`, `drone`, `contact_card`. Il ne change jamais, y compris si le nom commercial change — un
identifiant qui bouge invalide l'historique des contrats.

Correspondance vers `applications_elsatia.code` : **facultative et nullable**. Un produit peut ne
pointer vers aucune application.

#### (b) Contrat commercial d'entreprise — **un seul espace de facturation**

Un contrat par entreprise. Il porte ce qui est **commun à tous les produits** :

| Élément | Rôle |
|---|---|
| Référence de contrat | opposable, stable |
| **`stripe_customer_id`** | **un seul client Stripe par entreprise** — c'est ce qui réalise « un seul espace de facturation ELSATIA » |
| Devise | commune |
| Coordonnées et données de facturation | communes |
| Statut du contrat | actif, suspendu, résilié |
| Date d'effet, date de fin | — |

C'est l'unique endroit où l'unicité par entreprise reste légitime.

#### (c) Ligne d'abonnement produit — **une par produit souscrit**

C'est le cœur du modèle, et c'est ce qui manque aujourd'hui.

| Champ | Rôle | Corrige |
|---|---|---|
| contrat (référence) | rattachement | — |
| **`produit_code`** | quel produit | **lève l'unicité par entreprise** |
| `code_offre` | quel palier | — |
| **`generation_tarifaire`** | quelle génération de grille, **par produit** | permet GP en génération 2026-07 et Market en 2027-01 |
| `version_tarif` | version dans la génération | — |
| **`periodicite`** | **par produit** | permet GP annuel et Market mensuel |
| **`prix_contractuel_ht`** | **prix figé à la souscription** | **corrige la dette D-7** : le prix cesse d'être relu dans le code à chaque affichage |
| Devise | héritée du contrat | — |
| Statut | `essai`, `actif`, `impaye`, `suspendu`, `resilie` | supporte L1 (essai borné) |
| Date d'effet, date de fin, date de résiliation | cycle de vie **propre au produit** | résilier Market sans toucher Gestion Pro |
| `stripe_subscription_id`, `stripe_price_id` | rattachement Stripe **par produit** | §5.4 |
| Changement planifié | palier suivant, date d'effet | l'existant le fait déjà (`plan_suivant_id`, `changement_prevu_at`) |

**Unicité** : au plus **une ligne active par (contrat, produit)**. L'historique des lignes résiliées
est **conservé** — c'est lui qui protège les contrats passés.

#### (d) Modules, options, remises — génériques et rattachés à la ligne produit

| Aujourd'hui | Défaut | Cible |
|---|---|---|
| `modules_entreprises` → `modules_gestion_pro` | **spécifique à Gestion Pro** | modules rattachés à la **ligne produit**, catalogue de modules **par produit** |
| `options_abonnement_entreprises` → `catalogue_options_abonnement` | déjà générique, mais rattaché à l'**entreprise**, pas au produit ; et **`prix_unitaire_contractuel_ht` n'est écrit par aucun code applicatif** | rattachées à la **ligne produit**, avec le prix **effectivement figé** |
| `promotions_commerciales`, `plateforme_operations_remise` | portée entreprise | remise applicable **au contrat** ou **à une ligne produit**, au choix |

#### (e) Ce qui ne change pas

`plans_abonnement` (catalogue d'offres versionné), `factures_abonnement`, `stripe_webhook_events`,
`historique_tarification`, et toute la couche d'autorisation. Le modèle **s'insère**, il ne
remplace pas.

### 5.4 Stripe — architecture recommandée, sans aucune opération

**Un `Customer` par entreprise. Une `Subscription` par produit souscrit.**

| Option | Verdict |
|---|---|
| Une seule `Subscription` multi-items | **écartée**. Tous les items d'une souscription Stripe partagent le **même intervalle de facturation** : une entreprise en Gestion Pro annuel et Market mensuel devient irreprésentable. S'y ajoutent la résiliation d'un seul produit et les décalages de cycle. |
| **Une `Subscription` par produit, un `Customer` commun** | **retenue**. Périodicités indépendantes, cycles indépendants, résiliation produit par produit, et **un seul espace de facturation** côté client. |

**Contrepartie à assumer** : plusieurs souscriptions produisent **plusieurs factures Stripe**. Si une
facture ELSATIA consolidée est souhaitée, elle doit être **produite par ELSATIA** — `factures_abonnement`
existe déjà et sait le faire. C'est un arbitrage à porter (D-11), pas un obstacle.

**Aucune opération Stripe n'est effectuée dans cette conversation.** Aucun produit, aucun prix,
aucun client, aucune souscription n'est créé, lu par API ou modifié, ni en Test ni en Live.

### 5.5 Protection des contrats historiques

C'est la contrainte la plus importante du plan, et l'écosystème sait déjà la tenir : le contrat
canonique `CANONICAL-V4-2026-09` conserve la génération `COMPTES-PAR-FORFAIT-2026-07` comme
**génération précédente, lisible et non sélectionnable**, précisément *« pour honorer les contrats
souscrits sous cette génération : un abonnement existant n'est jamais migré silencieusement »*.

Le modèle multiproduit reprend cette doctrine et la **renforce** :

| Règle | |
|---|---|
| **H1** | La génération tarifaire est **figée sur la ligne produit** à la souscription. |
| **H2** | Le `prix_contractuel_ht` est **figé sur la ligne produit**. Il n'est **jamais** relu depuis le code ni depuis le catalogue courant. C'est la correction de la dette D-7, et elle est structurelle. |
| **H3** | Un changement de génération est un **acte explicite, daté, journalisé**, jamais un effet de bord d'une migration. |
| **H4** | Les générations retirées restent **lisibles** ; elles cessent seulement d'être **sélectionnables** pour un nouveau contrat. |
| **H5** | Aucune migration ne modifie un prix souscrit. La reprise fige **la valeur constatée**, pas la valeur recalculée. |

### 5.6 Plan de migration — sans SQL, sans numéro de ledger

> **Aucun SQL n'est écrit dans cette conversation. Aucun numéro de ledger n'est réservé.** Ce plan
> décrit une méthode ; sa mise en œuvre est un lot à part entière.

| Étape | Contenu | Réversible |
|---|---|:---:|
| **E0 — Inventaire** | recensement en lecture seule de tous les contrats existants : `abonnements_entreprises`, `modules_entreprises`, `options_abonnement_entreprises`, `tools_monetization_subscriptions`, `entitlements_utilisateurs_elsatia`, et l'état Stripe correspondant. **Écarts documentés avant toute écriture.** | — |
| **E1 — Modèle à côté** | création du nouveau modèle, **vide**, sans toucher l'existant. Aucun code ne le lit encore. | **oui** |
| **E2 — Reprise** | chaque `abonnements_entreprises` devient un **contrat** + une **ligne produit `gestion_pro`**, génération et prix figés **à la valeur constatée** (H5). Modules et options rattachés à cette ligne. | **oui** — le nouveau modèle est jetable tant qu'il n'est pas lu |
| **E3 — Réconciliation** | comparaison automatisée ancien ↔ nouveau, entreprise par entreprise, **et** contre Stripe. Zéro écart toléré avant de poursuivre. | **oui** |
| **E4 — Lecture** | le code lit le nouveau modèle ; l'ancien reste écrit en miroir. Vues de compatibilité pour le code non encore migré. | **oui** — retour à l'ancienne lecture |
| **E5 — Écriture** | les écritures basculent sur le nouveau modèle ; l'ancien devient dérivé. | difficile |
| **E6 — Observation** | période d'observation en Production, sans retrait de l'ancien. | — |
| **E7 — Retrait** | dépose de l'ancien modèle après observation concluante. | non |
| **E8 — Tools** | rattachement du canal mobile : la ligne produit `tools` **B2B** vit dans le nouveau modèle ; `tools_monetization_subscriptions` reste le canal **B2C mobile**, les deux se rejoignant dans `entitlements_utilisateurs_elsatia`. **À instruire séparément** — les stores imposent leurs règles. | — |

**Tests.** La recette se joue en **pgTAP sur une base clonée jetable**, jamais sur la base locale
courante : un `db reset` détruirait le jeu de données multi-app local. Couverture minimale : reprise
fidèle de chaque contrat, immuabilité du prix figé (H2), refus d'une seconde ligne active pour un
même produit, indépendance des périodicités, résiliation d'un produit sans effet sur les autres,
cohérence avec la couche d'autorisation.

**Ce que ce plan interdit explicitement** : supprimer `unique(entreprise_id)` et « voir ce qui se
passe ». La contrainte est aujourd'hui la seule garantie qu'aucune entreprise n'a deux abonnements
contradictoires ; la lever sans le modèle de remplacement et sans la réconciliation E3 ouvrirait une
classe de défauts de facturation silencieux — c'est-à-dire la pire espèce.

### 5.7 Ce que Market peut faire en attendant

Le modèle multiproduit est un lot lourd, et Market en dépend. Deux voies :

| Voie | Description | Verdict |
|---|---|---|
| **A** | Market attend le modèle multiproduit | **retenue.** Le volet commercial de Market (M8) est de toute façon en fin de chaîne, après le socle, les annonces, la recherche et la modération. |
| **B** | Market se dote d'un modèle commercial provisoire | **écartée.** Ce serait un **quatrième** modèle de monétisation — exactement le désordre que la décision R2 vise à corriger. |

**Conséquence de planning** : les lots M1 à M7 et M9 de Market **ne dépendent pas** du modèle
multiproduit et peuvent être conduits en parallèle. Seul **M8 est bloqué**, et avec lui l'ouverture
commerciale — puisque sans abonnement actif, aucune annonce n'est publiable (décision 1.1).

---

## 6. Facturation de l'abonnement Market — Flux A

Sous le modèle multiproduit :

```
contrat commercial d'entreprise        → un Customer Stripe, un espace de facturation
  └─ ligne produit « market »          → une Subscription Stripe propre
       ├─ palier (annonces actives)
       ├─ options (mise en avant : achat ponctuel ; page vendeur : récurrent)
       └─ remise éventuelle (offre de lancement L3)
factures_abonnement                    → facture ELSATIA
stripe_webhook_events                  → idempotence (existant)
```

**Lien avec l'autorisation** : la ligne produit `market` active alimente
`acces_applications_entreprises('market')`. La publication vérifie **l'autorisation**, pas la ligne
commerciale — conformément à la règle du §5.2.

**Comportement en cas d'abonnement inactif** (rappel de la règle R9 de la spécification) : les
annonces publiées passent en `suspendue`, motif `abonnement_inactif`, et sont **restaurées** à la
réactivation. Les brouillons restent accessibles. Aucune annonce n'est détruite.

---

## 7. Estimation de charge par lot

| Lot | Contenu | Charge |
|---|---|---|
| **M0** | Décisions tarifaires restantes (D-10, D-11) et cadrage juridique | — |
| **M1** | Socle : catalogue, rôles, **vérification pro**, espace vendeur | **lourd** |
| **M2** | Annonces : modèle, états, nomenclature, photos, bucket public, modération de base | **lourd** |
| **M3** | Recherche : projection, extensions, index, distance, filtres, curseur | **moyen à lourd** |
| **M4** | Vitrine publique : pages anonymes, référencement, mentions | **moyen** |
| **M5** | Interactions : messagerie, offres, **échanges avec soulte**, réservations, code de retrait | **moyen à lourd** |
| **M6** | Modération et sécurité : signalements, file, suspensions, contestations, score | **moyen** |
| **M7** | Notifications | **moyen** |
| **M8** | Commercial : offre Market, abonnement, facturation — **bloqué par MP** | **moyen** |
| **M9** | Ponts Stock et Colors | **léger à moyen** |
| **M10** | Site public « À venir » (**dépôt `elsatia-site`, hors de ce lot**) | **léger** |
| **M11** | Recette, sécurité, RGPD, charge | **moyen** |
| **MP** | **Modèle d'abonnement multiproduit ELSATIA** (§5) — lot transverse, hors Market | **lourd** |

**MP est un lot d'écosystème, pas un lot Market.** Il bénéficie à tous les produits et corrige une
dette existante. Market en est le déclencheur, pas le propriétaire.

---

## 8. Confirmation

Étude économique et comparaison de schémas de paiement. **Aucun objet Stripe créé, lu par API ou
modifié**, ni en Test ni en Live. Aucun prix, aucun produit, aucun plan, aucune souscription. Aucun
tarif définitif. Aucune modification du contrat tarifaire canonique. **Aucun code, aucune migration,
aucun SQL proposé, aucun numéro de ledger réservé.**
