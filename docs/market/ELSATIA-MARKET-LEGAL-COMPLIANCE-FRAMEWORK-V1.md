# ELSATIA-MARKET-LEGAL-COMPLIANCE-FRAMEWORK-V1

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1` — Phase 9
Branche : `feat/market-architecture-legal-business-v1` — base `1fc1331`

---

## AVERTISSEMENT — portée de ce document

**Ce document n'est pas un avis juridique et ne remplace pas un avocat.**

Il est un **cadrage d'ingénierie** : il identifie les régimes juridiques susceptibles de s'appliquer
à ELSATIA Market, en tire des **exigences fonctionnelles et techniques**, et signale ce qui doit être
tranché par un professionnel du droit avant toute ouverture.

Les régimes cités (DSA, P2B, LCEN, Code de la consommation, Code du travail, REACH/CLP, DAC7…) sont
nommés avec confiance. **Les références d'articles précises sont à faire vérifier** et sont signalées
comme telles ; le droit applicable évolue, et une erreur de référence dans un document d'ingénierie
ne doit jamais devenir une conclusion opérationnelle.

Aucune conclusion juridique définitive n'est formulée. Chaque section se termine par ce qui doit être
validé.

---

## 1. Statut de la plateforme — la question première

### 1.1 On ne peut pas supposer qu'ELSATIA est « simple hébergeur »

Le lot l'interdit explicitement, et cette prudence est fondée. Le régime de responsabilité allégée de
l'hébergeur (LCEN, loi n° 2004-575 du 21 juin 2004, art. 6 ; désormais articulé avec le **règlement
(UE) 2022/2065 « DSA »**) suppose un rôle **passif, technique et neutre** vis-à-vis du contenu.

Or, plusieurs fonctions envisagées éloignent Market de la passivité :

| Fonction envisagée | Effet sur le statut |
|---|---|
| Nomenclature **fermée** de catégories | ELSATIA structure et contraint le contenu |
| **Vérification** des vendeurs professionnels | rôle actif de contrôle à l'entrée |
| **Modération a priori** de certaines catégories | intervention avant publication |
| **Classement** des résultats de recherche | ELSATIA hiérarchise la visibilité |
| **Mise en avant payante** | ELSATIA vend de la visibilité sur du contenu de tiers |
| **Messagerie interne** avec quotas et filtres | ELSATIA intervient dans les échanges |
| **Code de retrait** attestant la remise | ELSATIA produit un élément de preuve de l'exécution |

Aucune ne fait basculer mécaniquement dans l'édition. Ensemble, elles dessinent un **opérateur de
plateforme en ligne** — statut propre, ni hébergeur pur ni éditeur, qui porte ses **obligations
positives**.

### 1.2 Le régime qui s'applique très probablement : opérateur de plateforme en ligne

Trois corpus se superposent :

**(a) DSA — règlement (UE) 2022/2065.** Applicable à tout fournisseur de service intermédiaire
offrant ses services dans l'Union, depuis février 2024. Obligations pertinentes :

| Obligation | Traduction fonctionnelle pour Market |
|---|---|
| Point de contact unique (autorités et utilisateurs) | adresse dédiée, publiée |
| Conditions générales claires, incluant les règles de modération | CGU Market spécifiques |
| **Mécanisme de signalement et d'action** (« notice and action ») | signalement accessible **y compris aux anonymes**, accusé de réception, décision motivée |
| **Exposé des motifs** pour toute restriction | motif obligatoire sur refus, suspension, dépublication |
| **Recours interne** contre les décisions de modération | voie de contestation — prévue §3.3 de la spécification |
| Suspension des utilisateurs fournissant fréquemment des contenus manifestement illicites | compteur d'infractions, seuil, suspension motivée |
| Transparence des systèmes de recommandation et du classement | **critères de classement publiés**, mise en avant payante **signalée comme telle** |
| Interdiction des interfaces trompeuses | pas de faux compte à rebours, pas de fausse rareté |
| Rapports de transparence | statistiques de modération exportables |

**(b) DSA, section « marketplaces » — traçabilité des professionnels.** Le DSA impose aux plateformes
**permettant à des consommateurs de conclure des contrats à distance avec des professionnels** de
collecter, vérifier et conserver un jeu d'informations sur chaque professionnel (identité, adresse,
téléphone, e-mail, pièce d'identité, coordonnées de paiement, registre du commerce, auto-certification
de conformité des produits), de **faire des efforts raisonnables pour en vérifier la fiabilité**, de
suspendre le professionnel qui ne les fournit pas, et de concevoir l'interface de façon que ces
informations soient présentées à l'acheteur.

**Ceci est probablement l'obligation la plus lourde de tout le projet**, et elle recoupe exactement le
dispositif de vérification N1–N3 spécifié en §2.7 de la spécification fonctionnelle. **Bonne
nouvelle** : le dispositif spécifié va déjà dans ce sens. **Mauvaise nouvelle** : il devient
*obligatoire*, et non plus un simple choix de qualité.

> **À faire valider — question ouverte majeure.** Market, en V1, ne permet **pas** de conclure un
> contrat en ligne : il met en relation, et la vente se conclut hors plateforme (retrait sur place,
> virement). La qualification de « plateforme permettant de conclure des contrats à distance »
> est-elle pour autant écartée ? La réservation acceptée, avec accord sur le bien, la quantité et le
> prix, pourrait suffire à caractériser la conclusion d'un contrat sur la plateforme. **C'est la
> question juridique n° 1 du projet** : elle détermine si la traçabilité DSA des professionnels est
> obligatoire ou seulement souhaitable.
>
> **Position d'ingénierie recommandée** : appliquer le dispositif **comme s'il était obligatoire**.
> Le coût est modéré (il recoupe la vérification déjà voulue), et l'hypothèse inverse est bien plus
> coûteuse à corriger après ouverture.

**(c) P2B — règlement (UE) 2019/1150.** S'applique aux services d'intermédiation en ligne fournis à
des **entreprises utilisatrices** — ce que sont exactement les vendeurs Market. Obligations :

| Obligation | Traduction fonctionnelle |
|---|---|
| Conditions générales claires et accessibles avant la souscription | CGU vendeur Market |
| **Préavis** avant toute modification défavorable des CGU | notification + délai (ordre de grandeur : 15 jours ; **durée à faire valider**) |
| **Motivation** de toute restriction, suspension ou résiliation | motif écrit, **avant ou au moment** de la prise d'effet |
| **Transparence du classement** : principaux paramètres et leur importance relative | page publique décrivant les critères |
| Divulgation de tout **traitement différencié** de ses propres offres | pertinent : la Boutique ELSATIA et Market doivent rester séparées |
| Système interne de traitement des réclamations | **exemption possible pour les petites entreprises** (seuils de salariés et de chiffre d'affaires) — **à vérifier** |
| Désignation de **médiateurs** | idem |

**(d) Code de la consommation — loyauté des plateformes.** Obligations d'information sur la qualité
de l'annonceur (professionnel ou particulier), sur les modalités de référencement et de classement,
et sur l'existence d'une relation contractuelle ou capitalistique influençant le classement.
*(Base généralement citée : art. L111-7 et suivants — **référence à vérifier**.)*

### 1.3 Ce qui doit être validé juridiquement

| # | Question | Criticité |
|---|---|:---:|
| J-1 | Market est-il une « plateforme permettant de conclure des contrats à distance » au sens du DSA, alors que la vente se conclut hors plateforme ? | **maximale** |
| J-2 | Le régime de responsabilité de l'hébergeur reste-t-il invocable malgré la nomenclature fermée, la vérification et le classement ? | **maximale** |
| J-3 | ELSATIA franchit-elle les seuils déclenchant les obligations renforcées (réclamations, médiateurs) du P2B ? | haute |
| J-4 | Quelles obligations d'archivage et de transparence de modération s'imposent ? | haute |
| J-5 | Le code de retrait produit par ELSATIA fait-il d'elle un tiers à la transaction ? | moyenne |

---

## 2. Obligations d'information

### 2.1 Sur l'identité du vendeur

Le DSA et le Code de la consommation convergent : l'acheteur doit savoir **avec qui il contracte**.

| Information | Affichée publiquement | Motif |
|---|:---:|---|
| Qualité de **professionnel** | **oui, systématiquement** | obligation d'information ; en V1, **tout** vendeur est professionnel, ce qui simplifie |
| Raison sociale | **oui** | identification |
| Ville et département | **oui** | localisation du bien |
| SIREN / SIRET | **à faire valider** | le DSA impose la traçabilité **auprès de la plateforme** ; l'affichage public intégral est une autre question, et il facilite l'usurpation |
| Adresse postale complète | **non** en page publique ; **oui** après engagement | sécurité du dépôt |
| Téléphone, e-mail | **non** en page publique | anti-spam, anti-hameçonnage |
| Personne physique auteur de l'annonce | **jamais** | minimisation RGPD ; l'annonce appartient à l'organisation |

> **Tension à arbitrer** : le DSA veut de la transparence sur le professionnel ; la sécurité et le
> RGPD veulent de la minimisation. Le compromis proposé — identité de l'entreprise publique,
> coordonnées de contact accessibles après demande tracée — doit être **validé**. J-6.

### 2.2 Sur le bien

Obligatoire dans tous les cas : caractéristiques essentielles, état, prix, **mention claire HT/TTC**,
quantité et unité, disponibilité, garanties applicables, conditions de retrait ou de livraison.

En complément pour les catégories réglementées : les mentions du §5.

### 2.3 Sur la plateforme elle-même

Mentions légales, CGU Market **distinctes** de celles de Gestion Pro, CGV **de la Boutique** bien
séparées, politique de modération, critères de classement, politique de confidentialité, point de
contact DSA, information sur la médiation de la consommation, et — **capital** — une mention
permanente et non ambiguë :

> **ELSATIA n'est pas vendeur des biens publiés sur Market.** Le vendeur est l'entreprise qui publie
> l'annonce. ELSATIA n'encaisse pas le prix des biens et ne garantit ni leur état, ni leur
> conformité, ni leur authenticité.

---

## 3. Rétractation, garanties, biens d'occasion

### 3.1 Droit de rétractation

Le droit de rétractation de 14 jours protège le **consommateur** dans les contrats **à distance** et
hors établissement. *(Base généralement citée : art. L221-18 et suivants du Code de la consommation —
**référence à vérifier**.)*

| Situation | Rétractation | Débiteur |
|---|---|---|
| Pro → **particulier**, vente conclue à distance, expédition | **oui, 14 jours** | **le vendeur**, jamais ELSATIA |
| Pro → **particulier**, retrait sur place après accord en ligne | **incertain** — la qualification « à distance » dépend du lieu de conclusion | **à faire valider** — J-7 |
| Pro → **professionnel** | **non** en principe ; exceptions étroites | — |

**Exceptions notables** (à vérifier au cas d'espèce) : biens confectionnés sur mesure, biens
susceptibles de se détériorer rapidement, biens descellés ne pouvant être renvoyés pour des raisons
d'hygiène ou de sécurité — cette dernière est **directement pertinente pour les peintures et produits
chimiques**.

**Exigence fonctionnelle** : l'annonce doit porter un champ indiquant si le droit de rétractation
s'applique, avec sa raison. C'est une **déclaration du vendeur**, sous sa responsabilité, jamais un
calcul d'ELSATIA.

### 3.2 Garanties légales

| Garantie | Champ | Durée | Débiteur |
|---|---|---|---|
| **Conformité** | vendeur professionnel → consommateur | 2 ans ; **réductible à 1 an minimum pour les biens d'occasion, par accord des parties** *(à vérifier)* | le vendeur |
| **Vices cachés** | tous, y compris B2B *(art. 1641 du Code civil)* | délai courant à compter de la découverte | le vendeur |
| Garantie commerciale | facultative | libre | le vendeur |

**Point capital et contre-intuitif** : la garantie légale de conformité **s'applique aux biens
d'occasion** vendus par un professionnel à un consommateur. Un vendeur qui croit « vendre en l'état,
sans garantie » à un particulier se trompe, et ELSATIA ne doit pas laisser croire le contraire.

**Exigence fonctionnelle** : le champ `garantie` du modèle d'annonce doit proposer
`garantie_legale_uniquement` comme valeur explicite, et l'interface doit **rappeler au vendeur** que
la garantie légale n'est pas écartable face à un consommateur. Une case « vendu sans garantie »
proposée sans nuance exposerait ELSATIA au grief d'avoir facilité une clause abusive.

### 3.3 Vente à un particulier vs. à un professionnel

Le même bien n'obéit pas au même régime selon l'acheteur : prix TTC ou HT, rétractation ou non,
garantie de conformité ou vices cachés seuls, facture obligatoire dans les deux cas mais de contenu
distinct.

**Exigence fonctionnelle** : le vendeur doit pouvoir déclarer s'il accepte les acheteurs
particuliers. Un vendeur peut légitimement vouloir **réserver ses ventes aux professionnels** — et
c'est même prudent pour les catégories réglementées. Champ `acheteurs_acceptes ∈ {tous,
professionnels_uniquement}`, avec filtrage en conséquence.

---

## 4. TVA et facturation

| Sujet | Position |
|---|---|
| TVA sur l'**abonnement Market** | ELSATIA, régime normal, déjà géré |
| TVA sur la **vente d'un bien** | **entièrement au vendeur**. ELSATIA n'est pas partie à la vente et ne la calcule pas. |
| **Régime de la marge** (biens d'occasion) | possible selon la qualité du vendeur et l'origine du bien *(base généralement citée : art. 297 A du CGI — **à vérifier**)*. Modélisé par la valeur `marge` du champ `tva_applicable`. |
| Autoliquidation B2B, ventes intracommunautaires | au vendeur |
| **Facture** | établie par le **vendeur**. ELSATIA ne produit aucune facture de vente et n'en fournit pas de modèle qui pourrait être compris comme une facture ELSATIA. |
| Avoir | par le vendeur |

### 4.1 Obligations déclaratives de la plateforme — DAC7

**Point à ne surtout pas négliger.** La directive (UE) 2021/514 dite **DAC7**, transposée en droit
français, impose aux **opérateurs de plateforme** de collecter, vérifier et **déclarer annuellement à
l'administration fiscale** les informations relatives aux vendeurs et à leurs revenus, pour
plusieurs activités dont **la vente de biens**. Elle impose aussi d'informer chaque vendeur des
données le concernant qui sont déclarées. *(Transposition généralement citée : art. 1649 ter A et
suivants du CGI — **référence à vérifier**.)*

> **Question ouverte, à faire valider — J-8.** DAC7 s'applique-t-elle à une plateforme qui **met en
> relation sans intermédier le paiement** et **sans connaître le montant réellement versé** ? Le
> texte prévoit des situations où l'opérateur ne peut raisonnablement pas connaître la contrepartie.
> Market affiche un prix, mais ne constate ni le prix final négocié, ni le paiement.
>
> **Enjeu** : si DAC7 s'applique, ELSATIA doit collecter l'identité fiscale des vendeurs, mesurer les
> transactions et **déclarer chaque année**. C'est un lot en soi, et il change l'estimation de charge.
>
> **Position d'ingénierie recommandée** : concevoir dès la V1 le modèle de données de façon que les
> informations d'identification fiscale des vendeurs et les transactions conclues soient
> **collectables et exportables**, sans construire la déclaration tant que J-8 n'est pas tranchée.
> Le coût de la prévoyance est faible ; celui de la reconstitution rétroactive est élevé.

---

## 5. Produits — classement en trois régimes

### 5.1 Méthode

Chaque catégorie de la nomenclature (§3.2 de la spécification) porte une étiquette qui **pilote
l'interface** : champs supplémentaires obligatoires, mentions imposées, passage forcé en
`en_verification`, ou blocage pur et simple.

**Principe directeur** : dans le doute, **ne pas ouvrir la catégorie**. Une catégorie fermée fait
perdre du chiffre d'affaires ; une catégorie ouverte à tort peut faire perdre l'entreprise.

### 5.2 AUTORISÉ

Biens professionnels courants, sans réglementation sectorielle de mise sur le marché.

| Catégorie | Exigences |
|---|---|
| `materiaux_construction` (bois, plaques, carrelage, couverture) | description, état, quantité, photos |
| `consommables` (visserie, abrasifs, fixations) | idem |
| `mobilier_professionnel` | idem |
| `outillage_main` non électrique | idem |

Contrôle a posteriori. Aucune mention réglementaire spécifique au-delà du droit commun.

### 5.3 AUTORISÉ SOUS CONDITIONS

Publication possible **uniquement** avec des champs et des mentions supplémentaires, et **passage
systématique en vérification**.

| Catégorie | Régime concerné | Conditions imposées à la publication |
|---|---|---|
| `outillage_electroportatif` | conformité et sécurité des équipements de travail | marquage CE déclaré ; notice disponible ; état de fonctionnement ; **certificat de conformité pour équipement d'occasion** — *base : Code du travail, obligations du vendeur d'équipements de travail d'occasion ; **articles à vérifier*** |
| `machines_chantier` | directive « Machines » 2006/42/CE, remplacée par le **règlement (UE) 2023/1230** ; Code du travail | idem, renforcé : année, heures, entretien, dispositifs de sécurité présents et fonctionnels, notice en français |
| `engins_levage` (nacelles, treuils, élingues) | vérifications générales périodiques | **rapport de vérification périodique en cours de validité obligatoire** ; à défaut, publication refusée |
| `epi` | règlement (UE) 2016/425 ; Code du travail | **date de péremption obligatoire** ; **plusieurs catégories d'EPI d'occasion sont interdites à la vente en France** (notamment protection contre les chutes de hauteur et certains casques) — **liste exacte à faire valider** ; à défaut de validation, **traiter l'ensemble des EPI d'occasion comme interdits** |
| `peintures_produits` (peintures, enduits, colles, solvants) | REACH (CE) 1907/2006 ; CLP (CE) 1272/2008 | **emballage d'origine étiqueté obligatoire** ; reconditionnement **interdit** ; fiche de données de sécurité disponible pour les produits dangereux ; interdiction d'expédition pour certaines classes de danger ; mention des dangers |
| `materiaux_isolation` | amiante (§5.4) ; performance | **déclaration d'absence d'amiante obligatoire** pour tout matériau susceptible d'en contenir ; année de fabrication |
| `vehicules_remorques` | code de la route ; vente de véhicules | certificat d'immatriculation au nom du vendeur ; **contrôle technique en cours de validité** pour une vente à un particulier ; kilométrage ; certificat de cession ; certificat de situation administrative |
| `pieces_detachees` | contrefaçon ; sécurité | origine déclarée ; pièces de sécurité (freinage, levage) soumises au régime des engins |
| `lots_destockage` | tous les régimes des biens composant le lot | **description exhaustive du contenu obligatoire** ; un lot **ne peut pas contenir** un bien d'une catégorie interdite ; si le lot contient un bien sous conditions, **les conditions les plus strictes s'appliquent au lot entier** |
| `equipements_techniques` (CVC, électricité, plomberie) | conformité ; **fluides frigorigènes** | attention particulière : la cession d'équipements contenant des fluides frigorigènes est **réglementée** — **à faire valider** |

### 5.4 INTERDIT

Publication **techniquement impossible**. Ce ne sont pas des règles de modération : ce sont des
gardes du modèle, et la détection d'une tentative alimente le score de confiance du vendeur.

| Interdit | Motif |
|---|---|
| **Amiante et tout matériau en contenant** | interdiction générale de fabrication, importation et **mise sur le marché** en France (décret n° 96-1133 du 24 décembre 1996). **Aucune exception, aucun « à débarrasser », aucun « pour dépose ».** |
| Déchets et matériaux destinés à l'élimination | la cession de déchets relève du régime des déchets, non de la vente |
| Produits chimiques **interdits ou restreints** par REACH, hors emballage d'origine ou sans étiquetage | sécurité |
| Produits **phytosanitaires** | régime propre, distribution encadrée |
| EPI d'occasion des catégories interdites *(liste à valider — §5.3)* | sécurité des personnes |
| Équipements de travail **non conformes** | interdiction d'exposer, mettre en vente ou vendre des équipements non conformes *(Code du travail — article à vérifier)* |
| Matériel de **contrefaçon**, ou dont la marque a été retirée ou altérée | contrefaçon *(Code de la propriété intellectuelle)* |
| Biens dont le vendeur n'est pas propriétaire, ou d'origine non justifiée | **recel** *(art. 321-1 du Code pénal)* |
| Armes, munitions, explosifs, artifices | régimes spécifiques |
| Bouteilles de gaz **consignées**, extincteurs non contrôlés | propriété du consignataire ; sécurité |
| Compteurs, matériels appartenant à un concessionnaire de réseau | propriété d'un tiers |
| **Données, fichiers clients, listes de contacts** | RGPD |
| Prestations de service, main-d'œuvre, sous-traitance | Market vend des **biens** ; le travail dissimulé n'est pas loin |
| Véhicules gagés, sans certificat d'immatriculation, ou dont le kilométrage a été modifié | fraude |
| Tout bien d'une catégorie absente de la nomenclature | non instruit = non publiable |

### 5.5 À FAIRE VALIDER JURIDIQUEMENT

| # | Point | Pourquoi c'est bloquant |
|---|---|---|
| J-9 | Liste exacte des EPI d'occasion interdits à la vente | ouvrir à tort met des vies en jeu et engage lourdement |
| J-10 | Conditions exactes de vente d'équipements de travail d'occasion (certificat de conformité, forme, débiteur) | conditionne toute la catégorie `machines_chantier` |
| J-11 | Régime des matériaux de construction issus de dépose (réemploi vs déchet) | c'est le **cœur du cas d'usage « fin de chantier »** |
| J-12 | Équipements contenant des fluides frigorigènes | catégorie `equipements_techniques` |
| J-13 | Obligations du vendeur professionnel de véhicules d'occasion à un particulier | catégorie `vehicules_remorques` |
| J-14 | Portée exacte de l'obligation de déclaration d'absence d'amiante à la charge du vendeur | sécurité + responsabilité d'ELSATIA |
| J-15 | Responsabilité d'ELSATIA si une annonce interdite est publiée malgré les gardes | dimensionne l'assurance et la modération |
| J-16 | Échange entre professionnels : régime fiscal et comptable de l'échange (double vente) | fonction prévue en V1 |
| J-17 | Ouverture éventuelle au C2C (D-9) | **audit dédié requis** |

---

## 6. Propriété des biens, recel et contrefaçon

C'est le risque pénal du projet, et il ne se traite pas seulement par des CGU.

| Risque | Mesure |
|---|---|
| Vente d'un bien volé (**recel**) | vérification du professionnel ; `numero_serie` collecté et **conservé** en partie privée ; preuve d'achat facultative mais fortement pondérée ; coopération avec les autorités sur réquisition |
| Vente par un salarié de biens de son employeur | l'annonce appartient à l'**organisation**, jamais à la personne ; habilitation explicite ; journal append-only nominatif |
| **Contrefaçon** | signalement dédié « atteinte à mes droits » traité en priorité ; retrait rapide ; conservation des éléments ; procédure de notification par les titulaires de droits |
| Bien grevé (crédit-bail, location, gage) | déclaration de propriété **obligatoire à la publication**, opposable |

**Le `numero_serie` est un choix d'architecture à valeur juridique** : jamais affiché — l'exposer
faciliterait la fabrication de fausses annonces à partir de biens réels — mais **conservé et
comparable** par un modérateur, et communicable sur réquisition. C'est précisément l'équilibre qu'un
régime de plateforme diligente demande.

---

## 7. Signalement, médiation, litiges

| Dispositif | Obligation probable | Traduction |
|---|---|---|
| Signalement d'annonce ou de message | **DSA** | accessible à tous, **y compris anonymes** ; accusé de réception ; décision motivée ; catégories : illicite, dangereux, contrefaçon, arnaque, erreur de catégorie |
| Recours contre une décision de modération | **DSA** | contestation → réexamen humain → décision motivée |
| **Médiation de la consommation** | Code de la consommation | tout professionnel vendant à un consommateur doit proposer un médiateur. **Cette obligation pèse sur le vendeur.** ELSATIA doit l'en informer ; elle doit elle-même en désigner un pour **son propre service** (l'abonnement Market). |
| Médiation P2B | règlement (UE) 2019/1150 | médiateurs à désigner si les seuils sont franchis (J-3) |
| Litige acheteur ↔ vendeur | — | ELSATIA **n'arbitre pas**. Elle conserve et restitue aux parties la trace des échanges, offres, réservations et remises. C'est un rôle de **témoin**, pas de juge. |
| Signalement aux autorités | DSA | procédure interne : soupçon d'infraction grave → conservation des éléments → signalement. **À formaliser avec un avocat** (J-18). |

---

## 8. Données personnelles (RGPD)

| Traitement | Base légale probable | Conservation | Point d'attention |
|---|---|---|---|
| Compte acheteur particulier | exécution du contrat | durée du compte + délai légal | **le traitement le plus sensible** : le seul portant sur des personnes physiques hors cadre professionnel |
| Identité des vendeurs (traçabilité DSA) | **obligation légale** (si J-1 le confirme) | durée imposée par le texte | pièces d'identité : chiffrement, accès restreint, journalisation des accès |
| Messagerie interne | exécution du contrat | durée bornée + conservation en cas de litige | **contenu privé** : accès modération **strictement** limité au signalement portant sur la conversation |
| Annonces publiées | intérêt légitime | durée de publication + archivage | pas de donnée personnelle en partie publique — c'est une règle de conception, pas une politique |
| Journal append-only | obligation légale / intérêt légitime | long | **inaltérable** — arbitrage avec le droit à l'effacement : voir ci-dessous |
| Signalements | obligation légale | durée du traitement + recours | identité du signalant protégée |
| Alertes et recherches enregistrées | consentement | jusqu'au retrait | opt-in strict |

**Droits des personnes.** Accès, rectification, effacement, portabilité, opposition. L'existant
`exporter_donnees_entreprise()` couvre le périmètre **entreprise** ; **rien** n'existe pour un
particulier — c'est un développement à part entière.

**Tension à arbitrer, et elle est réelle** : le journal append-only est une exigence de traçabilité
et de preuve ; le droit à l'effacement est un droit fondamental. La conciliation habituelle consiste
à **pseudonymiser** les données personnelles dans le journal tout en conservant les faits et leur
chaîne — ce que la maison sait déjà faire (`anonymiser_employe` existe côté paie). **À valider —
J-19.**

**Minimisation.** Le choix de laisser la consultation entièrement anonyme (§4.2 de la spécification)
est aussi une décision RGPD : il réduit drastiquement le volume de données personnelles collectées.

---

## 9. Contractuel — ce qu'il faut rédiger

| Document | Parties | Points saillants |
|---|---|---|
| **CGU Market** | ELSATIA ↔ tout utilisateur | statut de plateforme, non-vendeur, règles de publication, catégories interdites, modération, signalement, recours, responsabilité |
| **CGU vendeur Market** *(P2B)* | ELSATIA ↔ entreprise vendeuse | abonnement, quotas, vérification, classement, mise en avant, suspension motivée, préavis de modification, médiation |
| **CGV abonnement Market** | ELSATIA ↔ entreprise vendeuse | prix, durée, résiliation, facturation |
| **Charte de publication** | opposable aux vendeurs | catégories, mentions obligatoires, interdits, sanctions graduées |
| **Politique de modération** *(DSA)* | publique | critères, délais, recours, statistiques |
| **Critères de classement** *(DSA + P2B)* | publique | paramètres principaux, effet de la mise en avant payante |
| **Politique de confidentialité Market** | publique | traitements, durées, droits, destinataires |
| **Mentions légales / point de contact DSA** | publiques | — |

**À ne pas faire** : réutiliser les CGU de Gestion Pro. Le rapport juridique est **différent par
nature** — service logiciel d'un côté, intermédiation de l'autre. Une CGU unique brouillerait
précisément la distinction que tout ce document s'emploie à établir.

---

## 10. Synthèse des risques juridiques

| # | Risque | Gravité | Probabilité sans mesure | Mesure principale |
|---|---|:---:|:---:|---|
| R1 | Qualification en plateforme de contrats à distance non anticipée (DSA) | **majeure** | moyenne | appliquer la traçabilité des professionnels comme si elle était obligatoire |
| R2 | Publication d'un bien interdit (amiante, EPI, machine non conforme) | **majeure** | **élevée** sans garde | nomenclature fermée + vérification a priori + interdits techniques |
| R3 | **Recel** | **majeure** | moyenne | vérification pro + numéro de série + preuve d'achat + coopération |
| R4 | Perte du bénéfice du régime d'hébergeur | **majeure** | moyenne | modération diligente, motivée, tracée ; J-2 |
| R5 | Obligations déclaratives DAC7 non tenues | **haute** | **indéterminée** | trancher J-8 ; concevoir la collecte exportable dès la V1 |
| R6 | Confusion Boutique / Market dans l'esprit de l'acheteur | **haute** | **élevée** sans discipline | séparation stricte des parcours, des tables, des CGU, des factures |
| R7 | Manquement P2B (classement, préavis, motivation) | moyenne | élevée | transparence publiée, motivation systématique |
| R8 | Fuite de données multi-tenant par l'index de recherche | **haute** | faible avec la projection | projection publique + fonctions à projection explicite |
| R9 | Contrefaçon non traitée avec diligence | haute | moyenne | procédure de notification prioritaire |
| R10 | Contentieux consommateur sur la garantie légale | moyenne | moyenne | information du vendeur, champ `garantie` explicite |
| R11 | Utilisation de Market comme canal d'hameçonnage | haute | **élevée** | messagerie interne, quotas, avertissements, aucun paiement en messagerie |
| R12 | Vente entre particuliers ouverte sans audit (D-9) | **majeure** | nulle si non ouverte | **ne pas ouvrir** |

---

## 11. Ce que ce cadrage recommande avant toute ouverture

1. **Faire trancher J-1** (qualification DSA) par un avocat. Tout le dimensionnement en dépend.
2. **Faire trancher J-8** (DAC7). Idem pour la charge et le modèle de données.
3. **Faire valider la liste des catégories** — J-9 à J-14 — avant d'ouvrir la moindre catégorie
   `sous_conditions`.
4. **Faire rédiger les documents contractuels** par un professionnel, pas les dériver de l'existant.
5. **Ne pas ouvrir le C2C** (D-9 / J-17).
6. **Contracter une source de vérification d'entreprise** (D-4) : sans elle, l'exigence
   « un particulier ne doit pas pouvoir se déclarer professionnel » n'est pas tenue, et R2 comme R3
   deviennent probables plutôt qu'hypothétiques.

---

## 12. Confirmation

Document de cadrage. Aucun code, aucune migration, aucun objet Stripe, aucune Production, aucun
dépôt tiers modifié. **Ce document ne constitue pas un avis juridique.**
