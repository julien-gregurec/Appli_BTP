// Famille décorative (DECORATIVE-FAMILIES-V1 §4) : fleur à 5 pétales, même principe de
// composition que flower4.ts (divideCircle + cercles de pétale à mi-rayon), généralisé à 5
// directions — la règle géométrique (angle = 360°/N, rayon pétale = R/2) est donc reproductible
// et dérivée, pas cinq pétales dessinés arbitrairement. Aucune primitive nouvelle, aucune
// référence tierce.
import { assertFinitePositive, boundsFromPoints, divideCircle, point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type Flower5Input = { diameter: number; rotation?: number };

export const flower5Parameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre", unit: "mm", min: 100, max: 20000, defaultValue: 1200 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: -90 },
];

const DEFAULT_INPUT: Flower5Input = { diameter: 1200, rotation: -90 };
const PETALS = 5;

export const flower5Explanation: TraceExplanation = {
  objective: "Tracer une fleur à 5 pétales selon une division régulière du cercle en 5 (72° par secteur).",
  usage: "Motif de plafond, gabarit de découpe, marquage décoratif circulaire.",
  materials: ["Compas de chantier ou ficelle + crayon", "Rapporteur pour reporter les angles de 72°"],
  preparation: "Tracez d'abord le cercle directeur avant de chercher les centres de pétales.",
  principle: "Le cercle directeur de rayon R est divisé en 5 points réguliers, écartés de 360°/5 = 72°. Chaque pétale est un cercle de rayon R/2, centré à mi-chemin entre O et chacune des 5 directions — la même règle que pour 4 ou 6 pétales, seul le nombre de divisions change.",
  steps: [
    "Tracer le cercle directeur de rayon R.",
    "Diviser ce cercle en 5 points réguliers, espacés de 72°.",
    "Placer les 5 centres de pétales à R/2 de O, sur chaque direction.",
    "Depuis chaque centre, tracer un cercle de rayon R/2.",
    "Tracer le petit cercle central pour finir le motif.",
  ],
  tips: ["Reportez les 5 divisions avec un rapporteur plutôt qu'à l'œil : une erreur de quelques degrés se voit sur un motif à 5 branches.", "Contrôlez l'angle entre deux directions consécutives avant de tracer les pétales."],
  commonErrors: ["Diviser le cercle en parts visuellement égales sans vérifier les 72° exacts.", "Confondre le rayon du cercle directeur et celui des pétales."],
  finalCheck: "Contrôlez que les 5 centres de pétales sont à la même distance de O et que l'angle entre deux directions consécutives vaut exactement 72°.",
  warnings: ["Une division en 5 est plus sensible aux petites erreurs qu'une division en 4 ou 6 — vérifiez avant de tracer les pétales."],
};

export function createFlower5Geometry(input: Flower5Input = DEFAULT_INPUT): TraceModel {
  const diameter = assertFinitePositive(input.diameter, "Le diamètre");
  const rotationDegrees = input.rotation ?? -90;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");
  const rotationRadians = (rotationDegrees * Math.PI) / 180;

  const outerRadius = diameter / 2;
  const petalRadius = outerRadius / 2;
  const centreRadius = outerRadius - petalRadius;
  const O = point("O", 0, 0, "Centre O", "center");

  const directions = divideCircle(O, outerRadius, PETALS, rotationRadians, "D");
  const petalCentres = divideCircle(O, centreRadius, PETALS, rotationRadians, "C").map((item) => ({ ...item, role: "center" as const }));

  const points = [O, ...directions, ...petalCentres];
  const sectorAngle = 360 / PETALS;
  const axisHalfExtent = Math.max(60, outerRadius * 1.15);

  const petalCircles = petalCentres.map((centre, index) => ({ id: `petal-${index + 1}`, centre, radius: petalRadius, role: "shape" as const }));
  const centralRadius = petalRadius * 0.35;

  const steps: SiteStep[] = [
    { id: "step-outer", title: "Tracer le cercle directeur", instruction: `Tracez le cercle directeur de rayon ${outerRadius} mm.`, measurements: [`${outerRadius} mm`], pointIds: ["O", directions[0].id], visibleEntityIds: ["circle-outer"] },
    { id: "step-divide", title: "Diviser en 5", instruction: `Reportez 5 divisions régulières de ${sectorAngle}° chacune.`, measurements: [`${sectorAngle}°`], pointIds: directions.map((d) => d.id), controlId: "control-sector", visibleEntityIds: ["circle-outer"] },
    { id: "step-centres", title: "Placer les 5 centres de pétales", instruction: `Sur chaque direction, placez un centre à ${petalRadius} mm de O.`, measurements: [`${petalRadius} mm`], pointIds: petalCentres.map((c) => c.id), visibleEntityIds: ["circle-outer", "circle-construction"] },
    { id: "step-petals", title: "Tracer les 5 pétales", instruction: `Depuis chaque centre, tracez un cercle de rayon ${petalRadius} mm.`, measurements: [`${petalRadius} mm`], pointIds: petalCentres.map((c) => c.id), visibleEntityIds: ["circle-outer", "circle-construction", ...petalCircles.map((c) => c.id)] },
    { id: "step-centre-circle", title: "Tracer le centre", instruction: `Terminez avec un petit cercle central de rayon ${Math.round(centralRadius)} mm.`, measurements: [`${Math.round(centralRadius)} mm`], pointIds: ["O"], visibleEntityIds: [...petalCircles.map((c) => c.id), "circle-central"] },
  ];

  const model: TraceModel = {
    id: "flower-5", name: "Fleur 5 pétales", slug: "flower-5", categoryId: "forms-design", difficulty: "intermediate",
    tags: ["fleur", "5 pétales", "radial", "plafond", "décoratif"], status: "preview",
    parameters: flower5Parameters, explanation: flower5Explanation,
    bounds: boundsFromPoints(points, Math.max(60, outerRadius * 0.15)),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [],
    circles: [
      { id: "circle-outer", centre: O, radius: outerRadius, role: "construction" },
      { id: "circle-construction", centre: O, radius: centreRadius, role: "construction" },
      ...petalCircles,
      { id: "circle-central", centre: O, radius: centralRadius, role: "shape" },
    ],
    ellipses: [],
    constructionLines: [{ id: "axis-y", start: point("axis-y-", 0, -axisHalfExtent), end: point("axis-y+", 0, axisHalfExtent), role: "axis" }],
    dimensions: [
      { id: "dim-diameter", kind: "linear", from: directions[0], to: O, label: `R ${outerRadius} mm`, value: outerRadius, unit: "mm" },
      { id: "dim-sector", kind: "angle", from: directions[0], to: directions[1], label: `${sectorAngle}°`, value: sectorAngle, unit: "°" },
    ],
    controls: [
      { id: "control-sector", label: "Angle entre deux directions", value: sectorAngle, unit: "°", pointIds: [directions[0].id, directions[1].id] },
      ...petalCentres.map((item, index) => ({ id: `control-${index + 1}`, label: `Distance O → ${item.id}`, value: centreRadius, unit: "mm" as const, pointIds: ["O", item.id] })),
    ],
    quantities: [
      { id: "q-petal-radius", label: "Rayon de chaque pétale", value: petalRadius, unit: "mm", quality: "exact" },
      { id: "q-sector", label: "Angle entre directions", value: sectorAngle, unit: "°", quality: "exact" },
    ],
    steps,
  };
  return validateTraceModel(model);
}
