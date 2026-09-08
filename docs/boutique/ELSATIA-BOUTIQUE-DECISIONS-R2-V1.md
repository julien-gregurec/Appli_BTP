# ELSATIA — Boutique : décisions R2 (Q2, Q8, Q9, P0)

| | |
|---|---|
| Nature | **Consignation de décisions. Documentaire uniquement.** Aucun code, aucune migration, aucun Stripe, aucun déploiement. |
| Audit accepté | `6cb0b79` |
| Base | `1fc1331` |
| Décideur | Julien |
| Date | 2026-09-08 |

Ce document fait foi sur les points qu'il tranche. Les autres documents du lot ont été mis à
jour en conséquence ; en cas de divergence résiduelle, **c'est ce document qui prime**.

---

## D-Q2 — Le B2C est accepté

> **La Boutique ELSATIA vendra aux professionnels et aux particuliers.**

Deux modèles clients distincts sont prévus : **client professionnel** et **client particulier**.

### Ce qu'un particulier ne doit pas avoir à fournir

| Interdit d'exiger | Conséquence sur le modèle |
|---|---|
| Une entreprise Gestion Pro | `entreprise_id` cesse d'être la clé d'entrée de la Boutique |
| Un SIRET | Le numéro d'identification est un attribut **du modèle professionnel seulement** |
| Un abonnement Gestion Pro | Acheter n'exige pas d'être abonné |
| Un faux tenant professionnel | **Aucun contournement par entreprise fictive n'est acceptable** |

Ce dernier point est le plus important : créer une entreprise fantôme pour faire entrer un
particulier dans le modèle existant aurait « marché » techniquement, et aurait pollué
définitivement l'annuaire, la facturation et les statistiques. C'est explicitement écarté.

### Ce que le modèle doit assurer pour un particulier

Commande · paiement · adresse · facture · TVA · livraison · retour · remboursement ·
consentements · droits RGPD · **rattachement ultérieur facultatif à un compte ELSATIA**.

### Conséquence : la recommandation « compte obligatoire pour tout » est levée

L'audit `6cb0b79` recommandait, faute d'arbitrage, d'exiger un compte pour toute commande.
**Cette recommandation est remplacée** par la règle suivante, qui découle du rattachement
ultérieur facultatif :

| Moment | Compte ELSATIA |
|---|---|
| **Acheter** | facultatif |
| **Activer** un produit activable (carte NFC, licence) | **obligatoire** |
| **Rattacher** une commande passée à un compte | à l'initiative du client, à tout moment |

Cette règle est cohérente : une carte ne peut pas être activée sans titulaire, mais elle peut
être **achetée** par quelqu'un qui n'est pas encore titulaire — un dirigeant qui commande pour
son équipe, un particulier qui offre une carte. Le rattachement ultérieur facultatif devient
alors le chemin normal, et non une exception.

**Conséquences techniques à porter dans le lot 1 :**

1. le suivi d'une commande non rattachée passe par un lien porteur de jeton, **borné en durée et
   en portée** ;
2. les droits RGPD d'un client non rattaché exigent une vérification d'identité qui ne peut pas
   se réduire à la connaissance de l'adresse e-mail ;
3. le rattachement ultérieur doit être **idempotent** : rattacher deux fois la même commande ne
   la duplique pas ;
4. la médiation de la consommation devient **obligatoire** (cf. D-P0 et checklist juridique §8).

---

## D-Q8 — Réattribution sécurisée d'une carte NFC

> **Une carte NFC physique doit pouvoir être réattribuée.**

Neuf exigences, toutes retenues :

| # | Exigence | Porté par |
|---|---|---|
| 1 | Révocation de l'ancien jeton | fonction de résolution |
| 2 | Désactivation de l'ancien profil | carte logique |
| 3 | Contrôle des permissions | RLS |
| 4 | **Confirmation de l'administrateur de l'entreprise** | parcours d'administration |
| 5 | Nouveau jeton | carte logique |
| 6 | Nouvelle attribution | association support ↔ carte |
| 7 | **Audit append-only** | journal |
| 8 | Notification | notifications |
| 9 | **Absence totale d'accès pour l'ancien titulaire** | RLS + révocation |

Le support ELSATIA ne peut intervenir que par le **mécanisme d'assistance strict** : justifié,
limité dans le temps, notifié.

### ⚠︎ Point à confirmer — que désigne « le jeton » ?

L'exigence 1 (révoquer l'ancien jeton) et l'exigence 5 (nouveau jeton) sont réalisables de deux
façons, et **elles n'ont pas le même coût** :

| Lecture | Ce qu'elle implique | Verdict |
|---|---|---|
| **A — le jeton est celui gravé dans la puce** | Réattribuer impose de **ré-encoder la puce** — donc de récupérer physiquement la carte — **et le QR imprimé devient faux**, puisque Contact/Card V1 impose que QR et NFC portent le même jeton. La carte devient de fait à usage unique. | **impraticable** |
| **B — le jeton est celui de la carte logique (le profil)** | La puce garde son identifiant gravé ; c'est le jeton **de profil** qui est révoqué et remplacé. Les neuf exigences sont satisfaites, la carte reste réutilisable, le QR imprimé reste valide. | **retenue** |

**Lecture retenue : B.** Elle est la seule qui rende les neuf exigences simultanément
satisfaisables sans détruire l'objet. Concrètement :

```
  puce + QR imprimé  ──►  identifiant de SUPPORT (gravé, immuable)
                              │
                              ▼
                     association active  ──►  CARTE (jeton de profil, révocable et remplaçable)
```

Après réattribution : l'ancien jeton de profil est révoqué et ne résout plus jamais ; un nouveau
jeton de profil est créé pour le nouveau titulaire ; l'association du support bascule vers lui.
L'ancien titulaire n'a plus **aucun** accès — ni au profil, ni à ce que la carte reçoit.

> Si vous entendiez la lecture A, dites-le : cela change la nature du produit (carte non
> réattribuable, à remplacer physiquement) et le contenu du lot 7.

### ⚠︎ Deux frontières à préciser

**a) Carte détenue par un particulier.** L'exigence 4 impose la confirmation de
*l'administrateur de l'entreprise*. Une carte achetée par un particulier — désormais possible
depuis D-Q2 — n'a pas d'entreprise. **Règle retenue par défaut :** pour une carte détenue en
propre, le **titulaire est l'autorité** ; la réattribution est un acte du propriétaire du
support, tracé et notifié comme les autres. Une carte détenue par une entreprise reste soumise à
la confirmation de son administrateur.

**b) Ce que « absence totale d'accès » ne recouvre pas.** L'exigence 9 porte sur **la carte et
son profil**. Elle ne défait pas la règle de Contact/Card V1 (P15) sur le carnet de contacts
personnel d'un salarié qui part : *« versé à l'entreprise, ou conservé par la personne — un
choix, pas un défaut silencieux »*. Révoquer une carte ne confisque pas rétroactivement les
contacts d'une personne ; cela lui retire la carte, son profil et ce que la carte reçoit
désormais. Si vous vouliez aussi trancher le sort du carnet, c'est une décision distincte, qui
appartient au lot Contact/Card.

---

## D-Q9 — Socle permanent, sans abonnement

> **Une carte NFC achetée continue à fonctionner sans abonnement payant.**

### Socle permanent — jamais conditionné à un paiement récurrent

URL publique révocable · NFC · QR code · vCard · coordonnées essentielles · modification du
profil de base · désactivation en cas de perte.

### Fonctions avancées — peuvent dépendre d'un abonnement facultatif

Gestion d'équipe · statistiques · OCR · synchronisation Gestion Pro · classement automatique ·
campagnes · personnalisation avancée · automatisations.

> **L'arrêt d'un abonnement avancé ne doit pas désactiver le socle de la carte achetée.**

### Ce que cette décision tranche définitivement

1. **La carte est un bien vendu, pas un service loué.** C'était la question ouverte 13.5 de la
   checklist juridique. Elle est fermée.
2. **L'option C est retenue** pour l'articulation bien/abonnement : achat du bien seul, puis
   proposition d'abonnement **à l'activation**. Les options A (deux paiements imposés) et B
   (panier mixte) sont écartées.
3. **Le poste `coût_logiciel_amorti`** du modèle de coût devient **applicable** : le socle
   permanent a un coût d'hébergement et d'exploitation qui ne sera couvert par aucun
   abonnement. Il doit être intégré au coût réel unitaire de la carte, et non ignoré.

### ⚠︎ Une conséquence à écrire dans les CGV

Un socle « permanent » est un engagement de durée pris envers l'acheteur. Deux points doivent
être écrits **avant** la première vente, sous peine de promesse non tenable :

- **la règle de fin de service** : que se passe-t-il si ELSATIA cesse d'exploiter le service —
  préavis, export des données, sort de l'URL publique ;
- **ce que « permanent » signifie** : sans limite de durée liée au paiement, ce qui n'est pas
  la même chose que sans limite de durée absolue.

Ce n'est pas un obstacle à la décision : c'est la rédaction qu'elle impose.
Porté en checklist juridique §13.

### Contrainte technique qui en découle

**Aucun mécanisme de facturation ne doit pouvoir désactiver le socle d'une carte achetée.** Cela
doit être une propriété du code — un impayé d'abonnement avancé ne touche pas la résolution de
l'URL publique — et non une consigne d'exploitation.

---

## D-P0 — Conditions bloquantes avant toute ouverture

Quatre conditions cumulatives. **Tant qu'elles ne sont pas toutes fermées, la Boutique reste
masquée et son catalogue vide.**

| # | Condition | État | Effort |
|---|---|---|---:|
| **P0-1** | `boutiqueEstActive()` devient **fail-closed** | à faire | ~0,5 j |
| **P0-2** | Le webhook Boutique **refuse** un événement dont `livemode` ne correspond pas à l'environnement | à faire | ~0,5 j |
| **P0-3** | **Aucune commande n'est payable sans facture de vente ELSATIA** | à faire | cf. ci-dessous |
| **P0-4** | Boutique masquée et catalogue vide tant que P0-1 à P0-3 ne sont pas fermées | **tenu aujourd'hui** | — |

### ⚠︎ P0-3 change le séquencement du projet

Dans l'audit `6cb0b79`, la facturation était le **lot 8**, en aval des commandes et de la
logistique. En faire une condition d'ouverture la fait remonter en amont : **il n'existe plus de
palier intermédiaire où la Boutique serait ouverte mais pas encore facturante.**

Conséquences :

1. le lot « Factures et avoirs » **cesse d'être différable** ; il devient une dépendance de
   l'ouverture, au même titre que le paiement ;
2. il ne peut pas être développé plus tôt pour autant — une facture suppose une commande, un
   client et des montants figés, donc les lots 1, 4 et 5 ;
3. **le chemin critique se raccourcit d'un lot mais s'allonge en durée** : plus rien ne peut être
   ouvert avant lots 1 → 4 → 5 → 8. La feuille de route est mise à jour en conséquence ;
4. **P0-3 dépend d'une validation juridique** (mentions obligatoires, numérotation, conservation)
   qui n'est pas rendue. C'est aujourd'hui le seul des quatre points P0 qui ne dépende pas
   uniquement d'ELSATIA.

**P0-1 et P0-2 restent immédiatement réalisables** (~1 jour à eux deux) et ne dépendent d'aucun
arbitrage. Ils devraient partir avant le Train V3.

---

## Récapitulatif des questions

| # | Question | Statut |
|---|---|---|
| Q2 | Vend-on à des particuliers ? | **TRANCHÉE — oui** |
| Q8 | Réattribution d'une carte NFC | **TRANCHÉE**, sous réserve de la lecture B du « jeton » |
| Q9 | La carte fonctionne-t-elle sans abonnement ? | **TRANCHÉE — oui, socle permanent** |
| Q1, Q3 à Q7, Q10, Q11, Q13, Q14 | — | **toujours ouvertes** |

Q14 (bien + abonnement) est **résolue de fait** par D-Q9 : option C.
Q1 (module GP ou surface autonome) est **fortement contrainte** par D-Q2 : un particulier ne
devant traverser aucune entreprise, la Boutique ne peut plus être un simple module interne à
Gestion Pro. Elle n'est pas formellement tranchée pour autant.
