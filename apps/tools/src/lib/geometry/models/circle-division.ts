// Modèle réel n°1 (FIRST-FUNCTIONAL-LOT-V1) : division régulière d'un cercle. Remplace le
// démonstrateur purement technique du lot précédent (ENGINE-FOUNDATION-V1 §14) par un modèle
// complet (paramètres, cotes, étapes, explication). Construction mathématique générique —
// aucune référence tierce. Non référencé par catalog.ts : reste interne/preview.
import { assertFinitePositive, boundsFromPoints, divideCircle, point, type Dimension } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

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
  const diameter = assertFinitePositive(input.diameter, "Le diamètre");
  const divisions = input.divisions;
  if (!Number.isInteger(divisions) || divisions < 1 || divisions > 24) throw new Error("Le nombre de divisions doit être un entier entre 1 et 24.");
  const startAngleDegrees = input.startAngle ?? 0;
  if (!Number.isFinite(startAngleDegrees)) throw new Error("L'angle de départ doit être une valeur finie.");
  const startAngleRadians = (startAngleDegrees * Math.PI) / 180;

  const radius = diameter / 2;
  const O = point("O", 0, 0, "Centre O", "center");
  const dividedPoints = divideCircle(O, radius, divisions, startAngleRadians);
  const points = [O, ...dividedPoints];
  const sectorAngle = divisions >= 2 ? 360 / divisions : 0;

  const dimensions: Dimension[] = [
    { id: "dim-radius", kind: "radius", from: O, to: dividedPoints[0], label: `R ${radius} mm`, value: radius, unit: "mm" },
  ];
  if (divisions >= 2) {
    dimensions.push({ id: "dim-sector", kind: "angle", from: dividedPoints[0], to: dividedPoints[1], label: `${sectorAngle}°`, value: sectorAngle, unit: "°" });
  }

  const axisHalfExtent = Math.max(50, radius * 1.15);
  const constructionLines = [
    { id: "axis-x", start: point("axis-x-", -axisHalfExtent, 0), end: point("axis-x+", axisHalfExtent, 0), role: "axis" as const },
    { id: "axis-y", start: point("axis-y-", 0, -axisHalfExtent), end: point("axis-y+", 0, axisHalfExtent), role: "axis" as const },
  ];

  const steps: SiteStep[] = [
    { id: "step-centre", title: "Matérialiser le centre", instruction: "Tracez deux axes perpendiculaires et marquez leur intersection O.", measurements: [], pointIds: ["O"], visibleEntityIds: ["axis-x", "axis-y"] },
    { id: "step-circle", title: "Tracer le cercle directeur", instruction: `Réglez le compas au rayon ${radius} mm et tracez le cercle depuis O.`, measurements: [`${radius} mm`], pointIds: ["O", dividedPoints[0].id], controlId: "control-1", visibleEntityIds: ["axis-x", "axis-y", "circle-main"] },
    {
      id: "step-divide",
      title: "Diviser régulièrement",
      instruction: divisions >= 2 ? `Reportez ${divisions} divisions de ${sectorAngle}° chacune autour de O.` : "Un seul point suffit ici, aucune division angulaire à reporter.",
      measurements: divisions >= 2 ? [`${sectorAngle}°`] : [],
      pointIds: dividedPoints.map((p) => p.id),
      visibleEntityIds: ["axis-x", "axis-y", "circle-main"],
    },
  ];

  const model: TraceModel = {
    id: "circle-division",
    name: "Cercle divisé",
    slug: "circle-division",
    categoryId: "geometry",
    difficulty: "easy",
    tags: ["cercle", "division", "répartition", "spots", "rosace"],
    status: "preview",
    parameters: circleDivisionParameters,
    explanation: circleDivisionExplanation,
    bounds: boundsFromPoints(points, Math.max(50, radius * 0.15)),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [],
    circles: [{ id: "circle-main", centre: O, radius, role: "shape" }],
    ellipses: [],
    constructionLines,
    dimensions,
    controls: dividedPoints.map((item, index) => ({ id: `control-${index + 1}`, label: `Distance O → ${item.id}`, value: radius, unit: "mm" as const, pointIds: ["O", item.id] })),
    quantities: [{ id: "q-sector", label: "Angle entre divisions", value: sectorAngle, unit: "°" as const, quality: "exact" as const }],
    steps,
  };
  return validateTraceModel(model);
}
