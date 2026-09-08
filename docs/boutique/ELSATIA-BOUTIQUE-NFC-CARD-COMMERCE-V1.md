# ELSATIA — Boutique : commerce des cartes NFC Contact/Card (V1)

| | |
|---|---|
| Nature | Conception documentaire. Aucun code, aucune migration, aucun objet Stripe. |
| Base | `1fc1331` |
| Amont produit | `audit/elsatia-contact-card-architecture-v1` @ `0e644d5` — architecture logicielle **close**, non fusionnée |
| Amont commerce | `ELSATIA-BOUTIQUE-CATALOG-ORDERS-MODEL-V1.md` |

> Aucun prix, aucun délai, aucune finition fournisseur, aucune garantie chiffrée n'est inventé
> dans ce document. Tout ce qui devra venir d'un fournisseur est noté `<à obtenir>`.

---

## 1. Ce que l'architecture Contact/Card impose déjà

Le lot Contact/Card a tranché quatre points qui **ne se rediscutent pas ici** :

1. **La carte physique n'est qu'un porteur d'URL.** Toute l'information vit dans le profil en
   ligne, modifiable. C'est écrit au §1 de la spécification fonctionnelle.
2. **La puce ne contient qu'une seule chose** : `https://<domaine>/c/<token>`. Pas de vCard
   embarquée, pas de nom, pas de téléphone, pas de clé. Une puce lue par un tiers malveillant ne
   donne rien de plus que l'URL publique.
3. **Le jeton du NFC est repris à l'identique dans le QR code**, ce qui garantit que les deux
   désignent la même carte.
4. **États d'une carte** : `brouillon → active → suspendue → révoquée`, `révoquée` étant
   **terminal**, appliqué par un filtre `revoque_le is null` **dans la fonction de résolution**.

L'exigence de la présente commande — *« une carte ne doit contenir aucun secret ou donnée
personnelle complète dans sa puce »* — est donc **déjà satisfaite** par l'architecture existante.
Ce document ne l'affaiblit pas ; il vérifie que la mise en vente d'un objet physique ne la casse
pas. C'est là que se trouve le vrai risque.

---

## 2. Le point que l'architecture Contact/Card n'a pas eu à trancher

Contact/Card V1 a été conçu **sans produit physique en vente**. Il confond donc, sans que cela
lui pose problème, deux objets que la mise en vente sépare :

| Objet | Ce que c'est | Durée de vie |
|---|---|---|
| **Le support** | L'objet fabriqué, expédié, encodé : une puce, un numéro de série, une finition, un QR imprimé. | Celle du plastique. Perdu, volé, cassé, remplacé. |
| **La carte** | L'entité logique Contact/Card : un titulaire, un profil, des états, des contacts reçus. | Celle de la personne dans l'organisation. |

Confondre les deux crée deux impasses concrètes, et aucune n'est théorique :

**Impasse 1 — la réattribution.** Un commercial part, son successeur reprend la carte. L'état
`révoquée` étant **terminal**, la carte logique ne peut pas être réaffectée. Mais la puce, elle,
porte une URL **gravée physiquement** : elle ne peut pas changer. Sans niveau intermédiaire, un
support réattribué exige de jeter un objet parfaitement fonctionnel.

**Impasse 2 — la perte.** Le titulaire perd sa carte. Il veut deux choses à la fois : que
l'objet perdu ne résolve plus, **et** conserver son profil, ses contacts reçus et son historique
sur un nouvel objet. Une révocation unique ne peut pas faire les deux.

### Conception retenue : une indirection au niveau du support

```
  puce NFC / QR imprimé
        │
        │  https://<domaine>/c/<token_support>      (gravé, immuable)
        ▼
  SUPPORT PHYSIQUE  ──── association active ────►  CARTE  ────►  profil, contacts
  série, finition, lot                             (Contact/Card V1, inchangée)
  état propre
```

La fonction de résolution devient : `token → support → association active → carte`, et applique
**deux** filtres au lieu d'un : le support n'est ni désactivé ni révoqué, **et** la carte n'est
pas révoquée. Le principe de Contact/Card V1 — le filtre est dans la fonction de résolution, pas
dans l'affichage — est conservé tel quel.

Cela règle les deux impasses :

- **réattribution** = clore l'association, en ouvrir une nouvelle vers une autre carte. Le
  support et sa puce ne bougent pas. La carte de la personne partie reste révoquée et terminale,
  conformément à V1 ;
- **perte** = révoquer le **support** (terminal pour cet objet), ré-associer la **carte** à un
  support de remplacement. Le profil et les contacts survivent.

> **Point de réconciliation à valider (Q8).** Ceci ne contredit pas Contact/Card V1 : cela
> ajoute un niveau que V1 n'avait pas besoin d'avoir, puisqu'il n'y avait rien à fabriquer. Mais
> la fonction de résolution de V1 devra être revue lors de la réalisation. Ce n'est pas une
> réécriture : c'est un filtre supplémentaire au même endroit. **À faire valider avant tout
> développement de la carte physique.**

---

## 3. Les six étapes, séparées

La commande impose de séparer six choses. Elles le sont, et chacune a son propre état, ses
propres droits et sa propre preuve.

| # | Étape | Objet porteur | Preuve produite | Peut échouer sans casser les autres ? |
|---|---|---|---|---|
| 1 | Commande de la carte physique | Commande Boutique | Facture ELSATIA | oui |
| 2 | Fabrication | Ordre de fabrication | Numéros de série encodés | oui — la commande reste payée |
| 3 | Expédition | Expédition | Numéro de suivi transporteur | oui — retard, perte, réexpédition |
| 4 | Activation numérique | Support physique | Horodatage + auteur d'activation | oui — un support non activé ne résout rien d'utile |
| 5 | Association au titulaire | Association support ↔ carte | Journal d'association | oui — un support peut être activé sans titulaire |
| 6 | Abonnement logiciel éventuel | Abonnement | Facture d'abonnement | **oui, et c'est essentiel** |

**L'étape 6 est facultative et doit le rester.** Contact/Card V1 prévoit explicitement un
fonctionnement sans Gestion Pro (§5 de sa spécification). Vendre une carte physique qui cesse de
fonctionner si l'on ne paie pas un abonnement transformerait un bien acheté en service loué —
un changement de nature commerciale et juridique qui devrait alors être écrit noir sur blanc
avant l'achat, pas découvert après. **Recommandation : la carte achetée résout et affiche le
profil sans abonnement.** Ce qui se paie, ce sont les fonctions d'équipe, de classement et
d'intégration Gestion Pro.

C'est une question à trancher — **Q9** — parce qu'elle change les CGV, pas seulement le prix.

---

## 4. Le moment dangereux : entre l'encodage et l'activation

C'est le seul vrai risque de sécurité créé par le passage au physique, et il n'existait pas dans
Contact/Card V1.

Une carte est encodée en usine, puis voyage. Pendant ce trajet, **l'URL de la puce existe déjà**.
Elle est imprimée en QR sur l'objet, dans un colis, manipulée par un transporteur.

Si le seul fait de lire cette URL suffisait à s'approprier la carte, n'importe qui ayant eu le
colis entre les mains pourrait la revendiquer avant son destinataire.

### Règle retenue

1. Un support fabriqué naît dans l'état `encode`, **et son jeton ne résout vers rien
   d'exploitable** : il affiche uniquement une page « carte non activée ».
2. L'activation exige un **code d'activation** qui **n'est jamais porté par la puce ni par le
   QR** — donc jamais lisible en approchant un téléphone de la carte. Il est transmis par un
   canal distinct de l'objet : dans l'espace client, et/ou sous une pastille à gratter.
3. Le code d'activation est **à usage unique**, expirable, et sa saisie est limitée en
   tentatives.
4. Un support déjà activé ne peut pas être ré-activé par un tiers : seule une opération de
   **réattribution**, tracée et autorisée, change son association.

Ce que cela donne concrètement : une puce lue dans un entrepôt ne donne rien. Une carte volée
avant activation ne donne rien. Une carte volée après activation se révoque en un geste — c'est
déjà le P16 de Contact/Card V1.

> **Aucun secret n'est ajouté dans la puce pour autant.** Le code d'activation vit côté serveur ;
> la puce continue de ne contenir qu'une URL. La contrainte de la commande est tenue.

---

## 5. Déclinaisons commerciales du produit

Toutes s'expriment dans le modèle de catalogue défini en phase 2 — produit, variante, prix — sans
aucun cas particulier de code.

| Déclinaison | Nature | Variante portée par | Particularité |
|---|---|---|---|
| Carte individuelle | `physique` ou `physique_personnalise` | finition, mode de personnalisation | Achat unitaire, activation par le titulaire. |
| Carte entreprise | `physique_personnalise` | finition, gabarit de marque | Le gabarit visuel est validé une fois, réutilisé ensuite. |
| Lot équipe | `lot` | nombre de cartes | Composition de N cartes individuelles. Livré en un colis, activé carte par carte. |
| Remplacement | `remplacement` | finition | **Lié à un support existant.** Cf. §6. |
| Accessoire | `accessoire` | — | Étui, support de bureau. Aucun lien logiciel. |

### Personnalisation — ce qu'elle change

Dès qu'une carte porte le nom d'une personne ou le logo d'une entreprise, elle devient un **bien
confectionné selon les spécifications du consommateur**. Conséquence : pour un client
particulier, le **droit de rétractation est exclu** — mais uniquement si l'information a été
donnée **avant** la commande, clairement, et acceptée. C'est la contrepartie exacte de
l'exclusion.

Conséquences de conception, pas de rédaction :

1. une variante personnalisable **ne peut pas** être expédiée depuis un stock : elle est
   fabriquée à la commande, donc `disponibilite = sur_commande` ;
2. le parcours doit imposer un **aperçu** et une **validation explicite** du visuel avant
   paiement — c'est la seule preuve qu'ELSATIA a fabriqué ce qui a été validé ;
3. le fichier fourni par le client (logo) est une **donnée client**, pas un média catalogue :
   bucket distinct, durée de conservation propre, effacement à la demande. Traité en phase 11 ;
4. l'aperçu validé est **archivé avec la commande**. Sans lui, aucune réclamation « ce n'est pas
   ce que j'avais demandé » n'est arbitrable.

### Finitions

Les finitions réellement proposables dépendent d'un fournisseur qui n'est pas choisi.
`<à obtenir>` : matériaux disponibles, procédés d'impression, contraintes de zone d'impression,
minimums de commande, délais, tolérances colorimétriques.

**Rien n'est inventé ici.** Un axe d'option `finition` est prévu dans le modèle de variante ; ses
valeurs seront celles du fournisseur retenu, et pas d'autres.

---

## 6. Cycle de vie du support physique

```
  commande payee
        │
        ▼
  a_fabriquer ──► en_fabrication ──► encode ──► expedie ──► livre
                                                               │
                                                               ▼
                                                        active ──┬──► suspendu ──► active
                                                                 │
                                          reattribue ◄───────────┤
                                                                 │
                                                                 └──► revoque   (terminal)
                                                                       ▲
                                          perdu / vole / casse ────────┘
```

| État | Le jeton résout ? | Sens |
|---|---|---|
| `a_fabriquer` | non | Payé, pas encore lancé en production. |
| `en_fabrication` | non | Chez le fabricant. |
| `encode` | page « non activée » **uniquement** | La puce est écrite, l'objet existe, personne ne le détient. |
| `expedie` | idem | En transit. |
| `livre` | idem | Reçu, pas encore activé. |
| `actif` | **oui**, via l'association | En service. |
| `suspendu` | non | Suspension réversible (congé, litige, enquête). |
| `revoque` | **jamais plus** | Terminal. Perte, vol, destruction, fin de vie. |

**Un support révoqué ne renaît pas.** Comme la carte logique dans Contact/Card V1, et pour la
même raison : c'est ce qui rend la perte sans conséquence.

### Départ d'un salarié — la règle est déjà écrite

Contact/Card V1 tranche (P15) : révocation de la carte, et **choix explicite** sur le carnet
personnel — versé à l'entreprise, ou conservé par la personne. *« Un choix, pas un défaut
silencieux. »*

Le commerce n'y ajoute qu'une décision matérielle : **que devient l'objet ?**

| Option | Support | Carte logique | Carnet de contacts |
|---|---|---|---|
| Récupéré et réattribué | reste `actif`, nouvelle association | l'ancienne reste `révoquée` | choix explicite (V1) |
| Non récupéré | `revoque` | `révoquée` | choix explicite (V1) |
| Détruit | `revoque` | `révoquée` | choix explicite (V1) |

Le choix par défaut proposé est **« non récupéré »**, parce que c'est le seul qui soit vrai tant
que l'objet n'est pas physiquement revenu. Supposer qu'une carte a été rendue est exactement le
genre de défaut silencieux que V1 refuse.

---

## 7. Ce qui n'est pas tranché et ne doit pas l'être ici

| # | Question | Pourquoi elle bloque |
|---|---|---|
| Q8 | Ajouter le niveau « support » à la fonction de résolution Contact/Card | Sans lui, ni réattribution ni remplacement. À valider avant tout développement. |
| Q9 | La carte achetée fonctionne-t-elle **sans** abonnement ? | Change la nature du bien vendu, donc les CGV, pas seulement le prix. |
| Q10 | Qui fabrique et qui encode ? | Si le fabricant encode, il reçoit une liste de jetons : cela devient un flux de données à encadrer contractuellement. |
| Q11 | Le code d'activation est-il imprimé (pastille) ou uniquement en ligne ? | La pastille est plus simple pour l'utilisateur, mais elle voyage avec l'objet. |
| Q12 | Vend-on la carte à des particuliers, ou seulement à des entreprises ? | Détermine tout le régime de rétractation et le modèle client (cf. Q2). |

Aucune n'est tranchée. Elles remontent au rapport final.
