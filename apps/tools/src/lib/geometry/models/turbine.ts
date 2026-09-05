// Famille décorative (DECORATIVE-FAMILIES-V1 §6) : rosace tournante / turbine — un polygone
// fermé à sommets alternés (cercle extérieur + cercle intérieur), exactement le même schéma que
// star.ts (FIRST-FUNCTIONAL-LOT-V1), mais où les points intérieurs sont décalés d'un angle
// "twist" ARBITRAIRE au lieu d'être fixés à un demi-secteur — c'est ce décalage progressif qui
// donne l'effet de rotation. "twist" est une grandeur géométrique explicite (un décalage
// angulaire, en degrés, reportable directement au rapporteur sur chantier), jamais un paramètre
// visuel arbitraire. Composition de divideCircle + Polygon, aucune primitive nouvelle.
import { assertFinitePositive, boundsFromPoints, divideCircle, point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type TurbineInput = { diameter: number; branches: number; twist: number; rotation?: number };

export const turbineParameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre extérieur", unit: "mm", min: 100, max: 20000, defaultValue: 1800 },
  { id: "branches", label: "Nombre de branches", min: 3, max: 12, step: 1, defaultValue: 6 },
  { id: "twist", label: "Décalage angulaire (twist)", unit: "°", min: 1, max: 90, step: 1, defaultValue: 25 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: 0 },
];

const DEFAULT_INPUT: TurbineInput = { diameter: 1800, branches: 6, twist: 25, rotation: 0 };
const INNER_RATIO = 0.4;

export const turbineExplanation: TraceExplanation = {
  objective: "Tracer un motif radial à effet de rotation (turbine), à partir de deux cercles et d'un décalage angulaire.",
  usage: "Motif décoratif de plafond, grille de ventilation stylisée, marquage central rotatif.",
  materials: ["Compas de chantier ou ficelle + crayon", "Rapporteur pour le décalage angulaire", "Règle pour relier les points"],
  preparation: "Tracez d'abord le cercle extérieur et le cercle intérieur, concentriques.",
  principle: "Chaque point intérieur n'est pas aligné avec le point extérieur correspondant : il est décalé d'un angle constant, le « twist ». C'est ce décalage, reporté au rapporteur depuis chaque point extérieur, qui incline chaque branche et donne l'impression de rotation — la valeur du twist est directement l'angle à reporter, rien d'autre.",
  steps: [
    "Tracer le cercle extérieur.",
    "Diviser ce cercle en un point par branche, régulièrement espacés.",
    "Tracer le cercle intérieur, concentrique.",
    "Depuis chaque point extérieur, reporter le point intérieur correspondant en décalant de l'angle twist.",
    "Relier chaque point extérieur au point intérieur décalé, puis au point extérieur suivant, dans l'ordre.",
  ],
  tips: ["Reportez toujours le décalage twist dans le même sens de rotation pour toutes les branches.", "Un twist proche de la moitié de l'angle entre deux branches (ex. 30° pour 6 branches à 60°) donne un effet de rotation marqué et lisible."],
  commonErrors: ["Décaler certaines branches dans un sens et d'autres dans l'autre — l'effet de rotation disparaît.", "Confondre l'angle entre branches et l'angle de décalage twist, qui sont deux grandeurs différentes."],
  finalCheck: "Contrôlez que le décalage angulaire entre un point extérieur et son point intérieur correspondant est identique pour toutes les branches.",
  warnings: ["Vérifiez le sens de rotation avant de relier tous les points : un sens incohérent casse la lisibilité du motif."],
};

export function createTurbineGeometry(input: TurbineInput = DEFAULT_INPUT): TraceModel {
  const diameter = assertFinitePositive(input.diameter, "Le diamètre");
  const branches = input.branches;
  if (!Number.isInteger(branches) || branches < 3 || branches > 12) throw new Error("Le nombre de branches doit être un entier entre 3 et 12.");
  const twistDegrees = input.twist;
  if (!Number.isFinite(twistDegrees) || twistDegrees <= 0) throw new Error("Le décalage angulaire (twist) doit être strictement positif.");
  const rotationDegrees = input.rotation ?? 0;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");

  const rotationRadians = (rotationDegrees * Math.PI) / 180;
  const twistRadians = (twistDegrees * Math.PI) / 180;
  const outerRadius = diameter / 2;
  const innerRadius = outerRadius * INNER_RATIO;
  const O = point("O", 0, 0, "Centre O", "center");

  const outerPoints = divideCircle(O, outerRadius, branches, rotationRadians, "P");
  const innerPoints = divideCircle(O, innerRadius, branches, rotationRadians + twistRadians, "Q");
  const bladePoints = outerPoints.flatMap((item, index) => [item, innerPoints[index]]);

  const points = [O, ...outerPoints, ...innerPoints];
  const sectorAngle = 360 / branches;
  const axisHalfExtent = Math.max(60, outerRadius * 0.15);

  const steps: SiteStep[] = [
    { id: "step-outer", title: "Tracer le cercle extérieur", instruction: `Tracez le cercle extérieur de rayon ${outerRadius} mm.`, measurements: [`${outerRadius} mm`], pointIds: ["O"], visibleEntityIds: ["circle-outer"] },
    { id: "step-divide-outer", title: "Diviser le cercle extérieur", instruction: `Reportez ${branches} points réguliers, espacés de ${sectorAngle}°.`, measurements: [`${sectorAngle}°`], pointIds: outerPoints.map((p) => p.id), controlId: "control-sector", visibleEntityIds: ["circle-outer"] },
    { id: "step-inner", title: "Tracer le cercle intérieur", instruction: `Tracez le cercle intérieur de rayon ${Math.round(innerRadius)} mm, concentrique.`, measurements: [`${Math.round(innerRadius)} mm`], pointIds: ["O"], visibleEntityIds: ["circle-outer", "circle-inner"] },
    { id: "step-twist", title: "Reporter le décalage", instruction: `Depuis chaque point extérieur, reportez le point intérieur correspondant en décalant de ${twistDegrees}°.`, measurements: [`${twistDegrees}°`], pointIds: innerPoints.map((p) => p.id), controlId: "control-twist", visibleEntityIds: ["circle-outer", "circle-inner"] },
    { id: "step-link", title: "Relier les points", instruction: "Reliez chaque point extérieur au point intérieur décalé, puis au point extérieur suivant, dans l'ordre.", measurements: [], pointIds: bladePoints.map((p) => p.id), visibleEntityIds: ["turbine-polygon"] },
  ];

  const model: TraceModel = {
    id: "turbine", name: "Rosace tournante (turbine)", slug: "turbine", categoryId: "forms-design", difficulty: "advanced",
    tags: ["turbine", "rotation", "radial", "décalage", "décoratif"], status: "preview",
    parameters: turbineParameters, explanation: turbineExplanation,
    bounds: boundsFromPoints(points, axisHalfExtent),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [],
    circles: [
      { id: "circle-outer", centre: O, radius: outerRadius, role: "construction" },
      { id: "circle-inner", centre: O, radius: innerRadius, role: "construction" },
    ],
    ellipses: [],
    constructionLines: [],
    dimensions: [
      { id: "dim-outer", kind: "radius", from: O, to: outerPoints[0], label: `R ext. ${outerRadius} mm`, value: outerRadius, unit: "mm" },
      { id: "dim-twist", kind: "angle", from: outerPoints[0], to: innerPoints[0], label: `Twist ${twistDegrees}°`, value: twistDegrees, unit: "°" },
    ],
    controls: [
      { id: "control-sector", label: "Angle entre deux points extérieurs", value: sectorAngle, unit: "°", pointIds: [outerPoints[0].id, outerPoints[1].id] },
      { id: "control-twist", label: "Décalage angulaire extérieur → intérieur", value: twistDegrees, unit: "°", pointIds: [outerPoints[0].id, innerPoints[0].id] },
    ],
    quantities: [
      { id: "q-outer-radius", label: "Rayon extérieur", value: outerRadius, unit: "mm", quality: "exact" },
      { id: "q-inner-radius", label: "Rayon intérieur", value: innerRadius, unit: "mm", quality: "exact" },
      { id: "q-sector", label: "Angle entre branches", value: sectorAngle, unit: "°", quality: "exact" },
      { id: "q-twist", label: "Décalage angulaire (twist)", value: twistDegrees, unit: "°", quality: "exact" },
    ],
    steps,
    polygons: [{ id: "turbine-polygon", points: bladePoints, role: "shape" }],
  };
  return validateTraceModel(model);
}
