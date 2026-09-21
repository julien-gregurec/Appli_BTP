# ELSATIA Tools — Recette utilisateur interne — Scénarios A / B / C

Branche : `integration/tools-tracing-v1`. Date : 2026-09-05.
Portée : recette **interne** (logique métier + export), pas de parcours commercial complet
(l'UI Atelier reste à `/outils/traces-preview`, interne et noindex).

Suite exécutable : `apps/tools/src/lib/recette/scenarios-abc.test.ts` — **22 assertions, 22 vertes**.
Exécutée via les fonctions réelles de la branche (aucun mock). Suite `apps/tools` complète
après ajout : **447/447** (68 fichiers), typecheck ✅, lint ✅.

---

## Scénario A — Plaquiste : pièce 5000 × 4000 mm, rosace 6 pétales Ø 2400

| # | Critère (§50) | Vérification | Résultat |
|---|---|---|---|
| A1 | Créer la pièce / choisir la rosace / mettre 2400 | `createRosetteGeometry({ diameter: 2400 })` → modèle `rosette-6` valide, repère mm, rayon directeur **1200 mm** exact | ✅ |
| A2 | Lire les rayons | 6 centres secondaires, chacun **exactement 1200 mm** de O (écart < 1e-6) | ✅ |
| A3 | Afficher la construction | entraxe **60°**, 6 cercles `petal-*` | ✅ |
| A4 | Lire les points | 6 pointes de pétales à **R·√3 = 2078,46 mm** de O (propriété exacte du triangle équilatéral, `quality:"exact"`) | ✅ |
| A5 | Centrer | O = (0,0), `bounds` symétriques (`minX = -maxX`, `minY = -maxY`) → motif centré par construction | ✅ |
| A6 | Suivre le pas-à-pas | 4 étapes, chaque `pointIds` d'étape référence un point réel du modèle (pas de texte orphelin) | ✅ |
| A7 | Lire les points de report | tous X/Y finis ; C1 = (1200, 0) à rotation 0 | ✅ |
| A8 | Exporter PDF | `exportProjectPdf()` → **PDF 1.3, 2 pages, 6726 octets**, en-tête `%PDF-`, `/Type /Page` ≥ 2 ; écrit sur disque | ✅ |

### Observation UX (non bloquante) — libellé « diamètre directeur »

Le paramètre **« Diamètre directeur » = 2400 mm** est le **cercle de construction**, pas
l'encombrement du motif fini. L'enveloppe réelle pointe-à-pointe vaut **2·R·√3 ≈ 4157 mm** :
- tient en largeur (pièce 5000) ✅
- **dépasse la profondeur** (pièce 4000) ⚠️

Un plaquiste qui saisit « 2400 » en pensant « rosace de 2,40 m visible » obtient un motif de
**4,16 m** qui ne rentre pas dans la profondeur de 4 m. À traiter dans l'Atelier commercial :
soit renommer le paramètre (« diamètre du cercle de construction »), soit afficher aussi
l'encombrement calculé, soit proposer une saisie « encombrement cible » qui déduit R.

### Limite connue — déclenchement du PDF depuis l'UI

`exportProjectPdf()` fonctionne sur la géométrie d'un `TraceModel` (prouvé ci-dessus), mais
**aucun bouton de `/outils/traces-preview` ne l'appelle** : le branchement UI fait partie de
l'Atelier commercial différé. En recette interne, l'export se déclenche par la fonction, pas
par un clic.

---

## Scénario B — Photo d'un motif : import → calibration → mesure → enregistrement

| # | Critère (§50 / §16) | Vérification | Résultat |
|---|---|---|---|
| B1 | Aucune mesure réelle sans échelle | `pixelsToMillimetres(UNDEFINED_CALIBRATION, …)` **lève** « Échelle non définie » ; idem `millimetresToPixels` ; libellé « Échelle non définie » | ✅ |
| B2 | Cas connu : 2 points à 500 px = **2000 mm** réels | `computeCalibration` → `pixelDistance = 500`, `realDistanceMm = 2000`, **`mmPerPixel = 4`** ; libellé « Échelle calibrée » | ✅ |
| B3 | Vérification mathématique d'une **autre** distance | 750 px → **3000 mm** ; 125 px → 500 mm ; 1600 mm → 400 px ; aller-retour px↔mm exact | ✅ |
| B4 | L'unité réelle est prise en compte | `realDistance: 2, realUnit: "m"` ≡ `2000 mm` (même `mmPerPixel`) | ✅ |
| B5 | Données invalides | 2 points de calibration confondus → **erreur explicite** « points … distincts » | ✅ |
| B6 | Repère image (Y bas) → repère chantier (Y haut) | `pixelPointToMillimetres(cal, {x:50,y:20}, imageHeightPx:200)` → (500 mm, 1800 mm) (Y inversé via la hauteur image) | ✅ |
| B7 | Enregistrer / rouvrir | `createTracingProject` → `scaleStatus:"undefined"` (pas encore calibré) ; `JSON` round-trip → `validateTracingProject` rend un objet **identique** (aucune perte) | ✅ |

### Limites connues (différées, documentées)

- Pas de décodage d'image ni de `<canvas>` : `reference-image.ts` est en fonctions pures.
  Le choix des 2 points de calibration se fait dans l'UI Atelier (à faire).
- Pas de détection automatique de contour (CV). HEIC reconnu mais **non supporté**
  (`isSupportedFormat("heic") === false`).
- Persistance `TracingProject` (IndexedDB + sync) non branchée : le modèle et `migrateProject`
  sont prêts, le round-trip mémoire est prouvé (B7), l'écriture disque/DB reste à intégrer.

---

## Scénario C — Gorge LED périmétrique : contour → offset → longueur → marge → quantité

Contour d'essai : rectangle fermé **3000 × 2000 mm** (périmètre 10 000 mm).

| # | Critère (§50 / §23 / §24) | Vérification | Résultat |
|---|---|---|---|
| C1 | Définir le contour | `polylineLength` du contour fermé = **10 000 mm** | ✅ |
| C2 | Définir l'offset | `offsetPolyline(contour, 50)` vers l'intérieur → 2900 × 1900, périmètre **9600 mm** | ✅ |
| C3 | Offset impossible | `offsetPolyline(contour, 1500)` (> demi-largeur) → **erreur explicite**, jamais de faux contour | ✅ |
| C4 | Appliquer la marge | `applyMargin(9600, 10 %)` → marge 960, total **10 560 mm** | ✅ |
| C5 | Contrôle canonique §24 | `applyMargin(10 000, 10 %)` = **11 000 mm** (10 m + 10 % = 11 m) | ✅ |
| C6 | Quantité indicative | `planLed({ segments:[9600], margin:10 %, rollLengthMm:5000 })` → **3 rouleaux**, 15 000 mm commandés, **4440 mm de chute**, 0 rupture | ✅ |
| C7 | Pas de sous-estimation | 10 001 mm / rouleau 5000 → **3 rouleaux** (plafond arithmétique, jamais arrondi au inférieur) | ✅ |

### Note

`planLed` applique lui-même la marge au total avant de calculer les rouleaux : ne pas
appliquer `applyMargin` deux fois. La chute (`wasteMm`) est explicite pour le devis.

---

## Synthèse

| Scénario | Assertions | État |
|---|---|---|
| A — rosace paramétrique + PDF | 8 | ✅ |
| B — calibration image + mesure + save | 7 | ✅ |
| C — gorge LED offset + marge + quantité | 7 | ✅ |
| **Total** | **22** | **✅ 22/22** |

**Verdict recette interne : GO**, avec les réserves documentées :
1. Observation UX « diamètre directeur » ≠ encombrement du motif (Scénario A) — à traiter dans l'Atelier.
2. Déclenchement du PDF et choix des points de calibration : par fonction, pas encore par l'UI.
3. Persistance projet, décodage image, CV contour, HEIC, PDF chantier multipage, gabarit 1:1
   imprimé : différés, non exposés comme boutons.

Artefact produit : `recette_A_rosace_2400.pdf` (PDF 1.3, 2 pages) — plan coté + résultats +
points de construction + étapes chantier de la rosace Ø 2400.
