/**
 * ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §6/§7 — raccord entre le modèle résolu par Engine B et
 * l'adaptateur d'export (`ResolvedAtelierGeometry`).
 *
 * Ce module ne calcule aucune géométrie et n'en corrige aucune. Il se contente de :
 *   - présenter le `TraceModel` résolu comme la `ShapeGeometry` de l'export (c'en est une :
 *     `TraceModel extends ShapeGeometry`) ;
 *   - construire la table de report via `buildReportTable`, seul juge de ce calcul, à partir
 *     des points nommés du modèle et de son repère.
 *
 * Rien n'est fabriqué quand la résolution échoue : `undefined` remonte, et l'export retombe
 * sur le tracé manuel/photo du projet exactement comme avant ce lot (§3 : jamais inventer
 * une donnée manquante).
 */

import { buildReportTable, type ReportPoint } from "../chantier";
import type { ReportTable } from "../chantier/report-table";
import type { TraceModel } from "../geometry/trace-model";
import type { ResolvedAtelierGeometry } from "./atelier-export-adapter";
import type { TracingModelResolution } from "../tracing/model-resolver";

/**
 * Points de report d'un modèle : ses points nommés, dans l'ordre publié par le générateur.
 * Le libellé affiché est celui du modèle (`label`), à défaut son identifiant — jamais un
 * nom inventé.
 */
export function reportPointsFromModel(model: TraceModel): ReportPoint[] {
  return model.points.map((point) => ({ label: point.label ?? point.id, point: { x: point.x, y: point.y } }));
}

/**
 * Table de report d'un modèle résolu. Origine = origine du repère du modèle ; l'origine de
 * mesure est `exact` car la valeur vient d'une construction géométrique, pas d'une image ni
 * d'une saisie (§28 `measurement-origin.ts`).
 */
export function reportTableFromModel(model: TraceModel): ReportTable | undefined {
  const points = reportPointsFromModel(model);
  if (!points.length) return undefined;
  const origin = model.referenceFrame.origin;
  try {
    return buildReportTable(points, {
      origin: { x: origin.x, y: origin.y },
      originLabel: origin.label ?? origin.id,
      measurementOrigin: "exact",
    });
  } catch {
    return undefined;
  }
}

/**
 * Projette une résolution de modèle vers les entrées que `tracingProjectToChantierExportDocument`
 * ne peut pas déduire du projet seul. `undefined` tant que le modèle n'est pas résolu.
 */
export function resolvedAtelierGeometry(resolution: TracingModelResolution): ResolvedAtelierGeometry | undefined {
  if (resolution.status !== "resolved") return undefined;
  return { geometry: resolution.model, report: reportTableFromModel(resolution.model) };
}
