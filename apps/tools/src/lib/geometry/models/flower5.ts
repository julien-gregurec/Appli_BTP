// Famille décorative (DECORATIVE-FAMILIES-V1 §4) : fleur à 5 pétales, même principe que flower4.
//
// C4-LOT3-ROSETTES-V1 — Migré vers Engine B, selon le même principe que flower-4 (§ voir ce
// fichier) : géométrie via `engine/rosettes.ts::createRosette({elementType:"circle"})` en mode
// "classique".
//
// C5-CLEANUP-V1 §2 — Cercle central décoratif et son étape produits par Engine B
// (`centralCircleRatio`) ; plus aucun `SiteStep` recomposé localement. Seul le cercle directeur
// extérieur reste ajouté au niveau du modèle, sans étape dédiée.
import { createAngleDimension, createDiameterDimension, createRadiusDimension } from "../engine/dimensions";
import { createRosette } from "../engine/rosettes";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type Flower5Input = { diameter: number; rotation?: number };

export const flower5Parameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre", unit: "mm", min: 100, max: 20000, defaultValue: 1200 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: -90 },
];

const DEFAULT_INPUT: Flower5Input = { diameter: 1200, rotation: -90 };
const PETALS = 5;
// Proportion décorative du cercle central, en fraction du rayon de pétale (= rayon directeur
// Engine B). Choix produit propre à la famille "fleur" ; la géométrie et l'étape qui en
// découlent sont produites par Engine B (`centralCircleRatio`), jamais ici.
const CENTRAL_CIRCLE_RATIO = 0.35;

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
  tips: [
    "Reportez les 5 divisions avec un rapporteur plutôt qu'à l'œil : une erreur de quelques degrés se voit sur un motif à 5 branches.",
    "Contrôlez l'angle entre deux directions consécutives avant de tracer les pétales.",
    "Comme pour la fleur à 4 pétales, les pétales tiennent exactement dans le diamètre saisi — aucun dépassement à anticiper (contrairement à la rosace à 6 pétales).",
  ],
  commonErrors: ["Diviser le cercle en parts visuellement égales sans vérifier les 72° exacts.", "Confondre le rayon du cercle directeur et celui des pétales."],
  finalCheck: "Contrôlez que les 5 centres de pétales sont à la même distance de O et que l'angle entre deux directions consécutives vaut exactement 72°.",
  warnings: ["Une division en 5 est plus sensible aux petites erreurs qu'une division en 4 ou 6 — vérifiez avant de tracer les pétales."],
};

export function createFlower5Geometry(input: Flower5Input = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI vers Engine B.
  const diameter = input.diameter;
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error("Le diamètre doit être supérieur à 0.");
  const rotationDegrees = input.rotation ?? -90;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");

  // 2. Géométrie : exclusivement Engine B, mode "classique" (voir flower-4 pour la justification
  //    du diamètre moitié transmis à Engine B).
  const outerRadius = diameter / 2;
  const shape = createRosette({ outerDiameter: outerRadius, count: PETALS, elementType: "circle", rotationDegrees, centralCircleRatio: CENTRAL_CIRCLE_RATIO });
  const petalRadius = shape.metadata.directorRadius as number;
  const O = shape.primitives.points.O;
  const C1 = shape.primitives.points.C1;
  const C2 = shape.primitives.points.C2;

  // Cercle directeur extérieur : propre à ce modèle (voir flower-4). Le cercle central décoratif
  // et son étape viennent d'Engine B via `centralCircleRatio` (C5-CLEANUP-V1 §2).
  shape.primitives.circles.push({ centre: O, radius: outerRadius, role: "construction" });

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-diameter", `Ø ${diameter} mm`, createDiameterDimension({ centre: O, radius: outerRadius })),
    dimensionResultToDimension("dim-radius", `R pétale ${Math.round(petalRadius)} mm`, createRadiusDimension({ centre: O, radius: petalRadius })),
    dimensionResultToDimension("dim-sector", `${Number((360 / PETALS).toFixed(2))}°`, createAngleDimension(O, C1, C2)),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "flower-5",
    name: "Fleur 5 pétales",
    slug: "flower-5",
    categoryId: "forms-design",
    difficulty: "intermediate",
    tags: ["fleur", "5 pétales", "radial", "plafond", "décoratif"],
    status: "preview",
    parameters: flower5Parameters,
    explanation: flower5Explanation,
  };

  // Toutes les étapes proviennent d'Engine B, cercle central inclus (C5-CLEANUP-V1 §2).
  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
