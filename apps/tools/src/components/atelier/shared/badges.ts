/**
 * Modèles d'affichage des badges « origine de mesure » et « qualité ».
 *
 * §12 accessibilité : un badge n'est jamais distingué uniquement par la couleur. Chaque
 * badge porte donc un libellé texte explicite, un code court et un glyphe. Rien n'est
 * recalculé : on ne fait que refléter la valeur reçue du backend
 * (`describeOrigin` / `isRealWorldTrusted` de `@/lib/tracing/measurement-origin`,
 * `MaterialQuality` de `@/lib/chantier`).
 */

import {
  describeOrigin,
  isRealWorldTrusted,
  originWarning,
  type MeasurementOrigin,
} from "../../../lib/tracing/measurement-origin";
import type { MaterialQuality } from "../../../lib/chantier";

export type OriginBadgeModel = {
  origin: MeasurementOrigin;
  /** Libellé humain complet, ex. « Saisie manuelle ». */
  label: string;
  /** Code court non ambigu pour l'affichage compact, ex. « MANUEL ». */
  code: string;
  /** Glyphe décoratif (doublé par le texte, jamais seul porteur de sens). */
  glyph: string;
  /** Vrai si la valeur peut être présentée comme une cote chantier réelle. */
  trusted: boolean;
  /** Mention à afficher quand la valeur n'est pas fiable, sinon chaîne vide. */
  warning: string;
};

const ORIGIN_CODES: Record<MeasurementOrigin, string> = {
  exact: "EXACT",
  manual: "MANUEL",
  calibrated: "CALIBRÉ",
  imported: "IMPORTÉ",
  approximated: "APPROX.",
};

const ORIGIN_GLYPHS: Record<MeasurementOrigin, string> = {
  exact: "◆",
  manual: "✎",
  calibrated: "▣",
  imported: "⇩",
  approximated: "≈",
};

export function originBadgeModel(origin: MeasurementOrigin): OriginBadgeModel {
  return {
    origin,
    label: describeOrigin(origin),
    code: ORIGIN_CODES[origin],
    glyph: ORIGIN_GLYPHS[origin],
    trusted: isRealWorldTrusted(origin),
    warning: originWarning(origin),
  };
}

export type QualityBadgeModel = {
  quality: MaterialQuality;
  label: string;
  code: string;
  glyph: string;
};

const QUALITY_LABELS: Record<MaterialQuality, string> = {
  exact: "Exact",
  estimate: "Estimation",
};

const QUALITY_GLYPHS: Record<MaterialQuality, string> = {
  exact: "●",
  estimate: "◐",
};

export function qualityBadgeModel(quality: MaterialQuality): QualityBadgeModel {
  return {
    quality,
    label: QUALITY_LABELS[quality],
    code: quality === "exact" ? "EXACT" : "ESTIM.",
    glyph: QUALITY_GLYPHS[quality],
  };
}
