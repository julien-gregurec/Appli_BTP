// Famille décorative (DECORATIVE-FAMILIES-V1 §3) : fleur à 4 pétales, construction radiale
// générique par composition de primitives existantes (divideCircle, Circle, point) — aucune
// primitive Petal/Flower ajoutée au moteur. Même relation pétale/centre déjà éprouvée en
// Production par le moteur Pro (pro-engine.ts, fleur-4/5/6/8, mêmes rapports rayon/pétale),
// réimplémentée ici en fonction TraceModel indépendante — jamais un import du moteur commercial,
// pour ne pas mélanger le système de preview interne et le catalogue payant. Construction
// géométrique générale, aucune référence tierce.
import { assertFinitePositive, boundsFromPoints, divideCircle, point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type Flower4Input = { diameter: number; rotation?: number };

export const flower4Parameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre", unit: "mm", min: 100, max: 20000, defaultValue: 1200 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: 0 },
];

const DEFAULT_INPUT: Flower4Input = { diameter: 1200, rotation: 0 };
const PETALS = 4;

export const flower4Explanation: TraceExplanation = {
  objective: "Tracer une fleur à 4 pétales symétriques à partir d'un seul cercle directeur.",
  usage: "Motif de plafond, gabarit de découpe, marquage décoratif d'une trappe ou d'un caisson carré.",
  materials: ["Compas de chantier ou ficelle + crayon", "Équerre pour les deux axes perpendiculaires"],
  preparation: "Tracez d'abord les deux axes perpendiculaires : ils fixent les 4 directions des pétales.",
  principle: "Le cercle directeur de rayon R est divisé en 4 points à 90° (les axes eux-mêmes). Chaque pétale est un cercle de rayon R/2, centré à mi-chemin entre O et chaque direction : il touche O d'un côté et atteint le bord du cercle directeur de l'autre.",
  steps: [
    "Tracer les deux axes perpendiculaires, centrés en O.",
    "Tracer le cercle directeur de rayon R.",
    "Placer les 4 centres de pétales, à R/2 de O sur chaque axe.",
    "Depuis chaque centre, tracer un cercle de rayon R/2 : c'est un pétale.",
    "Tracer le petit cercle central pour finir le motif.",
  ],
  tips: ["Les 4 centres de pétales sont toujours à mi-rayon : pas besoin de recalculer, un simple partage en deux du rayon suffit.", "Contrôlez la symétrie en vérifiant que les pétales opposés sont alignés avec O."],
  commonErrors: ["Centrer un pétale directement sur le cercle directeur au lieu de le placer à mi-rayon.", "Mélanger le rayon du cercle directeur et celui des pétales."],
  finalCheck: "Contrôlez que les 4 centres de pétales sont à la même distance de O (R/2) et que l'angle entre deux directions consécutives est bien de 90°.",
  warnings: ["Vérifiez le tracé avant toute découpe ou peinture définitive."],
};

export function createFlower4Geometry(input: Flower4Input = DEFAULT_INPUT): TraceModel {
  const diameter = assertFinitePositive(input.diameter, "Le diamètre");
  const rotationDegrees = input.rotation ?? 0;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");
  const rotationRadians = (rotationDegrees * Math.PI) / 180;

  const outerRadius = diameter / 2;
  const petalRadius = outerRadius / 2;
  const centreRadius = outerRadius - petalRadius; // = petalRadius, relation identique au moteur Pro déjà validé.
  const O = point("O", 0, 0, "Centre O", "center");

  const directions = divideCircle(O, outerRadius, PETALS, rotationRadians, "D");
  const petalCentres = divideCircle(O, centreRadius, PETALS, rotationRadians, "C").map((item) => ({ ...item, role: "center" as const }));

  const points = [O, ...directions, ...petalCentres];
  const sectorAngle = 360 / PETALS;
  const axisHalfExtent = Math.max(60, outerRadius * 1.15);

  const petalCircles = petalCentres.map((centre, index) => ({ id: `petal-${index + 1}`, centre, radius: petalRadius, role: "shape" as const }));
  const centralRadius = petalRadius * 0.35;

  const steps: SiteStep[] = [
    { id: "step-axes", title: "Tracer les axes", instruction: "Tracez deux axes perpendiculaires, centrés en O.", measurements: [], pointIds: ["O"], visibleEntityIds: ["axis-x", "axis-y"] },
    { id: "step-outer", title: "Tracer le cercle directeur", instruction: `Tracez le cercle directeur de rayon ${outerRadius} mm.`, measurements: [`${outerRadius} mm`], pointIds: ["O", directions[0].id], visibleEntityIds: ["axis-x", "axis-y", "circle-outer"] },
    { id: "step-centres", title: "Placer les 4 centres de pétales", instruction: `Sur chaque axe, placez un centre à ${petalRadius} mm de O.`, measurements: [`${petalRadius} mm`], pointIds: petalCentres.map((c) => c.id), controlId: "control-1", visibleEntityIds: ["axis-x", "axis-y", "circle-outer", "circle-construction"] },
    { id: "step-petals", title: "Tracer les 4 pétales", instruction: `Depuis chaque centre, tracez un cercle de rayon ${petalRadius} mm.`, measurements: [`${petalRadius} mm`], pointIds: petalCentres.map((c) => c.id), visibleEntityIds: ["circle-outer", "circle-construction", ...petalCircles.map((c) => c.id)] },
    { id: "step-centre-circle", title: "Tracer le centre", instruction: `Terminez avec un petit cercle central de rayon ${Math.round(centralRadius)} mm.`, measurements: [`${Math.round(centralRadius)} mm`], pointIds: ["O"], visibleEntityIds: [...petalCircles.map((c) => c.id), "circle-central"] },
  ];

  const model: TraceModel = {
    id: "flower-4", name: "Fleur 4 pétales", slug: "flower-4", categoryId: "forms-design", difficulty: "easy",
    tags: ["fleur", "4 pétales", "radial", "plafond", "décoratif"], status: "preview",
    parameters: flower4Parameters, explanation: flower4Explanation,
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
    constructionLines: [
      { id: "axis-x", start: point("axis-x-", -axisHalfExtent, 0), end: point("axis-x+", axisHalfExtent, 0), role: "axis" },
      { id: "axis-y", start: point("axis-y-", 0, -axisHalfExtent), end: point("axis-y+", 0, axisHalfExtent), role: "axis" },
    ],
    dimensions: [
      { id: "dim-diameter", kind: "diameter", from: directions[0], to: directions[2], label: `Ø ${diameter} mm`, value: diameter, unit: "mm" },
      { id: "dim-sector", kind: "angle", from: directions[0], to: directions[1], label: `${sectorAngle}°`, value: sectorAngle, unit: "°" },
    ],
    controls: petalCentres.map((item, index) => ({ id: `control-${index + 1}`, label: `Distance O → ${item.id}`, value: centreRadius, unit: "mm" as const, pointIds: ["O", item.id] })),
    quantities: [
      { id: "q-petal-radius", label: "Rayon de chaque pétale", value: petalRadius, unit: "mm", quality: "exact" },
      { id: "q-sector", label: "Angle entre directions", value: sectorAngle, unit: "°", quality: "exact" },
    ],
    steps,
  };
  return validateTraceModel(model);
}
