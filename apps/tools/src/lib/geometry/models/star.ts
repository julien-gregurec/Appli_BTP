// Modèle réel n°2 (FIRST-FUNCTIONAL-LOT-V1) : étoile régulière à 5 branches.
//
// C3-PILOT-V1 — Migré vers Engine B : la géométrie (sommets, rayons, angles, polygone,
// étapes) provient exclusivement de `engine/stars.ts::createStar`, projetée en TraceModel par
// le pont officiel `parametricShapeToTraceModel`. Cette couche ne fait que : (1) traduire les
// paramètres utilisateur (diamètre + ratio) vers les paramètres Engine B (rayons), (2) appeler
// Engine B, (3) coter via le moteur de cotation Engine B, (4) enrichir avec les métadonnées
// pédagogiques UI. Aucune formule géométrique n'est réimplémentée ici (§3/§4). Slug interne et
// contrat d'appel (`createStarGeometry`, `starParameters`) strictement inchangés (§17).
import { createDiameterDimension, createRadiusDimension, createAngleDimension } from "../engine/dimensions";
import { createStar } from "../engine/stars";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

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
  // 1. Traduction des paramètres UI vers Engine B — aucune géométrie, seulement des gardes de
  //    contrat côté produit (Engine B refuse déjà rayon <= 0 et rayon intérieur >= extérieur).
  const outerDiameter = input.outerDiameter;
  if (!Number.isFinite(outerDiameter) || outerDiameter <= 0) throw new Error("Le diamètre extérieur doit être supérieur à 0.");
  const innerRatio = input.innerRatio;
  if (!Number.isFinite(innerRatio) || innerRatio <= 0 || innerRatio >= 1) throw new Error("Le ratio du rayon intérieur doit être strictement compris entre 0 et 1.");
  const rotationDegrees = input.rotation ?? -90;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");
  const outerRadius = outerDiameter / 2;
  const innerRadius = outerRadius * innerRatio;

  // 2. Géométrie : exclusivement Engine B.
  const shape = createStar({ points: BRANCHES, outerRadius, innerRadius, rotationDegrees });

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main (§9).
  const [outerCircle, innerCircle] = shape.primitives.circles;
  const O = shape.primitives.points.O;
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-outer-diameter", `Ø ext. ${outerDiameter} mm`, createDiameterDimension(outerCircle)),
    dimensionResultToDimension("dim-outer-radius", `R ext. ${outerRadius} mm`, createRadiusDimension(outerCircle)),
    dimensionResultToDimension("dim-inner-radius", `R int. ${Math.round(innerRadius)} mm`, createRadiusDimension(innerCircle)),
    dimensionResultToDimension("dim-division-angle", `${360 / BRANCHES}°`, createAngleDimension(O, shape.primitives.points.T1, shape.primitives.points.T2)),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement, jamais poussées dans Engine B.
  const metadata: TraceModelMetadata = {
    id: "star-5",
    name: "Étoile 5 branches",
    slug: "star-5",
    categoryId: "forms-design",
    difficulty: "intermediate",
    tags: ["étoile", "5 branches", "polygone", "radial", "décoratif"],
    status: "preview",
    parameters: starParameters,
    explanation: starExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
