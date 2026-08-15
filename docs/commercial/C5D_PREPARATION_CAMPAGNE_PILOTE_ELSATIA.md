# C5-D — Préparation opérationnelle de la campagne pilote ELSATIA

## 1. Objet et limites

Ce lot transforme C5-A, C5-B et C5-C en un dispositif directement utilisable pour préparer la campagne pilote de 30 entreprises alsaciennes. Il ne contient aucun prospect réel et n'exécute aucune recherche, collecte, importation, sollicitation ou activation d'essai.

Les décisions opérationnelles nécessaires à la collecte pilote sont désormais arrêtées. La collecte pourra commencer dans un lot séparé, sous réserve des contrôles par lot prévus dans la checklist. Aucun contact ne doit être envoyé avant les contrôles d'exécution correspondants.

## 2. Décisions opérationnelles retenues

| Sujet | Décision C5-D | Limite ou condition |
|---|---|---|
| Outil | Classeur Excel dédié, distinct d'ELSATIA | Le CRM interne reste BETA |
| Emplacement | `ELSATIA / Commercial / Prospection / Campagne pilote` sur le Google Drive professionnel ELSATIA, accès **Restreint** | Accès initial réservé à Julien GREGUREC ; aucun téléversement effectué dans C5-D |
| Responsable | Julien GREGUREC | Propriétaire du classeur, responsable de campagne et expéditeur initial |
| Zone initiale | Rayon de **50 km autour de Strasbourg** | Dépassement ponctuel seulement pour un profil au score C5-A particulièrement élevé |
| Entreprises individuelles | Admissibles sans être prioritaires, si le besoin structuré est démontré | Plusieurs utilisateurs, équipes ou chantiers ; aucun domicile ni canal personnel collecté |
| Canal initial | Envoi manuel, unitaire et personnalisé via Google Workspace depuis `contact@elsatia.fr` | Aucun envoi automatisé |
| Automatisation | Aucune pour les trois lots | Brevo non utilisé pour une séquence froide pilote |
| Conservation | Politique définitive du pilote définie en section 10 | Suppression anticipée dès que la donnée n'est plus utile |
| Opposition | Onglet séparé et contrôle avant chaque lot/action | Accès restreint et données minimales |

## 3. Outil de suivi définitif du pilote

Le pilote utilise `C5D_MODELE_SUIVI_CAMPAGNE_PILOTE_ELSATIA.xlsx`.

Le classeur rassemble :

- le scoring C5-A, avec les 10 critères notés `0`, `5`, `10` ou `?` ;
- les lots et priorités ;
- le statut C5-C et la prochaine action datée ;
- l'historique minimal des actions C5-B ;
- les démonstrations, essais, propositions et décisions ;
- une liste d'opposition séparée ;
- un tableau de bord calculé par formules ;
- les listes contrôlées utilisées par les menus déroulants ;
- les règles d'utilisation et les sources de référence.

Le classeur reste séparé de l'application ELSATIA : le catalogue applicatif marque actuellement le CRM interne **BETA**. Aucune donnée réelle du pilote ne doit y être copiée tant qu'un lot distinct n'a pas validé son périmètre, ses droits et sa conformité.

## 4. Emplacement et accès recommandés

### Décision unique

Utiliser, lors du lot de collecte, le dossier suivant :

```text
ELSATIA/
└── Commercial/
    └── Prospection/
        └── Campagne pilote/
            └── C5D_MODELE_SUIVI_CAMPAGNE_PILOTE_ELSATIA.xlsx
```

Paramètres obligatoires :

- propriétaire et responsable : **Julien GREGUREC** ;
- accès général **Restreint**, jamais « toute personne disposant du lien » ;
- accès initial accordé uniquement à Julien GREGUREC ;
- tout accès supplémentaire devra être accordé nominativement et justifié ;
- éditeurs empêchés de modifier les autorisations ou de repartager lorsque l'option est disponible ;
- une seule version de référence, sans copies envoyées par e-mail ;
- accès depuis le Finder du Mac via Google Drive pour ordinateur ;
- disponibilité hors connexion seulement si nécessaire et sur un Mac protégé ;
- revue des accès avant chaque lot et retrait immédiat lorsqu'un accès n'est plus nécessaire.

Google Drive permet de limiter un fichier à des personnes précises et de choisir des rôles de consultation ou de modification : [Google Drive — partager des fichiers](https://support.google.com/drive/answer/2494822?hl=fr). Drive pour ordinateur permet l'accès depuis le Finder et la synchronisation des fichiers Office sur macOS : [Google Drive pour ordinateur](https://support.google.com/drive/answer/10838124?hl=fr).

### Comparaison

| Option | Sauvegarde | Contrôle des accès | Mac / Excel | Décision |
|---|---|---|---|---|
| Local uniquement | Dépend du Mac et de la sauvegarde locale | Simple, mais lié au poste | Excellent | Non retenu comme emplacement maître |
| Google Drive professionnel restreint | Synchronisation et historique du service | Accès nominatif et révocable | Compatible via Finder/Excel | **Retenu** |
| Nouveau service externe | Variable | Nouveau paramétrage | Variable | Inutile pour 30 prospects |

Ce document recommande l'emplacement ; il ne crée aucun dossier et ne téléverse aucun fichier.

## 5. Structure exacte du classeur

### Onglet `PROSPECTS`

Fiche maître, une ligne par entreprise :

1. `ID_PROSPECT`
2. `LOT`
3. `PRIORITE_C5A`
4. `RAISON_SOCIALE`
5. `ENSEIGNE`
6. `SIREN`
7. `CLE_DEDUPLICATION`
8. `VILLE`
9. `DEPARTEMENT`
10. `DISTANCE_STRASBOURG_KM`
11. `ACTIVITE`
12. `EFFECTIF_ESTIME`
13. `SITE_WEB`
14. `TELEPHONE_PROFESSIONNEL`
15. `EMAIL_PROFESSIONNEL_PUBLIC`
16. `INTERLOCUTEUR_PROFESSIONNEL`
17. `ROLE_INTERLOCUTEUR`
18. `SOURCE_PRINCIPALE_URL`
19. `DATE_COLLECTE`
20. `DATE_VERIFICATION`
21. `SIGNAL_PUBLIC_FACTUEL`
22. `C1_TAILLE`
23. `C2_METIER`
24. `C3_EQUIPES_CHANTIERS`
25. `C4_PLANNING_TEMPS_FRAIS`
26. `C5_PARCOURS_COMMERCIAL_CHANTIER`
27. `C6_DISPERSION_OUTILS`
28. `C7_PILOTAGE_RENTABILITE`
29. `C8_ACCES_DECIDEUR`
30. `C9_GEOGRAPHIE`
31. `C10_DECLENCHEUR_CALENDRIER`
32. `NB_CRITERES_DOCUMENTES`
33. `SCORE_C5A`
34. `CLASSIFICATION_C5A`
35. `MOTIF_EXCLUSION`
36. `CANAL_INITIAL`
37. `DATE_PREMIER_CONTACT`
38. `STATUT_PIPELINE`
39. `BESOINS_EXPRIMES`
40. `OBJECTIONS`
41. `OFFRE_POTENTIELLE`
42. `DERNIERE_ACTION`
43. `DATE_DERNIERE_ACTION`
44. `PROCHAINE_ACTION`
45. `DATE_PROCHAINE_ACTION`
46. `RESPONSABLE`
47. `DATE_REPONSE`
48. `DATE_ECHANGE`
49. `DATE_DEMO_PLANIFIEE`
50. `DATE_DEMO_REALISEE`
51. `DATE_DEBUT_ESSAI`
52. `DATE_FIN_ESSAI`
53. `DATE_PROPOSITION`
54. `DECISION`
55. `RAISON_RESULTAT`
56. `DATE_REPRISE`
57. `OPPOSITION_OUI_NON`
58. `NOTES_FACTUELLES`

Les colonnes de score, complétude et classification sont calculées. Les catégories utilisent les listes contrôlées de `LISTES`.

### Onglet `ACTIONS`

`ID_ACTION`, `ID_PROSPECT`, `LOT`, `DATE_HEURE`, `CANAL`, `SENS`, `TYPE_ACTION`, `MESSAGE_VARIANTE`, `RESULTAT_FACTUEL`, `PROCHAINE_ACTION`, `DATE_PROCHAINE_ACTION`, `RESPONSABLE`, `OPPOSITION_REÇUE_OUI_NON`.

Une action conserve un résumé factuel, pas une copie intégrale de l'échange.

### Onglet `OPPOSITIONS`

`ID_OPPOSITION`, `IDENTIFIANT_PROFESSIONNEL_MINIMAL`, `TYPE_IDENTIFIANT`, `CANAL`, `DATE_OPPOSITION`, `SOURCE_INTERNE`, `STATUT`, `ENTREPRISE_SI_UTILE`.

### Onglet `TABLEAU_DE_BORD`

Indicateurs calculés pour l'ensemble du pilote et par lot : prospects saisis, P1/P2, contactés, réponses/échanges, démos planifiées et réalisées, essais, propositions, gagnés, perdus et oppositions. Les divisions utilisent des formules protégées contre les dénominateurs nuls.

### Onglet `LISTES`

Valeurs autorisées : lots, scores, classifications, statuts, canaux, sens, types d'action, offres, décisions, raisons gagnées/perdues, opposition et activités prioritaires.

### Onglet `README`

Objet, règles de saisie, scoring C5-A, déduplication, opposition, conservation, contrôle GO/NO-GO et références.

## 6. Minimisation des données

### Données autorisées lorsqu'elles sont nécessaires

- raison sociale, enseigne et identifiant d'entreprise ;
- ville, département et distance de la zone pilote ;
- activité et tranche d'effectif publique ;
- site officiel ;
- standard ou téléphone professionnel public ;
- adresse générique publique, ou adresse nominative professionnelle pertinente si nécessaire ;
- nom et rôle professionnels seulement s'ils sont publics, pertinents et utiles ;
- URL de source et dates de collecte/vérification ;
- score, statut, actions, besoins et objections strictement professionnels.

### Données interdites

- adresse personnelle ou domicile d'un entrepreneur individuel ;
- téléphone privé ;
- e-mail personnel sans nécessité démontrée ;
- date de naissance, situation familiale, loisirs, opinions ou données sensibles ;
- contenu de profils privés ;
- informations sur des salariés sans rapport avec la décision ;
- appréciations personnelles, rumeurs ou déductions financières ;
- secrets, mots de passe, jetons ou données de Production.

Une donnée manquante reste vide ou porte la mention `non trouvé` lorsqu'une vérification a réellement été tentée. Elle n'est jamais estimée par défaut.

## 7. Zone géographique du pilote

### Comparaison

| Zone | Proximité | Taille du vivier | Risque |
|---|---|---|---|
| 30 km | Très forte | Peut être trop étroite pour 30 P1/P2 | Élargir trop tôt les critères métier |
| **50 km** | Forte, rendez-vous physiques réalistes | Couvre Strasbourg, Eurométropole et une part significative du Bas-Rhin | Équilibre maîtrisable |
| 75 km | Correcte | Vivier plus large | Temps de déplacement plus important |
| Alsace entière | Variable | Vivier maximal | Dilution de la proximité locale |

### Décision

Commencer par **50 km autour de Strasbourg**, distance appréciée par trajet ou localisation de l'établissement ciblé. La qualité C5-A prime sur la distance : ne pas abaisser le score pour remplir la liste.

Un prospect légèrement au-delà de 50 km peut être retenu uniquement si son score C5-A est particulièrement élevé et si la raison est documentée. Il n'y a pas d'extension automatique de la zone : toute extension plus large exige une nouvelle validation.

## 8. Entreprises individuelles et micro-entreprises

Le statut juridique n'est pas un motif d'exclusion automatique, mais les entreprises individuelles et micro-entreprises ne sont pas prioritaires. Elles peuvent entrer si :

- elle exerce un métier prioritaire ;
- elle présente un besoin structuré lié à plusieurs utilisateurs, équipes ou chantiers ;
- elle peut utiliser utilement les 3 comptes de l'offre Mini à 79 € HT/mois ;
- son score C5-A atteint P1 ou P2 ;
- un canal strictement professionnel est public ;
- son domicile n'est pas enregistré si celui-ci correspond à l'adresse professionnelle.

Les structures d'une ou deux personnes restent hors priorité initiale, conformément au critère de taille C5-A, sauf profil exceptionnel documenté. La première vague privilégie 10 à 25 salariés et tolère quelques structures de 3 à 10 ou 25 à 35 salariés particulièrement pertinentes.

## 9. Notice opérationnelle de prospection

### Formulation courte pour chaque premier e-mail

> Je vous contacte au nom d'ELSATIA dans un cadre strictement professionnel, au sujet de l'organisation entre le bureau et les chantiers. Vos coordonnées professionnelles ont été trouvées sur [source publique exacte]. Si vous préférez ne plus recevoir de message de ma part concernant ELSATIA, répondez simplement à cet e-mail et je retirerai vos coordonnées de ma liste de prospection.

### Présentation orale au téléphone

> Bonjour, Julien GREGUREC à l'appareil, pour ELSATIA. Je vous appelle au sujet de l'organisation entre le bureau et les chantiers dans le cadre de votre activité professionnelle. Est-ce que je peux vous expliquer la raison de mon appel en trente secondes ? Si vous ne souhaitez pas être rappelé, je le note immédiatement.

La CNIL indique que la prospection électronique vers des professionnels peut s'appuyer sur l'intérêt légitime lorsque la sollicitation est liée à leur profession, avec information et opposition simple et gratuite. Chaque message doit identifier l'organisation et permettre un refus simple : [CNIL — prospection électronique](https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique-sms-mms-et-automate-dappel).

Cette formulation courte doit apparaître dès le premier e-mail. Elle identifie ELSATIA, précise la finalité B2B et la source professionnelle publique, et offre une opposition simple.

## 10. Opposition et conservation

### Fonctionnement de `OPPOSITIONS`

1. à toute opposition, arrêter immédiatement e-mail, téléphone et LinkedIn ;
2. supprimer les prochaines actions de la fiche ;
3. ajouter le minimum permettant d'empêcher un nouveau contact ;
4. marquer `NE PLUS CONTACTER` ;
5. contrôler l'onglet avant chaque ajout, chaque gel de lot et chaque action ;
6. ne jamais réintroduire l'identifiant depuis une autre source.

Identifiant minimal pratique :

- e-mail professionnel normalisé en minuscules ;
- téléphone normalisé au format international si l'opposition porte sur ce canal ;
- à défaut, `SIREN + canal` pour une opposition portée par l'entreprise entière.

Ne pas créer de mécanisme de hachage improvisé dans le classeur. Si une empreinte est retenue ultérieurement, elle doit faire l'objet d'un mécanisme validé et reproductible.

### Politique retenue

| Catégorie | Règle opérationnelle proposée | Sortie |
|---|---|---|
| Prospect | Maximum 3 ans à compter de la collecte ou du dernier contact pertinent | Supprimer plus tôt dès que les données ne sont plus utiles ; conserver seulement les métriques anonymisées nécessaires |
| Perdu | Uniquement pendant la durée nécessaire au suivi commercial | Revue périodique et suppression ou anonymisation dès que la conservation n'est plus utile |
| À reprendre plus tard | Jusqu'à une date de reprise explicite et documentée | Aucune relance indéfinie ; supprimer ou anonymiser si la reprise n'est plus pertinente |
| Opposition | Minimum 3 ans dans la liste repoussoir, avec les seules données nécessaires | Usage exclusif : empêcher toute nouvelle prospection ; aucune réactivation automatique |

La CNIL indique comme repère que les données de prospects peuvent être conservées trois ans à compter de la collecte ou du dernier contact émanant du prospect, et recommande au moins trois ans pour les informations nécessaires à l'opposition : [CNIL — durées des données commerciales](https://www.cnil.fr/fr/questions-reponses-sur-les-referentiels-relatifs-la-gestion-des-activites-commerciales-et-des).

La liste d'opposition conserve au minimum : l'identifiant professionnel utile, l'entreprise si nécessaire, le canal, la date, la source interne et le statut `NE PLUS CONTACTER`. Elle ne sert à aucune autre finalité.

Ces règles devront être reprises dans la documentation RGPD et le registre de traitement lorsque le dispositif commercial sera formalisé.

## 11. Signature commerciale

Signature retenue :

```text
Julien GREGUREC
ELSATIA
contact@elsatia.fr
elsatia.fr
```

Ne pas ajouter de titre ni de numéro de téléphone à cette signature pilote.

## 12. Canal d'envoi retenu

### Décision

Envoyer manuellement, un par un, via Google Workspace depuis la boîte professionnelle `contact@elsatia.fr`.

- personnalisation humaine obligatoire ;
- aucun publipostage ou séquence automatique ;
- réponses reçues dans la même boîte et traitées le jour ouvré suivant ;
- arrêt immédiat possible ;
- journalisation manuelle dans `ACTIONS` ;
- contrôle de l'onglet `OPPOSITIONS` avant chaque envoi.

**Brevo n'est pas retenu** pour les premiers contacts froids. La campagne pilote reste entièrement manuelle.

**GO obligatoire :** envoyer un message interne de test depuis `contact@elsatia.fr`, vérifier l'expéditeur, la réception, la réponse et l'absence de redirection défaillante. Ce test ne vise aucun prospect.

## 13. Calendrier des trois lots

Les 30 fiches doivent d'abord être recherchées, vérifiées, scorées puis gelées dans un lot ; C5-D n'exécute pas cette collecte.

### Semaine 0 — préparation

- lundi–mercredi : qualification et vérification futures des 30 fiches ;
- jeudi : déduplication, contrôle des sources et opposition ;
- vendredi : gel des lots, contrôle GO/NO-GO, test interne de la boîte et validation des 10 messages du lot 1.

### Cadence identique par lot

| Jour | Action |
|---|---|
| Lundi avant démarrage | Contrôle du lot, liste repoussoir, sources, messages et responsables |
| Mardi — J0 | Premier e-mail manuel aux 10 entreprises, étalé dans la journée |
| Vendredi — J3 | Appel professionnel, uniquement lorsque le canal et le rôle sont appropriés |
| J5, ou prochain jour ouvré | Relance e-mail ; décalage uniquement pour éviter week-end et jour férié |
| Mercredi — J8 | LinkedIn uniquement si pertinent et conforme à C5-B |
| Lundi suivant — J13 | Dernière relance et clôture propre |
| Lundi après-midi | Revue de lot de 25 à 30 minutes et décision GO/NO-GO pour le suivant |

### Séquence globale

- **Lot 1 :** semaines 1 à 3, revue avant tout lot 2 ;
- **Lot 2 :** semaines 3 à 5, seulement après correction validée ;
- **Lot 3 :** semaines 5 à 7, seulement après la deuxième revue ;
- **bilan final :** fin de semaine 7, sans lancer une extension automatique à 100 prospects.

Toute réponse suspend la cadence automatique prévue sur la fiche et déclenche une prochaine action adaptée.

## 14. Passage au lot suivant

Le lot suivant est **NO-GO** tant que l'une des conditions suivantes subsiste :

- incident d'opposition, de notice, d'accès ou de données ;
- message non délivré de façon répétée ou boîte de réponse non opérationnelle ;
- objection récurrente révélant une fonction absente ou un positionnement trompeur ;
- pipeline incomplet, actions non datées ou historique insuffisant ;
- opposition non traitée ;
- taux bruts non calculés ou revue non tenue ;
- ciblage manifestement mauvais ;
- présentation, démonstration ou environnement DEMO-18M indisponible.

Le passage est **GO** seulement si :

- toutes les oppositions sont bloquées ;
- chaque fiche a une source, un statut et une prochaine action ou un résultat final ;
- les volumes et motifs du lot sont relus ;
- aucune anomalie juridique/process importante n'est ouverte ;
- une seule correction principale est décidée, documentée et appliquée ;
- les 10 messages du lot suivant sont relus avant envoi.

## 15. Sélection opérationnelle des 30 entreprises

### Priorité

- établissement actif en Alsace, dans la zone pilote ;
- 10 à 25 salariés en priorité ;
- second œuvre, aménagement intérieur ou rénovation ;
- plusieurs équipes ou chantiers attestés par un fait public ;
- dirigeant ou décideur professionnel accessible ;
- coordonnées professionnelles publiques et pertinentes ;
- au moins 7 critères C5-A documentés ;
- score **P1 (75–100)** ou **P2 (60–74)** ;
- aucun motif d'exclusion ni opposition.

### Tolérance contrôlée

Quelques entreprises de 3 à 10 ou 25 à 35 salariés peuvent être retenues si leur besoin potentiel est particulièrement cohérent et si le score reste P1/P2. Ne pas abaisser le score pour atteindre 30.

La classification **P3 (45–59)** correspond à l'ancienne catégorie C5-A « À enrichir ». Elle facilite le suivi des candidats incomplets, mais un P3 ne peut pas entrer dans un lot de contact tant qu'il n'a pas été enrichi et reclassé P1 ou P2.

Répartition de travail héritée de C5-A : 15 entreprises de 10 à 20 salariés, 8 de 20 à 25 salariés et 7 structures de 3 à 10 salariés suffisamment structurées, à ajuster seulement si les données publiques ne permettent pas de documenter les critères.

## 16. Vérification avant ajout futur

Pour chaque entreprise candidate :

1. vérifier l'existence et le statut actif dans l'Annuaire des Entreprises/Sirene ;
2. vérifier activité et établissement ciblé ;
3. vérifier ville, département et appartenance à la zone ;
4. consulter le site officiel ou une présence professionnelle fiable ;
5. noter la tranche d'effectif publique si disponible ;
6. vérifier le caractère professionnel des coordonnées ;
7. enregistrer l'URL et la date de chaque source principale ;
8. noter `non trouvé` plutôt que d'inventer ;
9. documenter les critères de score par des faits ;
10. contrôler la clé de déduplication et `OPPOSITIONS` avant validation.

## 17. Déduplication

### Clé pratique

1. **SIREN** comme clé principale de l'entreprise ;
2. si le suivi distingue des établissements, `SIREN + code postal de l'établissement`, sans multiplier les fiches inutilement ;
3. si SIREN temporairement non trouvé, nom de domaine normalisé ;
4. dernier recours : raison sociale normalisée + code postal, marquée à vérifier.

Avant ajout, rechercher la clé dans `PROSPECTS`, `ACTIONS` et `OPPOSITIONS`. Une enseigne et sa raison sociale partagent la même fiche lorsque le besoin et l'interlocuteur concernent la même entreprise. Une entreprise d'un lot précédent n'est jamais recréée : son statut est mis à jour dans sa fiche maître.

## 18. Critères GO / NO-GO

La checklist détaillée se trouve dans `C5D_CHECKLIST_GO_NO_GO.md`.

### GO minimal

- classeur vierge vérifié et emplacement professionnel validé ;
- accès nominatifs et sauvegarde définis ;
- notice courte opérationnelle validée ;
- mécanisme d'opposition opérationnel ;
- conservation validée ;
- signature et boîte `contact@elsatia.fr` testées ;
- scripts C5-B, présentation C2 et démonstration C4 disponibles ;
- Preview DEMO-18M prête sans données réelles ;
- pipeline C5-C et calendrier approuvés ;
- responsable de campagne identifié.

Une décision C5-D manquante produit un **NO-GO** pour la collecte. Un contrôle d'exécution manquant dans les sections G ou H de la checklist bloque le contact ou le passage de lot concerné.

## 19. État de préparation

Les décisions de gouvernance, de ciblage, de minimisation, de conservation, d'opposition, d'identité, de canal et de calendrier sont arrêtées. C5-D est prêt pour le lot suivant consacré à la collecte pilote.

Avant chaque contact réel, les contrôles d'exécution de la checklist restent obligatoires : source et qualification de la fiche, opposition, personnalisation, dates, responsable, disponibilité des supports et bon fonctionnement de la boîte.

## 20. Contrôle de périmètre

- aucun prospect réel recherché ou inscrit ;
- aucune coordonnée réelle collectée ;
- aucun e-mail, appel ou message LinkedIn envoyé ;
- aucun service externe configuré ;
- aucun fichier téléversé ;
- aucune donnée Production utilisée ;
- aucun code applicatif modifié.
