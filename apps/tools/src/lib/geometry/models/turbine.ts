// Famille décorative (DECORATIVE-FAMILIES-V1 §6) : rosace tournante / turbine.
//
// C4-LOT1-V1 — Migré vers Engine B : la géométrie provient exclusivement de
// `engine/stars.ts::createStar`, généralisé pour ce lot avec le paramètre additif
// `innerAngleOffsetDegrees` (§2) — c'est exactement le "twist" : le décalage angulaire, au
// centre, entre chaque sommet extérieur et son sommet intérieur apparié. Absent, `createStar`
// place ce sommet à un demi-secteur (étoile régulière, comportement star-5 inchangé) ; renseigné,
// il produit le motif vrillé de la turbine. Aucune formule géométrique locale : une seule
// implémentation mathématique active du motif « pointes + creux alternés ».
import { createAngleDimension, createDiameterDimension, createRadiusDimension } from "../engine/dimensions";
import { createStar } from "../engine/stars";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

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
  // 1. Traduction des paramètres UI vers Engine B — aucune géométrie ici, seulement les gardes
  //    de contrat déjà exposées côté produit.
  const diameter = input.diameter;
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error("Le diamètre doit être supérieur à 0.");
  const branches = input.branches;
  if (!Number.isInteger(branches) || branches < 3 || branches > 12) throw new Error("Le nombre de branches doit être un entier entre 3 et 12.");
  const twist = input.twist;
  if (!Number.isFinite(twist) || twist <= 0) throw new Error("Le décalage angulaire (twist) doit être strictement positif.");
  const rotationDegrees = input.rotation ?? 0;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");

  const outerRadius = diameter / 2;
  const innerRadius = outerRadius * INNER_RATIO;

  // 2. Géométrie : exclusivement Engine B (étoile généralisée avec décalage explicite).
  const shape = createStar({ points: branches, outerRadius, innerRadius, rotationDegrees, innerAngleOffsetDegrees: twist });

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const [outerCircle] = shape.primitives.circles;
  const O = shape.primitives.points.O;
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-outer-diameter", `Ø ext. ${diameter} mm`, createDiameterDimension(outerCircle)),
    dimensionResultToDimension("dim-outer-radius", `R ext. ${outerRadius} mm`, createRadiusDimension(outerCircle)),
    dimensionResultToDimension("dim-sector", `${Number((360 / branches).toFixed(2))}°`, createAngleDimension(O, shape.primitives.points.T1, shape.primitives.points.T2)),
    dimensionResultToDimension("dim-twist", `Twist ${twist}°`, createAngleDimension(O, shape.primitives.points.T1, shape.primitives.points.V1)),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement, jamais poussées dans Engine B.
  const metadata: TraceModelMetadata = {
    id: "turbine",
    name: "Rosace tournante (turbine)",
    slug: "turbine",
    categoryId: "forms-design",
    difficulty: "advanced",
    tags: ["turbine", "rotation", "radial", "décalage", "décoratif"],
    status: "preview",
    parameters: turbineParameters,
    explanation: turbineExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
