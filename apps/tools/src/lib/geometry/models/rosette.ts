// Modèle réel n°3 (FIRST-FUNCTIONAL-LOT-V1) : rosace à 6 pétales simple.
//
// C4-LOT3-ROSETTES-V1 — Migré vers Engine B : la géométrie (centre, 6 centres secondaires, 6
// cercles superposés, pointes de pétales, steps) provient exclusivement de
// `engine/rosettes.ts::createRosette({elementType:"circle"})`, étendu ce lot avec un mode
// "classique" (diamètre intérieur omis) qui reproduit exactement la construction historique —
// chaque cercle secondaire passe par O — au lieu du mode "anneau" existant (tangence, non
// applicable ici). Voir §6/§7 pour l'analyse de l'ambiguïté « diamètre directeur vs encombrement
// réel » signalée par la recette A.
import { createAngleDimension, createDiameterDimension, createRadiusDimension } from "../engine/dimensions";
import { createRosette } from "../engine/rosettes";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type RosetteInput = { diameter: number; rotation?: number };

export const rosetteParameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre directeur", unit: "mm", min: 100, max: 20000, defaultValue: 2400 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: 0 },
];

const DEFAULT_INPUT: RosetteInput = { diameter: 2400, rotation: 0 };
const PETALS = 6;

export const rosetteExplanation: TraceExplanation = {
  objective: "Tracer une rosace simple à 6 pétales à partir d'un seul rayon, sans calcul complexe.",
  usage: "Motif décoratif de plafond ou de sol, gabarit de vitrail, marquage central d'une pièce circulaire.",
  materials: ["Compas de chantier ou ficelle + crayon de même longueur pour tous les cercles", "Décamètre pour le diamètre directeur"],
  preparation: "Tracez le cercle directeur au centre exact de la zone à décorer avant de placer les centres secondaires.",
  principle: "Le cercle directeur de rayon R est divisé en 6 points réguliers (60° d'écart) : ce sont les 6 centres secondaires. Comme ils sont eux-mêmes espacés d'exactement R (division en 6 d'un cercle de rayon R), un cercle de rayon R tracé depuis chacun passe automatiquement par le centre O et par ses deux voisins — c'est ce recouvrement qui dessine les 6 pétales.",
  steps: [
    "Tracer le cercle directeur de rayon R.",
    "Diviser ce cercle en 6 points réguliers (60°) : ce sont les centres secondaires.",
    "Depuis chaque centre secondaire, tracer un cercle du même rayon R.",
    "Vérifier que chaque cercle passe bien par O et par ses deux voisins.",
  ],
  tips: [
    "Gardez le même réglage de compas du début à la fin : c'est le même rayon R partout.",
    "Tracez les 6 cercles secondaires dans le même ordre pour ne pas en oublier.",
    // Clarification du contrat produit (§6) : le « diamètre » saisi est celui du cercle
    // directeur (où se placent les 6 centres), pas l'encombrement final du motif — les pétales
    // dépassent ce cercle. Encombrement réel, pointe à pointe : diamètre × √3 (≈ 1,73×).
    "Le diamètre saisi est celui du cercle directeur : le motif fini (pointe à pointe) est environ 1,73 fois plus large — vérifiez l'espace disponible sur l'encombrement réel, pas sur le seul diamètre directeur.",
  ],
  commonErrors: ["Changer le réglage du compas entre deux cercles secondaires.", "Décaler légèrement le centre O en cours de tracé.", "Confondre le diamètre directeur saisi avec l'encombrement réel du motif fini, plus grand."],
  finalCheck: "Chaque centre secondaire doit être exactement à R du centre O, et les cercles voisins doivent se croiser précisément sur le centre O.",
  warnings: ["Un tracé décoratif au plafond doit être vérifié en plusieurs points avant peinture ou perçage définitif.", "Vérifiez que l'encombrement réel (pointe à pointe, ≈ 1,73 × le diamètre directeur) tient dans l'espace disponible, pas seulement le cercle directeur."],
};

export function createRosetteGeometry(input: RosetteInput = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI vers Engine B.
  const diameter = input.diameter;
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error("Le diamètre directeur doit être supérieur à 0.");
  const rotationDegrees = input.rotation ?? 0;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");

  // 2. Géométrie : exclusivement Engine B, mode "classique" (aucun diamètre intérieur) — chaque
  //    cercle secondaire a pour rayon sa propre distance à O (= diameter / 2, sans autre division).
  const shape = createRosette({ outerDiameter: diameter, count: PETALS, elementType: "circle", rotationDegrees, computeTips: true });
  const R = shape.metadata.directorRadius as number;
  const O = shape.primitives.points.O;
  const C1 = shape.primitives.points.C1;
  const C2 = shape.primitives.points.C2;
  // Encombrement géométrique réel (§6) : distance centre → pointe de pétale, calculée par
  // Engine B lui-même via l'intersection des cercles réellement construits (jamais réécrite à la
  // main) — exposée en `metadata.tipDistance` par `createRosette`.
  const tipDistance = shape.metadata.tipDistance as number;

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main. Distingue
  //    explicitement le diamètre directeur (paramètre utilisateur) de l'encombrement réel du
  //    motif fini — jamais mélangés dans une seule cote (§6).
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-diameter", `Ø directeur ${diameter} mm`, createDiameterDimension({ centre: O, radius: R })),
    dimensionResultToDimension("dim-radius", `R ${R} mm`, createRadiusDimension({ centre: O, radius: R })),
    dimensionResultToDimension("dim-sector", `${Number((360 / PETALS).toFixed(2))}°`, createAngleDimension(O, C1, C2)),
    dimensionResultToDimension("dim-envelope", `Encombrement réel Ø ${Math.round(tipDistance * 2)} mm`, createDiameterDimension({ centre: O, radius: tipDistance })),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "rosette-6",
    name: "Rosace 6 pétales simple",
    slug: "rosette-6",
    categoryId: "forms-design",
    difficulty: "easy",
    tags: ["rosace", "6 pétales", "radial", "plafond", "compas"],
    status: "preview",
    parameters: rosetteParameters,
    explanation: rosetteExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
