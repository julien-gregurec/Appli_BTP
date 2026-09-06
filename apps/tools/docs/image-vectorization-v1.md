# Import photo & vectorisation V1

Chaîne « référence visuelle → géométrie constructible » d'ELSATIA Tools. Ce lot complète
l'étage `src/lib/tracing/` posé par le workflow production (`production-workflow.md`) : il
ajoute l'import réel, le redressement de perspective, la détection de contour, l'ajustement
en primitives traçables, les symétries, l'historique et la persistance de l'image.

```
PHOTO / CAPTURE / CROQUIS
  → IMPORT              image-import.ts · image-decode.ts   (format, taille de travail, EXIF)
  → REDRESSEMENT        reference-image.ts · perspective.ts (rotation, miroir, homographie)
  → CALIBRATION         reference-image.ts                  (px → mm, cote de contrôle)
  → DÉTECTION / TRACÉ   edge-detection.ts · vectorization.ts
  → VECTORISATION       fitting.ts                          (droite, cercle, arc, ellipse)
  → SIMPLIFICATION      vectorization.ts + moteur simplify  (Précis / Équilibré / Chantier)
  → GÉOMÉTRIE           vectorization.ts                    (RawContour → GeometricShape)
  → VALIDATION          api.ts                              (proposition → confirmé)
  → MISE À L'ÉCHELLE    vectorization.ts                    (scaleGeometricShape)
  → TRACÉ CHANTIER      chantier/* et exports/* (hors lot)
```

## Règle qui prime sur tout le reste

**Aucune cote inventée.** Trois garde-fous sont exécutables et testés :

1. `pixelsToMillimetres`, `contourToGeometricShape` et toute conversion px → mm **lèvent une
   erreur** tant que l'image n'est pas calibrée.
2. Un contour `source: "detected"` est forcé à `status: "proposition"` à la création **et à la
   relecture** d'un projet. Seule une confirmation explicite de l'utilisateur le fait passer à
   `confirmed`, et toute retouche ultérieure (ajout, déplacement, suppression d'un point) le
   ramène à l'état de proposition.
3. Toute qualité affichée provient d'un écart **calculé** (erreur de calibration, erreur de
   fit, écart de simplification). Aucun pourcentage de confiance n'est produit.

## Arborescence du lot

| Fichier | Rôle | Brief |
| --- | --- | --- |
| `tracing/image-import.ts` | Acceptation de format, taille de travail, budget d'analyse, transport de calibration, lecture EXIF | §3, §5, §42, §43 |
| `tracing/image-decode.ts` | **Seul module DOM** : `createImageBitmap`, `<canvas>`, niveaux de gris d'analyse, object URL | §6, §41–§44 |
| `tracing/reference-image.ts` | Calque de fond, redressement simple, calibration tracée, cote de contrôle, grille réelle | §4, §6, §9, §10, §13, §30 |
| `tracing/perspective.ts` | Homographie 4 points, redressement d'un plan rectangulaire, mesure d'inclinaison | §11, §12 |
| `tracing/edge-detection.ts` | Niveaux de gris, contraste, Otsu, Sobel, composante connexe, suivi de frontière de Moore | §14 |
| `tracing/fitting.ts` | Ajustement droite / cercle / arc / ellipse avec erreur mesurée, tangences, approximation d'ellipse en arcs | §21–§25 |
| `tracing/symmetry.ts` | Symétries, complétion d'une demi-figure, répétition radiale, centre proposé, axes | §26–§29 |
| `tracing/vectorization.ts` | Édition de contour, 3 niveaux de simplification + écart mesuré, éléments constructibles, mise à l'échelle, provenance | §15–§21, §31, §32, §35 |
| `tracing/reliability.ts` | Réserves affichables, construites sur des faits vérifiables | §35–§37 |
| `tracing/history.ts` | Pile annuler / rétablir bornée, purement fonctionnelle | §38 |
| `tracing/asset-store.ts` | Octets d'image en IndexedDB, purge des orphelins | §39, §40, §44 |
| `tracing/api.ts` | API stable consommée par l'Atelier | §46 |
| `tracing/numeric.ts` | Gauss avec pivot, valeurs propres 2×2 | support §11, §22–§25 |

## Formats d'image

| Format | État | Raison |
| --- | --- | --- |
| JPEG, PNG, WEBP | **Pris en charge** | Décodables par le navigateur sans dépendance |
| HEIC / HEIF | **Refusé explicitement** | Aucun décodeur disponible sans dépendance native. Message rendu : « HEIC non pris en charge pour le moment. Exportez la photo en JPEG depuis votre téléphone. » Aucune fausse prise en charge n'est simulée. |

Sources d'import prévues : fichier, appareil photo, capture existante. En web/PWA, un
`<input type="file" accept="image/jpeg,image/png,image/webp">` suffit (`REFERENCE_FILE_ACCEPT`).
Aucune dépendance native n'a été ajoutée pour la caméra : le Capacitor déjà présent
(`@capacitor/filesystem`) reste le point de branchement mobile.

## Calibration

1. L'utilisateur clique **A** puis **B** sur l'image.
2. Il saisit la distance réelle A–B (mm, cm, m ou pouces).
3. `computeCalibration` en déduit `mmPerPixel` et conserve **les points, l'unité saisie, la
   date et l'origine de mesure** (`origin: "calibrated"`).

Exemple : A–B = 842 px pour 1200 mm → 1,4252 mm/px.

### Deuxième cote de contrôle (fortement recommandée)

`verifyCalibration` mesure une deuxième cote connue avec l'échelle obtenue et publie l'écart
brut, jamais lissé :

```
attendu  800 mm
calculé  814 mm
écart    +14 mm  (1,75 %)
qualité  bon
```

Seuils d'écart relatif : `excellent` ≤ 0,5 % · `bon` ≤ 2 % · `moyen` ≤ 5 % · `insuffisant`
au-delà. Une qualité `moyen` remonte un avertissement, `insuffisant` une **erreur bloquante**.

### Grille réelle (§30)

Une fois l'échelle définie, `calibrationGrid` projette une maille de 100 / 250 / 500 / 1000 mm
sur l'image : un contrôle visuel immédiat de la cohérence d'échelle.

## Redressement

### Simple (§13)

`rotateAdjust` (rotation libre), `rotateAdjustQuarterTurn` (90°), `flipAdjust` (miroirs),
`straightenTransform` (aligner une ligne sur l'axe horizontal ou vertical avec la plus petite
correction).

### Perspective (§11) — **implémenté**

L'utilisateur désigne les quatre coins A/B/C/D d'un plan qu'il sait rectangulaire et donne sa
largeur **et** sa hauteur réelles. `rectifyQuadToRectangle` calcule l'homographie exacte
(système 8×8, élimination de Gauss avec pivot partiel), l'homographie inverse pour reprojeter
un tracé sur la photo d'origine, et une `CalibrationResult` valable dans l'image redressée —
où l'échelle est enfin uniforme.

**Limite assumée** : le redressement exige largeur ET hauteur réelles. Depuis une seule cote,
le rapport d'aspect d'un plan vu en perspective est indéterminé sans modèle de caméra ;
ELSATIA refuse plutôt que d'inventer un rapport. `rectifyQuadToRectangle` lève dans ce cas.

Sans redressement, `assessPerspective` mesure l'écart entre côtés opposés et l'écart angulaire
aux 90°, et produit « Photo inclinée : mesures potentiellement imprécises. »

## Détection de contour (§14)

Chaîne sans bibliothèque de vision : niveaux de gris → étirement de contraste (percentiles
2 %/98 %) → seuil d'Otsu (ou seuil manuel) → masque binaire → plus grande composante connexe
(4-connexité) → suivi de frontière de Moore avec critère d'arrêt de Jacob. Un gradient de
Sobel est disponible en option pour les images peu contrastées.

**Ce que ce n'est pas** : une IA de reconnaissance de motif. La chaîne fonctionne bien sur un
croquis au trait ou une capture nette, et échoue sur une photo de chantier bruitée — auquel cas
elle **lève** (« Détection non concluante… tracez le contour à la main ») plutôt que de rendre
du bruit. Le résultat est toujours un `RawContour { source: "detected", status: "proposition" }`
accompagné de « Contour automatique — à valider avant utilisation. »

La détection tourne sur une image ramenée à `MAX_ANALYSIS_PIXELS` (1,2 Mpx) ; au-delà elle
refuse de démarrer.

## Vectorisation manuelle assistée (§15, §16)

`traceContour`, `appendContourPoint`, `moveContourPoint`, `removeContourPoint`,
`setContourClosed`. Le tracé vectoriel est **indépendant de l'image** : masquer ou supprimer
le calque de référence ne retire rien au dessin (le contour porte ses propres points, l'image
n'est qu'un `assetRef`).

## Ajustement en primitives (§21–§25)

`fitGeometry` essaie la primitive la plus simple d'abord et retient la première dont l'écart
**mesuré** tient sous la tolérance : droite → cercle/arc → ellipse. Si aucune ne convient, la
polyligne est conservée telle quelle plutôt que déformée ; les primitives écartées sont
renvoyées avec leur erreur, ce qui explique le choix.

| Fonction | Méthode | Erreur renvoyée |
| --- | --- | --- |
| `fitLine` | Moindres carrés totaux (axe principal) — gère les verticales | Distance orthogonale max et RMS |
| `fitCircle` | Moindres carrés algébriques (Kåsa), données recentrées | \|distance au centre − rayon\| max et RMS |
| `fitArc` | Cercle ajusté + bornes angulaires, sens décidé par un point intermédiaire | Celle du cercle |
| `fitEllipse` | Conique `Ax²+Bxy+Cy²+Dx+Ey=1` puis diagonalisation ; rejette parabole et hyperbole | Distance géométrique point → ellipse |

Exemple de proposition rendue : « Cercle proposé : centre (1200 ; 800), rayon 602, écart max
2,1 — à valider. »

**Tangences (§23)** : `tangencyBetweenCircles` / `tangencyBetweenArcs` donnent le point de
raccordement tangentiel (externe ou interne) — celui que l'artisan repère au cordeau pour
enchaîner deux coups de compas. S'il n'y a pas de tangence, la fonction le dit avec l'écart
mesuré au lieu d'en forcer une.

**Ellipse (§25)** : signalée comme plus difficile à reproduire à la main.
`approximateEllipseForSite` remplace l'ellipse par des segments et arcs de cercle raccordés via
le simplificateur du moteur, avec l'écart maximal mesuré.

## Simplification (§19, §20)

Trois niveaux exposés à l'utilisateur, adossés aux tolérances chantier existantes :

| Niveau | Libellé | Tolérance | Mode moteur |
| --- | --- | --- | --- |
| `precis` | Précis | 1 mm | `precise` |
| `standard` | Équilibré | 5 mm | `balanced` |
| `simple` | Chantier | 20 mm | `site` |

`simplifyContourWithReport` renvoie l'écart **réellement mesuré** entre le relevé et la forme
simplifiée (distance de chaque point d'origine au segment le plus proche), pas la tolérance
demandée : « Simplification Équilibré — écart maximal 3,4 mm. » Sur un contour image non
calibré, l'écart reste en pixels et aucune valeur en millimètres n'est affichée.

`contourToConstructionElements` produit la sortie utile au chantier : une suite de segments et
d'arcs de cercle, via `simplifyToConstructionElements` du moteur.

## Symétries et répétition (§26–§29)

- `completeBySymmetry` : l'artisan ne trace qu'une moitié, ELSATIA génère l'autre. La
  demi-figure doit commencer et finir sur l'axe ; les sommets posés sur l'axe ne sont pas
  dédoublés.
- `symmetryDeviation` / `findVerticalSymmetryAxis` : écart de symétrie mesuré, axe proposé.
- `repeatRadially` : un pétale + un centre + un nombre → rosace au pas angulaire exact.
- `proposeCentre` : centre par ajustement de cercle, repli sur l'encombrement, **toujours
  corrigeable** (`editable: true`) ; `manualCentre` prime.
- `createAxis` / `projectOnAxis` / `symmetryFromAxis` : axes horizontal, vertical, personnalisé.

## Mise à l'échelle (§31, §32)

`scaleGeometricShape` redimensionne une géométrie confirmée indépendamment de l'image
(1850 × 1850 mm → 3200 × 3200 mm). Proportions conservées par défaut. En mode non uniforme,
l'avertissement est explicite : « les cercles deviennent des ellipses, les rayons et les points
de tangence changent. »

## Statuts de fiabilité (§35–§37)

`GeometricShape.origin` réutilise les valeurs existantes de `measurement-origin.ts` :
`exact` > `manual` > `calibrated` > `imported` > `approximated`. `describeShapeSource` en donne
le libellé (« Calibré depuis photo », « Approximation », …). `reviewTracingReliability` produit
les réserves affichables :

| Code | Niveau | Déclencheur |
| --- | --- | --- |
| `echelle-non-definie` | erreur | Aucune calibration |
| `calibration-non-controlee` | information | Une seule cote, pas de contrôle |
| `calibration-insuffisante` | avertissement / erreur | Écart mesuré > 2 % / > 5 % |
| `perspective-suspectee` | information / avertissement | Inclinaison mesurée sur le quadrilatère |
| `contour-automatique` / `contour-non-valide` | avertissement | Contour encore en proposition |
| `simplification-ecart` | information | Écart mesuré de la dernière simplification |
| `forme-non-fiable` | avertissement | Forme `imported` ou `approximated` |

`hasBlockingNotice` dit si un dossier peut partir au chantier.

## Persistance (§39, §40)

- Le `TracingProject` ne transporte **jamais** d'octets d'image : seulement un `assetRef`
  opaque. Un test vérifie l'absence de `base64` / `data:image` dans le JSON sérialisé.
- Les blobs vivent dans `asset-store.ts` (IndexedDB `elsatia-atelier-assets`, cloisonnée par
  périmètre `local` / `company:<id>` comme les projets), avec une implémentation mémoire pour
  les tests et `pruneOrphanAssets` pour la purge.
- `validateTracingProject` valide désormais le **contenu** : images de référence, calibration,
  contours, formes. Une calibration corrompue est rejetée ; un contour `detected` marqué
  « confirmed » dans le fichier est ramené à « proposition ».
- Migration douce : un projet antérieur au suivi de traçabilité (§9) ne contient que le facteur
  d'échelle. Il est relu en conservant `mmPerPixel` exactement, les points de calibration étant
  reconstruits sur l'axe X à partir de `pixelDistance`. Aucun bump de `TRACING_PROJECT_SCHEMA_VERSION`
  n'a été nécessaire.
- `serializeTracingProject` écrit ; la RELECTURE passe par `migrateTracingProject`
  (`migration.ts`), frontière tolérante du canon. Il n'existe volontairement pas de second point
  d'entrée de lecture.

**Persistance réelle** : le tracé est enregistré par `repository.ts` (IndexedDB `elsatia-atelier`),
la voie de mutation unique est `touchTracingProject` (`atelier.ts`). Voir
`docs/audits/ELSATIA_TOOLS_IMAGE_VECTORIZATION_CANONICAL_RECONCILIATION_V1.md`.

## Le relevé confirmé devient un tracé libre (§11 de la réconciliation)

`free-conversion.ts` est le seul point de passage entre la photo et le document : une
`GeometricShape` confirmée devient une entité `FreeGeometry` du canon (contour ou polyligne), et
emprunte ensuite exactement les mêmes rails que ce que l'utilisateur aurait dessiné à la main —
édition de sommets, annulation, scène, cotations, SVG / DXF / PDF / PNG / mosaïque / impression.
Aucun export ne connaît la photo.

Trois refus explicites : contour non confirmé (levée en amont), projet portant un `modelId`
(invariant du canon : jamais deux sources de vérité géométrique), relevé dépassant 500 sommets
(refus avec la conduite à tenir, ou réduction sur demande avec l'écart mesuré).

## Annuler / rétablir (§38)

`history.ts` fournit une pile générique bornée (50 étapes par défaut) : `pushHistory`, `undo`,
`redo`, `undoLabel`, `resetHistory`. Purement fonctionnelle, sans couplage React ni Atelier —
l'interface décide de l'état qu'elle historise (points, calibration, simplification, validation).

## Mobile (§41) et performances (§42)

- Toute image est ramenée à `MAX_WORKING_DIMENSION_PX` (2400 px de côté) avant affichage et
  tracé ; l'analyse tourne sur 1,2 Mpx maximum. Une photo 48 Mpx n'alimente jamais un algorithme.
- Redimensionner l'image de travail ne fausse pas les cotes : `rescaleCalibration` /
  `resizeReferenceImage` transportent l'échelle (test dédié).
- `createReferenceObjectUrl` / `revokeReferenceObjectUrl` évitent de retenir une photo en mémoire.
- L'orientation EXIF est demandée au navigateur (`imageOrientation: "from-image"`), avec un
  lecteur de tag JPEG écrit sur place en secours — aucune dépendance ajoutée.

## Vie privée (§44)

Tout le traitement est local. Aucune image n'est envoyée vers un service externe, et aucun
appel réseau n'existe dans ce lot.

## IA future (§45)

L'architecture est prête à recevoir une analyse automatique : `fitGeometry`, `proposeCentre`,
`findVerticalSymmetryAxis` et `detectContour` renvoient déjà des **propositions** portant leur
erreur mesurée, et le passage à `confirmed` est un point de contrôle unique. Aucune IA n'est
simulée aujourd'hui.

## Limitations connues

| Sujet | État | Raison |
| --- | --- | --- |
| HEIC | Refusé avec message | Aucun décodeur sans dépendance native |
| Redressement depuis une seule cote | Refusé | Rapport d'aspect indéterminé sans modèle de caméra |
| Détection sur photo de chantier bruitée | Échoue proprement | Chaîne légère assumée ; le tracé manuel reste la voie fiable |
| Rendu du calque, warp visuel de l'image redressée | Hors lot | Couche interface Atelier (l'homographie et son inverse sont fournies) |
| Recadrage (`crop`) | Modèle + validation seulement | Le rognage effectif des pixels appartient au rendu |
| Branchement `TracingProject` sur `ProjectRepository` | Différé | Frontière du lot Atelier |
| Bibliothèque de modèles utilisateur (§33) | Différé | `GeometricShape` est sérialisable et paramétrable ; l'enregistrement « comme modèle » relève de la bibliothèque Atelier |

## Tests

12 fichiers, 123 tests ajoutés (`apps/tools` : 447 → 570).

`image-import` · `calibration-quality` · `perspective` · `edge-detection` · `fitting` ·
`symmetry` · `vectorization-site` · `reliability` · `history` · `asset-store` · `persistence` ·
`workflow`.

Les trois tests de fiabilité exigés (§49) sont explicites dans `workflow.test.ts` :
une géométrie automatique non confirmée ne devient jamais exacte ; une photo non calibrée ne
fournit jamais de millimètres ; une approximation conserve son statut.
