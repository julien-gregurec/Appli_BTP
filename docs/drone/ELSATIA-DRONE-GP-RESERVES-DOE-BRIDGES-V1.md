# ELSATIA Drone — Ponts Gestion Pro, Réserves et DOE V1

> 2026-09-08. Précise `packages/drone-core/src/ports/ecosystem.ts` et l'ouvre au DOE, qu'il
> ne couvre pas. **Aucun code, aucune migration.**

---

## 1. Les trois règles déjà inscrites dans le noyau

`ports/ecosystem.ts` fixe, en commentaire de code et dans les types :

1. **Aucune clé étrangère entre applications.** La liaison passe par `ExternalReference`.
2. **Le sens du flux est toujours Drone → application cible**, jamais l'inverse.
3. **Chaque cible reçoit un sous-ensemble strict, inscrit dans le type** : Gestion Pro ne
   reçoit pas le modèle 3D, Tools ne reçoit pas les médias bruts, **Réserves reçoit un
   brouillon, pas une réserve validée**.

Et la conséquence, écrite noir sur blanc : *« un déploiement Drone dont aucun de ces ports
n'est branché est un déploiement pleinement fonctionnel. »*

**Ces trois règles ne se rediscutent pas.** Ce document les applique et comble le manque.

---

## 2. Le manque : il n'existe aucun port DOE

Ports définis : `GestionProDronePort`, `ToolsDronePort`, `ReservesDronePort`. **Pas de
`DoeDronePort`.**

Ce n'est pas un oubli anodin. L'audit d'architecture DOE
(`docs/audits/ELSATIA-DOE-TECHNICAL-LIBRARY-ARCHITECTURE-AUDIT-REPORT.md`, verdict
`GO ARCHITECTURE — option C`) nomme explicitement Drone comme l'une des applications qui
**risquent de dupliquer le référentiel produit** si rien n'est cadré :

> « chaque nouvelle application (Réserves, Drone) ajoute sa propre colonne
> `marque`/`fabricant`/`reference`. »

**Avertissement de traçabilité : ce rapport d'audit DOE n'est suivi par aucune branche git.**
Il n'existe que dans le répertoire de travail du worktree principal. Un `git clean` le
détruirait. Le signaler fait partie de ce lot ; le committer n'en fait pas partie.

---

## 3. Pont Gestion Pro

### 3.1 Ce que GP peut fournir à Drone

| Donnée | Obligatoire ? | Forme |
|---|---|---|
| Entreprise | Non — le tenant vient du socle | — |
| Client | **Non** | `ExternalReference` nullable |
| Chantier | **Non** | `ExternalReference` nullable |
| Adresse, position | Non | Copie au moment de la liaison, **pas une lecture vivante** |
| Contacts | Non | Copie |
| Plans | Non | Référence de stockage |
| Devis associé | Non | `ExternalReference` |

**« Copie, pas lecture vivante » est le point qui compte.** L'audit du modèle client a établi
un P0 identique côté DOE : le bloc d'identification lit `clients` en direct, donc un document
réimprimé deux ans plus tard n'affiche pas le même maître d'ouvrage. Drone ne doit pas
reproduire ce défaut : **ce qui entre dans un rapport est figé au moment de la génération.**

### 3.2 Ce que Drone restitue à GP

Le port existant expose `publishProjectSummary` (`DroneProjectSummaryV1`) et
`publishSolarLayouts` (`DroneSolarExportV1`). Il manque le flux qui compte commercialement :
**les quantités proposées**. Recommandation : `publishMeasurementProposal`
(`DroneMeasurementExportV1`), avec ces garanties dans le type :

| Garantie | Règle |
|---|---|
| Statut | `proposition`, **jamais** `validee` |
| Provenance | Chaque quantité porte son `MeasurementOrigin` et son `MeasurementQualityLevel` |
| Seuil | Une quantité de niveau ≤ 3 est **refusée à l'émission**, pas signalée à la réception |
| Destination | Un **brouillon** de ligne, jamais une ligne de devis |
| Idempotence | `origine_client_id` — sinon une double publication double la quantité |
| Traçabilité | Retour de la référence GP dans l'`ExternalReference` du projet |

**Interdits :** modifier un devis existant · créer un devis · toucher un prix · déclencher une
facturation. Toute donnée commerciale reste validée dans Gestion Pro, par un humain de
Gestion Pro.

### 3.3 Le mode autonome n'est pas négociable

`gestion_pro_id` et toute référence équivalente restent **nullables**. Un artisan qui achète
Scan sans Gestion Pro doit disposer d'un produit entier. C'est aussi ce qui rend possible un
abonnement autonome — voir le document de modèle économique.

---

## 4. Pont Réserves

### 4.1 Ce qui existe

`ReservesDronePort` expose `publishReserveDrafts` et `publishReserveDraft`, avec le type
`ReserveDraftV1`. **Brouillon** est dans le nom du type : la décision est déjà prise et bien
prise.

Côté Réserves, les cibles réelles sont `reserves`, `reserves_photos`, `reserves_plans`,
`reserves_chantiers`, `reserves_historique`, `reserves_transitions`, et l'idempotence est
disponible via `origine_client_id` (migrations V1, V2 et **273**).

### 4.2 Contenu d'un brouillon

localisation (zone, repère sur plan si disponible, position WGS84 si connue) · **photo
originale** · photo annotée en pièce séparée · gravité proposée · type de désordre proposé ·
commentaire · auteur · date de constat · **lien vers la mission Drone** · `origine_client_id`.

### 4.3 Interdits

Créer une réserve validée · lever une réserve · changer un statut · clore un lot ·
notifier les intervenants à la place de Réserves.

### 4.4 Duplication des médias — arbitrage

| Option | Avantage | Inconvénient |
|---|---|---|
| **A — copier la photo dans Réserves** | Réserves autonome ; la photo survit à une purge Drone | Double stockage ; deux empreintes du même contenu |
| **B — référence probatoire** (identifiant + **sha256** + URL signée à la demande) | Un seul stockage ; une seule empreinte | Réserves dépend de Drone ; une purge Drone vide une réserve |

**Recommandation : B pour la consultation courante, A au moment où la réserve est levée.**

Justification : tant que la réserve vit, la référence suffit et évite le double stockage. Au
moment de la levée, la photo devient une **preuve de clôture** susceptible d'être opposée
des années plus tard, éventuellement dans un DOE : à cet instant, elle doit être copiée et
devenir indépendante de Drone. C'est exactement la logique de figement retenue pour le DOE.

Corollaire à inscrire dans la rétention : **un média Drone référencé par une réserve ouverte
ne peut pas être purgé.**

---

## 5. Pont DOE

### 5.1 Ce qui commande

L'audit DOE tranche : **le DOE est un module de Gestion Pro, pas une application**, et le
figement doit être **réel** — copie de chaque pièce dans `doe-archives`, SHA-256, ligne
`doe_pieces`, snapshots, empreinte globale sur la liste ordonnée
`(ordre, titre, empreinte_sha256)`, puis PDF consolidé et ZIP structuré.

Conséquence directe pour Drone : **le DOE ne référence pas un média Drone, il en prend copie.**
La question du §4.4 ne se pose donc pas ici — elle est déjà tranchée par le DOE lui-même.

### 5.2 `DoeDronePort` — proposition

| Opération | Contenu |
|---|---|
| `proposeDoeSelection` | Médias sélectionnés, classés par lot et par zone, avec titre, ordre, date de prise de vue et **sha256** |
| `proposeInspectionReport` | Rapport Drone versionné, avec son empreinte |
| `proposeAsBuiltEvidence` | Photos de réception et avant/après, comme preuves de réalisation |

Le mot `propose` est délibéré : le figement d'un DOE **exige une validation explicite** —
« un DOE est une déclaration de l'entreprise, pas un calcul ».

### 5.3 Deux règles de non-régression

1. **Un média supprimé de la mission Drone ne vide jamais un DOE figé.** La copie et
   l'empreinte protègent le DOE. C'est précisément la limite n°1 du DOE actuel (figement
   nominal : le manifeste ne stocke que des identifiants) que l'architecture cible corrige.
2. **L'empreinte du DOE couvre les snapshots, pas seulement les pièces.** L'audit relève que
   `serialiserDocumentStable` n'inclut pas le bloc destinataire côté contrats client. Drone
   ne doit pas alimenter un DOE en supposant le contraire.

### 5.4 Référentiel produit — ne pas ouvrir une quatrième duplication

L'audit DOE constate que le référentiel produit est **déjà dupliqué trois fois en texte
libre**. Si Drone ajoute ses colonnes `marque` / `fabricant` / `reference` pour décrire une
tuile ou un panneau identifié sur une photo, il en crée une quatrième.

**Règle : Drone ne crée aucun référentiel produit.** Il porte du texte libre marqué
« observé », et se branchera sur `bibliotheque_liens` le jour où la bibliothèque technique
existera. Le texte libre assumé est réversible ; une table concurrente ne l'est pas.

---

## 6. Pont Tools

`ToolsDronePort` existe (`publishRoofGeometry`, `publishMeasurements`), avec la règle
« jamais les médias bruts ». Deux réserves d'audit :

1. **La doctrine de provenance n'est unifiée par aucun code partagé.**
   `apps/tools/src/lib/tracing/measurement-origin.ts` n'est ni dans la base Drone, ni dans le
   train canonique V2, ni sur `main`. Les deux échelles sont cohérentes, leur unité n'est
   garantie par rien.
2. **Les unités diffèrent** : Tools en `mm | mm² | m² | °`, Drone en mètres et mètres carrés.
   **Une conversion existera au point de jonction, et c'est là que se logent les erreurs de
   facteur 1000.** Elle doit être écrite une fois, testée, et non recopiée.

Le jour où les deux applications alimentent le même métré, `packages/mesure-provenance`
devient exigible. Ce jour n'est pas arrivé ; la dette est nommée.

---

## 7. Tableau des interdits

| Interdit | Où il se joue |
|---|---|
| Clé étrangère SQL entre applications | Partout |
| Flux entrant vers Drone imposé par une autre application | Partout |
| Mise à jour automatique d'un devis | GP |
| Émission d'un devis | GP |
| Création d'une réserve validée | Réserves |
| Levée d'une réserve | Réserves |
| Figement automatique d'un DOE | DOE |
| Vidage rétroactif d'un DOE figé | DOE |
| Quatrième référentiel produit | DOE / bibliothèque |
| Lecture vivante d'un client dans un rapport | Partout |
| Rapprochement inter-tenant par empreinte | Stockage |
| Publication non idempotente | Tous les ponts |

---

## 8. Ordre de branchement

| Ordre | Pont | Condition |
|---|---|---|
| 0 | **Aucun** | Drone autonome, complet. **Le produit doit être vendable ici** |
| 1 | GP — résumé et lien | Socle multiproduit du Train V3 stabilisé |
| 2 | Réserves — brouillons | Réserves déployé pour le tenant |
| 3 | GP — quantités proposées | **Campagne métrologique effectuée** |
| 4 | DOE — sélection | Bibliothèque technique et DOE fermés |
| 5 | Tools — géométrie | Convergence de provenance traitée |

**Le rang 0 n'est pas une étape de transition : c'est l'état par défaut.** Un pont non branché
ne dégrade rien.
