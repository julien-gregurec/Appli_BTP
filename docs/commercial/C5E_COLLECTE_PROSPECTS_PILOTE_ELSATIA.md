# C5-E — Collecte et qualification des prospects pilotes ELSATIA

## 1. Objet, périmètre et verdict

Le lot C5-E constitue une première liste réelle de **30 entreprises du second œuvre dans le Bas-Rhin**, réparties en trois lots de 10. Il couvre uniquement la recherche publique, la vérification, la qualification et la préparation du suivi.

**Aucune entreprise n'a été contactée.** Aucun e-mail, appel, SMS, message LinkedIn, formulaire, inscription ou essai n'a été déclenché.

Le classement produit **30 P2**, sans P1 forcé. Ce résultat est volontairement prudent : les sources publiques documentent bien l'activité, la taille, les équipes, les projets, l'accès professionnel et la géographie, mais ne prouvent généralement pas la dispersion des outils ni les difficultés de pilotage/rentabilité. Ces deux critères restent `?` jusqu'à un échange autorisé.

## 2. État de départ et garde-fous

- dépôt : `/Users/juliengregurec/Projects/liria-codex` ;
- branche créée : `codex/c5e-collecte-prospects-pilote` ;
- base : `73a0312c168fe7a5614e913a08d9afea5509eab0` ;
- C5-A à C5-D et modèle Excel présents ;
- onglet `OPPOSITIONS` contrôlé et vide ;
- aucun fichier applicatif modifié ;
- test interne aller-retour de `contact@elsatia.fr` maintenu comme condition préalable à C5-F ; aucun test prospect réalisé ;
- classeur contenant les données réelles exclu de Git par une règle ciblée.

## 3. Méthode de recherche

### 3.1 Constitution du vivier

Un vivier de **292 candidats distincts** a été extrait à partir de l'[API Recherche d'entreprises de l'État](https://recherche-entreprises.api.gouv.fr/docs/) pour le département 67, sur les activités suivantes :

- plâtrerie (`43.31Z`) ;
- menuiserie intérieure et agencement (`43.32A`, `43.32C`) ;
- revêtements de sols et murs (`43.33Z`) ;
- peinture et vitrerie (`43.34Z`) ;
- autres travaux de finition (`43.39Z`).

La présélection a privilégié les établissements actifs, employeurs, situés à environ 50 km de Strasbourg et appartenant aux tranches d'effectif compatibles avec C5-A.

### 3.2 Vérification en temps réel

Chaque entreprise retenue a été vérifiée le **15 août 2026** avec, selon disponibilité :

1. l'[Annuaire des Entreprises](https://annuaire-entreprises.data.gouv.fr/) pour l'existence, le SIREN, l'activité, l'adresse et la tranche d'effectif ;
2. le site officiel pour les métiers, les équipes, les réalisations, les coordonnées et le parcours de projet ;
3. une source secondaire publique : BOAMP, France Travail, Qualibat, fédération professionnelle, annuaire municipal ou fiche professionnelle publique ;
4. une déduplication par SIREN, raison sociale, enseigne, domaine et téléphone.

Les URL sources sont enregistrées ligne par ligne dans le classeur. Une donnée non trouvée est indiquée `NON TROUVÉ`, jamais complétée par supposition.

### 3.3 Qualification et classement

Le score C5-A a été appliqué sans modifier ses critères ni ses pondérations. Chaque ligne contient huit critères documentés sur dix ; les critères `C6_DISPERSION_OUTILS` et `C7_PILOTAGE_RENTABILITE` restent inconnus.

Le classement combine : score, adéquation métier, taille, proximité, accessibilité professionnelle, qualité des coordonnées, actualité des signaux et diversité du lot 1. Il n'est donc pas un simple tri décroissant du score.

## 4. Synthèse des 30 entreprises

| Rang | Lot | Entreprise / enseigne | Ville | Métier principal | Effectif public | Score | Priorité |
|---:|---|---|---|---|---|---:|---|
| 1 | Lot 1 | SVMJ / STRASOL | Wiwersheim | Revêtements de sols professionnels | 20 spécialistes annoncés ; registre 20–49 | 70 | P2 |
| 2 | Lot 1 | MAYART | Kilstett | Peinture et second œuvre multi-activité | 20–49 | 70 | P2 |
| 3 | Lot 1 | ENNESSER ET FILS | Hœrdt | Peinture, façade, ITE et aménagement | Environ 30 annoncés | 70 | P2 |
| 4 | Lot 1 | CRÉPI STYLE | Haguenau | Façade, ITE, couverture et rénovation | 10–19 ; site : plus de 20 | 70 | P2 |
| 5 | Lot 1 | ÉTABLISSEMENTS GÉRARD ET FILS | Lutzelhouse | Peinture, isolation et échafaudage | 35 annoncés | 70 | P2 |
| 6 | Lot 1 | CARRELAGE DENNI | Gundershoffen | Carrelage et rénovation intérieure | 23 collaborateurs annoncés | 70 | P2 |
| 7 | Lot 1 | CARRELAGE NUSS | Geispolsheim | Carrelage et salles de bains | 10–19 | 70 | P2 |
| 8 | Lot 1 | AKPRO | Souffelweyersheim | Plâtrerie et faux plafonds | 20–49 | 65 | P2 |
| 9 | Lot 1 | SCE CARRELAGE | Strasbourg | Carrelage et revêtements | 10–19 | 65 | P2 |
| 10 | Lot 1 | CF PARQUET | Mundolsheim | Parquets et revêtements de sols | 10–19 | 65 | P2 |
| 11 | Lot 2 | SARL PEINTURE KAROTSCH | Benfeld | Peinture, façade, ITE et sols | 10–19 | 70 | P2 |
| 12 | Lot 2 | PEINTURE DÉCORATION A. BOEHM | Dettwiller | Peinture et aménagement | 10–19 | 70 | P2 |
| 13 | Lot 2 | CHROMATIC | Saverne | Peinture intérieure et ITE | 10–19 | 70 | P2 |
| 14 | Lot 2 | HK RENOV | Strasbourg | Peinture, isolation et rénovation | Tranches 10–19 / 20–49 contradictoires | 65 | P2 |
| 15 | Lot 2 | PEINTURES LEBERQUIER / LV SOLS | Strasbourg | Peinture et sols | 10–19 | 65 | P2 |
| 16 | Lot 2 | GASHI | Bischheim | Plâtrerie et plafonds | 10–19 | 65 | P2 |
| 17 | Lot 2 | ÉTABLISSEMENTS TOMAT | Holtzheim | Façades, ITE, béton et pierre | 10–19 | 65 | P2 |
| 18 | Lot 2 | CARRELAGE KÉVIN CAILLET | Fegersheim | Carrelage et salles de bains | 10–19 | 65 | P2 |
| 19 | Lot 2 | COCOONING | La Wantzenau | Rénovation, décoration et peinture | 10–19 | 65 | P2 |
| 20 | Lot 2 | ANDRÉ NONNENMACHER & FILS | Brumath | Peinture, plâtrerie et sols | 20–49 | 65 | P2 |
| 21 | Lot 3 | HSOLS FRANCE | Griesheim-près-Molsheim | Sols industriels | 10–19 | 65 | P2 |
| 22 | Lot 3 | KLEINMANN CHARLES | Brumath | Peinture, sols, ITE et façades | 20–49 | 65 | P2 |
| 23 | Lot 3 | RCBC | Mommenheim | Carrelage et salles de bains | 10–19 | 65 | P2 |
| 24 | Lot 3 | PEINTURES DÉCORS VEITH | Oberhoffen-sur-Moder | Peinture, décoration et ITE | 10–19 | 65 | P2 |
| 25 | Lot 3 | DIPOL | Geispolsheim | Carrelage, faïence et sols souples | 20–49 | 60 | P2 |
| 26 | Lot 3 | SANTORO FRÈRES | Molsheim | Carrelage et marbrerie | 10–19 | 60 | P2 |
| 27 | Lot 3 | ESCHLIMANN | Erstein | Restauration et peinture décorative | 6–9 / 10–19 contradictoires | 60 | P2 |
| 28 | Lot 3 | INTERSOL | Bischoffsheim | Sols industriels et techniques | 20–49 | 60 | P2 |
| 29 | Lot 3 | HITTIER & FILS | Schweighouse-sur-Moder | Peinture intérieure et plâtrerie | 20–49 | 60 | P2 |
| 30 | Lot 3 | PEINTUR'S HEIBEL & GARGOWITSCH | Barr | Peinture et ITE | 10–19 | 60 | P2 |

## 5. Lots proposés

### Lot 1 — test de campagne, 10 entreprises

1. STRASOL — sols professionnels, équipe bureau/conducteurs/poseurs explicite ;
2. MAYART — second œuvre multi-activité et signal de marché récent ;
3. ENNESSER ET FILS — peinture/aménagement, équipe d'environ 30 personnes ;
4. CRÉPI STYLE — rénovation multi-métiers et processus de projet public ;
5. GÉRARD ET FILS — 35 professionnels et plusieurs domaines ;
6. CARRELAGE DENNI — 23 collaborateurs et gestion de projet de A à Z ;
7. CARRELAGE NUSS — rénovation complète de salles de bains ;
8. AKPRO — plâtrerie/faux plafonds et coordonnées professionnelles ;
9. SCE CARRELAGE — marché public 2026 et coordonnées vérifiées ;
10. CF PARQUET — équipe de pose, clients professionnels et réalisations récentes.

Ce lot couvre sols, carrelage, plâtrerie, peinture, façade, isolation et rénovation. Les coordonnées sont exploitables pour les dix entreprises, sous réserve d'une dernière revue humaine avant C5-F.

### Lots 2 et 3

Le lot 2 rassemble des profils proches et bien sourcés, avec quelques coordonnées à compléter. Le lot 3 conserve des entreprises pertinentes mais dont la taille précise, le décideur ou les coordonnées professionnelles demandent davantage de vérification avant toute sollicitation.

## 6. Répartitions

### Priorité et score

| Mesure | Résultat |
|---|---:|
| P1 | 0 |
| P2 | 30 |
| P3 | 0 |
| Score moyen | 65,7 / 100 |
| Plage | 60 à 70 |
| Complétude | 8 critères documentés sur 10 pour chaque fiche |

L'absence de P1 ne signifie pas une faible qualité du vivier. Elle traduit l'application stricte de C5-A : aucune difficulté d'outillage, de ressaisie ou de rentabilité n'est affirmée sans preuve.

### Métier principal

| Famille | Nombre |
|---|---:|
| Peinture, façade, ITE, rénovation et multi-activité | 17 |
| Sols, carrelage et salles de bains | 11 |
| Plâtrerie / cloisons / plafonds | 2 |

### Taille

| Donnée publique | Nombre |
|---|---:|
| 10–19 salariés | 19 |
| Environ 20 salariés / spécialistes | 1 |
| Environ 30 salariés | 1 |
| Tranche 20–49 salariés | 9 |

Les tranches 20–49 ne permettent pas d'affirmer qu'une entreprise compte 25 salariés ou moins. Elles obtiennent donc une note de taille prudente lorsque aucun effectif plus précis n'est public.

### Géographie

| Distance approximative de Strasbourg | Nombre |
|---|---:|
| 0–10 km | 9 |
| Plus de 10 à 25 km | 13 |
| Plus de 25 à 50 km | 8 |

Les 30 entreprises restent dans la zone pilote ; aucune exception au-delà de 50 km n'a été retenue. Les distances sont des estimations géographiques, pas des temps de trajet.

## 7. Qualité des coordonnées

| Champ | Disponible | Non trouvé / à confirmer |
|---|---:|---:|
| Site ou présence professionnelle | 23 | 7 |
| Téléphone professionnel public | 22 | 8 |
| E-mail professionnel public | 18 | 12 |
| Décideur/contact professionnel nommé | 13 | 17 |

Les adresses retenues sont professionnelles et publiquement exposées dans un contexte d'entreprise. Aucun canal privé, domicile ou donnée sensible n'a été collecté.

## 8. Incertitudes à conserver visibles

- `C6_DISPERSION_OUTILS` et `C7_PILOTAGE_RENTABILITE` restent `?` pour les 30 prospects ;
- l'effectif de HK RENOV diffère selon l'année et la source ;
- ESCHLIMANN présente une différence entre une source récente à 6–9 et le registre à 10–19 ;
- CRÉPI STYLE et ENNESSER publient des chiffres d'équipe plus précis que les tranches administratives, avec des dates différentes ;
- les tranches 20–49 d'AKPRO, MAYART, NONNENMACHER, KLEINMANN, DIPOL, INTERSOL et HITTIER doivent être précisées ;
- les entreprises sans téléphone, e-mail ou interlocuteur identifié restent exploitables uniquement après enrichissement ou validation manuelle ;
- le besoin logiciel, le nombre de comptes, les outils actuels, les pointages, les frais et la rentabilité ne sont pas établis.

## 9. Contrôles prudence, RGPD et qualité

- 30 SIREN uniques ;
- une seule fiche par entreprise ou groupe commercial pertinent ;
- entreprises actives au moment de la collecte ;
- opposition contrôlée : liste vide ;
- données limitées au contexte professionnel ;
- sources et dates conservées dans le classeur ;
- faits, signaux et hypothèses séparés dans chaque fiche ;
- 30 statuts `Qualifié`, aucun `Contacté` ;
- lots 1, 2 et 3 contenant chacun 10 entreprises ;
- tableau de bord : 30 prospects, 0 contact, 0 réponse, 0 opposition ;
- aucune erreur de formule détectée ;
- classeur réel non versionné.

## 10. Recommandations avant C5-F

1. Examiner manuellement les dix fiches du lot 1, une par une.
2. Confirmer l'identité commerciale actuelle de STRASOL/SVMJ et l'interlocuteur de MAYART.
3. Vérifier les coordonnées immédiatement avant usage, car elles peuvent évoluer.
4. Réaliser et documenter le test interne aller-retour de `contact@elsatia.fr` exigé par C5-D.
5. Ne lancer aucun message tant que le lot 1, les angles d'approche et les canaux n'ont pas été approuvés explicitement.
6. Lors d'un futur échange autorisé, qualifier en priorité les critères restés inconnus : outils, ressaisies, planning, heures/frais, pilotage et calendrier.

## 11. Livrables et conservation

- rapport versionné : `docs/commercial/C5E_COLLECTE_PROSPECTS_PILOTE_ELSATIA.md` ;
- classeur opérationnel privé : `outputs/c5e-private/ELSATIA_CAMPAGNE_PILOTE_30_PROSPECTS.xlsx` ;
- destination Drive prévue : `ELSATIA / Commercial / Prospection / Campagne pilote` ;
- téléversement Drive non effectué, faute d'autorisation explicite ;
- aucun autre lot commencé.

## Verdict

**C5-E PRÊT — 30 PROSPECTS QUALIFIÉS**
