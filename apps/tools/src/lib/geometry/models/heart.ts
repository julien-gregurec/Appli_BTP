// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §2) : cœur géométrique par tangence.
//
// C4-LOT1-V1 — Migré vers Engine B (classé DIRECT au rapport C3, §44) : la géométrie (lobes,
// tangentes, pointe, cercles de construction, axe de symétrie, étapes) provient exclusivement de
// `engine/hearts.ts::createHeart`. Aucune formule locale active après migration.
import { createHorizontalDimension, createRadiusDimension, createVerticalDimension } from "../engine/dimensions";
import { createHeart } from "../engine/hearts";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type HeartInput = { width: number; height: number };

export const heartParameters: readonly TraceParameter[] = [
  { id: "width", label: "Largeur (entre les deux bulbes)", unit: "mm", min: 50, max: 20000, defaultValue: 1200 },
  { id: "height", label: "Hauteur totale", unit: "mm", min: 50, max: 20000, defaultValue: 1400 },
];

const DEFAULT_INPUT: HeartInput = { width: 1200, height: 1400 };

export const heartExplanation: TraceExplanation = {
  objective: "Tracer un cœur symétrique constructible au compas, sans courbe approximative.",
  usage: "Décor de plafond ou de sol, gabarit de découpe, marquage pour un événement.",
  materials: ["Compas de chantier ou ficelle + crayon", "Règle pour les deux tangentes droites", "Équerre pour l'axe vertical"],
  preparation: "Tracez d'abord l'axe vertical de symétrie : tous les points se placent par rapport à lui.",
  principle: "Deux cercles de même rayon R, tangents entre eux au sommet du creux, forment les deux bulbes. Une droite tangente à chaque cercle, tracée depuis la pointe basse, ferme le contour — c'est la même tangence qu'on utilise pour raccorder une droite à un rayon.",
  steps: [
    "Tracer l'axe vertical de symétrie.",
    "Placer les deux centres, à égale distance de l'axe.",
    "Tracer les deux cercles de rayon R : ils se touchent exactement sur l'axe.",
    "Placer la pointe basse sur l'axe, à la hauteur totale voulue.",
    "Depuis la pointe, tracer les deux droites tangentes aux cercles.",
  ],
  tips: ["Vérifiez la tangence en contrôlant que la droite touche le cercle en un seul point, jamais en deux.", "Un rapport hauteur/largeur proche de 1,2 donne une silhouette équilibrée."],
  commonErrors: ["Placer les deux centres à une distance différente de l'axe, ce qui casse la symétrie.", "Tracer une droite sécante au lieu d'une tangente."],
  finalCheck: "Contrôlez que les deux bulbes sont identiques par symétrie miroir et que chaque droite touche son cercle sans le couper.",
  warnings: ["Un tracé décoratif doit être vérifié avant découpe ou peinture définitive."],
};

export function createHeartGeometry(input: HeartInput = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI vers Engine B.
  const width = input.width;
  if (!Number.isFinite(width) || width <= 0) throw new Error("La largeur doit être supérieure à 0.");
  const height = input.height;
  if (!Number.isFinite(height) || height <= 0) throw new Error("La hauteur doit être supérieure à 0.");
  const lobeRadius = width / 4;
  if (!(height > lobeRadius)) throw new Error("La hauteur doit être strictement supérieure à un quart de la largeur pour que la pointe reste en dehors des cercles.");

  // 2. Géométrie : exclusivement Engine B.
  const shape = createHeart({ width, height });
  const cusp = shape.primitives.points.cusp;
  const leftLobe = shape.primitives.points.leftLobe;

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-width", `Largeur ${width} mm`, createHorizontalDimension({ x: -2 * lobeRadius, y: 0 }, { x: 2 * lobeRadius, y: 0 }, 60)),
    dimensionResultToDimension("dim-height", `Hauteur ${height} mm`, createVerticalDimension({ x: 0, y: lobeRadius }, cusp, -60)),
    dimensionResultToDimension("dim-radius", `R ${Math.round(lobeRadius)} mm`, createRadiusDimension({ centre: leftLobe, radius: lobeRadius })),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "heart",
    name: "Cœur géométrique",
    slug: "heart",
    categoryId: "forms-design",
    difficulty: "intermediate",
    tags: ["cœur", "tangence", "décoratif", "symétrie"],
    status: "preview",
    parameters: heartParameters,
    explanation: heartExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
