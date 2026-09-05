// Famille décorative (DECORATIVE-FAMILIES-V1 §3) : fleur à 4 pétales.
//
// C4-LOT3-ROSETTES-V1 — Migré vers Engine B : la géométrie (centre, 4 centres de pétales, 4
// cercles de pétales) provient de `engine/rosettes.ts::createRosette({elementType:"circle"})` en
// mode "classique" (diamètre intérieur omis). Chaque pétale est un cercle qui passe par O — pas
// un pétale en amande (`elementType:"petal"`, qui produirait une forme pointue différente de
// l'historique). Le cercle directeur extérieur (bornage visuel, = le diamètre saisi) et le petit
// cercle central décoratif sont propres à ce modèle (pas un concept générique de rosace) : ajoutés
// ici, jamais dans Engine B. Aucune formule géométrique locale active après migration — ces deux
// cercles ont un rayon directement dérivé du paramètre utilisateur, sans autre calcul.
import { createAngleDimension, createDiameterDimension, createRadiusDimension } from "../engine/dimensions";
import { createRosette } from "../engine/rosettes";
import { dimensionResultToDimension, parametricShapeToTraceModel, validateTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { SiteStep } from "../shape-model";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

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
  tips: [
    "Les 4 centres de pétales sont toujours à mi-rayon : pas besoin de recalculer, un simple partage en deux du rayon suffit.",
    "Contrôlez la symétrie en vérifiant que les pétales opposés sont alignés avec O.",
    // Contrairement à la rosace à 6 pétales (cercles superposés dépassant le cercle directeur),
    // les pétales de cette fleur sont inscrits DANS le cercle directeur : l'encombrement réel du
    // motif fini est exactement le diamètre saisi, sans dépassement (§6).
    "Ici, les pétales tiennent exactement dans le diamètre saisi — contrairement à la rosace à 6 pétales, il n'y a aucun dépassement à anticiper.",
  ],
  commonErrors: ["Centrer un pétale directement sur le cercle directeur au lieu de le placer à mi-rayon.", "Mélanger le rayon du cercle directeur et celui des pétales."],
  finalCheck: "Contrôlez que les 4 centres de pétales sont à la même distance de O (R/2) et que l'angle entre deux directions consécutives est bien de 90°.",
  warnings: ["Vérifiez le tracé avant toute découpe ou peinture définitive."],
};

export function createFlower4Geometry(input: Flower4Input = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI vers Engine B.
  const diameter = input.diameter;
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error("Le diamètre doit être supérieur à 0.");
  const rotationDegrees = input.rotation ?? 0;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");

  // 2. Géométrie : exclusivement Engine B, mode "classique". Le cercle directeur EXTÉRIEUR
  //    (diamètre saisi) est deux fois le rayon des pétales : on demande donc à Engine B un
  //    diamètre moitié, pour que directorRadius/elementRadius (= le rayon renvoyé) valent
  //    exactement outerRadius/2 = petalRadius, la relation historique de ce modèle.
  const outerRadius = diameter / 2;
  const shape = createRosette({ outerDiameter: outerRadius, count: PETALS, elementType: "circle", rotationDegrees });
  const petalRadius = shape.metadata.directorRadius as number;
  const O = shape.primitives.points.O;
  const C1 = shape.primitives.points.C1;
  const C2 = shape.primitives.points.C2;

  // Cercle directeur extérieur (bornage, = diamètre saisi) et petit cercle central décoratif :
  // propres à ce modèle, ajoutés à la géométrie Engine B avant adaptation (jamais une seconde
  // formule — leurs rayons dérivent directement des valeurs déjà calculées par Engine B).
  const centralRadius = petalRadius * 0.35;
  shape.primitives.circles.push({ centre: O, radius: outerRadius, role: "construction" });
  shape.primitives.circles.push({ centre: O, radius: centralRadius, role: "shape" });

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-diameter", `Ø ${diameter} mm`, createDiameterDimension({ centre: O, radius: outerRadius })),
    dimensionResultToDimension("dim-radius", `R pétale ${Math.round(petalRadius)} mm`, createRadiusDimension({ centre: O, radius: petalRadius })),
    dimensionResultToDimension("dim-sector", `${Number((360 / PETALS).toFixed(2))}°`, createAngleDimension(O, C1, C2)),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "flower-4",
    name: "Fleur 4 pétales",
    slug: "flower-4",
    categoryId: "forms-design",
    difficulty: "easy",
    tags: ["fleur", "4 pétales", "radial", "plafond", "décoratif"],
    status: "preview",
    parameters: flower4Parameters,
    explanation: flower4Explanation,
  };

  const model = parametricShapeToTraceModel(shape, metadata, { dimensions });

  // Enrichissement pédagogique (§7) : une étape dédiée pour le cercle central décoratif, propre à
  // ce modèle — insérée avant le contrôle final fourni par Engine B, sans dupliquer sa géométrie
  // (référence l'entité déjà adaptée par son id réel).
  const centralCircleId = model.circles.find((c) => Math.abs(c.radius - centralRadius) < 1e-6)?.id;
  const centralStep: SiteStep = {
    id: "step-central-circle",
    title: "Tracer le cercle central",
    instruction: `Terminez avec un petit cercle central de rayon ${Math.round(centralRadius)} mm.`,
    measurements: [`${Math.round(centralRadius)} mm`],
    pointIds: ["O"],
    visibleEntityIds: centralCircleId ? [centralCircleId] : undefined,
  };
  const steps = [...model.steps.slice(0, -1), centralStep, model.steps.at(-1)!];

  return validateTraceModel({ ...model, steps });
}
