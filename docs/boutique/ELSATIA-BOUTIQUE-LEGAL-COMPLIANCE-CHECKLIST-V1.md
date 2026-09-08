# ELSATIA — Boutique : checklist de conformité juridique (V1)

| | |
|---|---|
| Nature | **Checklist de travail destinée à être soumise à un professionnel du droit.** |
| Base | `1fc1331` |

> ## Avertissement, à lire avant toute utilisation de ce document
>
> **Ce document n'est pas un avis juridique et n'en tient pas lieu.**
>
> Il recense les points à faire examiner, formule des hypothèses de travail, et signale les
> endroits où l'architecture technique dépend d'une réponse juridique. **Aucune ligne ne doit
> être traitée comme validée.** Une hypothèse notée ici reste une hypothèse jusqu'à ce qu'un
> professionnel du droit l'ait confirmée par écrit.
>
> Les points marqués **⚠︎ dépendance technique** sont ceux où une réponse différente
> **change le code à écrire**, pas seulement un texte à publier. Ce sont ceux à traiter en
> premier.

---

## 0. Le point de départ, mesuré

Les CGV existantes (`docs/juridique/cgv.md`, 113 lignes, 16 articles) sont les CGV **de
l'abonnement logiciel**. Décompte réel des occurrences dans ce fichier :

| Terme | Occurrences |
|---|---:|
| boutique, livraison, retour, remboursement, garantie légale, médiateur, matériel, transporteur | **0 chacun** |
| rétractation | 1 |

**Il n'existe aujourd'hui aucun document contractuel couvrant la vente d'un bien.** Vendre en
l'état reviendrait à vendre sans conditions de vente.

---

## 1. Identité et information précontractuelle

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 1.1 | Mentions légales | Complétude au regard de l'activité de **vente en ligne**, qui s'ajoute à l'édition de logiciel | à examiner |
| 1.2 | Identité du vendeur | ELSATIA vend en son nom propre : identification, contact, coordonnées effectives | à examiner |
| 1.3 | Information précontractuelle | Caractéristiques essentielles, prix TTC, frais de livraison, délai, modalités de paiement, rétractation | à examiner |
| 1.4 | Marque | Rappel du cadre interne : « marque déposée », **jamais** le symbole ® | à respecter |
| 1.5 | Distinction Boutique / Market | Aucune formulation ne doit laisser croire à une place de marché : dans la Boutique, ELSATIA est vendeur et répond de tout | **⚠︎ dépendance technique** |

## 2. Conditions générales de vente

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 2.1 | **CGV particuliers** | Document à créer intégralement. N'existe pas | à créer |
| 2.2 | **CGV professionnels** | Document à créer intégralement. N'existe pas | à créer |
| 2.3 | Articulation avec les CGV d'abonnement | Deux contrats distincts, ou un socle commun ? | à examiner |
| 2.4 | Acceptation | Preuve de l'acceptation, horodatée, version acceptée conservée | **⚠︎ dépendance technique** |
| 2.5 | Version applicable | Les CGV applicables sont **celles acceptées à la commande**, pas les CGV courantes | **⚠︎ dépendance technique** |

**⚠︎ 2.4 et 2.5** imposent d'archiver la version des CGV avec chaque commande. Ce n'est pas
une case à cocher : c'est une copie à conserver.

## 3. Rétractation

| # | Point | Hypothèse de travail — **non validée** | Statut |
|---|---|---|---|
| 3.0 | **Applicabilité** | **Le B2C étant accepté (D-Q2), toute la section 3 s'applique.** Elle n'est plus conditionnelle | **acquis** |
| 3.1 | Principe | 14 jours pour un particulier achetant à distance | à confirmer |
| 3.2 | Point de départ | Réception du bien | à confirmer |
| 3.3 | **Bien personnalisé** | Exclusion possible pour un bien confectionné selon les spécifications du consommateur | **à confirmer — ⚠︎ dépendance technique** |
| 3.4 | Condition de l'exclusion | L'information doit être donnée **avant** la commande et acceptée expressément | **⚠︎ dépendance technique** |
| 3.5 | Contenu numérique | Exclusion possible après exécution, avec accord exprès et renoncement | à confirmer |
| 3.6 | Prestation | Exclusion possible si exécutée avec accord exprès | à confirmer |
| 3.7 | Professionnel | Pas de rétractation en principe ; vérifier les cas particuliers | à confirmer |
| 3.8 | Formulaire | Formulaire type à fournir | à examiner |

**⚠︎ 3.3 et 3.4 sont le point le plus structurant du lot.** La carte NFC personnalisée est le
produit V1 envisagé. Si l'exclusion est retenue **et** correctement recueillie, une carte
personnalisée n'est pas reprise. Si le recueil est mal fait, elle l'est. Le parcours doit donc
imposer une acceptation explicite et **archivée**, avant paiement — c'est de la conception, pas
de la rédaction.

## 4. Garanties

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 4.1 | Garantie légale de conformité | Durée, charge de la preuve, mise en œuvre | à examiner |
| 4.2 | Garantie des vices cachés | Articulation avec la précédente | à examiner |
| 4.3 | Garantie commerciale | **Si** ELSATIA en propose une : contenu, durée, coût. Sinon, ne rien annoncer | à décider |
| 4.4 | Information sur les garanties | Mention obligatoire dans les CGV et sur la fiche produit | à examiner |
| 4.5 | Pièces / remplacement | Politique de remplacement d'un support défectueux | à décider |

> **Aucune durée de garantie n'est écrite dans ce document.** Annoncer une durée non validée
> serait un engagement contractuel pris par erreur.

## 5. Conformité du produit

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 5.1 | Conformité d'un produit NFC | Exigences applicables à un objet comportant une puce sans contact | **à examiner** |
| 5.2 | Documentation fournisseur | Déclarations et certificats à exiger du fabricant | `<à obtenir>` |
| 5.3 | Marquages | Marquages à apposer, le cas échéant | à examiner |
| 5.4 | Déchets d'équipements | Obligations éventuelles liées à la mise sur le marché | à examiner |
| 5.5 | Emballage | Obligations éventuelles liées aux emballages | à examiner |

**Aucun de ces points ne peut être tranché sans le fournisseur retenu.** Ils sont listés pour
qu'ils soient posés **avant** la commande fournisseur, pas après.

## 6. Livraison

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 6.1 | Délai annoncé | Un délai annoncé engage. Il doit venir du transporteur, jamais d'une estimation optimiste | **⚠︎ dépendance technique** |
| 6.2 | Retard | Droits de l'acheteur, procédure | à examiner |
| 6.3 | Perte | Charge du risque pendant le transport | à examiner |
| 6.4 | Réception | Réserves, constat de dommage | à examiner |
| 6.5 | Zones desservies | Périmètre géographique — cf. Q7 | à décider |

## 7. Retours et remboursements

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 7.1 | Modalités de retour | Qui paie le retour, dans quel délai, dans quel état | à examiner |
| 7.2 | Délai de remboursement | Délai imposé après réception ou preuve d'expédition | à examiner |
| 7.3 | Moyen de remboursement | Même moyen que le paiement, sauf accord contraire | à examiner |
| 7.4 | Remboursement partiel | Cas et justification | à examiner |
| 7.5 | Avoir | Un avoir peut-il remplacer un remboursement, et dans quels cas | **à examiner** |

**⚠︎ 7.5** : proposer un avoir là où un remboursement est dû est une source classique de litige.
Le modèle technique permet les deux (`…-SECURITY-PAYMENT-MODEL-V1.md` §A.3) ; **c'est le droit
qui doit dire lequel s'impose**, pas l'ergonomie.

## 8. Médiation

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 8.1 | Médiateur de la consommation | Obligation d'adhésion et d'information si vente aux particuliers | **à examiner** |
| 8.2 | Coordonnées | À publier dans les CGV et les mentions légales | dépend de 8.1 |
| 8.3 | Plateforme de règlement en ligne | Information éventuelle | à examiner |

> **Q2 est tranchée : le B2C est accepté (D-Q2).** La section 8 n'est donc plus conditionnelle :
> elle est **obligatoire et à traiter avant la première vente à un particulier**. L'adhésion à un
> dispositif de médiation n'est pas instantanée — c'est une démarche à engager tôt, pas à la
> veille de l'ouverture.

## 9. Fiscalité et facturation

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 9.1 | Taux de TVA applicables | Par nature de produit | **⚠︎ dépendance technique** |
| 9.2 | Ventes hors de France | Règles applicables, seuils, guichet unique éventuel | **⚠︎ dépendance technique** |
| 9.3 | Autoliquidation intracommunautaire | Conditions, vérification du numéro de TVA de l'acheteur | **⚠︎ dépendance technique** |
| 9.4 | Mentions obligatoires de la facture | Liste exhaustive à valider | **⚠︎ dépendance technique** |
| 9.5 | Numérotation | Continue, sans trou, sans réutilisation | **⚠︎ dépendance technique** |
| 9.6 | Conservation | Durée de conservation des factures | **⚠︎ dépendance technique** |
| 9.7 | Facturation électronique | Calendrier et obligations à venir | à examiner |
| 9.8 | **Absence actuelle de facture** | ELSATIA encaisse aujourd'hui sans émettre de facture (cf. audit, T1) | **à corriger avant toute vente** |

**9.8 est le point le plus urgent de cette checklist.**

## 10. Données personnelles

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 10.1 | Base légale | Exécution du contrat pour la commande ; autre base pour la prospection | à examiner |
| 10.2 | Durées de conservation | **Non uniformes** : facture ≠ fichier de personnalisation ≠ historique d'achat | **⚠︎ dépendance technique** |
| 10.3 | Droit d'accès | Doit être exerçable par un client Boutique **non abonné et non rattaché à un compte** (D-Q2). La vérification d'identité ne peut pas se réduire à la connaissance de l'adresse e-mail | **⚠︎ dépendance technique** |
| 10.4 | Droit d'effacement | Limité par les obligations comptables : savoir dire ce qui est conservé et pourquoi | **⚠︎ dépendance technique** |
| 10.5 | Sous-traitant de fabrication | Contrat de sous-traitance si le fabricant reçoit des données | **à examiner** |
| 10.6 | Fichiers fournis par le client | Logos : durée de conservation, effacement, droits de tiers | **⚠︎ dépendance technique** |
| 10.7 | Destinataires nominatifs | Un lot d'équipe expédié nominativement traite des données de salariés d'un client | **à examiner** |
| 10.8 | Registre des traitements | Ajout du traitement « vente en ligne » | à examiner |

## 11. Cookies et traceurs

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 11.1 | Traceurs de la Boutique | Nécessaires au fonctionnement vs autres | à examiner |
| 11.2 | Consentement | Recueil, preuve, retrait | à examiner |
| 11.3 | Panier | Un panier serveur limite le recours au stockage local | à examiner |

## 12. Paiement

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 12.1 | Prestataire de paiement | Information du client sur le prestataire | à examiner |
| 12.2 | Authentification forte | Conditions applicables | à examiner |
| 12.3 | Aucune donnée de carte chez ELSATIA | À vérifier et à écrire : le parcours passe par une page hébergée par le prestataire | à confirmer |
| 12.4 | Impayés / oppositions | Procédure, conséquences sur la commande | à examiner |

## 13. Contenus numériques, abonnement, résiliation

| # | Point | À faire examiner | Statut |
|---|---|---|---|
| 13.1 | Contenu numérique | Fourniture, exécution, rétractation | à examiner |
| 13.2 | Abonnement lié à un bien | **TRANCHÉ (D-Q9)** : la carte est un **bien vendu**, l'abonnement avancé est un service **distinct et facultatif**. Deux contrats, pas un | **acquis — à rédiger** |
| 13.2 bis | **Engagement de « socle permanent »** | Le socle fonctionne sans abonnement, sans limite liée au paiement. À écrire : **règle de fin de service** (préavis, export, sort de l'URL publique) et ce que « permanent » signifie exactement | **à rédiger — obligatoire avant la première vente** |
| 13.3 | Reconduction | Information avant échéance | à examiner |
| 13.4 | Résiliation | Modalités, y compris en ligne | à examiner |
| 13.5 | Conséquence de la résiliation sur un bien acheté | **TRANCHÉ (D-Q9) : non.** L'arrêt d'un abonnement avancé **ne désactive pas** le socle de la carte achetée. À écrire explicitement dans les CGV | **acquis — à rédiger** |

**13.5 est tranché.** Un bien acheté qui cesserait de fonctionner faute d'abonnement ne serait pas
vendu, il serait loué. La décision D-Q9 écarte cette ambiguïté : la carte est un bien.

Il reste au juriste à **rédiger** cette garantie, et surtout à traiter 13.2 bis : un socle annoncé
comme permanent est un engagement de durée. Sans règle de fin de service écrite, c'est une
promesse que rien ne borne.

---

## 14. Ordre de traitement recommandé

| Rang | Point | Motif |
|---|---|---|
| 1 | **9.8 / P0-3** — absence de facture | On ne peut pas encaisser sans facturer. **Condition d'ouverture.** |
| 2 | **3.3 / 3.4** — exclusion de rétractation sur bien personnalisé | Le B2C étant acquis, cela détermine le parcours d'achat lui-même. |
| 3 | **8.x** — médiation de la consommation | Obligatoire depuis D-Q2. L'adhésion prend du temps : à engager tôt. |
| 4 | **13.2 bis** — règle de fin de service du socle permanent | Un engagement de durée sans borne écrite. |
| 5 | 2.1 / 2.2 — rédaction des CGV particuliers **et** professionnels | Ne peut commencer qu'après 1 à 4. |
| 6 | 5.x — conformité produit | À poser **avant** la commande fournisseur. |
| 7 | 10.x — RGPD du client non rattaché | Découle de D-Q2. |

Q2 et Q9 ne figurent plus dans cet ordre : elles sont tranchées.

---

## 15. Ce que ce document ne fait pas

- Il ne valide rien.
- Il ne cite aucun texte comme s'il l'appliquait à un cas donné.
- Il n'annonce aucune durée de garantie, aucun délai de livraison, aucun taux de TVA.
- Il ne remplace pas l'examen d'un professionnel du droit, qui reste **obligatoire avant toute
  mise en vente**.
