# ELSATIA Drone — Implémentation des contrats de données V1

> Lot **ELSATIA-DRONE-CORE-CONTRACTS-V1**. Branche `feat/drone-core-contracts-v1`,
> basée sur `996be15` — la cible cutover figée, ledger **263 migrations**.
>
> **Aucune migration. Aucun déploiement. Aucune modification du socle multi-app.**
> Ce lot ajoute un package TypeScript isolé et sa documentation, rien d'autre.
>
> Documents amont : [architecture](ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md) ·
> [modèle de données](ELSATIA_DRONE_DATA_MODEL_V1.md) ·
> [roadmap MVP](ELSATIA_DRONE_MVP_ROADMAP_V1.md)

---

## 1. Ce qui a été créé

`packages/drone-core` — package privé `@elsatia/drone-core`, sur le modèle exact de
`packages/application-access` : `"type": "module"`, `exports` pointant sur la source
TypeScript, consommation prévue par `transpilePackages`.

```
packages/drone-core/
├── package.json
├── README.md
└── src/
    ├── index.ts              barrel
    ├── units.ts              unités canon, WGS84, conversions
    ├── ids.ts                identifiants typés
    ├── common.ts             horodatages, locataire, validation humaine, lien faible
    ├── storage-ref.ts        bucket + chemin, jamais une URL
    ├── serialization.ts      JSON stable, SHA-256
    ├── provenance.ts         échelle d'origines, maillon faible
    ├── quality.ts            niveaux, métriques mesurées, incertitude
    ├── project.ts            DroneProject + cycle de vie
    ├── mission.ts            DroneMission
    ├── device.ts             DroneDevice, CameraProfile
    ├── media.ts              MediaAsset, TelemetrySample
    ├── reconstruction.ts     ReconstructionJob / Result + machine à états
    ├── idempotency.ts        clé stable
    ├── roof.ts               RoofModel / Plane / Edge / Obstacle
    ├── measurement.ts        Measurement, ControlPoint
    ├── solar.ts              SolarPanelSpec, PlacementRules, Layout, LayoutResult
    ├── inspection.ts         InspectionFinding
    ├── export-artifact.ts    ExportArtifact
    ├── exports/              cinq contrats versionnés V1
    ├── ports/                storage, drone, moteur, écosystème
    ├── validation/           validation runtime
    └── fixtures/             trois jeux d'essai anonymes
```

Le seul fichier existant modifié est `tsconfig.json` de la racine, pour y ajouter l'alias
`@elsatia/drone-core` à côté de celui d'`application-access`. Aucun autre fichier du dépôt
n'est touché.

**Les dix-neuf types demandés au §4 du brief sont tous définis**, plus `ControlPoint`,
`ExternalReference` et les types de support qu'ils exigent.

---

## 2. Décisions prises, et pourquoi

### 2.1 Nommage anglais, base de données française

Les types et les champs sont en anglais `snake_case` (`created_at`, `geometry_ref`,
`reconstruction_version`), comme le brief les nomme et comme les contrats d'export doivent
les publier. Le modèle de données, lui, reste en français (`drone_projets`, `unite`,
`incertitude_valeur`), conformément à la convention du dépôt.

La correspondance n'est pas laissée implicite : `MEASUREMENT_UNIT_DB_CODES` porte la table de
passage (`percent` ⇄ `pourcent`), et la couche d'accès aux données qui viendra plus tard
n'aura pas à la deviner.

### 2.2 Unités — mètre pour le relevé, millimètre pour le matériel

| Domaine | Unité canon | Raison |
|---|---|---|
| Longueurs, hauteurs, dénivelés relevés | **m** | Échelle du bâtiment, et unité du modèle de données |
| Surfaces | **m²** | Idem |
| Angles, azimuts, pentes angulaires | **degrés** dans tout contrat | Les radians restent une unité de calcul interne ; la conversion est explicite (`degreesToRadians` / `radiansToDegrees`) |
| Pentes | publiées en **degrés ET en pourcent** | §67 — ne pas imposer un arrondi à l'interface |
| Dimensions de panneaux, marges de pose, retraits | **mm** | Unité de publication des fabricants et de la mise en œuvre. Les convertir en mètres n'ajouterait que des flottants approchés |
| GSD | **mm/px** | Un relevé utile tourne entre 5 et 30 mm/px ; le cm/px perdrait un chiffre significatif |
| Coordonnées géographiques | **WGS84**, degrés décimaux | §6. Toute projection appartient au calcul, pas au contrat |

**Altitude.** Le §68 interdit de mélanger altitude GPS, hauteur relative au décollage, hauteur
projet et référentiel local. La contrainte est portée par le type : `Altitude` est un couple
`{ value_m, reference }`, et il n'existe aucun moyen d'écrire une altitude sans son
référentiel.

### 2.3 Identifiants typés

`packages/application-access` manipule des `string` nus — c'est suffisant pour deux entités,
pas pour dix-neuf familles d'UUID qui circulent ensemble. Les identifiants sont donc des types
marqués (`DroneProjectId`, `MediaAssetId`, …), construits par des convertisseurs validants
(`asDroneProjectId`), et **restent des chaînes à l'exécution** : la sérialisation JSON est
inchangée et le coût runtime est nul.

### 2.4 Provenance : la doctrine de Tools, étendue, non dupliquée à la légère

`apps/tools/src/lib/tracing/measurement-origin.ts` **n'est pas modifié par ce lot**.
`src/provenance.ts` en reprend les trois propriétés qui comptent — échelle ordonnée,
combinaison par le maillon le plus faible, avertissement automatique — et ajoute le seul
niveau qui manquait à Drone : `field_controlled` (contrôle terrain RTK / points de calage).

Ce niveau domine `exact`, et c'est un choix explicite : « exact » qualifie une géométrie
exacte *dans son propre repère*, `field_controlled` qualifie une géométrie recalée sur des
coordonnées connues du monde réel. Pour un métré, la seconde est strictement plus forte.

La convergence en `packages/mesure-provenance` reste une **dette assumée**, à ouvrir le jour
où deux applications consomment réellement la même échelle — pas avant.

### 2.5 Qualité : aucun seuil, parce qu'aucun seuil n'existe

Les quatre niveaux (`indicative`, `standard`, `high_precision`, `rtk_gcp_controlled`) sont
définis. **Aucune fonction ne les dérive de métriques**, et c'est le point le plus important
de ce lot : les seuils sont la sortie de la campagne de validation métrologique du §107, qui
n'a pas eu lieu. Une fonction qui les devinerait serait un seuil inventé déguisé en code.

Un test le vérifie explicitement : le barrel du package ne doit exporter aucun symbole
ressemblant à une dérivation automatique de qualité.

De même, `uncertainty_value` est nullable, `null` est sa valeur correcte aujourd'hui, et
`describeUncertainty()` retourne « Incertitude inconnue » plutôt qu'un chiffre plausible.
La validation refuse une *demi*-incertitude — une valeur sans unité, ou l'inverse — parce que
c'est une donnée corrompue, pas une donnée partielle.

### 2.6 Idempotence

Clé stable = `(schema_version, project_id, input_set trié et dédoublonné, engine,
engine_version, parameters normalisés)`, sérialisée par `stableStringify` puis hachée en
SHA-256 via l'API Web Crypto — disponible dans Node 20 comme dans un navigateur, ce qui évite
d'importer `node:crypto` dans un package transpilé par Next.

Deux propriétés testées : l'ordre de soumission des médias et l'ordre des clés de paramètres
sont sans effet ; changer un seul paramètre, une version de moteur ou un média produit une
clé différente.

`buildIdempotencyPayload()` est exposée à part de l'empreinte : en cas d'incident, on compare
deux charges utiles lisibles, pas deux hashs.

### 2.7 Validation runtime — sans nouvelle dépendance

Le dépôt n'embarque **ni `zod`, ni `ajv`, ni `yup`** ; `application-access` valide à la main.
Un lot de contrats n'est pas le bon endroit pour introduire une dépendance runtime dans quatre
applications : `src/validation/` est donc un noyau écrit à la main, qui **accumule toutes les
anomalies** avec leur chemin (`$.quality.uncertainty_value`) au lieu de s'arrêter à la
première — un import de 400 photos doit dire ce qui ne va pas, pas seulement où il a renoncé.

Le périmètre couvert est celui des objets **qui traversent une frontière** :

- `validateMediaAsset` — SHA-256, taille, bucket, **préfixe locataire du chemin de stockage**
  (les policies `storage.objects` valident l'UUID du premier segment), propagation de
  `degraded_source` pour les frames vidéo ;
- `validateMeasurement` — cohérence unité / grandeur, incertitude complète ou absente,
  présence explicite de `reconstruction_version` ;
- `validateReconstructionJob` — jeu d'entrée non vide et sans doublon, tentatives dans la
  borne ;
- les cinq contrats d'export — enveloppe, et **présence du bloc de provenance sur chaque
  valeur publiée**.

Les entités purement internes restent couvertes par le typage statique ; les redoubler
n'ajouterait que du code à maintenir.

### 2.8 Contrats d'export versionnés

`DroneProjectSummaryV1`, `DroneRoofExportV1`, `DroneMeasurementExportV1`,
`DroneInspectionExportV1`, `DroneSolarExportV1`, tous bâtis sur une enveloppe commune
(`contract`, `contract_version: 1`, `generated_at`, `project_id`, `reconstruction_version`).

Discipline : **on n'ajoute pas un champ obligatoire à un V1, on publie un V2.**

Trois règles de contenu sont portées par les types eux-mêmes :

- Gestion Pro reçoit résumé, métrés et PV — **jamais le modèle 3D** ;
- Tools reçoit contours, pans, arêtes et mesures — **jamais les médias bruts** ;
- Réserves reçoit un **brouillon** : `ReserveDraftV1` ne porte aucun statut de workflow, et la
  validation refuse un brouillon qui en porterait un. La validation reste chez Réserves.

`toExportedProvenanceV1()` est le point unique de calcul de `trusted` et `warning`. Recomposée
à cinq endroits, la règle du maillon faible finirait par diverger à l'un d'eux — et c'est
exactement là qu'une valeur non fiable sortirait sans mention.

`DroneSolarExportV1.shading_model` vaut toujours `"none"` en V1, et la validation refuse toute
autre valeur : l'ombrage est hors périmètre (§31), et le dire dans le contrat vaut mieux que
le taire.

### 2.9 Interfaces, sans implémentation

| Interface | Fichier | Ce qu'elle fixe |
|---|---|---|
| `MediaStorageAdapter` | `ports/storage.ts` | Upload **reprenable (TUS) par défaut**, parce que `file_size_limit` vaut 50 MiB et qu'un projet drone pèse des Go. Suppression explicite des objets (§92) |
| `ReconstructionArtifactStorage` | `ports/storage.ts` | Dépôt et purge des artefacts par travail |
| `SignedMediaAccess` | `ports/storage.ts` | URL **signées et expirantes** uniquement, y compris pour le partage client |
| `DroneAdapter` | `ports/drone-adapter.ts` | `capabilities()` est la méthode structurante ; `videoFeed()` retourne un **descripteur de surface**, jamais des trames (§100) |
| `ReconstructionEngineAdapter` | `ports/reconstruction-engine.ts` | ODM, Metashape ou autre, derrière un contrat unique. Le worker interroge, le moteur ne rappelle pas |
| `GestionProDronePort` / `ToolsDronePort` / `ReservesDronePort` | `ports/ecosystem.ts` | Contrats seuls. Aucune intégration ouverte |

Aucun bucket n'est créé. Aucune implémentation DJI, ODM ou Metashape n'est écrite.

### 2.10 Jeux d'essai

Trois fixtures anonymes, choisies parce qu'elles couvrent trois régimes de confiance :

| Fixture | Ce qu'elle démontre |
|---|---|
| `toitureSimple` | Deux pans, géométrie **entièrement validée**, mesure fiable |
| `maisonComplexe` | Six pans, noue, cheminée, géométrie **partiellement validée** → métré explicitement non fiable |
| `facade` | Relevé issu de **frames vidéo** → `degraded_source` propagé jusqu'à la mesure |

Aucune donnée réelle : pas d'adresse, pas de nom de client, positions posées sur un point de
convention au large de la côte atlantique, UUID déterministes. Les tests vérifient l'absence
de données nominatives, l'absence d'incertitude inventée, et le fait que toutes les références
inter-applications sont nulles — **le test d'acceptation du mode standalone du §43**.

---

## 3. Vérifications

| Contrôle | Commande | Résultat |
|---|---|---|
| Typage | `npx tsc --noEmit --incremental false` | ✅ aucune erreur |
| Lint | `npx eslint packages/drone-core` | ✅ 0 erreur, 0 avertissement |
| Tests du package | `npx vitest run packages/drone-core` | ✅ 10 fichiers, 67 tests |
| Tests de la racine | `npx vitest run` | ✅ inchangés |
| Ledger de migrations | `ls supabase/migrations \| wc -l` | **263 — inchangé** |

Couverture des tests, par thème du §21 du brief :

| Thème | Fichier |
|---|---|
| Unités | `src/units.test.ts` |
| Validation | `src/validation/entities.test.ts` |
| Sérialisation | `src/serialization.test.ts` |
| Qualité | `src/quality.test.ts`, `src/provenance.test.ts` |
| Idempotence | `src/idempotency.test.ts` |
| Contrats | `src/validation/contracts.test.ts` |
| Cycles de vie | `src/lifecycle.test.ts` |
| Identifiants | `src/ids.test.ts` |
| Jeux d'essai | `src/fixtures/fixtures.test.ts` |

---

## 4. Ce que ce lot n'ouvre pas

- **Aucune migration.** Le ledger reste à 263, y compris la ligne d'enregistrement de
  l'application `drone` dans `applications_elsatia` : elle appartient à un lot post-cutover.
- Aucun bucket, aucune policy `storage.objects`.
- Aucune application `apps/drone`, aucun service `services/drone-worker`.
- Aucune implémentation d'adaptateur, drone ou moteur.
- Aucune intégration réelle avec Gestion Pro, Tools ou Réserves.
- Aucun écran : Drone héritera de la cible **ELSATIA-UI-V2**, pas de l'UI actuelle.

## 5. Points restés ouverts, à trancher hors de ce lot

1. **Seuils de qualité** (§24, §107). Tant que la campagne métrologique n'a pas eu lieu, aucun
   niveau ne peut être dérivé automatiquement. Le noyau le refuse volontairement.
2. **`file_size_limit = 50 MiB`** dans `supabase/config.toml`. L'interface de stockage suppose
   TUS ; le relèvement de la limite est un prérequis du lot d'ingestion.
3. **Licence AGPL-3.0 d'OpenDroneMap.** La clause réseau doit être qualifiée par un conseil en
   propriété intellectuelle avant commercialisation. Le contrat `ReconstructionEngineAdapter`
   rend le moteur remplaçable, ce qui limite l'exposition mais ne la supprime pas.
4. **Convergence `packages/mesure-provenance`** entre Tools et Drone : dette assumée, à ouvrir
   quand deux applications consommeront réellement la même échelle.
5. **Priorité face à ELSATIA-UI-V2 et au cutover Production.** Ce lot ne consomme aucun de ces
   deux chemins critiques, mais la suite (application, worker, GPU) les croise directement.
