/**
 * §35, §36, §37 — Annotations de fiabilité et avertissements.
 *
 * Principe directeur du lot : ELSATIA ne transforme jamais une photo imprécise en fausse
 * géométrie certifiée. Chaque réserve listée ici s'appuie sur un fait vérifiable de l'état
 * (échelle absente, contour non confirmé, écart mesuré), jamais sur un score inventé (§36).
 */

import { describeOrigin, isRealWorldTrusted } from "./measurement-origin";
import { isCalibrated, type CalibrationState } from "./reference-image";
import type { PerspectiveAssessment } from "./perspective";
import type { GeometricShape, RawContour } from "./vectorization";

export type ReliabilityLevel = "erreur" | "avertissement" | "information";

export type ReliabilityNotice = {
  code:
    | "echelle-non-definie"
    | "calibration-non-controlee"
    | "calibration-insuffisante"
    | "perspective-suspectee"
    | "contour-non-valide"
    | "contour-automatique"
    | "simplification-ecart"
    | "forme-non-fiable";
  level: ReliabilityLevel;
  title: string;
  detail: string;
};

export type ReliabilityInput = {
  calibration: CalibrationState;
  perspective?: PerspectiveAssessment;
  contours?: readonly RawContour[];
  shapes?: readonly GeometricShape[];
  /** Écart maximal mesuré de la dernière simplification, en millimètres. */
  simplificationMaxDeviationMm?: number;
};

/**
 * Construit la liste des réserves à afficher au-dessus du tracé. Une liste vide signifie
 * seulement qu'aucune réserve **détectable** ne subsiste — jamais que le relevé est certifié.
 */
export function reviewTracingReliability(input: ReliabilityInput): ReliabilityNotice[] {
  const notices: ReliabilityNotice[] = [];

  if (!isCalibrated(input.calibration)) {
    notices.push({
      code: "echelle-non-definie",
      level: "erreur",
      title: "Photo non calibrée",
      detail: "Aucune mesure réelle disponible. Renseignez une distance connue sur l'image avant toute cotation.",
    });
  } else if (!input.calibration.check) {
    notices.push({
      code: "calibration-non-controlee",
      level: "information",
      title: "Calibration non contrôlée",
      detail: "L'échelle repose sur une seule cote. Mesurez une deuxième cote connue pour vérifier l'écart.",
    });
  } else if (input.calibration.check.quality === "insuffisant" || input.calibration.check.quality === "moyen") {
    notices.push({
      code: "calibration-insuffisante",
      level: input.calibration.check.quality === "insuffisant" ? "erreur" : "avertissement",
      title: `Qualité de calibration : ${input.calibration.check.quality}`,
      detail: `Écart mesuré de ${format(input.calibration.check.deviationMm)} mm (${input.calibration.check.errorPercent.toFixed(2)} %) sur la cote de contrôle. Reprenez la calibration ou redressez la photo.`,
    });
  }

  if (input.perspective && input.perspective.severity !== "aucune") {
    notices.push({
      code: "perspective-suspectee",
      level: input.perspective.severity === "forte" ? "avertissement" : "information",
      title: "Perspective détectée",
      detail: `${input.perspective.warning} Écart mesuré entre côtés opposés : ${input.perspective.oppositeSideRatioPercent.toFixed(1)} %.`,
    });
  }

  const unconfirmed = (input.contours ?? []).filter((contour) => contour.status !== "confirmed");
  if (unconfirmed.length) {
    const detected = unconfirmed.filter((contour) => contour.source === "detected").length;
    notices.push({
      code: detected > 0 ? "contour-automatique" : "contour-non-valide",
      level: "avertissement",
      title: detected > 0 ? "Contour automatique" : "Contour non validé",
      detail: `${unconfirmed.length} contour(s) encore à l'état de proposition. À valider avant utilisation.`,
    });
  }

  if (input.simplificationMaxDeviationMm !== undefined && Number.isFinite(input.simplificationMaxDeviationMm)) {
    notices.push({
      code: "simplification-ecart",
      level: "information",
      title: "Simplification",
      detail: `Écart maximal ${format(input.simplificationMaxDeviationMm)} mm entre le relevé et la forme simplifiée.`,
    });
  }

  const unreliable = (input.shapes ?? []).filter((shape) => !isRealWorldTrusted(shape.origin));
  if (unreliable.length) {
    notices.push({
      code: "forme-non-fiable",
      level: "avertissement",
      title: "Formes indicatives",
      detail: `${unreliable.length} forme(s) d'origine « ${describeOrigin(unreliable[0].origin)} » : valeurs indicatives, à vérifier sur le chantier.`,
    });
  }

  return notices;
}

/** Vrai s'il reste une réserve bloquante : rien ne doit partir au chantier dans cet état. */
export function hasBlockingNotice(notices: readonly ReliabilityNotice[]): boolean {
  return notices.some((notice) => notice.level === "erreur");
}

function format(value: number): number {
  return Math.round(Math.abs(value) * 10) / 10;
}
