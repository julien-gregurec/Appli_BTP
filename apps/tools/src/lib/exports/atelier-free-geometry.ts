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
 * repère, et rien d'autre. Aucune surface, aucun métré, aucune nomenclature : un tracé libre
 * ne dit pas ce qu'il représente, et en déduire une quantité serait une invention.
 *
 * L'origine de mesure est `exact` : les coordonnées viennent d'un tracé à l'écran en
 * millimètres, éventuellement accroché à une géométrie exacte — pas d'une image calibrée ni
 * d'un relevé (§28 `measurement-origin.ts`).
 */

import { buildReportTable, type ReportPoint } from "../chantier";
import type { ReportTable } from "../chantier/report-table";
import {
  freeGeometryIsEmpty,
  type FreeEntity,
  type FreeGeometry,
} from "../tracing/free-geometry";
import { freeGeometryToShape } from "../tracing/free-shape";
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
    return {
      geometry: freeGeometryToShape(geometry, { id: `libre-${project.id}`, name: project.name }),
      report: reportTableFromFreeGeometry(geometry),
    };
  } catch {
    // Un tracé qui ne se projette pas ne doit pas faire tomber l'écran d'export : les sections
    // qui en dépendent disparaissent, et le contrôle pré-export dit ce qui manque (§10 du lot
    // d'intégration export).
    return undefined;
  }
}
