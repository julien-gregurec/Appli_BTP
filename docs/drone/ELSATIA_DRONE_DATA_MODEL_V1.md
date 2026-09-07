# ELSATIA Drone — Modèle de données V1

> Livrable 4 (§128 du brief). **Aucune migration à ce stade**, conformément à §128 et §131.
>
> Rappel de contrainte dépôt : le ledger de la cible cutover Production est **figé à 263
> migrations** (`docs/organisation/ELSATIA_POST_CUTOVER_ROADMAP_V1.md`). Toute migration
> Drone — y compris la simple ligne d'enregistrement de l'application — appartient à un lot
> post-cutover. Ce document décrit une cible, il ne l'ouvre pas.

## 1. Conventions reprises du dépôt

Elles ne sont pas inventées ici : elles sont relevées sur le socle existant, en particulier
sur `supabase/migrations/20260828000246_colors_functional_core_v1.sql`, qui est le modèle
d'application métier le plus récent et le plus proche du besoin.

| Convention | Règle observée dans le dépôt | Application à Drone |
|---|---|---|
| Nommage | Tables préfixées par l'application, en **français**, au pluriel (`colors_seaux`, `colors_mouvements`) | `drone_projets`, `drone_missions`, … |
| Locataire | Colonne `entreprise_id uuid` référencée sur `public.entreprises` | Identique, **sur chaque table** |
| Autorisation | Une fonction unique `colors_action_autorisee(entreprise_id, action)` appelée par toutes les policies | `drone_action_autorisee(entreprise_id, action)` |
| Accès applicatif | `a_acces_application(entreprise_id, 'drone')` — RPC canonique du socle multi-app | Consommée, **jamais dupliquée** |
| Droits SQL | `revoke all` puis `grant` explicite ; `delete` révoqué par défaut aux `authenticated` | Identique |
| Stockage | Bucket privé, chemin `<entreprise_id>/<objet_id>/…`, policies sur `storage.objects` validant l'UUID du premier segment | Identique |
| Horodatage | `created_at` / `updated_at timestamptz not null default now()` + trigger | Identique |
| Historique | Table d'audit **append-only** séparée (`historique_acces_applications`) | `drone_journal_evenements` |

**Aucune table Drone ne référence Gestion Pro, Tools ou Réserves par clé étrangère.**
C'est l'exigence §43 (mode standalone) traduite en contrainte de schéma : les liens
inter-applications passent exclusivement par les colonnes de référence faible du §7.

---

## 2. Enregistrement de l'application dans le socle

Une seule ligne, dans une migration **post-cutover** :

```
applications_elsatia
  code = 'drone'
  nom  = 'ELSATIA Drone'
  statut_produit = 'bientot'     -- puis 'disponible'

roles_applications_elsatia (application_code = 'drone')
  drone_admin_organisation   — paramètres, quotas, suppression, partage client
  drone_operateur            — crée projets, importe médias, lance reconstructions, mesure
  drone_technicien           — mesure, annote, saisit des anomalies ; ne lance pas de traitement
  drone_consultation         — lecture seule
```

Le contrat de rôles suit exactement la forme des quatre rôles Colors. **Un administrateur
Gestion Pro n'obtient aucun rôle Drone par héritage** — règle déjà écrite dans
`docs/architecture/ELSATIA_COLORS_CANONICAL_INTEGRATION_V1.md`, reprise sans modification.

---

## 3. Entités

Correspondance avec la liste §57 du brief indiquée entre crochets.

### 3.1 Projet et acquisition

**`drone_projets`** — [DroneProject]

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid PK | |
| `entreprise_id` | uuid NOT NULL → `entreprises` | locataire |
| `nom` | text NOT NULL | |
| `type_releve` | text | `toiture` \| `facade` \| `photovoltaique` \| `inspection` \| `thermique` \| `modele_3d` \| `autre` (§13) |
| `statut` | text | machine à états §5 ci-dessous |
| `client_nom`, `adresse`, `latitude`, `longitude` | **nullables** | §12 : facultatifs en standalone |
| `date_releve` | date | |
| `operateur_id` | uuid → `utilisateurs` | |
| `retention_jours` | integer | §47 : durée de conservation configurable |
| `consentement_traitement` | jsonb | §49 : `processing_consent` |
| `source_app`, `reference_externe` | text nullables | §7 — lien faible écosystème |
| `created_at`, `updated_at` | timestamptz | |

**`drone_missions`** — [DroneMission] · paramètres d'acquisition planifiés ou constatés
(altitude, recouvrements, GSD cible, angles). Un projet peut n'avoir **aucune** mission :
c'est le cas nominal de l'import après vol, et le schéma ne doit pas l'interdire (§61).

**`drone_appareils`** — [DroneDevice] · modèle, numéro de série, radiocommande, firmware.
Alimenté par le SDK quand il est disponible, **saisi ou déduit de l'EXIF sinon**.

**`drone_profils_camera`** — [CameraProfile] · focale, taille capteur, résolution,
coefficients de distorsion connus. Clé de la qualité de reconstruction (§24).

### 3.2 Médias

**`drone_medias`** — [MediaAsset]

| Colonne | Note |
|---|---|
| `id`, `projet_id`, `entreprise_id` | |
| `type` | `photo` \| `video` \| `frame_extraite` \| `thermique` |
| `chemin_stockage` | référence bucket, **jamais une URL publique** |
| `checksum` | §74 : déduplication et reprise d'upload |
| `taille_octets`, `mime` | §96 : validation |
| `exif` | jsonb — §76, conservé intégralement, jamais purgé à l'import |
| `prise_le`, `latitude`, `longitude`, `altitude_gps`, `orientation` | extraits, dénormalisés pour l'indexation |
| `qualite_flou`, `qualite_exposition`, `doublon_de` | §75 : contrôle qualité |
| `exploitable` | boolean — décision du contrôle qualité, **corrigeable par l'utilisateur** |
| `source_degradee` | boolean — **vrai pour toute frame extraite d'une vidéo (§77)** ; se propage jusqu'à la mesure |
| `floutage_applique` | jsonb — §47, zones floutées et méthode |

**`drone_echantillons_telemetrie`** — [TelemetrySample] · série temporelle : position,
altitude, attitude, gimbal, batterie. **Table volumineuse** : partitionnement ou rétention
propre à prévoir. Absente en import simple, et le produit doit fonctionner sans elle.

### 3.3 Reconstruction

**`drone_travaux_reconstruction`** — [ReconstructionJob] — §60, §94, §95

| Colonne | Note |
|---|---|
| `id`, `projet_id`, `entreprise_id` | |
| `statut` | `en_attente` \| `traitement` \| `termine` \| `erreur` \| `annule` (§18) |
| `moteur`, `moteur_version` | §60 — `odm`, `metashape`, … |
| `parametres` | jsonb |
| `jeu_medias` | uuid[] ou table de liaison — l'`input_media_set` du §60 |
| `cle_idempotence` | **unique** — hash de (projet, jeu de médias, version de pipeline, paramètres). §95 |
| `demarre_le`, `termine_le`, `duree_s` | §93 |
| `cout_estime_centimes` | §93 — observabilité de la rentabilité |
| `erreur_categorie`, `tentatives` | §94 — retries et dead-letter |

**`drone_resultats_reconstruction`** — [ReconstructionResult] · `version` (entier croissant
par projet), références de stockage (nuage de points, maillage, texture, orthophoto, MNS,
GLB allégé §72), et `metriques_qualite` jsonb : erreur de reprojection, GSD, nombre de
caméras calibrées, taux d'images retenues. **Ces métriques sont les entrées du niveau de
qualité §24 — elles ne sont pas le niveau lui-même.**

Un projet conserve **plusieurs** résultats. On n'écrase jamais une reconstruction (§59, §81).

### 3.4 Géométrie toiture

**`drone_modeles_toiture`** — [RoofModel] · rattaché à un `resultat_reconstruction`, avec
`origine` = `detecte` \| `corrige` \| `saisi` (§22).

**`drone_pans`** — [RoofPlane] · surface, pente, azimut, équation de plan, polygone.
**`drone_aretes`** — [RoofEdge] · `type` : `faitage` \| `egout` \| `rive` \| `noue` \|
`aretier` \| `acrotere` (§21).
**`drone_obstacles`** — [RoofObstacle] · `type` : `cheminee` \| `fenetre_toit` \|
`ventilation` \| `antenne` \| `zone_technique` \| `autre`, plus une `marge_securite_mm` (§29).

Chaque ligne porte `origine` et `valide_par` : la détection automatique est une
**proposition** tant qu'un humain ne l'a pas validée (§22).

### 3.5 Mesures et provenance — le cœur du produit

**`drone_mesures`** — [Measurement] + [MeasurementQuality], §23, §25, §58, §63

| Colonne | Note |
|---|---|
| `valeur`, `unite` | `m` \| `m2` \| `deg` \| `pourcent` |
| `grandeur` | `distance` \| `polyligne` \| `surface` \| `angle` \| `pente` \| `hauteur` \| `denivele` |
| `nature` | **`mesure` \| `calcule` \| `estime`** — la distinction imposée par §37 |
| `methode` | `manuelle_3d` \| `manuelle_ortho` \| `derivee_pan` \| `derivee_modele` |
| `resultat_reconstruction_id` | quel modèle a produit la valeur (§58) |
| `geometrie_source` | jsonb — les points ou entités effectivement utilisés |
| `origine` | reprise de l'échelle `MeasurementOrigin` de Tools (§4 ci-dessous) |
| `qualite` | `indicatif` \| `standard` \| `haute_precision` \| `controle_rtk_gcp` (§24) |
| `incertitude_valeur`, `incertitude_unite` | **nullables — et `null` est la valeur correcte tant que la campagne §107 n'a pas eu lieu.** §25 : ne jamais inventer |
| `calibration_id` | → points de contrôle |
| `auteur_id`, `created_at` | |

**Règle de schéma non négociable :** `incertitude_valeur` est nullable **et** l'interface
doit savoir afficher une mesure sans incertitude. Le contraire pousserait à remplir la
colonne avec un chiffre inventé, ce que §25 interdit explicitement.

**`drone_points_controle`** — [GCP], §26 · coordonnées connues, distance connue mesurée
sur site, point relevé. Sert à contrôler ou corriger l'échelle.

**`drone_journal_evenements`** — §59, **append-only**, jamais mis à jour ni supprimé :
reconstruction initiale, correction utilisateur, mesure ajoutée/modifiée, pan corrigé,
obstacle ajouté, rapport exporté. Même forme que `historique_acces_applications`.

### 3.6 Métier

**`drone_implantations_solaires`** — [SolarLayout], §27–§30 · pan visé, modèle de panneau,
orientation portrait/paysage, marges (rive, faîtage, égout), zones interdites, résultat :
nombre de panneaux, puissance totale, surface utilisée. Plusieurs variantes par projet
(options A/B/C du §30) — donc une table, pas une colonne.

**`drone_panneaux_catalogue`** — §27 · fabricant, modèle, dimensions, puissance.
Structure extensible, **non pré-remplie** (§38).

**`drone_constats_inspection`** — [InspectionFinding], §32, §33 · position 3D et/ou 2D,
média associé, catégorie, priorité, statut, auteur, date, plus `reserve_externe_ref`
nullable pour la liaison facultative vers Réserves (§34).

**`drone_exports`** — [ExportArtifact] · format, périmètre, référence de stockage,
horodatage, auteur. Trace de ce qui a été remis au client (§59, §86).

---

## 4. Provenance : réutiliser ce qui existe déjà dans Tools

`apps/tools/src/lib/tracing/measurement-origin.ts` implémente déjà, pour ELSATIA Tools,
exactement la doctrine du §84 : une échelle d'origines ordonnée
(`exact` > `manual` > `calibrated` > `imported` > `approximated`), un prédicat
`isRealWorldTrusted()`, une combinaison **par le maillon le plus faible**, et un avertissement
automatique pour toute valeur non fiable.

**Ce module est le bon point de départ, et sa règle de combinaison est la propriété
la plus importante à conserver :** une surface calculée à partir d'un pan issu d'une
reconstruction non calibrée ne peut pas devenir « fiable » parce qu'un humain a cliqué
proprement. Le maillon faible gagne, jusqu'au PDF client.

Deux écarts à traiter, sans casser Tools :

1. Drone a besoin d'unités absentes (`m`, `m²`, `°`, `%`) là où Tools raisonne en `mm`.
2. Drone a besoin d'un niveau supplémentaire lié au **contrôle terrain** (RTK/GCP), qui
   n'existe pas dans Tools.

Recommandation : ne pas modifier le fichier de Tools depuis le lot Drone. Extraire la
doctrine dans un package partagé (`packages/mesure-provenance`) **plus tard**, quand deux
applications l'utiliseront réellement. En attendant, Drone en porte sa propre copie
étendue, et le point de convergence est inscrit comme dette assumée.

---

## 5. Cycle de vie du projet

```
BROUILLON
   ├──────────────────────────────┐            (import direct : §61 interdit d'imposer
   ▼                              ▼             le passage par une mission)
MISSION_PREPAREE ─► ACQUISITION_EN_COURS ─► MEDIAS_IMPORTES
                                                   │
                                                   ▼
                                            CONTROLE_QUALITE
                                                   │
                                                   ▼
                                            RECONSTRUCTION ──► (erreur) ─┐
                                                   │                     │
                                                   ▼                     ▼
                                              A_VALIDER          MEDIAS_IMPORTES
                                                   │              (reprise possible)
                                                   ▼
                                                VALIDE ─► RAPPORT_GENERE ─► ARCHIVE
```

Deux règles :

- Le chemin `BROUILLON → MEDIAS_IMPORTES` est direct. Un utilisateur en import pur ne
  traverse jamais un état de mission (§61).
- `VALIDE` signifie « un humain a validé la géométrie », pas « le calcul a réussi ». C'est
  la traduction du §22 dans la machine à états.

## 6. Cycle de vie d'un travail de reconstruction

```
en_attente ──► traitement ──► termine
     ▲              │
     │              ├──► erreur ──► (retry borné) ──► en_attente
     │              │                    │
     │              │                    └──► echec_definitif   (dead-letter, §94)
     └──── annule ◄─┘
```

L'idempotence (§95) repose sur `cle_idempotence` **unique** = hash de
`(projet_id, jeu_medias trié, moteur, moteur_version, parametres)`. Relancer un job
identique retourne le job existant ; changer un seul paramètre en crée un nouveau, sans
détruire l'ancien résultat.

---

## 7. Références inter-applications (§117)

Aucune clé étrangère entre applications. Le contrat est un quadruplet de colonnes faibles,
présent sur `drone_projets` et sur `drone_constats_inspection` :

| Colonne | Rôle |
|---|---|
| `source_app` | `gestion_pro` \| `reserves` \| `tools` \| `null` |
| `reference_externe` | identifiant opaque côté application distante |
| `statut_synchro` | `non_lie` \| `lie` \| `desynchronise` |
| `synchronise_le` | timestamptz |

Une base Drone dont ces colonnes sont toutes nulles est une base parfaitement valide.
C'est le test d'acceptation du §43.

---

## 8. Stockage

| Bucket | Contenu | Public | Note |
|---|---|---|---|
| `drone-medias` | photos, vidéos originales | non | volumes en Go — **voir la limite ci-dessous** |
| `drone-resultats` | nuages, maillages, orthophotos, GLB | non | |
| `drone-exports` | PDF, DXF, SVG | non | |
| `drone-partage` | modèle allégé et rapport pour lien client (§86) | non, **URL signée à durée limitée** | jamais les fichiers bruts |

Chemin : `<entreprise_id>/<projet_id>/<media_id>.<ext>`, policies `storage.objects`
validant l'UUID du premier segment — schéma exactement repris de `colors-seaux`.

**Point bloquant relevé à l'audit :** `supabase/config.toml` fixe aujourd'hui
`file_size_limit = "50MiB"`. Une photo drone passe, une vidéo 4K non, et le brief §74
annonce des projets de plusieurs Go. Supabase Storage supporte l'upload reprenable **TUS
jusqu'à 50 Go** (plan Pro), avec URL d'upload signée valable 24 h. Le relèvement de cette
limite et l'adoption de TUS sont un prérequis technique du lot d'ingestion, pas un détail
de configuration.

## 9. Suppression (§92)

`drone_projets` supprimé ⇒ cascade SQL sur toutes les tables filles, **plus** une reprise
explicite des objets de stockage et l'annulation des jobs en cours. La cascade SQL seule
laisserait des objets orphelins facturés dans les buckets. À traiter comme une procédure,
pas comme une contrainte `on delete cascade`.

---

## 10. Ce que ce document n'ouvre pas

- Aucune migration écrite, conformément à §128 et §131.
- Aucune modification du socle multi-app existant.
- Aucun type, aucune table créés dans le dépôt.
- Le ledger reste à 263.
