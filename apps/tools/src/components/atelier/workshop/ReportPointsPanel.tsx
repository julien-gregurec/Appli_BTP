/**
 * §14 — points de report.
 *
 * Aucune coordonnée n'est produite ici : les points sont ceux du modèle
 * (`reportPointsFromModel`) et la table est calculée par `buildReportTable`, seul juge de ce
 * calcul, via le composant `ReportTableView` déjà en place. L'origine est celle du repère du
 * modèle, et l'origine de mesure est `exact` parce que la valeur vient d'une construction
 * géométrique — jamais d'une photo ni d'une saisie.
 */

import type { TraceModel } from "@/lib/geometry/trace-model";
import { reportPointsFromModel } from "@/lib/exports/atelier-resolved-geometry";
import { ReportTableView } from "../report/ReportTableView";
import styles from "./workshop.module.css";

export function ReportPointsPanel({ model }: { model: TraceModel }) {
  const points = reportPointsFromModel(model);
  if (points.length === 0) {
    return <p className={styles.empty}>Ce modèle ne publie aucun point nommé à reporter.</p>;
  }

  const origin = model.referenceFrame.origin;
  return (
    <ReportTableView
      points={points}
      origin={{ x: origin.x, y: origin.y }}
      originLabel={origin.label ?? origin.id}
      measurementOrigin="exact"
      caption={`Points de report — ${model.name}`}
    />
  );
}
