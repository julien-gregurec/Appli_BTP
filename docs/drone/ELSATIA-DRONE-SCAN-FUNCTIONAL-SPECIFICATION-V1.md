# ELSATIA Drone / Scan — Spécification fonctionnelle V1

> Lot `ELSATIA-DRONE-SCAN-ARCHITECTURE-MASTER-V1`, 2026-09-08.
> Complète `ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md` (2026-09-07). Ne le remplace pas.
> **Aucun nom n'est arrêté par ce document.** Il instruit l'arbitrage, Julien tranche.

---

## 1. Positionnement — Drone ou Scan

### 1.1 Le problème posé

Les deux appellations décrivent le même code et des produits différents. « Drone » nomme un
**appareil**. « Scan » nomme un **geste**. Le choix engage le catalogue pour des années,
parce qu'un nom d'application ELSATIA devient un `code` dans `applications_elsatia`, une
ligne de facturation, un sous-domaine et une rubrique du site.

### 1.2 Comparaison

| Critère | **ELSATIA Drone** | **ELSATIA Scan** |
|---|---|---|
| Compréhension par un artisan | **Immédiate.** « L'appli pour mon drone » | Floue. « Scanner » évoque le scanner de bureau ou le PDF |
| Référencement | Requêtes existantes et qualifiées : « logiciel drone toiture », « inspection drone façade » | Requêtes ambiguës, dominées par la numérisation documentaire |
| Crédibilité professionnelle | Forte : le mot dit le sérieux du matériel | Moyenne : trop général pour rassurer |
| Capacité d'évolution | **Limitée par le nom.** Un relevé au téléphone dans « Drone » est une contradiction visible | **Large.** Drone, téléphone, caméra, futurs capteurs tiennent tous dedans |
| Risque de brider le produit | **Élevé** : le mode nominal V1 est l'**import** — souvent sans drone connecté, parfois sans drone du tout | Faible |
| Risque de promesse fausse | **Élevé** : « Drone » laisse entendre un pilotage que le produit ne fera pas en V1 (voir la matrice SDK) | Faible |
| Cohérence ELSATIA | Gestion Pro, Colors, Tools, Réserves, Market, Boutique : **aucun nom d'objet matériel** | Cohérent avec la série |
| Sous-modules possibles | Mal : « Drone > Relevé au téléphone » sonne faux | Bien : « Scan > Drone », « Scan > Relevé », « Scan > Métré » |

### 1.3 Le fait qui départage

**La V1 ne pilote aucun drone.** La matrice SDK l'établit : pas d'iOS chez DJI, radiocommande
à écran exclue, pas de mission waypoint sur la gamme Mini, aucun test matériel exécuté. Le
mode nominal est l'import après vol — et l'import fonctionne aussi bien depuis un téléphone,
un appareil photo ou une carte mémoire que depuis un drone.

Nommer « Drone » un produit dont la V1 n'exige aucun drone crée une promesse que le produit ne
tient pas. C'est le défaut exact que la Boutique a déjà payé (« service de base inclus »
présenté comme permanent) et qu'ELSATIA s'est engagé à ne plus commettre.

### 1.4 Recommandation

**`ELSATIA Scan` comme nom de produit, « drone » comme mot-clé de communication.**

- `code` applicatif : **`scan`** ;
- sous-domaine : `scan.elsatia.fr` ;
- accroche site : « Relevé, inspection et métré par l'image — **drone, téléphone ou appareil
  photo** » ;
- le mot « drone » reste massivement présent dans les titres de page, les rubriques d'aide et
  les balises, où il porte le référencement **sans** verrouiller le périmètre.

Le référencement, seul avantage sérieux de « Drone », s'obtient par le contenu. Le périmètre,
lui, ne se récupère pas : renommer une application après commercialisation coûte un `code`
applicatif en base, des URL, une facturation et la confiance.

**Décision requise de Julien.** Tant qu'elle n'est pas prise, les documents conservent le nom
de travail `ELSATIA Drone` et le paquet reste `packages/drone-core` — un renommage de paquet
avant arbitrage serait du travail perdu.

**Contrainte à ne pas oublier :** la marque ELSATIA est déposée mais non enregistrée
définitivement ; aucun sous-nom ne doit être présenté comme marque, ni porter le symbole ®.

---

## 2. Périmètre fonctionnel

### 2.1 Ce que le produit fait

Préparer une intervention, y rattacher des images d'où qu'elles viennent, les organiser par
chantier, les inspecter, les annoter, en tirer des mesures dont l'origine est tracée, en
produire des rapports, et proposer — jamais imposer — le résultat à Gestion Pro, Réserves et
au DOE.

### 2.2 Ce qu'il ne fait pas

| Interdit | Raison |
|---|---|
| Décider d'un décollage | Le responsable est humain. L'application informe et bloque un dossier incomplet, elle n'autorise pas |
| Lever une réserve | La validation finale appartient à Réserves |
| Émettre un devis | Le devis appartient à Gestion Pro |
| Conclure à une conformité | Aucun logiciel ne remplace un homme de l'art |
| Annoncer une précision non mesurée | Aucune campagne métrologique n'a eu lieu |
| Écraser une image originale | L'original est immuable ; l'annotation est un calque |
| Supprimer physiquement une preuve | Corbeille et rétention, pas destruction — doctrine Colors |

---

## 3. Rôles

Distinction fondatrice : **un rôle applicatif n'est pas une qualification réglementaire.**
Le rôle `telepilote` dans ELSATIA donne des droits sur des données. Il ne prouve ni formation,
ni attestation, ni assurance. L'application **enregistre et rappelle** ces éléments ; elle ne
les délivre pas et ne les vérifie pas.

### 3.1 Rôles applicatifs (à déclarer dans `roles_applications_elsatia`)

| Rôle | Missions | Données visibles | Actions | Risque principal |
|---|---|---|---|---|
| `admin_organisation` | Toutes | Toutes celles de l'entreprise | Paramétrer, habiliter, exporter, purger | Exfiltration de masse |
| `responsable_mission` | Celles qu'il ouvre ou qu'on lui affecte | Mission complète | Créer, préparer, clore, valider un rapport | Clôture prématurée |
| `telepilote` | Celles où il est désigné | Mission + médias + checklist | Exécuter, importer, annoter | Confondre rôle et qualification |
| `operateur_terrain` | Affectées | Mission + médias | Importer, annoter, mesurer en indicatif | Mesure présentée comme fiable |
| `metreur` | Affectées | Médias + reconstructions + mesures | Mesurer, calibrer, valider une quantité | Quantité validée sans calage |
| `charge_affaires` | Lecture | Résumés, mesures validées, rapports | Exporter, partager | Diffusion hors périmètre |
| `consultation` | Lecture | Ce qui lui est explicitement partagé | Lire, télécharger si autorisé | — |
| `invite_externe` | Aucune | **Un lien, un périmètre, une échéance** | Lire | Lien qui survit au besoin |

Huit rôles. Les autres métiers cités au brief — chef de chantier, architecte, maître d'œuvre,
expert, assureur, gestionnaire immobilier, syndic, diagnostiqueur, client final — ne sont
**pas** des rôles supplémentaires : ce sont des **usages** de `consultation` ou
`invite_externe`. Multiplier les rôles techniques par les métiers produirait une matrice
d'habilitations ingérable, exactement la dérive que la réconciliation d'ACL a déjà dû corriger
côté Gestion Pro.

### 3.2 Rôles transverses, hérités du socle

| Rôle | Origine | Portée dans Drone |
|---|---|---|
| Administrateur plateforme ELSATIA | socle | Activer l'application pour une entreprise, jamais lire ses médias |
| Global Owner | train V2 | Accès de dernier ressort, journalisé |
| Support ELSATIA | lot support inter-applications | **Strict par défaut, limité à Drone, justifié, borné dans le temps, notifié, avec bandeau, audité** |

### 3.3 Prestataire télépilote externe

Cas fréquent : l'entreprise n'a pas de télépilote et sous-traite le vol.

Deux modèles, à arbitrer :

- **A — invité borné** : le prestataire reçoit `telepilote` sur une mission unique, avec date
  de fin. Simple, sans nouvelle entité. **Recommandé pour la V1.**
- **B — entreprise tierce** : le prestataire a sa propre entreprise ELSATIA et un partage
  inter-tenant. Puissant, mais ouvre le partage entre tenants — un chantier que le socle n'a
  pas et qui ne se bricole pas.

---

## 4. Types de missions

Une mission décrit un **objectif de captation**, pas un appareil. La colonne « drone requis »
est la plus importante du tableau : **quatorze des vingt-deux types n'en exigent aucun.**

| # | Mission | Objectif | Drone requis | Précision attendue | Livrable principal |
|---|---|---|---|---|---|
| 1 | Inspection de toiture | Localiser désordres et manques | Recommandé | Indicative à standard | Rapport photo annoté |
| 2 | Inspection de façade | Fissures, enduits, joints | Recommandé | Indicative à standard | Rapport annoté |
| 3 | Inspection de bardage | Fixations, déformations | Recommandé | Indicative | Rapport |
| 4 | Inspection de verrière | Zone inaccessible | **Oui** | Indicative | Rapport |
| 5 | Inspection photovoltaïque | Modules, salissures, ombrage | **Oui** | Indicative | Rapport + plan de calepinage `[?]` |
| 6 | Suivi de chantier | Avancement daté | Non | Aucune | Série datée |
| 7 | Comparaison avant/après | Preuve d'intervention | Non | Aucune | Rapport comparatif |
| 8 | Constat de dommage | Preuve opposable | Non | Indicative | Rapport horodaté, empreintes |
| 9 | Repérage de réserves | Alimenter Réserves | Non | Aucune | Propositions de réserves |
| 10 | Relevé extérieur | Géométrie du bâti | Recommandé | Standard, calage requis | Mesures tracées |
| 11 | Relevé intérieur | Pièces, hauteurs | **Non** | Standard | Mesures tracées |
| 12 | Métré de surface | Quantité pour devis | Selon zone | **Standard minimum** | Quantités proposées |
| 13 | Métré de longueur | Linéaires | Selon zone | Standard minimum | Quantités proposées |
| 14 | Zone inaccessible | Voir sans nacelle | **Oui** | Indicative | Rapport |
| 15 | Inventaire photographique | État des lieux | Non | Aucune | Album classé |
| 16 | Préparation de devis | Alimenter GP | Non | Standard si quantités | Proposition de quantités |
| 17 | Préparation de DOE | Alimenter le DOE | Non | Aucune | Sélection classée |
| 18 | Documentation d'intervention | Tracer un passage | Non | Aucune | Fiche |
| 19 | Photo de réception | Preuve de fin | Non | Aucune | Album + rapport |
| 20 | Photogrammétrie | Modèle exploitable | Recommandé | **Selon calibration** | Nuage / ortho / maillage |
| 21 | Relevé de terrain | Topographie sommaire | **Oui + RTK/GCP** | **Contrôlée obligatoire** | Modèle + note de limites |
| 22 | Visite technique sans vol | Contexte, accès | **Non** | Aucune | Fiche + photos |

### 4.1 Conséquences

1. **Les missions 6 à 9, 11, 15 à 19 et 22 fonctionnent avec un téléphone.** Elles constituent
   le socle d'usage réel et la meilleure porte d'entrée commerciale.
2. **La mission 21 est la seule qui exige un matériel de précision.** Elle doit être
   explicitement conditionnée : sans RTK ni points de calage, le produit doit **refuser** de
   produire une mesure contrôlée, pas produire une mesure douteuse.
3. **La mission 5 comporte un `[?]`** : le calepinage photovoltaïque suppose une détection de
   modules qui n'existe pas et qui relève de l'IA. À ne pas annoncer.
4. **Les missions 12, 13 et 16 sont celles qui touchent l'argent.** Elles portent le risque
   maximal et exigent la validation humaine la plus stricte.

---

## 5. Parcours nominal

```
1. Ouvrir un projet         → entreprise, chantier (lien GP facultatif), adresse
2. Préparer (facultatif)    → type, matériel, checklist, autorisations
3. Capter                   → drone, téléphone ou appareil photo — hors ELSATIA en V1
4. Importer                 → guidé ; sha256, EXIF, déduplication, contrôle qualité
5. Organiser                → par zone, par lot, par date
6. Inspecter et annoter     → calques ; original immuable
7. Mesurer                  → chaque grandeur porte son origine et sa qualité
8. Reconstruire (option)    → file idempotente ; peut échouer sans perte
9. Produire                 → rapport versionné, empreinte, destinataires figés
10. Proposer                → GP (quantités), Réserves (propositions), DOE (sélection)
```

Les étapes 2, 8 et 10 sont facultatives. **Le produit doit rester utile si l'on n'exécute que
1, 4, 6 et 9** — c'est le parcours de l'artisan qui photographie une toiture au téléphone et
veut un rapport propre le soir même.

---

## 6. Contenu destiné au site (à ne pas publier en l'état)

- **Nom de travail** : ELSATIA Scan (arbitrage en attente) ;
- **Statut** : **« À l'étude »** — pas « À venir », qui suggère une date ;
- **Présentation** : « Relevé, inspection et métré par l'image. Depuis un drone, un téléphone
  ou un appareil photo : importez vos photos, annotez, mesurez, produisez un rapport. » ;
- **Public** : couvreurs, façadiers, bardeurs, métreurs, conducteurs de travaux, maîtres
  d'œuvre ;
- **Limites à afficher** : « Ne pilote pas votre drone. Les mesures sont indicatives tant
  qu'elles ne sont pas calées sur le terrain. » ;
- **Aucune date, aucun tarif, aucune capture, aucun bouton d'accès, aucun nom de constructeur.**

Le site est un **dépôt distinct** (`elsatia-site`) : ce lot n'y touche pas.
