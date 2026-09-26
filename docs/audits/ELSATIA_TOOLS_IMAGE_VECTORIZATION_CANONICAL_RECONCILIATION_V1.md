# ELSATIA Tools — Réconciliation « import photo & vectorisation » avec le canon pré-pilote

Audit et journal d'arbitrage du lot **IMAGE-VECTORIZATION-CANONICAL-RECONCILIATION-V1**.

| | |
| --- | --- |
| Canon Tools de départ | `integration/tools-prepilot-canonical-print-v1` — `48db424d1e479636d89acb9bd0c51ef937449290` |
| Lot image à transplanter | `feature/tools-image-vectorization-v1` — 6 commits, base `db3e5b0` |
| Branche produite | `integration/tools-image-vectorization-canonical-v1` |
| Engine B modifié | **NON** |
| Migration DB / Supabase | **AUCUNE** |
| Déploiement | **AUCUN** |

## 1. Topologie réelle

```
db3e5b0 ──(38 commits)──► 48db424   canon pré-pilote
   └────(6 commits)─────► c2f02c0   lot image
```

- `git merge-base 48db424 db3e5b0` = **`db3e5b0`**
- `git merge-base 48db424 c2f02c0` = **`db3e5b0`**
- `db3e5b0` est **ancêtre** de `48db424`.

Conséquence : le lot image est un delta propre au-dessus de l'ancêtre commun du canon. Aucun
« retour en arrière » n'est possible par construction tant qu'on ne fusionne pas la branche
ancienne en bloc — d'où la stratégie retenue.

## 2. Matrice de recouvrement

30 fichiers touchés par le lot image, dont **3 seulement** également touchés par le canon.

| Fichier | Lot image | Canon | Conflit Git | Conflit sémantique | Stratégie |
| --- | --- | --- | --- | --- | --- |
| `tracing/image-import.ts`, `image-decode.ts`, `perspective.ts`, `edge-detection.ts`, `fitting.ts`, `symmetry.ts`, `reliability.ts`, `history.ts`, `asset-store.ts`, `api.ts`, `numeric.ts` (+ tests) | ajout | — | non | non | report tel quel |
| `tracing/reference-image.ts` | modifié | intact | non | non | report tel quel |
| `tracing/vectorization.ts` | modifié | intact | non | non | report tel quel |
| `tracing/geometry-port.ts` | modifié | modifié | **non** (régions disjointes) | non | union automatique |
| `tracing/index.ts` | modifié | modifié | **oui** (en-tête) | non | union, canon d'abord |
| `tracing/project.ts` | modifié | modifié | **oui** (2 blocs) | **oui** (schéma v1 vs v4) | union, **canon prioritaire** |
| `docs/production-workflow.md`, `docs/image-vectorization-v1.md` | modifié / ajout | — | non | non | report tel quel |

## 3. Stratégie retenue — **C : cherry-pick puis adaptation**

Le merge de la branche ancienne était exclu : `feature/tools-image-vectorization-v1` porte un
`TracingProject` **schéma v1**, quand le canon en est à **v4** (`modelId`, `modelParams`,
`freeGeometry`, `startFromPhoto`, migration, dépôt IndexedDB, autosave, brouillon). Un merge
aurait fait négocier à Git deux versions d'un même contrat, avec le risque exact que ce lot doit
éviter : réintroduire l'ancien.

Les six commits ont donc été rejoués un par un (`git cherry-pick -x`) sur le canon. Quatre
s'appliquent sans conflit ; deux fichiers ont demandé une résolution, faite **en gardant le canon
intégralement** et en n'ajoutant que les capacités nouvelles.

## 4. Arbitrages

Chaque point ci-dessous a été tranché sans supprimer une capacité du canon.

### 4.1 `TracingProject` — le schéma v4 gagne

Le lot image supposait un `TracingProject` v1 et considérait la persistance comme différée. Le
canon a depuis : `schemaVersion = 4`, `migration.ts` (frontière de lecture tolérante),
`repository.ts` (IndexedDB `elsatia-atelier`), `autosave.ts`, `draft.ts`.

**Décision** : le lot image n'apporte à `project.ts` que la **validation de contenu** qui lui
manquait — images de référence, calibration, contours, formes — greffée sur la validation v4.
Aucun champ n'a été retiré, aucune version rétrogradée, aucun bump de schéma nécessaire (les
capacités ajoutées sont additives et un projet antérieur se relit inchangé).

### 4.2 `parseTracingProjectFile` — supprimé

Le lot image apportait sa propre lecture de fichier, adossée à la validation **stricte**. Le canon
a `migrateTracingProject`, qui accepte les versions connues et refuse une version future en le
nommant. Deux points d'entrée de lecture auraient fait exister deux règles concurrentes sur
« ce projet est-il ouvrable », et la plus ancienne aurait refusé des documents que le canon sait
lire. La fonction a été **retirée** ; `serializeTracingProject` (écriture) est conservée.

### 4.3 `touchTracingProject` — collision de nom, le canon gagne

Le lot image définissait `touchTracingProject(project, now)`. Le canon a déjà
`touchTracingProject(project, patch, now)` dans `atelier.ts` : correctif + **revalidation
stricte**, contrat plus riche et voie de mutation unique du projet.

**Décision** : la version du lot image est supprimée. Sa seule idée utile — `scaleStatus` cesse
d'être un drapeau posé à la main dès lors qu'une image peut porter une calibration — devient
`derivedScaleStatus(project)`, une **déduction pure** que l'appelant passe en correctif.
`TracingProjectPatch` est élargi de façon additive à `referenceImages`, `contours`, `shapes` et
`scaleStatus`, pour que le workflow photo emprunte la voie d'écriture du canon au lieu d'en
ouvrir une seconde.

### 4.4 Magasin d'images — base distincte, périmètre identique

Les projets vivent dans IndexedDB `elsatia-atelier` (version 1). Y ajouter un magasin d'images
aurait imposé d'incrémenter la version de cette base, donc une migration IndexedDB pour **tous**
les projets déjà enregistrés — pour une donnée qui n'a ni le même cycle de vie ni la même taille
qu'un document, et qu'on veut pouvoir purger sans toucher aux tracés.

**Décision** : base séparée `elsatia-atelier-assets`, mais **cloisonnée par le même périmètre**
que les projets (`local` / `company:<id>`, via `assetStorageScope` / `assetDatabaseName`), afin
qu'une photo de chantier d'une société ne soit pas lisible depuis un autre périmètre.

### 4.5 Vectorisation confirmée → tracé libre : `free-conversion.ts`

**C'est le cœur de la réconciliation.** Le lot image produisait sa propre `GeometricShape`. Le
canon possède déjà la géométrie **source** de l'utilisateur : `FreeGeometry`, que l'atelier édite
(poignées de classe C), historise, projette en scène et exporte. Laisser les deux coexister aurait
créé une quatrième vérité géométrique après Engine B, le tracé libre et les contours bruts.

`free-conversion.ts` est donc le **seul** point de passage entre la photo et le document :

```
détection / tracé  →  proposition  →  confirmation utilisateur  →  FreeEntity du canon
                                                                    │
                                    scène · cotations · SVG · DXF · PDF · PNG · mosaïque · 1:1
```

Aucun moteur géométrique n'a été créé, Engine B n'a pas été touché, et l'aval ne sait pas qu'une
image a existé.

Trois refus explicites :

1. **contour non confirmé** — `contourToGeometricShape` lève en amont ; c'est la seule fabrique
   de `GeometricShape` ;
2. **projet paramétrique** — `validateTracingProject` interdit `modelId` + `freeGeometry` ;
   `confirmVectorizationIntoProject` l'annonce avant le relevé plutôt qu'après ;
3. **relevé trop dense** — le tracé libre plafonne à 500 sommets par entité, un contour photo en
   compte des milliers. Refus avec la conduite à tenir, ou réduction **sur demande** avec l'écart
   réellement mesuré (`fitShapeToFreeLimits` essaie les tolérances de la plus fidèle à la plus
   grossière et rend celle qui passe).

### 4.6 Ellipse et cercle — option A retenue

Le tracé libre n'a que quatre natures : point, segment, polyligne, contour. Ni cercle, ni arc, ni
ellipse.

**Décision (option A du brief)** : un ajustement de cercle, d'arc ou d'ellipse reste un
**résultat de mesure** — centre, rayon, erreur — affiché et exportable comme tel. Il ne devient
**pas** un modèle Engine B : rien ne garantit qu'un contour photographié soit réellement le modèle
paramétrique qu'il évoque, et le promouvoir ferait passer une ressemblance pour une identité.
`sampleFitForFreeGeometry` en produit une approximation polygonale dont la **flèche maximale est
calculée et annoncée** ; le nombre de segments découle de la tolérance demandée.

### 4.7 Interface — aucune UI créée

Conformément au périmètre, aucune surface d'interface n'a été ajoutée : le canon possède déjà
l'Atelier, et une UI parallèle aurait été à défaire. Le lot livre les **API compatibles** que
cette surface consommera : calque image (`ReferenceImageLayer`, `setReferenceLayer`), calibration
(`calibrateReference`, `controlCalibration`), overlay de vectorisation (`detectContourProposal`,
`fitContourGeometry`, propositions portant leur erreur), et résultat confirmé
(`confirmVectorizationIntoProject`).

## 5. Ce qui a été vérifié

| Sujet | Résultat |
| --- | --- |
| Formats | JPEG / PNG / WEBP acceptés ; HEIC **refusé explicitement** ; faux MIME, extension trompeuse, fichier vide et fichier hors limite refusés |
| EXIF | Le tag `Orientation` est réellement lu (parseur JPEG APP1/TIFF écrit sur place, sans dépendance) ; le décodage demande d'abord `imageOrientation: "from-image"` au navigateur, la lecture du tag sert de secours |
| Calibration | 2 points + distance + unité + origine + date ; conversion px→mm **impossible** sans échelle |
| Cote de contrôle | Écart absolu et % mesurés, jamais lissés ; qualité déduite du seul écart |
| Perspective | Homographie 4 points exacte, inversible ; quadrilatère croisé et points alignés refusés ; redressement depuis une seule cote **refusé** |
| Vectorisation | Otsu, Sobel, composante connexe, suivi de Moore ; échec explicite plutôt que du bruit |
| Fiabilité | Une proposition non confirmée ne devient jamais exacte, y compris relue depuis un fichier qui la déclarerait confirmée |
| Tracé libre | Conversion, plafonds, provenance conservée, écart de réduction mesuré |
| Persistance | Aller-retour par `repository.ts`, relecture par `migrateTracingProject` |
| Service worker | Une image locale (`blob:`, `data:`, `filesystem:`) **n'est jamais interceptée** — test ajouté à la suite SW existante |
| CSP | `img-src 'self' data: blob:` vérifié sur le serveur en fonctionnement ; **aucune nouvelle origine** |
| Exports | SVG et DXF produits depuis la géométrie confirmée ; le SVG ne contient ni `<image>` ni `data:image` |

### Repère de charge (§20)

Mesuré sur ce poste, chaîne complète hors décodage :

| Étape | 1,0 Mpx | 1,2 Mpx (plafond d'analyse) |
| --- | --- | --- |
| Niveaux de gris RGBA | 3,9 ms | 1,8 ms |
| Détection complète (contraste + Otsu + composante + Moore) | 30,5 ms | 23,6 ms |
| Simplification Douglas–Peucker | 0,7 ms | 0,6 ms |
| Réduction sous le plafond du tracé libre | 9,4 ms | 6,4 ms |
| Ajustement cercle | 0,8 ms | 0,4 ms |
| Ajustement ellipse | 2,5 ms | 2,1 ms |
| **Total** | **≈ 48 ms** | **≈ 35 ms** |

Une photo de 12 Mpx est ramenée à 1,20 Mpx **avant** tout algorithme. Sur un téléphone trois à
cinq fois plus lent, la chaîne reste sous ~200 ms.

**Conclusion : aucun Web Worker n'est ajouté.** Le brief demande de ne pas en introduire sans
besoin démontré, et la mesure ne le démontre pas. Le seuil à surveiller est le relèvement de
`MAX_ANALYSIS_PIXELS` : la détection est linéaire en pixels, un plafond à 4 Mpx placerait la
chaîne au-delà de 100 ms sur poste et donc au-delà de 500 ms sur mobile — c'est **là** que le
worker deviendrait justifié.

## 6. Limites de la recette

**Recette navigateur A→P : non exécutée.** Deux raisons indépendantes, aucune contournable dans
le périmètre de ce lot :

1. **Aucune surface d'interface n'expose ce workflow.** Le lot est une couche bibliothèque, et le
   périmètre interdit explicitement de créer une UI parallèle ici. Les étapes A à P n'ont aucun
   bouton à actionner tant que l'Atelier ne les branche pas.
2. Le volet d'aperçu intégré ne peut pas charger les assets de l'application : celle-ci envoie
   `Cross-Origin-Resource-Policy: same-site` et le volet rend la page depuis une autre origine —
   toutes les requêtes `_next/static/*` échouent en `ERR_FAILED`. Le comportement est **identique
   sur le canon seul** : ce n'est pas une régression. La voie « vrai Chrome » n'était pas
   disponible (extension non connectée).

Ce qui a pu être vérifié sur le serveur en fonctionnement : `/` et `/projets` répondent 200 et
rendent leur HTML côté serveur, et la CSP réellement servie autorise `blob:` et `data:` en
`img-src` sans aucune origine supplémentaire.

**Conséquence pour la suite** : la recette navigateur et la vérification mobile (375 / 430 / 768 /
desktop) sont à faire **par le lot qui branchera l'Atelier**, où elles auront enfin un sens.

**Autre limite** : `image-decode.ts` — décodage, réduction, `getImageData` — est le seul module
qui touche au navigateur et il n'est **pas couvert par les tests** (l'environnement de test est
`node`, sans `createImageBitmap` ni `<canvas>`, et le brief interdit d'ajouter une dépendance pour
cela). C'est le risque résiduel du lot, à couvrir lors du branchement UI.

## 7. Résultats

| Vérification | Résultat |
| --- | --- |
| `typecheck` (apps/tools) | OK |
| `lint` (apps/tools) | OK |
| Tests Tools | **1846 / 1846** (canon 1694 + 152) |
| Tests racine | **806 / 806** (inchangé) |
| Recette interne A/B/C | 22 / 22 |
| `build` | OK |
| `build:native` | OK |
| `git diff --check` | propre |

Tests ajoutés par rapport au canon : 123 (lot image porté) + 16 (`free-conversion`) + 12
(`canonical-reconciliation`) + 1 (garde service worker) = **152**.

## 8. Suites

- Brancher l'Atelier sur les API du lot (calque, calibration, overlay, confirmation) — c'est le
  lot qui rendra la recette navigateur exécutable.
- Couvrir `image-decode.ts` au moment de ce branchement.
- Surveiller `MAX_ANALYSIS_PIXELS` : c'est lui, et non la taille des photos, qui déciderait un
  jour d'un Web Worker.
