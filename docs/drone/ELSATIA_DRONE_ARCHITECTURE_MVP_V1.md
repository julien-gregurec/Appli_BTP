# ELSATIA Drone — Architecture & MVP V1

> Livrable 1 (§125 du brief). Audit du dépôt réel + recherche web du 2026-09-07.
> **Aucun code, aucune migration, aucun déploiement, aucune modification Production** (§131).
>
> Livrables liés :
> [matrice SDK](ELSATIA_DRONE_SDK_COMPATIBILITY_V1.md) ·
> [options photogrammétriques](ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md) ·
> [modèle de données](ELSATIA_DRONE_DATA_MODEL_V1.md) ·
> [roadmap MVP](ELSATIA_DRONE_MVP_ROADMAP_V1.md)

---

## Résumé exécutif

Trois constats commandent tout le reste.

1. **Le socle multi-app ELSATIA est réutilisable tel quel.** `applications_elsatia` accepte
   n'importe quel code applicatif, les RPC d'autorisation sont génériques, et le catalogue
   de modules avec entitlements Stripe existe déjà. **Il ne faut créer aucune seconde
   architecture auth / tenant / rôles / facturation** (§4 du brief : instruit et tranché).

2. **Le pilotage DJI est un cul-de-sac pour la cible commerciale.** MSDK V5 est Android
   uniquement, la gamme Mini n'accepte que les radiocommandes sans écran, et le Mini 3 Pro
   n'a pas de missions waypoint. Un client avec un Mini 3 et une DJI RC à écran est
   matériellement inaccessible. **L'import après vol n'est pas un fallback : c'est le mode
   nominal.** Détail et preuves dans le livrable 2.

3. **L'infrastructure de traitement asynchrone n'existe pas dans le dépôt.** Il n'y a
   aujourd'hui aucune file de jobs, aucun worker, aucun GPU — seulement deux crons Vercel.
   C'est la brique la plus lourde à construire, et elle est entièrement nouvelle.

**Architecture recommandée :** une application `apps/drone` branchée sur le socle existant,
un pipeline d'ingestion → reconstruction asynchrone sur GPU européen derrière une
abstraction moteur, un modèle 3D et une orthophoto exploités par une couche métier toiture,
et un `DroneAdapter` développé **en parallèle et hors chemin critique**.

---

## A. État du dépôt (audit réel, 2026-09-07)

### A.1 Structure

| Élément | Constat |
|---|---|
| Nature | **Pas un monorepo au sens outillé.** La racine *est* Gestion Pro (`package.json` : `"name": "elsatia-gestion-pro"`). Pas de workspaces npm, pas de Turborepo/Nx |
| Applications | racine = Gestion Pro · `apps/tools` · `apps/colors`, chacune avec son propre `package-lock.json` et son `node_modules` |
| Package partagé | **un seul** : `packages/application-access` (deux fichiers), consommé via `transpilePackages` |
| Framework | Next.js 16.2.12, React 19.2.4, TypeScript 5 |
| Base | Supabase, projet `btp-platform`, PostgreSQL **17** |
| Migrations | **263** fichiers SQL · **54** fichiers de tests pgTAP |
| Hébergement | Vercel, `"regions": ["fra1"]` — **Paris, donc UE** ✅ §48 |
| Observabilité | Sentry (`@sentry/nextjs` 10.x) |
| CI | `.github/workflows/ci.yml` : `npm ci`, `npm run audit:security`, `npm run verify` (clean + typecheck + lint + test + vérif migrations/secrets/prix Stripe + build) |
| Asynchrone | **Deux crons Vercel** (`/api/cron/abonnements`, `/api/cron/notifications-push`). Aucune file, aucun worker, aucun `pg_cron`, aucun `pgmq` |

### A.2 Socle multi-app — réutilisable, et déjà générique

`supabase/migrations/20260826000234_elsatia_multi_app_convergence_v1.sql` définit :

- `applications_elsatia` — clé `code text` contrainte par `check(code ~ '^[a-z][a-z0-9_]{1,49}$')`.
  **Ajouter `drone` est une insertion de ligne, pas une évolution de schéma.**
- `roles_applications_elsatia`, `acces_applications_entreprises`,
  `habilitations_applications_utilisateurs`, `historique_acces_applications`.
- `a_acces_application(uuid, text)` et `applications_autorisees(uuid)`, `security definer`.

Côté TypeScript, `packages/application-access/src/index.ts` type déjà
`CodeApplicationElsatia = string` validé par regex — **union ouverte, aucun typage à modifier**.

Le contrat d'intégration d'une application tierce est déjà écrit et éprouvé :
`docs/architecture/ELSATIA_COLORS_CANONICAL_INTEGRATION_V1.md`. Drone le suit sans le rouvrir.

Le catalogue commercial existe également : `modules_gestion_pro` (statuts `actif` /
`bientot` / `interne` / `non_vendable`, `mode_activation` entreprise/plan/consommation) et
la chaîne d'entitlements Stripe (migrations 262 à 265). **Le `mode_activation = 'consommation'`
existe déjà** — c'est précisément la porte d'entrée du modèle à crédits du §89.

### A.3 Capacitor — le précédent mobile

`apps/tools` embarque Capacitor 8.5 (`fr.elsatia.tools`), dossiers `android/` et `ios/`,
build natif par `next build --webpack` + `output: "export"` puis `cap sync`.
Un chemin mobile éprouvé existe donc dans la maison. Sa limite pour Drone est traitée en §D.

### A.4 Moteur géométrique de Tools — réutilisable en partie seulement

`apps/tools/src/lib/geometry/` contient un moteur **2D** mature (primitives, transformations,
hit-test, snap, modèles de plan et de tracé), exposé aux modules métier par un adaptateur
unique `tracing/geometry-port.ts` — discipline explicitement documentée pour éviter la
duplication de moteur.

`apps/tools/src/lib/exports/` fournit déjà DXF, SVG, PNG, PDF. `apps/tools/src/lib/tracing/
measurement-origin.ts` implémente déjà la traçabilité d'origine des mesures.

**Ce qui est réutilisable :** la doctrine de provenance, la discipline du port unique, les
exportateurs.
**Ce qui ne l'est pas :** les primitives elles-mêmes. Elles sont `Point2D` / `Transform2D`,
et la toiture est un problème 3D. Tordre ce moteur en 3D dégraderait Tools sans servir Drone.

### A.5 Contraintes de dépôt en vigueur

| Contrainte | Source | Effet sur Drone |
|---|---|---|
| **Ledger figé à 263 migrations** jusqu'au cutover Production | `docs/organisation/ELSATIA_POST_CUTOVER_ROADMAP_V1.md` | Aucune migration Drone avant cutover, **y compris la ligne d'enregistrement de l'application** |
| Refonte visuelle **ELSATIA-UI-V2 obligatoire avant commercialisation** | mémoire projet, non démarrée | Drone hérite de la cible UI-V2, pas de l'UI actuelle. Ne pas produire d'écrans avant |
| Marque ELSATIA — commercialisation phasée, jalon 21-10-2026 | mémoire projet | Contraint la date d'annonce, pas le développement |
| Builds mobiles sur volume externe `/Volumes/ELSATIA-DEV` | mémoire projet | S'applique intégralement à un futur `apps/drone` natif |
| `apps/tools` : `npm run dev` Turbopack casse sur l'alias `@elsatia/application-access` | mémoire projet | Prévoir `--webpack` en dev pour toute nouvelle app consommant ce package |

### A.6 Limites d'infrastructure relevées

| Point | État actuel | Écart pour Drone |
|---|---|---|
| Taille de fichier stockage | `file_size_limit = "50MiB"` dans `supabase/config.toml` | Insuffisant. Supabase supporte TUS **jusqu'à 50 Go** (Pro) — à activer |
| Traitement long | Fonctions Vercel, bornées en durée | **Impossible** d'y faire une reconstruction. Worker externe obligatoire |
| GPU | Aucun | À provisionner (Scaleway / OVHcloud, France) |
| File de jobs | Aucune | À construire |

---

## B. Architecture recommandée

### B.1 Principes

1. **Un seul socle d'identité.** Drone consomme `a_acces_application(entreprise_id, 'drone')`.
   Aucune notion d'auth, de tenant, de rôle ou de facturation n'est recréée.
2. **La valeur est en aval de l'acquisition.** Le produit se construit de l'import vers le
   rapport, jamais du pilotage vers l'import (§112).
3. **Le moteur photogrammétrique est un fournisseur remplaçable**, derrière une abstraction.
4. **Le drone est un fournisseur remplaçable**, derrière le `DroneAdapter`.
5. **Rien ne quitte l'UE**, et rien n'entraîne un modèle tiers (§48, §49).
6. **Aucune valeur affichée sans provenance.** Corollaire dur : une incertitude inconnue
   s'affiche comme inconnue, jamais comme un chiffre plausible (§25).

### B.2 Découpage applicatif

```
elsatia-main/
├── src/                      Gestion Pro (racine, inchangé)
├── apps/tools/               inchangé
├── apps/colors/              inchangé
├── apps/drone/               ← NOUVEAU — Next.js web + Capacitor
├── packages/
│   ├── application-access/   inchangé, consommé
│   └── drone-contracts/      ← NOUVEAU — contrats d'export versionnés (§121)
└── services/
    └── drone-worker/         ← NOUVEAU — hors Vercel, sur GPU
```

`apps/drone` suit le schéma de `apps/tools` : `package-lock.json` propre,
`transpilePackages: ["@elsatia/application-access"]`, build webpack.

`services/drone-worker` **ne peut pas** vivre sur Vercel. C'est un service conteneurisé
sur GPU européen. C'est la seule rupture d'infrastructure du projet, et elle est inévitable.

### B.3 Décision : application séparée, pas module Gestion Pro

Le brief l'impose (§3, §43) et l'audit le confirme : `acces_applications_entreprises` porte
le droit **par entreprise et par application**, avec fenêtre de validité. Drone se vend
seul sans aucune adhérence. Un module Gestion Pro aurait au contraire lié le droit au
forfait Gestion Pro.

---

## C. Schéma des composants

```
   ┌──────────── ACQUISITION ────────────┐
   │                                      │
   │  Android + RC-N1        Carte SD /   │
   │  ↕ DroneBridge          dossier /    │
   │  ↕ MSDK V5              téléphone    │
   │  (Android seul)                      │
   └───────────┬──────────────┬───────────┘
               │              │
               ▼              ▼
        ┌──────────────────────────────┐
        │  apps/drone  (web + mobile)  │
        │  import · EXIF · contrôle    │
        │  qualité local · upload TUS  │
        └──────────────┬───────────────┘
                       │  URL signée
                       ▼
        ┌──────────────────────────────┐
        │ Supabase Storage (UE, privé) │
        │ drone-medias / -resultats    │
        │ -exports / -partage          │
        └──────────────┬───────────────┘
                       │
        ┌──────────────▼───────────────┐
        │  API Next.js (Vercel fra1)   │
        │  crée le job · jamais ne     │
        │  traite · aucun secret       │
        │  moteur exposé au client     │
        └──────────────┬───────────────┘
                       │  file de jobs
                       ▼
        ┌──────────────────────────────┐
        │ services/drone-worker  (GPU  │
        │ Scaleway / OVH, France)      │
        │  ┌────────────────────────┐  │
        │  │ MoteurReconstruction   │  │
        │  │  ├ AdaptateurODM       │  │
        │  │  └ AdaptateurMetashape │  │
        │  └────────────────────────┘  │
        └──────────────┬───────────────┘
                       │ nuage · maillage · ortho · MNS · GLB
                       ▼
        ┌──────────────────────────────┐
        │  Roof Intelligence           │
        │  pans · arêtes · obstacles   │
        │  → PROPOSITION, à valider    │
        └──────────────┬───────────────┘
                       ▼
        ┌──────────────────────────────┐
        │  Métrologie & métrés         │
        │  provenance + qualité portées│
        │  jusqu'au PDF                │
        └──────┬───────────────┬───────┘
               ▼               ▼
        Solar Designer   Inspection
               │               │
               └───────┬───────┘
                       ▼
              Rapport · Exports
                       │
                       ▼
        packages/drone-contracts (§121)
         → Gestion Pro · Tools · Réserves
```

---

## D. DroneAdapter

### D.1 Interface conceptuelle

```
DroneAdapter
  connecter() / deconnecter()
  infosAppareil()        → modèle, série, firmware, radiocommande
  telemetrie()           → flux d'événements
  batterie()
  etatCamera() / etatGimbal()
  fluxVideo()            → DESCRIPTEUR de surface, jamais des trames (voir D.3)
  capturerPhoto()
  demarrerMission() / pauser() / reprendre() / arreter()
  telechargerMedias()    → progression
  capacites()            → ce que CET adaptateur sait faire
```

`capacites()` est la méthode structurante. Sans elle, l'interface ment : elle promet
`demarrerMission()` sur un Mini 3 qui ne sait pas l'exécuter. L'UI se construit sur les
capacités déclarées, jamais sur l'existence d'une méthode.

### D.2 Implémentations prévues

| Adaptateur | Statut | Portée |
|---|---|---|
| `AdaptateurImport` | **MVP** | Pas de drone. Carte SD, dossier, téléphone. Couvre 100 % du marché |
| `AdaptateurDemo` | **MVP** | Données synthétiques marquées **DEMO** en permanence. §103, §104 |
| `AdaptateurDJI` | Phase 2 | Android seul, sous réserve du test matériel du livrable 2 §5 |
| `AdaptateurParrot` | Phase 3 | SDK ouvert, missions photogrammétriques natives, souveraineté |

`AdaptateurDemo` n'est pas un artefact de développement : sans lui, un examinateur Apple ou
Google ne peut pas tester l'application, et la soumission est rejetée. Il est au MVP pour
une raison commerciale.

### D.3 DroneBridge — plugin Capacitor natif

Faisable : Capacitor permet d'écrire du code natif Android local à l'application, et un
plugin Capacitor pour MSDK V5 existe déjà en communauté (`Paciolan/mSDK-v5-capacitor-plugin`),
ce qui prouve le montage sans nous engager sur ce code.

**Contrainte de performance dictée par §100 :** la vidéo live ne traverse pas le pont JS.
DJI rend le flux sur une `SurfaceView` Android native. L'architecture correcte est donc :

- **Natif** : rendu vidéo sur une surface, superposée à la WebView.
- **Pont JS** : uniquement les événements légers — `telemetry`, `battery`,
  `connectionState`, `cameraState`, `mediaCreated`, `missionState`.

Faire transiter les trames par le pont saturerait le pont et viderait la batterie.

**Conséquence de portée qu'il faut assumer explicitement : `DroneBridge` est un module
Android. Sur iOS, il n'y a pas de MSDK V5, donc pas de mode connecté, aujourd'hui ni à
architecture inchangée.**

---

## E. Pipeline média

```
capture/import
  → validation MIME et taille (§96)
  → extraction EXIF, CONSERVÉE INTÉGRALEMENT (§76)
  → contrôle qualité local : flou, exposition, doublons, GPS manquant (§75, §73)
  → checksum + déduplication (§74)
  → upload TUS reprenable vers URL signée (§74)
  → « Préparer la reconstruction » : sélection assistée, révisable (§78)
  → jeu de médias figé → clé d'idempotence → job (§95)
```

Deux règles non négociables :

- **Les EXIF ne sont jamais supprimés à l'import.** Ils portent la focale, l'orientation et
  la position, c'est-à-dire l'entrée du calcul (§76).
- **Toute frame extraite d'une vidéo est marquée `source_degradee`**, et ce marquage se
  propage jusqu'à la mesure et jusqu'au PDF (§77).

Le contrôle qualité **local, avant upload** (§73) est un choix de coût autant que d'UX :
il évite de facturer de la bande passante et du GPU pour des images inexploitables.

---

## F. Photogrammétrie

Traité intégralement dans le [livrable 3](ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md).

**Retenu : OpenDroneMap / NodeODM auto-hébergé sur GPU français, derrière
`MoteurReconstruction`. Plan B prêt : Agisoft Metashape sous Service Provider License
(plancher vérifié 155,90 $/mois).**

**Arbitrage bloquant avant commercialisation, pas avant développement :** ODM est sous
**AGPL-3.0**. La clause réseau doit être qualifiée par un conseil en propriété
intellectuelle. Ne modifier ODM sous aucun prétexte entre-temps.

---

## G. Stockage

Quatre buckets privés, chemin `<entreprise_id>/<projet_id>/…`, policies `storage.objects`
validant l'UUID du premier segment — schéma déjà éprouvé sur `colors-seaux`.
Détail dans le [livrable 4 §8](ELSATIA_DRONE_DATA_MODEL_V1.md).

Prérequis technique : **relever `file_size_limit` (aujourd'hui 50 MiB) et adopter TUS**,
qui porte à 50 Go avec URL d'upload signée valable 24 h.

Rétention, quotas, archivage et purge (§91) sont conçus dès le départ : le stockage est le
poste de coût qui court sans bruit, et un projet drone pèse des Go.

---

## H. Reconstruction

- **Asynchrone obligatoire** (§94). Aucune requête HTTP ne porte une reconstruction.
- File → worker → retries bornés → **dead-letter** au lieu d'une boucle infinie.
- **Idempotence** (§95) par clé unique `(projet, jeu de médias, moteur, version, paramètres)`.
- **Versionnement** (§60) : chaque résultat porte moteur, version, paramètres, jeu d'entrée
  et métriques de qualité. On n'écrase jamais une reconstruction.
- **Observabilité** (§93) : durée, pic mémoire, tailles d'entrée et de sortie, coût estimé.
  Sans ces chiffres, le pricing du §89 est indéfendable.

Choix de file à trancher (§U). Le plus léger et cohérent avec le dépôt : une table de jobs
PostgreSQL avec `select … for update skip locked` — pas de nouveau fournisseur, transactionnel
avec les données métier, observable en SQL. Alternative si la charge l'exige : `pgmq`.

---

## I. Modèle 3D

- **Serveur** : maillage haute qualité conservé, plus le nuage de points.
- **Client** : **GLB/glTF allégé** (§72). Format retenu pour le MVP : c'est le seul largement
  supporté par les moteurs web et mobiles.
- Viewer : rotation, zoom, pan, sélection, mesure (§19).
- **Deux vues liées** (§62) : 3D et plan/ortho, avec sélection synchronisée dans les deux sens.
- **Snap** (§64) : sommet, arête, plan, intersection — condition de la reproductibilité d'une
  mesure. Une mesure non reproductible n'est pas une mesure.
- Viewer de nuage de points : **hors MVP** (§71), performances mobiles à évaluer.

---

## J. Roof Intelligence

Objectif : transformer un maillage en géométrie toiture exploitable — pans, faîtages,
égouts, rives, noues, arêtiers, acrotères, cheminées, fenêtres de toit, obstacles (§21).

**Doctrine imposée par §22, et qui doit être visible dans l'UI, pas seulement dans le code :
ELSATIA propose, l'utilisateur valide ou corrige.** Chaque entité porte `origine`
(`detecte` / `corrige` / `saisi`) et `valide_par`. Une géométrie non validée ne produit
jamais un métré présenté comme fiable.

**Séquence de construction recommandée, et c'est un point d'architecture, pas de confort :**
livrer d'abord la **saisie manuelle assistée** (l'utilisateur trace ses pans sur
l'orthophoto, avec snap), et seulement ensuite la détection automatique. Un outil manuel
correct est utilisable dès le premier jour ; une détection automatique médiocre est
inutilisable et détruit la confiance dans tout le reste du produit.

---

## K. Métrés

- Par pan : surface, pente, orientation, azimut, largeur, longueur de rampant (§23).
- Global : surface totale, faîtage, rives, égouts, noues, arêtiers, gouttières, acrotères.
- Mesure manuelle toujours disponible : distance, polyligne, surface, angle, pente, hauteur,
  dénivelé (§63).
- **Trois natures distinctes et affichées** : `MESURÉ`, `CALCULÉ`, `ESTIMÉ` (§37).
- Pente en **% et en degrés**, sans arrondi excessif (§67).
- **Ne jamais mélanger** altitude GPS, hauteur relative drone, hauteur projet et référentiel
  local (§68) — quatre colonnes distinctes, jamais une seule.

**Qualité et incertitude (§24, §25).** Les quatre niveaux — indicatif, standard, haute
précision, contrôlé RTK/GCP — sont dérivés de critères réels : type de GNSS, présence de
RTK/GCP, nombre de photos, recouvrement, GSD, erreur de reprojection, calibration, contrôle
terrain. **Les seuils de ces niveaux n'existent pas encore** : ils sont la sortie de la
campagne de validation métrologique du §107, et pas une décision de bureau.

Jusqu'à cette campagne, `incertitude` reste **nulle et affichée comme inconnue**. C'est
l'application littérale du « Ne jamais inventer X » du §25.

---

## L. Solar Designer

Pan → panneau → implantation. Bibliothèque panneaux extensible et **non pré-remplie** (§38).
Portrait/paysage, espacements, marges rive/faîtage/égout, zones interdites, obstacles avec
marge (§28, §29). Plusieurs variantes comparables par projet (§30) : nombre de panneaux,
puissance, surface utilisée, orientation.

**Les retraits réglementaires ne sont pas codés en dur** (§28) : ils sont des paramètres
documentés, par défaut vides, saisis par l'utilisateur sous sa responsabilité.

**L'ombrage est hors MVP** (§31). Un moteur solaire approximatif produirait des chiffres
crédibles et faux — le pire résultat possible pour un outil de métré.

---

## M. Inspection

Anomalie posée sur photo, orthophoto ou modèle (§32) : identifiant, position, photo,
description, catégorie, priorité, date, auteur, statut (§33).
Rapport d'inspection dédié (§85).
Liaison **facultative** vers Réserves (§34) : `DroneFinding → ReserveDraft`, la validation
et le workflow restant intégralement dans Réserves (§118).

**Thermographie hors MVP** (§35), et lorsqu'elle arrivera : jamais présentée comme un
diagnostic certifié.

---

## N. Intégrations écosystème

Contrats **versionnés** dans `packages/drone-contracts` (§121) :
`DroneProjectSummaryV1`, `DroneMeasurementExportV1`, `DroneInspectionExportV1`,
`DroneRoofExportV1`, `DroneSolarExportV1`.

| Cible | Reçoit | Ne reçoit pas |
|---|---|---|
| Gestion Pro (§119) | lien relevé, surfaces, métrés, PDF, données PV, anomalies résumées | **le modèle 3D** |
| Tools (§120) | contours, plans, DXF, mesures, surfaces, profil de coupe | les médias bruts |
| Réserves (§118) | brouillon de réserve : chantier, photo, position, commentaire, catégorie, date | la validation, qui reste chez Réserves |

Aucune clé étrangère entre applications. Liaison par référence faible
(`source_app`, `reference_externe`, `statut_synchro`, `synchronise_le`).
**Test d'acceptation du mode standalone (§43) : une base Drone dont toutes ces colonnes
sont nulles doit fonctionner à 100 %.**

---

## O. Sécurité, confidentialité et conformité

### O.1 Sécurité technique (§96, §97)

Buckets privés, URLs signées, RLS par entreprise, validation MIME et taille, secrets du
moteur photogrammétrique **jamais exposés au client** — le client mobile parle à l'API
Next.js, qui seule parle au worker (§97).

### O.2 Confidentialité (§47)

Minimisation, isolation locataire, rétention configurable par projet, suppression du projet
et des médias avec propagation au stockage et aux jobs (§92), journalisation des accès
sensibles, chiffrement en transit et au repos.

**Floutage** : manuel au MVP ; automatique visages et plaques en phase ultérieure, et
**jamais présenté comme parfait** (§47).

### O.3 Localisation des données (§48)

| Composant | Région | Statut |
|---|---|---|
| Vercel | `fra1` (Paris) | ✅ déjà conforme |
| Supabase | projet `btp-platform` | ⚠️ région à **confirmer** avant engagement |
| GPU worker | Scaleway ou OVHcloud, France | ✅ par construction |
| Moteur photogrammétrique | auto-hébergé | ✅ aucune sortie |

**Avec l'option A ou B du livrable 3, aucune donnée client ne quitte l'UE.** C'est un
argument commercial, pas seulement une conformité.

### O.4 Droits sur les médias (§49)

`project_media_owner`, `processing_consent`, `third_party_processing`, `retention_policy`
portés au modèle. Un moteur auto-hébergé rend l'engagement de non-réutilisation trivial à
tenir et à écrire dans les CGU.

### O.5 Réglementation drone (§50, §51, §52)

**Position V1 : afficher, ne pas décider.** Aucun moteur juridique autonome (§50).

Le module `MissionCompliance` est une **coquille architecturale** qui saura consommer
plus tard une source officielle. En France, la source publique est la carte des restrictions
UAS de la DGAC/SIA, diffusée via Géoportail — **désormais migrée vers `cartes.gouv.fr`** —
avec des couches WMS/WFS et des exports GeoJSON. Cette source porte elle-même des limites
documentées (activités déclarées non représentées, hélistations privées absentes, zones
temporaires non couvertes), **qui doivent être affichées à l'utilisateur en même temps que
la carte**. Afficher une carte officielle incomplète sans dire qu'elle est incomplète serait
pire que ne rien afficher.

**Évolution réglementaire à confirmer auprès d'une source officielle avant tout usage
commercial :** plusieurs sources professionnelles convergentes indiquent que depuis le
1er janvier 2026, les drones de classe **C0 (< 250 g)** et **C1** peuvent voler en
agglomération en catégorie Ouverte A1 en France (arrêté « Espace » du 23 décembre 2025).
Si cela se confirme, **le Mini 3 (< 249 g) devient utilisable en agglomération**, ce qui
change matériellement le marché adressable du produit. Ce point mérite une vérification
DGAC formelle : c'est un argument commercial, donc un risque juridique s'il est faux.

**Responsabilité (§51)** : avant toute mission assistée, un écran non contournable rappelle
que le télépilote reste responsable de l'autorisation, de la sécurité, de l'environnement,
de la réglementation et du contrôle de l'aéronef.

**Geofencing (§52)** : aucun contournement des limitations constructeur ou firmware, jamais,
sous aucune option.

---

## P. Offline terrain (§44)

Mission préparée avant déplacement, capture et import sans réseau, contrôle qualité local,
file d'upload persistante, synchronisation au retour de connexion. **Le traitement lourd
attend la connexion** — c'est explicitement acceptable.

Précédent réutilisable : `apps/tools` a déjà une page `offline`, un manifeste PWA et
`@capacitor/filesystem` / `@capacitor/preferences`.

---

## Q. Coûts

Méthode et ancrages tarifaires réels dans le [livrable 3 §5](ELSATIA_DRONE_PHOTOGRAMMETRY_OPTIONS_V1.md).

Ancrages vérifiés au 2026-09-07 : Scaleway L4 à partir de **0,90 $/h**, OVHcloud A100
**1,52–1,85 €/h** (Paris, Strasbourg, Gravelines). Metashape Service Provider :
**155,90 $/mois** de plancher en pay-per-use.

**Ce qui manque et ne s'obtient que par mesure :** la durée GPU réelle par taille de
chantier. Campagne de benchmark à trois jeux d'images (petite toiture, maison, grand
bâtiment) exigée **avant** toute grille de crédits.

Modèles d'abonnement à auditer (§88) : par utilisateur · abonnement + crédits de
reconstruction · abonnement + stockage · abonnement + projets · combinaison.
**Le plus cohérent avec la structure de coût est abonnement + crédits** (§89) — et le socle
le supporte déjà : `modules_gestion_pro.mode_activation` accepte `'consommation'`.

**Garde-fou §90 :** aucune offre gratuite ne doit permettre de déclencher une charge GPU
non bornée. Gratuit = visualisation, projet d'exemple, import limité. Le traitement se
paie ou se crédite.

---

## R. MVP

Le MVP proposé en §109 est **retenu tel quel** : l'audit le confirme au lieu de le corriger.
La seule modification est un ajout, pas un retrait — l'`AdaptateurDemo`, exigé par la revue
des stores (§104).

1. Compte ELSATIA (socle existant) · 2. Projet standalone · 3. Import de photos ·
4. EXIF · 5. Contrôle qualité médias · 6. Upload reprenable · 7. Reconstruction cloud ·
8. Viewer 3D · 9. Orthophoto · 10. Mesures manuelles · 11. Pans (saisie assistée, puis
correction) · 12. Surfaces et pentes · 13. Rapport PDF · 14. Solar Designer simple ·
15. Export · **16. Adaptateur démo**.

**Hors MVP, et c'est le point le plus important : le contrôle du drone.** Justification
factuelle complète dans le livrable 2.

---

## S. Phases

| Phase | Contenu | Condition d'entrée |
|---|---|---|
| **1 — MVP** | Import → reconstruction → modèle → mesures → toiture → PDF → solaire simple | Aucune. Démarrable |
| **2 — Connecté** | `AdaptateurDJI`, télémétrie live, caméra, transfert média, contrôle de couverture, mission assistée si et seulement si le SDK le permet | **Test matériel Mini 3 + RC-N1 concluant** |
| **3 — Avancé** | Inspection avancée, IA visuelle, thermique, RTK/PPK, GCP avancés, ombrage, façades, autres constructeurs, comparaison temporelle | MVP validé métrologiquement (§107) |

**Aucune phase ne bloque la précédente.** La phase 2 peut être développée en parallèle du
MVP, à condition de ne jamais devenir chemin critique (§112).

---

## T. Risques

| # | Risque | Impact | Traitement |
|---|---|---|---|
| 1 | **Dépendance DJI** — App Key révocable unilatéralement, tensions géopolitiques | Faible sur le MVP, **fort** sur la phase 2 | `DroneAdapter` + MVP sans drone. Si DJI ferme, le produit vit |
| 2 | **AGPL d'ODM** en contexte SaaS | Bloquant commercial | Conseil PI avant facturation. Plan B Metashape prêt |
| 3 | **Coût GPU non maîtrisé** | Marge négative invisible pendant des mois | Benchmark obligatoire avant pricing. Crédits, pas illimité. Observabilité §93 dès le premier job |
| 4 | **Sur-promesse métrologique** | **Juridique et réputationnel** | Interdiction de tout claim de précision avant campagne §107. §108 |
| 5 | **Détection automatique décevante** | Perte de confiance sur tout le produit | Manuel assisté d'abord, automatique ensuite (§J) |
| 6 | **Rejet Apple/Google** faute de test possible sans drone | Blocage de distribution | `AdaptateurDemo` au MVP, marqué DEMO en permanence |
| 7 | **Ledger figé à 263** | Retarde l'enregistrement de l'application | Développement en local ; migration en lot post-cutover |
| 8 | **UI-V2 non démarrée** | Refonte des écrans Drone si construits trop tôt | Ne pas produire d'écrans définitifs avant la cible UI-V2 |
| 9 | **Nouvelle infrastructure worker + GPU** — aucun précédent dans le dépôt | Poste le plus lourd et le plus incertain | Le sortir en lot autonome, avec un jalon « un job traverse la file » très tôt |
| 10 | **Volume de stockage** | Coût silencieux et croissant | Quotas, rétention et purge conçus dès le modèle, pas ajoutés après |
| 11 | **Réglementation mal citée** | Juridique | Aucune affirmation réglementaire sans source officielle DGAC |
| 12 | **Dispersion des moteurs géométriques** | Dette structurelle | Un port unique par moteur, comme `tracing/geometry-port.ts` dans Tools |

---

## U. Décisions à prendre

Aucune n'est prise dans ce document. Toutes appartiennent à Julien.

| # | Décision | Qui / quoi tranche | Échéance |
|---|---|---|---|
| 1 | Moteur photogrammétrique : ODM ou Metashape | **Conseil PI sur l'AGPL** | Avant commercialisation, pas avant dev |
| 2 | Hébergement du worker GPU : Scaleway ou OVHcloud | Benchmark + coût réel | Avant le lot worker |
| 3 | File de jobs : table PostgreSQL `skip locked` ou `pgmq` | Volumétrie attendue | Avant le lot worker |
| 4 | **Périmètre iOS assumé** : import + visualisation + mesure, sans mode connecté | Produit — c'est une contrainte SDK, pas un choix technique | Avant tout support commercial |
| 5 | Matériel de référence : Mini 3 du propriétaire, ou drone professionnel | Marché visé : artisan ou bureau d'études | Avant la phase 2 |
| 6 | Modèle tarifaire (§88) | Après le benchmark GPU | Avant toute grille publique |
| 7 | Budget de la campagne de validation métrologique (§107) | Julien | **Avant tout claim de précision** |
| 8 | Nom : conserver « ELSATIA Drone » ou basculer « ELSATIA Scan » | §2 : conserver Drone en V1 | Réexaminer en phase 3 |
| 9 | Rang du lot Drone face à UI-V2 et au cutover | Julien | Avant tout code |
| 10 | Région du projet Supabase à confirmer | Vérification | Avant engagement §48 |

---

## §130 — Parallélisation en quatre conversations

Découpage conçu pour qu'aucune conversation ne touche les fichiers d'une autre, et pour
qu'aucun moteur ne soit écrit deux fois. **Aucune de ces conversations ne doit démarrer
avant l'arbitrage §U-9.**

### C1 — `ELSATIA-DRONE-SOCLE-APP`

- **Périmètre** : squelette `apps/drone` (Next.js + Capacitor), branchement sur
  `@elsatia/application-access`, écrans coquilles Projets / Import, navigation, i18n,
  offline PWA. Aucun métier, aucune 3D.
- **Dépendances** : aucune. Démarre en premier.
- **Fichiers autorisés** : `apps/drone/**`, `docs/drone/socle.md`.
- **Fichiers interdits** : `src/**`, `apps/tools/**`, `apps/colors/**`, `packages/**`,
  `supabase/**`, `services/**`.
- **Ordre de fusion** : **1er**.

### C2 — `ELSATIA-DRONE-INGESTION-STOCKAGE`

- **Périmètre** : contrat de modèle de données (TypeScript uniquement, **aucune migration**),
  import, lecture EXIF, contrôle qualité média, checksum et déduplication, upload TUS
  reprenable, buckets et conventions de chemin.
- **Dépendances** : C1 pour le squelette. Peut écrire ses modules purs avant.
- **Fichiers autorisés** : `apps/drone/src/lib/ingestion/**`,
  `apps/drone/src/lib/medias/**`, `packages/drone-contracts/**`, `docs/drone/ingestion.md`.
- **Fichiers interdits** : `supabase/migrations/**` (**ledger figé à 263**),
  `services/drone-worker/**`, tout autre app.
- **Ordre de fusion** : **2e**.

### C3 — `ELSATIA-DRONE-WORKER-RECONSTRUCTION`

- **Périmètre** : `services/drone-worker`, abstraction `MoteurReconstruction`,
  `AdaptateurODM`, file de jobs, retries, dead-letter, idempotence, observabilité et
  coût par job, **campagne de benchmark GPU** (livrable 3 §5).
- **Dépendances** : conventions de stockage de C2. Le service lui-même est indépendant.
- **Fichiers autorisés** : `services/drone-worker/**`, `docs/drone/worker.md`,
  `docs/drone/benchmark-gpu.md`.
- **Fichiers interdits** : `apps/**`, `src/**`, `supabase/**`.
- **Ordre de fusion** : **3e**. C'est le lot le plus risqué : jalon « un job traverse la
  file de bout en bout » à poser le plus tôt possible.

### C4 — `ELSATIA-DRONE-GEOMETRIE-METRES`

- **Périmètre** : viewer 3D + vue plan liée, snap, mesures manuelles, provenance et qualité,
  saisie assistée des pans, surfaces et pentes, Solar Designer simple, exports.
- **Dépendances** : consomme les sorties de C3 via des **fixtures figées** — ne l'attend pas.
- **Fichiers autorisés** : `apps/drone/src/lib/geometrie3d/**`,
  `apps/drone/src/lib/mesures/**`, `apps/drone/src/lib/solaire/**`,
  `apps/drone/src/components/viewer/**`, `docs/drone/geometrie.md`.
- **Fichiers interdits** : `apps/tools/**` (**ne jamais modifier le moteur 2D de Tools**),
  `services/**`, `supabase/**`.
- **Ordre de fusion** : **4e**.

**Règles communes aux quatre :**

- `supabase/migrations/**` est **gelé** pour tout le monde. Ledger 263.
- `packages/application-access` est **consommé, jamais modifié**.
- `apps/tools` et `apps/colors` sont **hors périmètre** de toutes.
- Un seul moteur géométrique 3D, chez C4, exposé par un port unique — même discipline que
  `tracing/geometry-port.ts` dans Tools.
- Toute valeur affichée passe par la structure de provenance. Aucune exception.
