// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §3) : arche plein cintre, fiche pédagogique dédiée.
//
// C4-LOT2-ARCHES-V1 — Migré vers Engine B : la géométrie (naissance, centre, sommet, arc, guides
// de construction, steps) provient exclusivement de `engine/arches.ts::createArch({type:
// "semicircular"})`. Ce modèle n'appelle plus `shapes.ts::createAdvancedArch` (conservé pour les
// autres outils historiques qui en dépendent, notamment la niche cintrée — non touché ici).
import { createHorizontalDimension, createRadiusDimension, createVerticalDimension } from "../engine/dimensions";
import { createArch } from "../engine/arches";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type ArchFullRoundInput = { width: number };

export const archFullRoundParameters: readonly TraceParameter[] = [
  { id: "width", label: "Largeur d'ouverture", unit: "mm", min: 100, max: 20000, defaultValue: 1200 },
];

const DEFAULT_INPUT: ArchFullRoundInput = { width: 1200 };

export const archFullRoundExplanation: TraceExplanation = {
  objective: "Tracer une arche plein cintre (demi-cercle exact) à partir de la seule largeur d'ouverture.",
  usage: "Porte ou passage cintré, niche murale, habillage de baie.",
  materials: ["Compas de chantier ou ficelle + crayon", "Cordeau pour la ligne de naissance", "Niveau pour vérifier l'horizontalité de la naissance"],
  preparation: "Implantez d'abord les deux pieds de jambage avant de chercher le centre.",
  principle: "Un plein cintre est un demi-cercle : le centre est au milieu de la ligne de naissance, et le rayon vaut exactement la moitié de la largeur d'ouverture.",
  steps: [
    "Implanter les deux jambages à la largeur exacte.",
    "Tracer la ligne de naissance A–B et son axe médian.",
    "Localiser le centre O au milieu de la ligne de naissance.",
    "Régler le compas au rayon (largeur ÷ 2).",
    "Tracer l'arc de A à B en passant par le sommet.",
  ],
  tips: ["Le rayon est toujours exactement la moitié de la largeur : pas de calcul à faire de tête, un simple partage en deux suffit.", "Vérifiez le réglage du compas en contrôlant O→A et O→B avant de tracer."],
  commonErrors: ["Confondre la largeur totale et le rayon.", "Décaler le centre par rapport au milieu réel de la ligne de naissance."],
  finalCheck: "Contrôlez que O est à égale distance de A et de B, et que cette distance vaut bien la moitié de la largeur.",
  warnings: ["Vérifiez le tracé avant toute découpe définitive de l'ouverture."],
};

export function createArchFullRoundGeometry(input: ArchFullRoundInput = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI vers Engine B.
  const width = input.width;
  if (!Number.isFinite(width) || width <= 0) throw new Error("La largeur doit être supérieure à 0.");

  // 2. Géométrie : exclusivement Engine B (invariant : radius = width / 2).
  const shape = createArch({ type: "semicircular", width });
  const { O, A, B, S } = shape.primitives.points;

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const radius = shape.primitives.arcs[0].radius;
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-width", `Largeur ${width} mm`, createHorizontalDimension(A, B, -80)),
    dimensionResultToDimension("dim-rise", `Flèche ${Math.round(S.y - A.y)} mm`, createVerticalDimension({ x: O.x, y: A.y }, S, 70)),
    dimensionResultToDimension("dim-radius", `R ${Math.round(radius)} mm`, createRadiusDimension({ centre: O, radius })),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "arch-full-round",
    name: "Arche plein cintre",
    slug: "arch-full-round",
    categoryId: "tracing",
    difficulty: "easy",
    tags: ["arche", "plein cintre", "demi-cercle", "passage"],
    status: "preview",
    parameters: archFullRoundParameters,
    explanation: archFullRoundExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
