/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §11 — raccord entre le tracé libre et l'export.
 *
 * Jumeau de `atelier-resolved-geometry.ts`, qui fait le même travail pour un modèle résolu par
 * Engine B. Les deux produisent une `ResolvedAtelierGeometry`, et l'adaptateur d'export
 * (`tracingProjectToChantierExportDocument`) ne fait aucune différence entre elles : c'est ce
 * qui branche le tracé libre sur SVG, DXF, PNG et PDF sans toucher une ligne du pipeline (§11).
 *
 * Les deux ne peuvent jamais s'appliquer au même projet (§2 : une seule source géométrique),
 * donc l'appelant les enchaîne sans arbitrage à écrire — celui qui n'a rien à dire répond
 * `undefined`.
 *
 * ## Ce que le report affiche, et ce qu'il n'invente pas
 *
 * §11 est explicite : « ne pas inventer de quantités », « points/segments/longueurs simples ».
 * La table de report reprend donc les SOMMETS réellement tracés, cotés depuis l'origine du
 * repère, et rien d'autre.
 *
 * ATELIER-FREE-CONTOUR-AREA-V1 §14 déplace exactement une chose dans cette règle, et il vaut la
 * peine de dire laquelle. Un tracé libre continue de ne pas dire ce qu'il REPRÉSENTE : rien ici
 * ne déduit un matériau, une chute, un prix, un nombre de plaques ou un volume. Mais un contour
 * FERMÉ dit quelque chose qu'une polyligne ouverte ne disait pas — l'aire qu'il enferme et le
 * périmètre qu'il développe sont des propriétés de la forme elle-même, démontrées par ses
 * sommets et par rien d'autre. Ces deux-là sont donc publiées ; tout le reste demeure une
 * invention, et demeure exclu.
 *
 * L'origine de mesure est `exact` : les coordonnées viennent d'un tracé à l'écran en
 * millimètres, éventuellement accroché à une géométrie exacte — pas d'une image calibrée ni
 * d'un relevé (§28 `measurement-origin.ts`).
 */

import { buildReportTable, nomenclatureFromQuantities, type ReportPoint } from "../chantier";
import type { MaterialLine } from "../chantier/nomenclature";
import type { ReportTable } from "../chantier/report-table";
import {
  freeGeometryIsEmpty,
  type FreeEntity,
  type FreeGeometry,
} from "../tracing/free-geometry";
import { freeGeometryToShape } from "../tracing/free-shape";
import type { Quantity } from "../geometry/shape-model";
import type { TracingProject } from "../tracing/project";
import type { ResolvedAtelierGeometry } from "./atelier-export-adapter";

/**
 * Libellé d'un sommet dans la table de report.
 *
 * Un point isolé porte son propre identifiant, qui suffit ; un sommet de segment ou de
 * polyligne porte celui de son entité et son rang, sans quoi deux lignes de la table seraient
 * indiscernables au moment de reporter les cotes au mur.
 */
function vertexLabel(entity: FreeEntity, index: number): string {
  if (entity.kind === "point") return entity.id;
  if (entity.kind === "segment") return `${entity.id}·${index === 0 ? "A" : "B"}`;
  // ATELIER-FREE-CONTOUR-AREA-V1 §13 — un sommet de contour se numérote comme un sommet de
  // polyligne, et le premier n'est pas répété en fin de table : la table de report se lit dans
  // l'ordre où l'on reporte les cotes au mur, et l'on ne repointe pas deux fois le même
  // repère. La fermeture est déjà dite par la nature de l'entité, pas par une ligne en double.
  return `${entity.id}·${index + 1}`;
}

/** §11 — points de report du tracé libre, dans l'ordre où ils ont été tracés. */
export function reportPointsFromFreeGeometry(geometry: FreeGeometry): ReportPoint[] {
  const points: ReportPoint[] = [];
  for (const entity of geometry.entities) {
    entity.points.forEach((vertex, index) => {
      points.push({ label: vertexLabel(entity, index), point: { x: vertex.x, y: vertex.y } });
    });
  }
  return points;
}

/** Table de report d'un tracé libre — `undefined` s'il ne porte aucun sommet. */
export function reportTableFromFreeGeometry(geometry: FreeGeometry): ReportTable | undefined {
  const points = reportPointsFromFreeGeometry(geometry);
  if (!points.length) return undefined;
  try {
    return buildReportTable(points, {
      // Origine du repère du tracé libre : l'origine monde. C'est celle que le viewport
      // affiche et celle depuis laquelle les sommets ont été posés — en changer ici ferait
      // lire des cotes qui ne correspondent à rien de ce que l'utilisateur a vu.
      origin: { x: 0, y: 0 },
      originLabel: "O",
      measurementOrigin: "exact",
    });
  } catch {
    return undefined;
  }
}

/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §14 — quantités de contour en lignes de métré, ou `undefined`.
 *
 * `nomenclatureFromQuantities` est l'adaptateur qui existait déjà pour les quantités publiées
 * par une `ShapeGeometry` du moteur : les contours libres empruntent le même chemin, donc les
 * mêmes unités (`ml`, `m²`), le même arrondi et le même badge de qualité. Écrire un second
 * convertisseur pour la voie libre aurait produit deux façons d'arrondir un mètre carré.
 *
 * Ce qui en sort ne porte AUCUNE hypothèse de matière : ni chute, ni prix, ni nombre de
 * plaques, ni volume. Une désignation, une quantité, une unité — ce que la géométrie démontre,
 * et rien de plus (§14).
 */
function contourNomenclature(quantities: readonly Quantity[]): readonly MaterialLine[] | undefined {
  if (!quantities.length) return undefined;
  try {
    const lines = nomenclatureFromQuantities(quantities);
    return lines.length ? lines : undefined;
  } catch {
    // Une quantité irrecevable ne doit pas emporter le plan : la géométrie et le report
    // partent quand même, et c'est la seule section qui manque.
    return undefined;
  }
}

/**
 * Projette le tracé libre d'un projet vers les entrées d'export. `undefined` quand le projet
 * n'est pas en mode tracé libre — l'export retombe alors sur le chemin paramétrique ou sur le
 * tracé manuel/photo, exactement comme avant ce lot (§3 du bridge : ne jamais inventer une
 * donnée manquante).
 */
export function freeAtelierGeometry(
  project: Pick<TracingProject, "id" | "name" | "freeGeometry">,
): ResolvedAtelierGeometry | undefined {
  const geometry = project.freeGeometry;
  if (freeGeometryIsEmpty(geometry) || !geometry) return undefined;
  try {
    // §14 — `quantities: true` : c'est ICI, une fois par document, que le coût du statut des
    // contours est payé. Le viewport, lui, ne le paie à aucune trame (cf. `FreeShapeOptions`).
    const shape = freeGeometryToShape(geometry, {
      id: `libre-${project.id}`,
      name: project.name,
      quantities: true,
    });
    return {
      geometry: shape,
      report: reportTableFromFreeGeometry(geometry),
      nomenclature: contourNomenclature(shape.quantities),
    };
  } catch {
    // Un tracé qui ne se projette pas ne doit pas faire tomber l'écran d'export : les sections
    // qui en dépendent disparaissent, et le contrôle pré-export dit ce qui manque (§10 du lot
    // d'intégration export).
    return undefined;
  }
}
