/**
 * ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §10 — projection d'une `TracingModelResolution` vers
 * ce qu'un écran doit afficher. Fonction pure et testable : le composant ne décide rien.
 *
 * Chaque état de résolution a une sortie — il n'existe aucun chemin qui rende « rien »
 * silencieusement, ni qui laisse une exception remonter jusqu'au rendu.
 */

import type { TracingModelResolution } from "../../../lib/tracing/model-resolver";

export type ModelResolutionTone = "ok" | "neutral" | "warning" | "error";

export type ModelResolutionViewModel = {
  tone: ModelResolutionTone;
  title: string;
  /** Explication principale — toujours renseignée. */
  message: string;
  /** Détails à lister (paramètres fautifs, avertissements). Peut être vide. */
  details: string[];
  /** Résumé « paramètre = valeur » du modèle réellement calculé, si résolu. */
  parameterSummary: { id: string; label: string; value: number; unit?: string; overridden: boolean }[];
  /** Vrai si l'export peut s'appuyer sur la géométrie du modèle. */
  geometryAvailable: boolean;
};

export function buildModelResolutionViewModel(resolution: TracingModelResolution): ModelResolutionViewModel {
  switch (resolution.status) {
    case "resolved": {
      const parameterSummary = resolution.parameters.map((parameter) => ({
        id: parameter.id,
        label: parameter.label,
        value: resolution.params[parameter.id],
        unit: parameter.unit,
        overridden: Object.prototype.hasOwnProperty.call(resolution.overrides, parameter.id),
      }));
      const details = resolution.warnings.map((warning) => warning.message);
      return {
        tone: details.length ? "warning" : "ok",
        title: resolution.label,
        message: "Géométrie calculée par le moteur à partir des paramètres de ce tracé.",
        details,
        parameterSummary,
        geometryAvailable: true,
      };
    }
    case "none":
      return {
        tone: "neutral",
        title: "Aucun modèle",
        message: "Ce tracé n’a pas de modèle de départ. L’export utilise le tracé manuel ou photo s’il en existe un.",
        details: [],
        parameterSummary: [],
        geometryAvailable: false,
      };
    case "unknown-model":
      return {
        tone: "error",
        title: "Modèle introuvable",
        message: resolution.message,
        details: ["Choisissez un modèle disponible depuis « Reprendre » pour retrouver la géométrie."],
        parameterSummary: [],
        geometryAvailable: false,
      };
    case "invalid-params":
      return {
        tone: "error",
        title: `${resolution.label} — paramètres invalides`,
        message: resolution.message,
        details: resolution.issues.map((issue) => issue.message),
        parameterSummary: [],
        geometryAvailable: false,
      };
    case "failed":
      return {
        tone: "error",
        title: `${resolution.label} — calcul impossible`,
        message: resolution.message,
        details: [],
        parameterSummary: [],
        geometryAvailable: false,
      };
  }
}
