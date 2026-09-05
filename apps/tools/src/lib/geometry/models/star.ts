// Modèle réel n°2 (FIRST-FUNCTIONAL-LOT-V1) : étoile régulière à 5 branches, construction
// paramétrique originale ELSATIA (2 cercles directeurs + polygone à sommets alternés). Aucune
// référence tierce, aucune image. Non référencé par catalog.ts : reste interne/preview.
import { assertFinitePositive, boundsFromPoints, divideCircle, point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type StarInput = { outerDiameter: number; innerRatio: number; rotation?: number };

export const starParameters: readonly TraceParameter[] = [
  { id: "outerDiameter", label: "Diamètre extérieur", unit: "mm", min: 100, max: 20000, defaultValue: 2000 },
  { id: "innerRatio", label: "Ratio rayon intérieur / extérieur", unit: "ratio", min: 0.05, max: 0.95, step: 0.01, defaultValue: 0.4 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: -90 },
];

const DEFAULT_INPUT: StarInput = { outerDiameter: 2000, innerRatio: 0.4, rotation: -90 };
const BRANCHES = 5;

export const starExplanation: TraceExplanation = {
  objective: "Tracer une étoile régulière à 5 branches, symétrique, à partir de deux cercles concentriques.",
  usage: "Motif décoratif de plafond, gabarit de découpe, marquage au sol pour un événement, décor lumineux.",
  materials: ["Compas de chantier ou ficelle + crayon", "Rapporteur (angles de 36° et 72°)", "Règle ou cordeau pour relier les points"],
  preparation: "Tracez d'abord le centre et vérifiez l'espace disponible pour le diamètre extérieur souhaité.",
  principle: "Une étoile à 5 branches alterne 5 sommets extérieurs et 5 sommets intérieurs, décalés d'un demi-secteur (18°). L'écart entre deux sommets extérieurs vaut 360°/5 = 72°, et 36° entre un sommet extérieur et le sommet intérieur voisin.",
  steps: [
    "Tracer le cercle extérieur (rayon = diamètre extérieur ÷ 2).",
    "Diviser ce cercle en 5 points réguliers (72° d'écart).",
    "Déterminer le rayon intérieur (rayon extérieur × ratio intérieur).",
    "Placer les 5 points intérieurs, décalés d'un demi-secteur (36°).",
    "Relier alternativement un point extérieur puis un point intérieur, sur tout le tour.",
    "Vérifier la symétrie : les 5 branches doivent être identiques.",
  ],
  tips: ["Un ratio intérieur proche de 0,4 donne une étoile à branches fines et lisibles.", "Reportez toujours les points dans le même sens de rotation pour éviter une branche inversée."],
  commonErrors: ["Oublier le décalage d'un demi-secteur entre points extérieurs et intérieurs, ce qui aligne les points au lieu de les alterner.", "Relier les points dans le désordre plutôt qu'en alternance stricte."],
  finalCheck: "Contrôlez que chaque sommet extérieur est à la même distance du centre, chaque sommet intérieur aussi, et que les 5 branches se superposent par rotation de 72°.",
  warnings: ["Vérifiez l'espace disponible avant de tracer : le diamètre extérieur doit tenir dans la surface de travail."],
};

export function createStarGeometry(input: StarInput = DEFAULT_INPUT): TraceModel {
  const outerDiameter = assertFinitePositive(input.outerDiameter, "Le diamètre extérieur");
  const innerRatio = input.innerRatio;
  if (!Number.isFinite(innerRatio) || innerRatio <= 0 || innerRatio >= 1) throw new Error("Le ratio du rayon intérieur doit être strictement compris entre 0 et 1.");
  const rotationDegrees = input.rotation ?? -90;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");
  const rotationRadians = (rotationDegrees * Math.PI) / 180;

  const outerRadius = outerDiameter / 2;
  const innerRadius = outerRadius * innerRatio;
  const O = point("O", 0, 0, "Centre O", "center");
  const outerSectorRadians = (2 * Math.PI) / BRANCHES;
  const outerPoints = divideCircle(O, outerRadius, BRANCHES, rotationRadians, "outer");
  const innerPoints = divideCircle(O, innerRadius, BRANCHES, rotationRadians + outerSectorRadians / 2, "inner");

  const polygonPoints = outerPoints.flatMap((item, index) => [item, innerPoints[index]]);
  const points = [O, ...outerPoints, ...innerPoints];
  const outerAngleDegrees = 360 / BRANCHES;
  const innerAngleDegrees = outerAngleDegrees / 2;

  const dimensions = [
    { id: "dim-outer-radius", kind: "radius" as const, from: O, to: outerPoints[0], label: `R ext. ${outerRadius} mm`, value: outerRadius, unit: "mm" as const },
    { id: "dim-inner-radius", kind: "radius" as const, from: O, to: innerPoints[0], label: `R int. ${Math.round(innerRadius)} mm`, value: innerRadius, unit: "mm" as const },
    { id: "dim-outer-sector", kind: "angle" as const, from: outerPoints[0], to: outerPoints[1], label: `${outerAngleDegrees}°`, value: outerAngleDegrees, unit: "°" as const },
    { id: "dim-inner-sector", kind: "angle" as const, from: outerPoints[0], to: innerPoints[0], label: `${innerAngleDegrees}°`, value: innerAngleDegrees, unit: "°" as const },
  ];

  const steps: SiteStep[] = [
    { id: "step-outer-circle", title: "Tracer le cercle extérieur", instruction: `Réglez le compas au rayon ${outerRadius} mm et tracez le cercle extérieur depuis O.`, measurements: [`${outerRadius} mm`], pointIds: ["O", outerPoints[0].id], visibleEntityIds: ["circle-outer"] },
    { id: "step-outer-divide", title: "Diviser en 5", instruction: `Reportez les 5 sommets extérieurs, espacés de ${outerAngleDegrees}°.`, measurements: [`${outerAngleDegrees}°`], pointIds: outerPoints.map((p) => p.id), controlId: "control-outer-1", visibleEntityIds: ["circle-outer"] },
    { id: "step-inner-radius", title: "Déterminer le rayon intérieur", instruction: `Réglez le compas au rayon intérieur ${Math.round(innerRadius)} mm et tracez le cercle intérieur.`, measurements: [`${Math.round(innerRadius)} mm`], pointIds: ["O"], visibleEntityIds: ["circle-outer", "circle-inner"] },
    { id: "step-inner-points", title: "Placer les points intérieurs", instruction: `Reportez les 5 sommets intérieurs, décalés de ${innerAngleDegrees}° par rapport aux sommets extérieurs.`, measurements: [`${innerAngleDegrees}°`], pointIds: innerPoints.map((p) => p.id), controlId: "control-inner-1", visibleEntityIds: ["circle-outer", "circle-inner"] },
    { id: "step-link", title: "Relier alternativement", instruction: "Reliez chaque sommet extérieur au sommet intérieur voisin, en alternant tout le tour.", measurements: [], pointIds: polygonPoints.map((p) => p.id), visibleEntityIds: ["circle-outer", "circle-inner", "star-polygon"] },
    { id: "step-symmetry", title: "Vérifier la symétrie", instruction: "Contrôlez que les 5 branches sont identiques par rotation de 72° autour de O.", measurements: [`${outerAngleDegrees}°`], pointIds: outerPoints.map((p) => p.id), visibleEntityIds: ["star-polygon"] },
  ];

  const model: TraceModel = {
    id: "star-5", name: "Étoile 5 branches", slug: "star-5", categoryId: "forms-design", difficulty: "intermediate",
    tags: ["étoile", "5 branches", "polygone", "radial", "décoratif"], status: "preview",
    parameters: starParameters, explanation: starExplanation,
    bounds: boundsFromPoints(points, Math.max(80, outerRadius * 0.15)),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [], points, segments: [], arcs: [],
    circles: [
      { id: "circle-outer", centre: O, radius: outerRadius, role: "construction" },
      { id: "circle-inner", centre: O, radius: innerRadius, role: "construction" },
    ],
    ellipses: [], constructionLines: [], dimensions,
    controls: [
      ...outerPoints.map((item, index) => ({ id: `control-outer-${index + 1}`, label: `Distance O → ${item.id}`, value: outerRadius, unit: "mm" as const, pointIds: ["O", item.id] })),
      ...innerPoints.map((item, index) => ({ id: `control-inner-${index + 1}`, label: `Distance O → ${item.id}`, value: innerRadius, unit: "mm" as const, pointIds: ["O", item.id] })),
    ],
    quantities: [
      { id: "q-outer-radius", label: "Rayon extérieur", value: outerRadius, unit: "mm", quality: "exact" },
      { id: "q-inner-radius", label: "Rayon intérieur", value: innerRadius, unit: "mm", quality: "exact" },
      { id: "q-outer-angle", label: "Angle entre sommets extérieurs", value: outerAngleDegrees, unit: "°", quality: "exact" },
      { id: "q-inner-angle", label: "Angle sommet extérieur → sommet intérieur", value: innerAngleDegrees, unit: "°", quality: "exact" },
    ],
    steps,
    polygons: [{ id: "star-polygon", points: polygonPoints, role: "shape" }],
  };
  return validateTraceModel(model);
}
