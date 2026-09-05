// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §5) : fiche pédagogique dédiée à la méthode des
// foyers, centrée sur la construction elle-même (grand axe/petit axe/foyers/distance focale),
// SANS positionnement dans une pièce (contrairement à createEllipse de shapes.ts, couplé à
// positionInRoom : un fichier différent, pas une seconde implémentation concurrente de la même
// formule).
//
// C4-LOT6-ELLIPSE-FINAL-V1 — Migré vers Engine B, DERNIER modèle de la convergence C4 : la
// formule c = √(a² − b²) et toute la géométrie (foyers, sommets, axes, ellipse) vivent
// exclusivement dans `engine/ellipse.ts::createEllipse` (générateur générique, réutilisable,
// délibérément PAS nommé "createPedagogicalEllipse" — la pédagogie reste ici, côté modèle).
import { createAlignedDimension } from "../engine/dimensions";
import { createEllipse } from "../engine/ellipse";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type EllipsePedagogicalInput = { width: number; height: number };

export const ellipsePedagogicalParameters: readonly TraceParameter[] = [
  { id: "width", label: "Largeur (grand axe si ≥ hauteur)", unit: "mm", min: 100, max: 20000, defaultValue: 2400 },
  { id: "height", label: "Hauteur (petit axe si ≤ largeur)", unit: "mm", min: 100, max: 20000, defaultValue: 1600 },
];

const DEFAULT_INPUT: EllipsePedagogicalInput = { width: 2400, height: 1600 };

export const ellipsePedagogicalExplanation: TraceExplanation = {
  objective: "Comprendre et tracer une ellipse exacte par la méthode des deux foyers et de la ficelle.",
  usage: "Plafond ovale, table ou miroir ovale, ouverture elliptique.",
  materials: ["Ficelle inextensible", "Deux piquets ou pointes pour les foyers", "Crayon", "Décamètre"],
  preparation: "Tracez d'abord le grand axe et le petit axe, perpendiculaires, qui se croisent au centre.",
  principle: "Pour tout point de l'ellipse, la somme des distances aux deux foyers F1 et F2 est constante et vaut la longueur du grand axe (2a). La distance du centre à chaque foyer vaut c = √(a² − b²), où a est le demi-grand axe et b le demi-petit axe.",
  steps: [
    "Tracer le grand axe et le petit axe, perpendiculaires, centrés au même point.",
    "Calculer la distance focale c = √(a² − b²).",
    "Placer les deux foyers F1 et F2 sur le grand axe, à c du centre.",
    "Nouer une ficelle de longueur 2a autour des deux foyers.",
    "Tendre la ficelle avec le crayon et parcourir tout le tour pour tracer l'ellipse.",
  ],
  tips: ["La ficelle doit rester tendue en permanence, sans se détendre ni forcer.", "Vérifiez la longueur de ficelle avant de commencer : elle doit mesurer exactement 2a plus le tour des deux piquets."],
  commonErrors: ["Confondre a et b (demi-grand axe et demi-petit axe).", "Placer les foyers en dehors du grand axe."],
  finalCheck: "Contrôlez que la somme des distances d'un point quelconque du tracé aux deux foyers est constante et égale à 2a.",
  warnings: ["Une ficelle qui s'étire fausse le tracé — préférez une ficelle inextensible ou un fil métallique fin."],
};

export function createEllipsePedagogicalGeometry(input: EllipsePedagogicalInput = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI — aucun calcul géométrique ici.
  const width = input.width;
  if (!Number.isFinite(width) || width <= 0) throw new Error("La largeur doit être supérieure à 0.");
  const height = input.height;
  if (!Number.isFinite(height) || height <= 0) throw new Error("La hauteur doit être supérieure à 0.");

  // 2. Géométrie : exclusivement Engine B (createEllipse, sans rotation — non exposée côté UI).
  const shape = createEllipse({ width, height });
  const F1 = shape.primitives.points.F1;
  const F2 = shape.primitives.points.F2;
  const { a, b, c } = shape.metadata as { a: number; b: number; c: number };
  const majorAlongX = shape.metadata.majorAlongX as boolean;
  const majorStart = majorAlongX ? shape.primitives.points["Vx-"] : shape.primitives.points["Vy-"];
  const majorEnd = majorAlongX ? shape.primitives.points["Vx+"] : shape.primitives.points["Vy+"];
  const minorStart = majorAlongX ? shape.primitives.points["Vy-"] : shape.primitives.points["Vx-"];
  const minorEnd = majorAlongX ? shape.primitives.points["Vy+"] : shape.primitives.points["Vx+"];

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-major", `Grand axe ${Math.round(2 * a)} mm`, createAlignedDimension(majorStart, majorEnd, majorAlongX ? -60 : 60)),
    dimensionResultToDimension("dim-minor", `Petit axe ${Math.round(2 * b)} mm`, createAlignedDimension(minorStart, minorEnd, 60)),
    dimensionResultToDimension("dim-foci", `Foyers ${Math.round(2 * c)} mm`, createAlignedDimension(F1, F2)),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement (foyers, ficelle : jamais dans Engine B).
  const metadata: TraceModelMetadata = {
    id: "ellipse-pedagogical",
    name: "Ellipse pédagogique (méthode des foyers)",
    slug: "ellipse-pedagogical",
    categoryId: "forms-design",
    difficulty: "intermediate",
    tags: ["ellipse", "ovale", "foyers", "ficelle", "pédagogique"],
    status: "preview",
    parameters: ellipsePedagogicalParameters,
    explanation: ellipsePedagogicalExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
