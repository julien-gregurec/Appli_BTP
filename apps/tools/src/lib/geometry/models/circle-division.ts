// Modèle réel n°1 (FIRST-FUNCTIONAL-LOT-V1) : division régulière d'un cercle.
//
// C4-LOT1-V1 — Migré vers Engine B : la géométrie (centre, cercle directeur, axes, points de
// division, étapes) provient exclusivement de `engine/circle-division.ts::createCircleDivision`.
// Reste géométriquement un cercle marqué de points — jamais un polygone (§3) : aucun segment de
// contour, aucun polygone dans les primitives Engine B de ce générateur.
import { createAngleDimension, createDiameterDimension, createRadiusDimension } from "../engine/dimensions";
import { createCircleDivision } from "../engine/circle-division";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type CircleDivisionInput = { diameter: number; divisions: number; startAngle?: number };

export const circleDivisionParameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre", unit: "mm", min: 10, max: 20000, defaultValue: 2000 },
  { id: "divisions", label: "Nombre de divisions", min: 1, max: 24, step: 1, defaultValue: 6 },
  { id: "startAngle", label: "Angle de départ", unit: "°", min: -360, max: 360, step: 1, defaultValue: 0 },
];

const DEFAULT_INPUT: CircleDivisionInput = { diameter: 2000, divisions: 6, startAngle: 0 };

export const circleDivisionExplanation: TraceExplanation = {
  objective: "Répartir un nombre exact de points autour d'un même centre, à intervalles angulaires égaux.",
  usage: "Spots de plafond, ancrages de rosace, implantation de poteaux circulaires, perçages régulièrement espacés.",
  materials: ["Mètre laser ou décamètre", "Compas de chantier ou ficelle + crayon", "Rapporteur ou équerre à 45°/60° selon le nombre de divisions", "Niveau laser croix pour les axes"],
  preparation: "Dégagez l'aire de traçage et repérez l'emplacement du centre avant toute mesure.",
  principle: "Un cercle complet mesure 360°. En le divisant en N parts égales, l'écart angulaire entre deux points consécutifs vaut toujours 360° / N — c'est cette seule formule qui gouverne tout le tracé.",
  steps: [
    "Matérialiser le centre O à l'intersection de deux axes perpendiculaires.",
    "Régler le compas au rayon exact (diamètre ÷ 2) et tracer le cercle directeur.",
    "Reporter l'angle de départ puis les divisions régulières autour de O.",
  ],
  tips: ["Vérifiez le réglage du compas sur deux points opposés avant de tracer tout le cercle.", "Pour un nombre de divisions pair, les points opposés doivent être parfaitement alignés avec O — un bon contrôle rapide."],
  commonErrors: ["Déplacer légèrement le centre entre deux mesures, ce qui décale tous les points suivants.", "Confondre le rayon et le diamètre saisi."],
  finalCheck: "Contrôlez que chaque point est bien à la même distance du centre (rayon) et que l'angle entre deux points consécutifs correspond à la valeur annoncée.",
  warnings: ["Un tracé au sol ou au plafond doit être vérifié avant perçage ou fixation définitive."],
};

export function createCircleDivisionGeometry(input: CircleDivisionInput = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI vers Engine B.
  const diameter = input.diameter;
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error("Le diamètre doit être supérieur à 0.");
  const divisions = input.divisions;
  if (!Number.isInteger(divisions) || divisions < 1 || divisions > 24) throw new Error("Le nombre de divisions doit être un entier entre 1 et 24.");
  const startAngleDegrees = input.startAngle ?? 0;
  if (!Number.isFinite(startAngleDegrees)) throw new Error("L'angle de départ doit être une valeur finie.");

  const radius = diameter / 2;

  // 2. Géométrie : exclusivement Engine B.
  const shape = createCircleDivision({ divisions, radius, startAngleDegrees });

  // 3. Cotations : moteur de cotation Engine B.
  const directorCircle = shape.primitives.circles[0];
  const O = shape.primitives.points.O;
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-diameter", `Ø ${diameter} mm`, createDiameterDimension(directorCircle)),
    dimensionResultToDimension("dim-radius", `R ${radius} mm`, createRadiusDimension(directorCircle)),
  ];
  if (divisions >= 2) {
    dimensions.push(
      dimensionResultToDimension("dim-sector", `${Number((360 / divisions).toFixed(2))}°`, createAngleDimension(O, shape.primitives.points.P1, shape.primitives.points.P2)),
    );
  }

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "circle-division",
    name: "Cercle divisé",
    slug: "circle-division",
    categoryId: "geometry",
    difficulty: "easy",
    tags: ["cercle", "division", "répartition", "spots", "rosace"],
    status: "preview",
    parameters: circleDivisionParameters,
    explanation: circleDivisionExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
