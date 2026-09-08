# ELSATIA-MARKET-BUSINESS-MODEL-V1

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1` — Phases 7 et 8
Nature : étude. **Aucun tarif définitif, aucun prix Stripe, aucun objet Stripe créé, lu par API ou
modifié.**
Branche : `feat/market-architecture-legal-business-v1` — base `1fc1331`

> **Tous les montants de ce document sont des ordres de grandeur d'étude.** Aucun n'est arbitré.
> Aucun ne doit être affiché, communiqué ou saisi dans Stripe. La grille canonique ELSATIA
> (`CANONICAL-V4-2026-09`) ne contient aucune offre Market, et ce document ne l'y ajoute pas.

---

## 1. Le cadre posé par Julien

> Seuls les professionnels qui publient des annonces paient un abonnement ou une offre commerciale
> liée à la vente. Les particuliers acheteurs ne paient aucun abonnement pour consulter ou acheter.

Cette décision est **structurante** et n'est pas remise en question ici. Elle a trois conséquences
que l'étude doit assumer :

1. **L'acheteur est gratuit, toujours** — particulier comme professionnel. Aucun des trois modèles
   étudiés ne facture l'acheteur.
2. **Le revenu vient du vendeur, et de lui seul.**
3. **Le revenu n'est pas indexé sur la valeur des transactions** dans le modèle de base. C'est la
   principale différence avec les places de marché grand public, et c'est un choix défendable : il
   rend le revenu prévisible et évite d'avoir à observer, mesurer et sécuriser les transactions —
   c'est-à-dire l'essentiel du coût et du risque d'une marketplace.

---

## 2. Le problème économique propre à une marketplace : l'amorçage

Toute place de marché affronte le même obstacle. Un acheteur ne vient que s'il y a des annonces ; un
vendeur ne paie que s'il y a des acheteurs. Facturer le vendeur **dès le premier jour**, alors qu'il
n'y a aucune audience, revient à lui vendre une promesse.

Trois éléments propres à ELSATIA atténuent le problème, sans le supprimer :

| Atout | Portée |
|---|---|
| Base installée d'entreprises BTP déjà clientes | l'offre de départ peut naître du parc existant, sans acquisition |
| Compte ELSATIA commun (socle multi-app livré) | activer Market ne demande ni inscription ni nouveau compte |
| Ponts Stock / Colors | le coût de publication d'une annonce est bas pour un client existant |

**Conséquence pour tous les modèles** : une phase d'amorçage à revenu nul ou quasi nul est
**inévitable**. Ce n'est pas une remise, c'est le prix d'entrée sur ce marché. Le nier conduirait à
poser une grille qui ne se vendra pas.

---

## 3. Les trois modèles économiques

### Modèle 1 — Abonnement vendeur pur

**Principe.** Le vendeur paie un abonnement mensuel ou annuel donnant droit à publier. Aucune
commission, aucune observation des transactions. ELSATIA n'intervient pas dans la vente.

**Structuration.** Trois niveaux, différenciés par le nombre d'annonces actives simultanées, le
nombre de photos, la durée de publication et la présence d'une page vendeur.

| Palier | Annonces actives | Ordre de grandeur (étude) |
|---|---:|---|
| Découverte | 3 | gratuit ou très bas |
| Standard | 20 | dizaines d'euros / mois |
| Volume | 100 | ~2 à 3 × Standard |
| Multi-sites / grand compte | négocié | devis |

Annonces supplémentaires à l'unité, mises en avant en option.

| Avantages | Risques | Coût opérationnel |
|---|---|---|
| Revenu **prévisible et récurrent** | à l'amorçage, le vendeur paie sans audience | **le plus bas des trois** |
| Aucun encaissement de la vente → statut juridique le plus simple | revenu **déconnecté de la valeur créée** : une vente à 40 000 € rapporte autant qu'une à 40 € | ni KYC, ni séquestre, ni litige de paiement, ni chargeback, ni TVA sur la transaction |
| Aucun KYC de paiement, aucune obligation d'établissement de paiement | l'abonnement est **le premier poste coupé** dans une PME sous tension | facturation = celle qui existe déjà (`abonnements_entreprises`, Stripe) |
| Modèle **déjà maîtrisé** par ELSATIA (abonnements GP) | plafond de revenu bas | modération et vérification pro restent à la charge d'ELSATIA |
| Compatible avec le socle livré, sans Connect | | |

**Alignement avec la décision de Julien : total.**

---

### Modèle 2 — Abonnement vendeur + commission sur transaction

**Principe.** Abonnement d'accès réduit, complété par une commission (ordre de grandeur d'étude :
2 à 5 %) prélevée sur les ventes conclues **via la plateforme**.

**Prérequis absolu** : ELSATIA doit **observer et intermédier le paiement**. Une commission sur une
transaction qu'on ne voit pas est incollectable — le vendeur conclura hors plateforme.

| Avantages | Risques | Coût opérationnel |
|---|---|---|
| Revenu **aligné sur la valeur créée** | **contournement** : la mise en relation faite, les deux parties ont un intérêt convergent à sortir de la plateforme. C'est le risque n° 1, et il est structurel. | **très élevé** |
| Barrière d'entrée basse pour le vendeur | change la **nature juridique** : ELSATIA devient intermédiaire de paiement | KYC/LCB-FT de tous les vendeurs |
| Aligne ELSATIA sur le succès de ses vendeurs | expose aux **litiges, remboursements et chargebacks** | gestion des litiges, remboursements, avoirs |
| Potentiel de revenu **très supérieur** | complexité TVA (biens d'occasion, régime de la marge, autoliquidation, ventes intracommunautaires) | Stripe Connect Express/Custom complet |
| | responsabilité perçue d'ELSATIA sur la transaction | support opérationnel permanent |
| | tension directe avec « seuls ceux qui publient paient un abonnement » | comptabilité de flux de tiers |

**Alignement avec la décision de Julien : partiel.** La commission n'est ni un abonnement, ni « une
offre liée à la vente » au sens d'un forfait — c'est un prélèvement sur le prix du bien. Cela ne
contredit pas frontalement l'instruction, mais cela en déplace le centre de gravité et mérite un
arbitrage explicite.

---

### Modèle 3 — Abonnement de base + options de visibilité (freemium encadré)

**Principe.** Un socle **gratuit et durable** (3 annonces actives, photos limitées, durée courte)
ouvert à toute entreprise vérifiée. La monétisation porte sur le **volume** et la **visibilité** :
paliers d'annonces, remontée en tête de catégorie, mise en avant sur la page d'accueil, page
vendeur enrichie, alertes prioritaires.

| Avantages | Risques | Coût opérationnel |
|---|---|---|
| **Résout l'amorçage** : le catalogue se remplit avant qu'on ne facture | revenu **incertain et tardif** ; le gratuit peut suffire à beaucoup de vendeurs occasionnels | **moyen** |
| Barrière d'entrée nulle → volume d'annonces | coût de **modération et de vérification supporté aussi pour les gratuits** | vérification pro sur tout le parc, y compris non payant |
| Aucune commission → statut juridique simple, comme le Modèle 1 | la mise en avant payante impose une **transparence sur le classement** (obligation d'information sur les critères de référencement) | modération sur tout le parc |
| Monétise ce qui a une valeur réelle et mesurable : la visibilité | risque d'un catalogue de faible qualité si le gratuit est trop généreux | affichage du classement et de son critère |
| Conversion naturelle : le vendeur paie **après** avoir constaté l'intérêt | | facturation : socle existant |

**Alignement avec la décision de Julien : bon.** Seuls les professionnels qui publient paient — ceux
qui publient **beaucoup** ou **veulent être vus**. Les acheteurs restent gratuits.

---

### 3.4 Comparaison

| Critère | M1 Abonnement pur | M2 + Commission | M3 Freemium encadré |
|---|:---:|:---:|:---:|
| Alignement décision Julien | **total** | partiel | **bon** |
| Amorçage du catalogue | difficile | moyen | **facile** |
| Prévisibilité du revenu | **forte** | faible | moyenne |
| Plafond de revenu | bas | **élevé** | moyen |
| Complexité juridique | **faible** | **élevée** | faible |
| Coût opérationnel | **faible** | **élevé** | moyen |
| Charge de développement V1 | **faible** | **élevée** | faible à moyenne |
| Risque de contournement | sans objet | **majeur** | sans objet |
| Réversibilité | **forte** | faible | **forte** |
| Délai de mise sur le marché | **court** | long | court |

### 3.5 Recommandation

**Modèle 3 pour le lancement, avec une trajectoire explicite vers le Modèle 1.**

Raisonnement :

1. **Le Modèle 2 est prématuré, pas mauvais.** Il exige de savoir intermédier des paiements entre
   tiers — KYC, litiges, chargebacks, TVA sur biens d'occasion — alors qu'aucune de ces briques
   n'existe (l'audit établit que le Connect en place n'a **aucun** `application_fee`). Et il repose
   sur un pari non vérifié : que les parties accepteront de payer sur la plateforme plutôt que de
   sortir après la mise en relation. Sur des biens professionnels d'occasion, souvent retirés sur
   place et payés par virement, ce pari est franchement défavorable.

2. **Le Modèle 1 est le bon régime de croisière, mais un mauvais point de départ.** Facturer un
   abonnement pour publier dans un catalogue vide, c'est vendre une audience qui n'existe pas.

3. **Le Modèle 3 est le Modèle 1 avec une rampe d'accès.** Il partage sa simplicité juridique et son
   coût opérationnel modéré, et il résout l'amorçage. Le gratuit n'est pas une remise : c'est le
   moyen de constituer l'inventaire sans lequel il n'y a rien à vendre.

4. **Ils convergent naturellement.** Quand le catalogue est dense et l'audience réelle, le palier
   gratuit se resserre et le Modèle 3 devient le Modèle 1 sans rupture de contrat pour personne.

**Ce qu'il faut éviter absolument** : lancer avec une commission. Elle impose la charge maximale au
moment où le produit a le moins de valeur démontrée, et elle est **très difficile à retirer** une
fois annoncée.

### 3.6 Ce que le modèle recommandé implique de tarifer — sans le tarifer ici

| Objet | Nature | Arbitrage requis |
|---|---|---|
| Palier gratuit | annonces actives, photos, durée | **D-10** |
| Paliers payants | volume d'annonces actives | **D-10** |
| Annonce supplémentaire | à l'unité, récurrente | **D-10** |
| Mise en avant | **achat ponctuel** — jamais un « /mois » | **D-10** |
| Page vendeur enrichie | option récurrente | **D-10** |
| Multi-sites / grands comptes | devis (`devis_obligatoire` existe déjà sur `plans_abonnement`) | **D-10** |
| Période d'essai | durée, contenu | **D-10** |
| Périodicité annuelle | la règle maison est `annuel = 10 × mensuel` | à confirmer pour Market |

**Aucun de ces montants n'est proposé ici.** Ils appellent une étude de marché et une décision de
Julien, dans un lot tarifaire dédié — comme cela a été fait pour Gestion Pro.

### 3.7 Insertion dans le contrat canonique

Le contrat `CANONICAL-V4-2026-09` est la source de vérité unique, consommée par l'application **et**
par le site vitrine. Une offre Market devra **y entrer** — pas vivre à côté.

Sa structure s'y prête : `offres`, options récurrentes, achats ponctuels (le pack de crédits IA est
le précédent exact d'une mise en avant ponctuelle), `modules`, et surtout des **générations
tarifaires versionnées avec conservation des anciennes**, mécanisme mûr et directement applicable.

**Dette héritée, à traiter avant et non après** (constat d'audit) : le prix souscrit n'est
aujourd'hui **pas figé au niveau du contrat** — il est relu dans le code à chaque affichage — et
`options_abonnement_entreprises.prix_unitaire_contractuel_ht` n'est **écrit par aucun code
applicatif**. Créer une offre Market sur cette base, c'est reproduire le défaut sur un deuxième
produit. **Décision D-7.**

---

## 4. Phase 8 — Paiement et facturation

### 4.1 Deux flux à ne jamais confondre

| | **Flux A — Abonnement Market** | **Flux B — Prix du bien vendu** |
|---|---|---|
| Qui paie | l'entreprise vendeuse | l'acheteur |
| Qui encaisse | **ELSATIA** | **le vendeur** |
| Nature | service d'ELSATIA | vente entre le vendeur et l'acheteur |
| Facture | ELSATIA → vendeur | vendeur → acheteur |
| TVA | TVA française sur un service, régime ELSATIA | régime du vendeur et du bien (§4.5) |
| Existe aujourd'hui | infrastructure **livrée** | **rien** |
| Recommandation V1 | **Stripe, socle existant** | **hors plateforme** |

**Le Flux A n'est pas discutable** : c'est un abonnement ELSATIA de plus, sur une mécanique éprouvée
(`abonnements_entreprises`, `factures_abonnement`, webhooks cloisonnés, idempotence traitée via
`stripe_webhook_events`).

Tout le reste de cette phase porte sur le **Flux B**.

### 4.2 Les six schémas comparés (Flux B)

#### S1 — Contact direct, aucun paiement intégré

Market met en relation. Le paiement se règle entre les parties (espèces, virement, chèque, terminal
du vendeur), hors du système.

- **Rôle d'ELSATIA** : mise en relation et traçabilité des échanges.
- **KYC** : néant (aucun flux financier).
- **Coût de développement** : **nul** au-delà de la messagerie et de la réservation.
- **Risque** : aucune preuve de paiement ; litige non arbitrable par ELSATIA.
- **Responsabilité** : minimale — ELSATIA n'a jamais détenu de fonds.
- **Adapté à** : retrait sur place, virement B2B — c'est-à-dire **le cas dominant** des biens
  professionnels d'occasion.

#### S2 — Réservation avec acompte

Un acompte est versé pour bloquer le bien ; le solde se règle au retrait.

- **Rôle d'ELSATIA** : encaisse et reverse, ou intermédie l'acompte.
- **KYC** : **oui**, dès qu'ELSATIA touche des fonds destinés à un tiers.
- **Coût** : **élevé** — reversement, remboursement, gestion du non-retrait, litige sur l'acompte.
- **Risque** : l'acompte est le point de friction juridique par excellence (qui le conserve si
  l'acheteur ne vient pas ? si le bien n'est pas conforme ?).
- **Verdict** : **le pire rapport valeur/complexité des six.** Toute la complexité du paiement
  intégré, pour une fraction du montant.

#### S3 — Paiement complet via la plateforme (ELSATIA encaisse puis reverse)

- **Rôle d'ELSATIA** : intermédiaire de paiement de plein exercice.
- **KYC** : **oui, lourd** — LCB-FT sur tous les vendeurs, bénéficiaires effectifs, surveillance.
- **Coût** : **le plus élevé** — séquestre, reversement, remboursement, chargeback, réconciliation,
  comptabilité de flux de tiers.
- **Risque** : détenir des fonds pour compte de tiers relève d'un **régime réglementé** ; opérer
  sans le statut ou l'exemption adéquate est une prise de risque majeure.
- **Verdict** : **hors de portée en V1**, et disproportionné au regard du volume attendu.

#### S4 — Stripe Connect (comptes vendeurs connectés)

Trois déclinaisons, qui ne se valent pas :

| Déclinaison | Qui porte le KYC | Charge ELSATIA | Existant |
|---|---|---|---|
| **Standard** | **Stripe** (relation directe avec le vendeur) | faible | **DÉJÀ CÂBLÉ** : `entreprises.stripe_account_id`, OAuth, garde d'état anti-CSRF, contrôle de permission |
| **Express** | Stripe, avec parcours intégré | moyenne | inexistant |
| **Custom** | **ELSATIA** | **très élevée** | inexistant |

Constat d'audit décisif : **le Connect Standard existe déjà** — mais **sans `application_fee_amount`,
sans `transfer_data`, sans `on_behalf_of`**. Aucune commission n'est câblée, et le paiement se fait
*au nom de* l'entreprise connectée (`stripeAccount`).

Autrement dit : ELSATIA sait déjà faire payer un client **du vendeur** sur le compte **du vendeur**,
sans jamais toucher les fonds. C'est exactement la brique dont Market aurait besoin — et elle est
compatible avec un modèle **sans commission**.

- **Verdict** : **la seule voie crédible** si un paiement en ligne est souhaité un jour. En V1, elle
  n'est pas nécessaire.

#### S5 — Paiement au retrait

Le prix se règle physiquement à la remise, contre le code de retrait Market.

- **Rôle d'ELSATIA** : **aucun** sur le flux financier ; traçabilité de la remise seulement.
- **Coût** : nul.
- **Adapté à** : le retrait sur place, c'est-à-dire le cas dominant.
- **Verdict** : **c'est S1, appliqué au retrait.** À retenir avec S1.

#### S6 — Facturation directe vendeur → acheteur

Le vendeur facture avec ses propres outils (dont Gestion Pro, s'il en est client).

- **Rôle d'ELSATIA** : aucun. Éventuellement un **rappel** au vendeur d'établir sa facture.
- **Verdict** : **le corollaire obligé de S1 et S5.** C'est le vendeur qui doit facturer, parce que
  c'est lui le vendeur.

### 4.3 Recommandation

**V1 : S1 + S5 + S6.** Mise en relation, remise tracée par code de retrait, facturation par le
vendeur. ELSATIA ne touche jamais le prix d'un bien.

**Trajectoire V2, si et seulement si le besoin est démontré** : **S4 Standard sans commission** —
le vendeur encaisse en ligne sur son propre compte Stripe, la brique existe déjà, ELSATIA ne détient
rien et ne change pas de statut.

**S2 et S3 : écartés.** S2 concentre la complexité sans la valeur. S3 suppose un statut réglementé
sans rapport avec la taille du projet.

Ce choix n'est pas un renoncement. C'est la reconnaissance d'un fait de marché : sur des biens
professionnels d'occasion, souvent lourds, retirés sur place et réglés par virement entre
entreprises, **un paiement en ligne intégré n'est pas ce qui manque**. Ce qui manque, c'est
l'audience et la confiance.

### 4.4 Analyse des points exigés par la Phase 8

| Point | Sous S1+S5+S6 (V1) | Sous S4 sans commission (V2) | Sous S3 / commission (écarté) |
|---|---|---|---|
| **KYC vendeur** | vérification **professionnelle** (SIRET, rattachement) — pas un KYC financier | KYC **porté par Stripe** (Standard) | KYC LCB-FT **porté par ELSATIA** |
| **Reversement** | sans objet | sans objet (le vendeur encaisse directement) | à construire |
| **Commission** | aucune | aucune | `application_fee_amount` — **inexistant** |
| **Remboursement** | entre les parties | par le vendeur, dans son Stripe | par ELSATIA |
| **Litige** | **médiation** ELSATIA sur les faits tracés, jamais arbitrage financier | idem | arbitrage financier |
| **Chargeback** | sans objet | supporté par le vendeur | supporté par ELSATIA |
| **TVA** | **entièrement** au vendeur | idem | ELSATIA doit qualifier chaque flux |
| **Facture de vente** | par le vendeur | par le vendeur | par le vendeur, via ELSATIA |
| **Avoir** | par le vendeur | par le vendeur | à gérer |
| **Paiement partiel** | entre les parties | à construire | à construire |
| **Caution** | **non proposée** | non | à construire |
| **Annulation** | libération de la quantité engagée, aucun flux | idem | remboursement |
| **Preuve de livraison** | **code de retrait** + photo + signature optionnelle | idem | idem |
| **Responsabilité ELSATIA** | **hébergement et mise en relation** | idem | intermédiaire de paiement |

### 4.5 TVA — ce qui doit être dit sans être tranché

En V1, **ELSATIA n'a aucune obligation de TVA sur les ventes** : elle n'est pas partie à la vente.
Sa seule TVA est celle de son propre abonnement (Flux A), déjà gérée.

Le vendeur, lui, affronte une matière complexe que le **modèle d'annonce doit savoir représenter**
sans que la plateforme la tranche à sa place :

- TVA normale (20 %) sur un bien neuf ou un surplus vendu par un assujetti ;
- **régime de la marge** sur certains biens d'occasion ;
- exonérations et cas particuliers ;
- vente à un particulier (TTC affiché) vs. à un professionnel (HT), avec autoliquidation possible ;
- ventes intracommunautaires.

D'où le champ `tva_applicable` du modèle d'annonce, avec des valeurs explicites **dont
`marge`** — et une règle d'affichage : **prix TTC pour un acheteur particulier, prix HT pour un
acheteur professionnel**, sans ambiguïté. Une place de marché qui affiche un prix dont on ne sait
pas s'il est HT ou TTC fabrique du litige à la chaîne.

**ELSATIA ne calcule ni ne certifie la TVA d'une vente.** Le vendeur déclare, sous sa responsabilité,
et les CGU le disent. Voir le cadre juridique.

### 4.6 Facturation de l'abonnement Market (Flux A)

Entièrement couverte par l'existant :

```
plans_abonnement            → un plan Market (code, version, prix, quotas, devis_obligatoire)
abonnements_entreprises     → une souscription par entreprise
factures_abonnement         → facture ELSATIA
stripe_webhook_events       → idempotence
promotions_commerciales,
plateforme_operations_remise → remises et promotions
```

**Une limite structurelle à lever** : `abonnements_entreprises` porte `entreprise_id` en
**`unique`** — une entreprise, un abonnement. Une entreprise abonnée à Gestion Pro **et** à Market
ne rentre pas dans ce modèle. Trois voies : un second enregistrement (lever l'unicité — impact sur
tout le code existant), un modèle d'abonnement par application (plus propre, plus coûteux), ou
Market traité comme une **option** de l'abonnement existant (le plus simple, mais faux : Market doit
pouvoir être souscrit **sans** Gestion Pro).

**Décision D-8.** C'est le principal obstacle technique du modèle économique, et il est indépendant
du modèle retenu.

### 4.7 Ce qui ne sera jamais fait

| Interdit | Motif |
|---|---|
| Encaisser le prix d'un bien sur un compte ELSATIA | régime réglementé sans rapport avec le projet |
| Détenir des fonds pour compte de tiers | idem |
| Proposer un séquestre | idem |
| Garantir une transaction | ELSATIA n'est ni assureur ni garant |
| Proposer un crédit ou un paiement fractionné | régime réglementé |
| Afficher un prix sans dire s'il est HT ou TTC | fabrique du litige |
| Facturer l'acheteur | contraire à la décision de Julien |

---

## 5. Estimation de charge par lot

Ordres de grandeur pour une réalisation par lots séquentiels, hors décisions et hors juridique.

| Lot | Contenu | Charge |
|---|---|---|
| **M0** | Décisions D-1 à D-10, cadrage juridique par un professionnel du droit | — |
| **M1** | Socle : enregistrement au catalogue, rôles, vérification pro N1–N3, espace vendeur | **lourd** |
| **M2** | Annonces : modèle, états, nomenclature, photos, bucket public, modération de base | **lourd** |
| **M3** | Recherche : projection, extensions, index, distance, filtres, pagination par curseur | **moyen à lourd** |
| **M4** | Vitrine publique : pages anonymes, référencement, mentions légales | **moyen** |
| **M5** | Interactions : messagerie, offres, réservations, code de retrait, quotas | **moyen à lourd** |
| **M6** | Modération et sécurité : signalements, file, suspensions, contestations, score | **moyen** |
| **M7** | Notifications : typologie, préférences, file d'envoi | **moyen** |
| **M8** | Commercial : offre Market, abonnement (**dépend de D-8**), facturation | **moyen** |
| **M9** | Ponts Stock et Colors | **léger à moyen** |
| **M10** | Site public « À venir » (**dépôt `elsatia-site`, hors de ce lot**) | **léger** |
| **M11** | Recette, sécurité, RGPD, charge | **moyen** |

Prérequis externes bloquants : **M1 dépend d'une source de vérification d'entreprise (D-4)** et
**M3 d'extensions PostgreSQL non installées** (`unaccent`, `pg_trgm`, `earthdistance`/`cube`).
Dépendances internes : fusion de `9fcf128` (assistance), réconciliation du ledger, lot ELSATIA-UI-V2
(toute UI produite avant serait à refaire).

---

## 6. Confirmation

Étude économique et comparaison de schémas de paiement. **Aucun objet Stripe créé, lu par API ou
modifié**, ni en Test ni en Live. Aucun prix, aucun produit, aucun plan. Aucun tarif définitif.
Aucune modification du contrat tarifaire canonique. Aucun code, aucune migration.
