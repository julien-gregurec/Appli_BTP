# ELSATIA — Boutique : spécification fonctionnelle (V1)

| | |
|---|---|
| Nature | Conception documentaire. Aucun code, aucune migration, aucun objet Stripe, aucun déploiement. |
| Base | `1fc1331` |
| Amont | `ELSATIA-BOUTIQUE-ARCHITECTURE-AUDIT-REPORT.md`, `…-CATALOG-ORDERS-MODEL-V1.md`, `…-NFC-CARD-COMMERCE-V1.md` |

> Aucun prix, aucun délai, aucun stock, aucune garantie, aucune remise, aucun témoignage n'est
> inventé dans ce document.

---

## 0. Ce que la Boutique est, et ce qu'elle n'est pas

**La Boutique ELSATIA est l'espace où ELSATIA vend ses propres produits et services.** ELSATIA
est le vendeur : elle fixe les produits et les tarifs, gère les commandes, et répond de la
facturation, de la livraison et du service après-vente.

**ELSATIA Market est autre chose** : une plateforme où des professionnels abonnés publient leurs
propres biens, surplus et matériels. ELSATIA n'y est pas vendeur.

Cette distinction n'est pas rédactionnelle, elle est structurante : dans la Boutique, toute
réclamation, tout retour et tout remboursement engagent ELSATIA. Aucun écran, aucun libellé,
aucune page publique ne doit laisser croire que la Boutique est un espace de mise en relation.

---

# Partie A — Parcours client

## A.1 Les deux audiences

| | Particulier | Professionnel |
|---|---|---|
| Identité | personne physique | entreprise (raison sociale, SIREN) |
| Prix affiché | **TTC en premier** | **HT en premier**, TTC rappelé |
| Rétractation | 14 jours, sauf exclusions | **aucune** (hors cas très particuliers) |
| Garantie | légale de conformité + vices cachés | vices cachés ; conformité contractuelle |
| Facture | obligatoire à la demande, systématique ici | obligatoire, avec mentions professionnelles |
| Médiation consommation | obligatoire de proposer | non applicable |
| TVA | toujours facturée | facturée, sauf autoliquidation intracommunautaire |

**L'audience n'est pas un préréglage d'affichage : elle change le contrat.** Elle doit donc être
déterminée **avant** le paiement, jamais déduite après coup, et **figée dans la commande**.

Le prototype actuel ne connaît qu'une seule audience — l'entreprise cliente déjà abonnée — et
n'affiche que du HT. Il n'est pas utilisable tel quel pour un particulier.

## A.2 Les 17 étapes

| # | Étape | Ce qui se joue | Preuve conservée |
|---|---|---|---|
| 1 | Consultation | Aucun engagement. Prix, disponibilité et délai affichés tels qu'ils sont, jamais embellis. | — |
| 2 | Choix d'un produit | — | — |
| 3 | Variante | Le prix et la disponibilité **dépendent de la variante**, pas du produit. | — |
| 4 | Personnalisation | Bascule le régime de rétractation. Doit être **annoncée avant**, pas après. | Données de personnalisation |
| 5 | Aperçu | Dernier moment où le client peut corriger. | **Aperçu validé, archivé** |
| 6 | Panier | Panier **serveur**, pas `localStorage`. Prix revalidés à chaque affichage. | — |
| 7 | Adresse | Facturation **et** livraison, distinctes. Pays obligatoire (il détermine la TVA). | Adresses figées |
| 8 | Livraison | Mode, délai indicatif, frais de port. Aucun délai promis qui ne vienne du transporteur. | Mode + frais figés |
| 9 | Paiement | **Le montant est recalculé serveur juste avant.** Cf. partie C. | Référence de paiement |
| 10 | Confirmation | Écran **et** e-mail. Récapitulatif complet, y compris mentions de rétractation. | E-mail horodaté |
| 11 | Facture | Émise par **ELSATIA**. Numérotation continue. Cf. §A.5. | Facture PDF archivée |
| 12 | Suivi | États de commande lisibles par le client, sans jargon interne. | Journal d'états |
| 13 | Réception | Livraison confirmée par le transporteur ou par le client. | Preuve transporteur |
| 14 | Activation | **Uniquement pour les produits activables** (cartes NFC). Cf. `…-NFC-CARD-COMMERCE-V1.md` §4. | Horodatage + auteur |
| 15 | Retour | Demande motivée, autorisation, bordereau, réception, contrôle. | Bordereau + constat |
| 16 | Remboursement | Total, partiel, ou avoir. Jamais automatique. | Avoir + référence Stripe |
| 17 | Assistance | Canal identifié, rattaché à la commande. | Fil de support |

Trois étapes n'existent **pas du tout** aujourd'hui : 15, 16, 17. Deux existent mais sans
document : 11 (aucune facture émise) et 13 (aucun suivi transporteur).

## A.3 Commande avec ou sans compte — analyse avant décision

La commande impose de n'ouvrir la commande sans compte **qu'après** analyse des conséquences sur
la facturation, le suivi et les droits RGPD. Voici l'analyse.

### Facturation

Une facture exige une identité et une adresse **exactes** : sans compte, elles ne sont ni
vérifiées ni corrigibles par le client lui-même. Surtout, une facture émise doit être conservée
au titre des obligations comptables — **plusieurs années** — indépendamment de toute demande
d'effacement. Vendre sans compte ne réduit donc pas les données conservées : cela les conserve
sans donner au client le moyen d'y accéder.

### Suivi

Sans compte, le suivi passe par un **lien porteur de jeton** envoyé par e-mail. Ce lien est un
secret de fait : qui l'a, voit la commande, l'adresse et le montant. Il faut alors le limiter
dans le temps et en portée — ce qui revient à construire une demi-authentification, moins sûre
qu'un compte, pour un confort marginal.

### Droits RGPD

C'est le point décisif. Un client sans compte qui demande l'accès ou l'effacement de ses données
**ne peut pas prouver son identité** par un canal authentifié. Répondre à une simple adresse
e-mail transforme la procédure RGPD elle-même en vecteur : il suffit de connaître l'adresse d'un
tiers pour demander son historique. Un compte, lui, offre un canal authentifié.

### Le cas particulier qui tranche

**Les cartes NFC ne sont pas activables sans identité.** L'activation associe un support à une
carte, et une carte a un titulaire (Contact/Card V1). Vendre une carte à un acheteur anonyme
produit un objet qu'il faudra de toute façon rattacher à un compte pour qu'il serve.

### Conclusion — recommandation

| Cas | Compte |
|---|---|
| Produit **activable** (carte NFC, licence, abonnement) | **Compte obligatoire.** Non négociable : sans identité, le produit ne fonctionne pas. |
| Produit **non activable** (accessoire seul) | Compte non requis techniquement. |
| **Recommandation V1** | **Compte obligatoire pour tout.** |

Justification : le seul produit V1 réellement envisagé est la carte NFC, qui exige un compte.
Ouvrir un parcours invité pour les seuls accessoires ferait construire, tester et maintenir un
second parcours complet — panier invité, suivi par jeton, procédure RGPD dégradée, réconciliation
si l'invité crée un compte ensuite — pour une part de ventes qui n'existe pas encore.

**Ce n'est pas un refus définitif.** C'est un report motivé : la commande invité redeviendra
pertinente le jour où le catalogue comportera des produits non activables vendus seuls. Le
modèle de données doit donc prévoir un **client Boutique** distinct de l'entreprise
(cf. §A.4) — pour ne pas avoir à tout refaire à ce moment-là.

## A.4 Le modèle client — le point de rupture avec l'existant

Aujourd'hui, `boutique_commandes.entreprise_id` est `not null` vers `entreprises`, et toute la
RLS repose dessus. Il n'existe pas de client Boutique : il n'existe que des entreprises clientes
de Gestion Pro.

Conséquence directe : **on ne peut vendre qu'à un client Gestion Pro existant.** Un artisan qui
veut seulement une carte NFC ne peut pas acheter.

### Conception retenue

Un **client Boutique** est une entité propre, avec un type (`particulier` | `professionnel`),
ses adresses, ses commandes, et un **rattachement facultatif** à une entreprise Gestion Pro.

```
   compte utilisateur
          │
          ▼
   CLIENT BOUTIQUE ──(facultatif)──► entreprise Gestion Pro
     type, adresses,                  (si le client est aussi abonné)
     commandes, factures
```

Trois propriétés que ce modèle doit tenir :

1. **acheter n'exige pas d'être abonné** — sinon la Boutique ne peut pas recruter ;
2. **être abonné ne crée pas automatiquement un client Boutique** — sinon on crée des clients
   fantômes qui n'ont jamais rien acheté ;
3. **le rattachement est réversible et tracé** — un client peut s'abonner après avoir acheté.

Le rattachement à la trésorerie Gestion Pro (existant, migrations 175/176) reste possible
**quand et seulement quand** ce rattachement existe. Il devient une conséquence du lien, pas une
condition de l'achat.

## A.5 Facturation — le bloquant légal

Rappel de l'audit : une commande payée ne produit aujourd'hui **aucun document de vente émis par
ELSATIA**. Elle crée une écriture dans la comptabilité du client. Ce n'est pas une facture.

Exigences minimales d'une facture de vente ELSATIA :

- **numérotation continue, sans trou, sans réutilisation**, indépendante des commandes ;
- identité complète du vendeur et de l'acheteur, telles qu'au moment de la vente ;
- détail des lignes, HT, taux et montant de TVA par taux, total TTC ;
- mentions imposées par la situation (autoliquidation, exonération, franchise le cas échéant) ;
- **document figé** : une facture émise n'est jamais modifiée. Une correction se fait par avoir.

Deux règles de conception qui en découlent :

1. la facture **copie** les données (vendeur, acheteur, lignes, taux) au lieu de les référencer —
   modifier une adresse client ne doit jamais réécrire une facture passée ;
2. l'émission est **idempotente** : un webhook rejoué ne crée pas une deuxième facture. Le
   mécanisme existe déjà pour la finalisation de commande, il doit couvrir la facture.

---

# Partie B — Stock et logistique

## B.1 Le pont avec Gestion Pro : faible, optionnel, jamais implicite

La commande interdit d'utiliser automatiquement le stock Gestion Pro sans décision
d'architecture. Cette décision est ici : **non**.

| | Stock Gestion Pro | Stock Boutique |
|---|---|---|
| À qui il appartient | à l'entreprise cliente | à ELSATIA |
| Ce qu'il décrit | ce que le client possède | ce qu'ELSATIA peut vendre |
| Qui l'écrit | le client | ELSATIA |
| Isolation | par entreprise (RLS) | plateforme |

Ce sont **deux stocks différents, de deux propriétaires différents**. Les confondre ferait
apparaître le stock d'ELSATIA dans l'inventaire d'un client, ou l'inverse. Aucune tentation de
réutilisation ne justifie ce risque.

**Le pont faible retenu** — et il est unidirectionnel, facultatif et déclenché par un événement,
jamais par une lecture croisée :

> Quand une commande Boutique est livrée **et** que le client est rattaché à une entreprise
> Gestion Pro **et** que l'entreprise l'a explicitement demandé, ELSATIA **propose** — sans
> l'appliquer — la création d'une entrée d'outillage ou de stock chez le client.

Trois conditions cumulatives, une proposition et non une écriture. C'est la même règle que celle
déjà tenue par l'écosystème pour les données OCR de Contact/Card : *aucune information ne devient
une fiche métier sans qu'un humain l'ait vue et validée*.

Le rattachement trésorerie existant (175/176) suit la même logique : conservé, mais il ne tient
plus lieu de facture (§A.5), et il ne s'applique qu'aux clients rattachés.

## B.2 États et notions de stock

| Notion | Définition | Manque aujourd'hui ? |
|---|---|---|
| Stock disponible | vendable immédiatement | existe |
| **Stock réservé** | engagé par une commande non encore payée | **absent — cf. T4 de l'audit** |
| Seuil d'alerte | déclenche un réapprovisionnement | existe (jamais exploité : aucune alerte) |
| Rupture | disponible = 0, réapprovisionnement prévu | déduit, non modélisé |
| Épuisé définitif | ne reviendra pas | absent |
| Précommande | vendable avant réception | absent |
| Lot | ensemble d'unités d'une même production | absent |
| Numéro de série | identifie **une** unité | absent |

### La réservation — correction d'un défaut réel

Aujourd'hui le stock n'est décrémenté qu'à la réception du webhook de paiement, et la
décrémentation est écrite `greatest(0, stock - quantite)` : **la survente est silencieusement
absorbée**. Deux clients peuvent payer le dernier exemplaire, et rien ne le signale.

Conception : le stock est **réservé** à la création de la session de paiement, pour une durée
bornée, libéré si le paiement expire ou est annulé, et **consommé** au paiement. Les trois
quantités deviennent explicites : `physique`, `réservé`, `disponible = physique − réservé`.
Toute tentative de réservation supérieure au disponible **échoue**, elle n'est pas absorbée.

## B.3 Fournisseur, coût d'achat, marge

Le coût d'achat interne est une donnée **strictement interne** : jamais exposée au client, jamais
dans une réponse d'API accessible côté navigateur, jamais dans les métadonnées Stripe.

Il est porté par un **approvisionnement** (fournisseur, lot, quantité, coût unitaire, date), pas
par la variante : un même produit acheté à deux moments n'a pas le même coût, et écraser
l'ancien coût rendrait toute analyse de marge fausse rétroactivement.

## B.4 Expédition, incidents, réexpédition

| Notion | Règle |
|---|---|
| Préparation | Liste de préparation par commande. Une commande partiellement préparable peut donner **plusieurs expéditions**. |
| Transporteur | Entité déclarée, pas un texte libre. |
| Numéro de suivi | Rattaché à l'**expédition**, pas à la commande — une commande peut en avoir plusieurs. |
| Échec de livraison | État explicite, avec motif du transporteur. Ne fait **pas** repasser la commande en « en préparation ». |
| Produit endommagé | Constat, avec preuve (photo). Ouvre remplacement ou remboursement. |
| Produit perdu | Après délai transporteur. Ouvre réexpédition ou remboursement. |
| Réexpédition | **Nouvelle expédition, même commande.** Ne crée pas une seconde vente, donc ne facture pas deux fois. |

La règle qui évite le plus d'erreurs comptables : **une commande peut avoir plusieurs
expéditions, une expédition n'appartient qu'à une commande, et une réexpédition ne crée jamais de
seconde facture.**

---

# Partie C — Méthode tarifaire

> **Aucun prix n'est proposé, suggéré ou calculé dans ce document.** Ce qui suit est une méthode
> et une typologie. Tous les paramètres sont notés `<à obtenir>` et resteront vides tant qu'il
> n'y aura pas de devis fournisseur, de volumes et de taux de retour observés.

## C.1 Réconciliation avec l'antériorité

Un modèle de marge existe déjà : `ELSATIA_HARDWARE_SHOP_LABELS_READINESS_V1.md` §29, sur une
branche **non fusionnée**. Il pose : `coût_réel_unité = prix_achat + transport entrant amorti +
emballage/kitting + provision SAV + frais de paiement + stockage amorti`, puis
`prix_vente = coût_réel × (1 + marge_cible)`, avec l'avertissement de ne pas fixer `marge_cible`
sans données réelles.

**Ce modèle est repris tel quel.** Il lui manque quatre postes exigés par la présente commande,
qui n'existaient pas dans son périmètre matériel : la **personnalisation**, la **fabrication à la
demande**, la **garantie** et le **coût logiciel** éventuel. Ils sont ajoutés ci-dessous.

## C.2 Coût réel unitaire — modèle étendu

```
coût_réel_unité =
    coût_d_achat_HT                        <à obtenir : devis fournisseur>
  + transport_entrant amorti               <à obtenir>
  + fabrication_à_la_demande               <à obtenir>   ← nouveau (carte personnalisée)
  + personnalisation                       <à obtenir>   ← nouveau (préparation du visuel, calage)
  + emballage / kitting                    <à obtenir>
  + coût_de_stockage amorti                <à obtenir>   (nul si fabrication à la commande)
  + provision_SAV                          = taux_de_retour_observé × coût_de_traitement
  + provision_garantie                     <à obtenir>   ← nouveau (remplacement sous garantie)
  + provision_pertes                       <à obtenir>   (perte transporteur, casse, rebut)
  + service_client amorti                  <à obtenir>
  + frais_de_paiement                      <à obtenir : barème Stripe applicable>
  + coût_logiciel_amorti                   <à obtenir>   ← nouveau, et seulement si Q9 tranche
                                                          que la carte inclut un service

prix_de_vente_HT = coût_réel_unité × (1 + marge_cible)
prix_TTC         = prix_de_vente_HT × (1 + taux_TVA applicable)   ← calculé, jamais stocké
```

Trois avertissements de méthode, qui comptent autant que la formule :

1. **`marge_cible` n'est pas une valeur unique.** Un objet à faible rotation et un consommable
   récurrent n'ont pas la même. L'avertissement de l'antériorité est maintenu.
2. **Les provisions ne sont pas des devinettes.** `provision_SAV`, `provision_garantie` et
   `provision_pertes` reposent sur des taux **observés**. Avant les premières ventes, ils sont
   inconnus — et il faut l'écrire, pas les remplir au jugé.
3. **Les frais de paiement s'appliquent au TTC encaissé**, pas au HT. L'oublier fait sous-estimer
   le coût d'environ le montant de la TVA multiplié par le taux de commission.

## C.3 Typologie des prix

| Type | Qui le fixe | Portée | Traçabilité |
|---|---|---|---|
| **Prix public** | ELSATIA | tous les particuliers | Prix daté (§1.6 du modèle de catalogue) |
| **Prix professionnel** | ELSATIA | acheteurs professionnels | Prix daté, audience `professionnel` |
| **Prix par quantité** | ELSATIA | palier `quantite_min` | Prix daté, même mécanisme |
| **Remise** | un humain | une commande ou un client | **auteur, motif, durée, historique — obligatoires** |
| **Promotion** | ELSATIA | période bornée | Dates de début et de fin obligatoires |
| **Geste commercial** | un humain | une commande précise | Auteur, motif ; produit un **avoir**, jamais une réécriture de facture |
| **Coupon** | ELSATIA | code, conditions, quota | Conditions et quota bornés ; cf. §1.10 du catalogue |
| **Prix négocié** | un humain | un client nommé | Audience `negocie`, durée bornée, auteur |
| **Tarif historique** | personne | un client existant | Conséquence du prix daté : le prix appliqué à une commande passée reste lisible |

## C.4 La règle non négociable sur les remises

> **Toute remise a un auteur, un motif, une durée et un historique.**

Conséquences de conception, et non de rédaction :

1. une remise **sans motif est refusée** — le champ est obligatoire, pas facultatif ;
2. une remise **sans date de fin est refusée** — une remise perpétuelle est un prix, et un prix
   se déclare comme tel ;
3. une remise **n'est jamais modifiée** : elle est close et remplacée ;
4. une remise appliquée est **copiée dans la commande**, avec son motif et son auteur — pour
   qu'une facture reste explicable des années plus tard ;
5. **aucun rôle ne peut se remiser à soi-même** sans validation d'un autre.

Rappel de l'audit : aujourd'hui, ni les remises ni **les prix eux-mêmes** ne sont historisés.
`modifierProduitBoutiqueAction` écrase `prix_ht` sans auteur ni trace. Reconstituer le prix
affiché à une date donnée est actuellement impossible.

## C.5 Points bloqués par des arbitrages non rendus

Deux incohérences connues du moteur commercial pèsent sur la Boutique et **ne sont pas tranchées
ici** : deux modèles de comptes supplémentaires incompatibles, et un tarif annuel calculé ×10
d'un côté et ×12 de l'autre. Elles n'affectent la Boutique que si Q9 conclut que la carte
embarque un service. **Elles relèvent du lot tarifaire et du Train V3, pas de ce lot.**

---

# Partie D — Administration plateforme

## D.1 Principe

L'administration Boutique est une surface **plateforme**, réservée à ELSATIA. Elle n'est jamais
visible d'une entreprise cliente, quel que soit son abonnement.

Elle **réutilise** ce que le Train V3 apporte plutôt que de le refaire : l'annuaire plateforme et
la fiche entreprise (`feat/platform-client-directory-billing-workspace-v1`, non fusionné) et
l'accès support strict (`feat/platform-cross-app-support-access-communications-v1`, non fusionné,
assistance **stricte par défaut et verrouillée en Production**).

Conséquence directe : **un agent ELSATIA ne consulte pas librement les données d'un client.**
L'accès à une commande dans le cadre d'une assistance suit le régime strict du Train V3 — motif,
durée, trace — et non un droit d'administration général.

## D.2 Les 16 domaines

| Domaine | Existe | Contenu attendu |
|---|---|---|
| Catalogue | partiel (`/plateforme/boutique`) | Produits, natures, catégories, statut commercial, publication, archivage |
| Variantes | **non** | Axes d'options, références, poids, dimensions, disponibilité |
| Stock | partiel | Physique / réservé / disponible, seuils, alertes, lots, numéros de série |
| Commandes | **non** | Recherche, filtres par axe (cycle, paiement, retour, litige), détail, journal |
| Paiements | **non** | Rapprochement Stripe, écarts, événements reçus, `livemode` |
| Remboursements | **non** | Total, partiel, avec plafond cumulé et double validation |
| Expéditions | **non** | Préparation, transporteur, suivi, échecs, réexpéditions |
| Clients | **non** | Client Boutique, type, adresses, rattachement Gestion Pro éventuel |
| Factures | **non** | Numérotation, PDF, archivage, réémission d'un exemplaire (jamais modification) |
| Avoirs | **non** | Émission, motif, lien à la facture d'origine |
| Promotions | **non** | Codes, conditions, quotas, périodes |
| Retours | **non** | Demande, autorisation, bordereau, réception, constat |
| Produits personnalisés | **non** | File d'attente `a_verifier`, aperçu, validation ou refus motivé |
| Activation des cartes NFC | **non** | Supports, séries, états, associations, réattributions, révocations |
| Incidents | **non** | Litiges, dommages, pertes, avec pièces |
| Historique | **non** | Journal append-only, consultable, non modifiable |

**Deux domaines sur seize existent partiellement. Quatorze sont à construire.**

## D.3 Trois écrans qui portent l'essentiel du risque

1. **File de validation des personnalisations.** Dernier point humain avant une fabrication
   irréversible. Doit afficher l'aperçu exactement tel qu'il sera fabriqué, et permettre un refus
   **motivé** qui déclenche un remboursement, jamais un abandon silencieux.
2. **Écran de remboursement.** Le seul écran qui fait sortir de l'argent. Plafond cumulé affiché,
   avoir généré, motif obligatoire, double validation au-delà d'un seuil `<à définir>`.
3. **Écran d'activation des supports.** Le seul écran qui peut réattribuer une carte, donc
   changer qui répond derrière une URL déjà imprimée. Chaque réattribution est tracée : auteur,
   motif, ancienne et nouvelle association.
