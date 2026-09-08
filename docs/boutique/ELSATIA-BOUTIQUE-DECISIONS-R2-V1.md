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

### L'identifiant physique — rectification R3, ambiguïté levée

> **La puce NFC et le QR imprimé portent le même identifiant physique, opaque et immuable.
> Ils ne portent pas le jeton révocable du profil logique.**

Chaîne de résolution, côté serveur :

```
  puce NFC  ─┐
             ├──►  IDENTIFIANT PHYSIQUE (opaque, immuable, gravé/imprimé)
  QR imprimé ─┘              │
                             ▼
                    ATTRIBUTION ACTIVE
                             │
                             ▼
                    PROFIL LOGIQUE PUBLIC (jeton révocable)
```

Cela lève l'ambiguïté signalée en R2 : le jeton révoqué lors d'une réattribution est celui **du
profil logique**, jamais l'identifiant gravé. L'objet physique n'est donc jamais consommé par une
réattribution.

**Déroulé d'une réattribution :**

| # | Effet |
|---|---|
| 1 | Le **support physique reste inchangé** |
| 2 | L'ancien profil est **révoqué** |
| 3 | L'ancienne attribution est **fermée** |
| 4 | Une **nouvelle attribution** est créée |
| 5 | Un **nouveau profil logique** devient actif |
| 6 | **Aucune réécriture NFC, aucune réimpression QR** |
| 7 | L'historique reste **append-only** |

L'ancien titulaire n'a plus **aucun** accès — ni au profil, ni à ce que la carte reçoit désormais.

> **Point de réconciliation avec Contact/Card V1.** V1 énonce que la puce contient
> `https://<domaine>/c/<token>` et que ce jeton est repris à l'identique dans le QR. Cela reste
> vrai dans sa forme — un identifiant unique porté à l'identique par les deux supports — mais
> **cet identifiant est désormais celui du support physique, pas celui du profil**. La fonction
> de résolution de V1 gagne un niveau. À porter au lot Contact/Card.

### Autorité — qui peut agir sur une carte

| Situation | Autorité |
|---|---|
| **Carte d'entreprise** | Administrateur **habilité** |
| **Carte personnelle** | Le titulaire, **après réauthentification forte** |
| **Support ELSATIA** | Accès **strict, justifié, limité dans le temps et notifié**. Aucun droit d'administration général |
| **Carte volée, perdue ou contestée** | **Blocage jusqu'à vérification** |

Le dernier cas introduit un état que le cycle de vie R2 n'avait pas : **`bloque`**, distinct de
`suspendu` (retrait volontaire et réversible) et de `revoque` (terminal). Le blocage est une
mesure conservatoire : l'identifiant cesse de résoudre, mais la décision définitive — remise en
service ou révocation — attend une vérification. Il est ajouté au cycle de vie du support.

### Contacts reçus — propriété

| Type de carte | Les contacts reçus sont… |
|---|---|
| **Professionnelle**, appartenant à l'entreprise | des **données professionnelles de l'entreprise** |
| **Personnelle** | un **carnet personnel séparé** |

> **Point de réconciliation avec Contact/Card V1.** V1 (P15) prévoyait, au départ d'un salarié,
> un **choix explicite** : carnet versé à l'entreprise, ou conservé par la personne. Cette
> rectification **restreint ce choix pour les cartes professionnelles** : les contacts reçus via
> une carte d'entreprise sont, dès l'origine, des données de l'entreprise — il n'y a donc plus de
> choix à faire à leur sujet. Le choix de V1 conserve tout son sens pour le **carnet personnel**,
> qui reste séparé. À porter au lot Contact/Card, qui devra ajuster P15.

---

## D-Q9 — Service de base inclus sans abonnement récurrent

> **Une carte NFC achetée continue à fonctionner sans abonnement payant.**

### ⚠︎ Rectification R3 — formulation imposée

Toute promesse « **permanente** » ou « **à vie** » est **retirée** de l'ensemble des documents et
remplacée par la formule suivante, qui est la seule à employer :

> **« Service de base inclus sans abonnement récurrent. »**

Motif : « permanent » et « à vie » sont des engagements de durée absolue, que rien ne borne et
que rien ne garantit. « Inclus sans abonnement récurrent » dit exactement ce qui est vrai — le
service ne dépend d'aucun paiement périodique — sans promettre une durée qu'ELSATIA ne peut pas
tenir contractuellement.

### Service de base — jamais conditionné à un paiement récurrent

**NFC · QR code · vCard · profil essentiel · désactivation en cas de perte**,
**sous réserve des conditions de service définies dans les CGV.**

L'URL publique est la cible de résolution du NFC et du QR ; son devenir en cas d'arrêt du service
est un point de CGV (cf. ci-dessous), et non une promesse implicite.

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
   de base a un coût d'hébergement et d'exploitation qui ne sera couvert par aucun
   abonnement. Il doit être intégré au coût réel unitaire de la carte, et non ignoré.

### Sept points à écrire dans les futures CGV

Le service de base n'étant conditionné à aucun paiement, ses conditions doivent être écrites, et
non supposées. Sept points, tous obligatoires **avant la première vente** :

| # | Point |
|---|---|
| 1 | **Disponibilité** |
| 2 | **Maintenance** |
| 3 | **Évolution** |
| 4 | **Préavis en cas d'arrêt** |
| 5 | **Export** |
| 6 | **Suppression** |
| 7 | **Devenir de l'URL publique** |

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

## D-Q1 — Positionnement fermé (rectification R3)

> **La Boutique ELSATIA est une application commerciale autonome de l'écosystème.**

| Elle partage | Elle peut être reliée à | Elle n'exige pas |
|---|---|---|
| Le **compte ELSATIA** | **Gestion Pro** | Une entreprise Gestion Pro |
| | | Un abonnement Gestion Pro |

**Un particulier peut commander sans entreprise ni abonnement Gestion Pro.**

Ce que cela ferme :

1. **La Boutique n'est pas un module de Gestion Pro.** L'audit `6cb0b79` laissait la question
   ouverte ; D-Q2 l'avait fortement contrainte ; elle est désormais tranchée.
2. **`entreprise_id` ne peut plus être la clé d'entrée**, ni dans le modèle, ni dans les
   politiques RLS. Le rattachement à Gestion Pro devient un **lien facultatif**, pas une
   condition d'existence.
3. **L'identité est celle du compte ELSATIA**, partagée avec le reste de l'écosystème — pas une
   identité propre à la Boutique, ce qui aurait créé un second annuaire.
4. Le **pont faible avec Gestion Pro** (trésorerie, outillage) conserve exactement le régime
   défini en phase 6 : proposé, jamais appliqué, et seulement pour les clients rattachés.

## Récapitulatif des questions

| # | Question | Statut |
|---|---|---|
| Q2 | Vend-on à des particuliers ? | **TRANCHÉE — oui** |
| Q8 | Réattribution d'une carte NFC | **TRANCHÉE**, sous réserve de la lecture B du « jeton » |
| Q9 | La carte fonctionne-t-elle sans abonnement ? | **TRANCHÉE — oui** : *service de base inclus sans abonnement récurrent* |
| Q1 | Module GP ou surface autonome ? | **TRANCHÉE (R3) — application commerciale autonome** |
| Q3 à Q7, Q10, Q11, Q13 | — | **toujours ouvertes** |

Q14 (bien + abonnement) est **résolue de fait** par D-Q9 : option C.
Q1 est **fermée par la rectification R3** : application commerciale autonome de l'écosystème.

Les questions encore ouvertes — Q3 (fabricant), Q4 (fail-closed, recommandé sans réserve),
Q5 (rattachement trésorerie), Q6 (TVA Stripe ou ELSATIA), Q7 (périmètre géographique),
Q10 (qui encode), Q11 (code d'activation imprimé ou en ligne), Q13 (décomposition des états) —
**ne bloquent aucun démarrage**. Elles portent sur la fabrication, la fiscalité et la forme, pas
sur le modèle.
