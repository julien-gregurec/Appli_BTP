// Famille décorative NON radiale (DECORATIVE-FAMILIES-V1 §7) : composition double-S.
//
// C4-LOT4-CURVES-V1 — Migré vers Engine B : chaque « S » (courbe en doucine / ogee) est
// exclusivement construit par `engine/curves.ts::createSCurve` (deux arcs de même rayon,
// raccordés au point milieu, continuité C1 garantie par construction — voir le commentaire de
// `createWaveCurve`). Extension additive minimale d'Engine B (§5, "ne pas créer un nouveau
// générateur double-s si une extension du générateur existant suffit") : `bulgeRatio?` sur
// `WaveCurveParameters`/`SCurveParameters`, qui multiplie la flèche de base `width/2` — un signe
// négatif inverse le bombement, permettant de composer deux S mirroir sans dupliquer la formule
// corde+flèche->rayon. Le mapping `bulgeRatio = ±2·waistRatio` (vérifié empiriquement contre les
// centres d'arc de l'ancien modèle) reproduit exactement `bulge = waistRatio·width`.
// L'assemblage des deux S (décalage, préfixage des points, fusion des étapes) reste une décision
// de mise en page propre à CE modèle (comme l'était déjà `spacing` dans l'ancien fichier) : il
// n'est pas remonté dans Engine B, qui ne connaît qu'un seul S à la fois — pas de nouveau
// générateur "double-s" enregistré (cf. createDoubleSCurve, laissé inchangé, qui compose un
// mouvement vertical à 4 segments, une forme différente de deux S décalés horizontalement).
import { createHorizontalDimension, createRadiusDimension, createVerticalDimension } from "../engine/dimensions";
import { createSCurve } from "../engine/curves";
import { boundsFromPoints } from "../engine/measure";
import { emptyPrimitives, type ConstructionStep, type ParametricShape } from "../engine/model";
import { assertFinitePositive, type Point2D } from "../engine/types";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type DoubleSInput = { width: number; height: number; waistRatio: number };

export const doubleSParameters: readonly TraceParameter[] = [
  { id: "width", label: "Largeur (bombement d'un S)", unit: "mm", min: 100, max: 20000, defaultValue: 800 },
  { id: "height", label: "Hauteur d'un S", unit: "mm", min: 100, max: 20000, defaultValue: 2000 },
  { id: "waistRatio", label: "Rapport de bombement", unit: "ratio", min: 0.05, max: 0.9, step: 0.01, defaultValue: 0.3 },
];

const DEFAULT_INPUT: DoubleSInput = { width: 800, height: 2000, waistRatio: 0.3 };

export const doubleSExplanation: TraceExplanation = {
  objective: "Tracer deux courbes en S (doucines) complémentaires, uniquement au compas, sans courbe libre.",
  usage: "Frise décorative de plafond ou de mur, moulure stylisée, encadrement ondulé.",
  materials: ["Compas de chantier ou ficelle + crayon", "Règle et équerre pour les axes et les points de raccord"],
  preparation: "Tracez l'axe vertical de chaque S et repérez les trois points A (bas), M (milieu), B (haut).",
  principle: "Un S est fait de deux arcs de même rayon. Le second arc est le premier retourné de 180° autour du point milieu M : la tangente au point de raccord est donc automatiquement continue, sans réglage. Le rayon se déduit de la demi-hauteur et du bombement : R = (demi-corde² + flèche²) / (2 × flèche). La seconde courbe est la même, décalée, avec le bombement inversé.",
  steps: [
    "Tracer l'axe vertical du premier S et placer A, M, B.",
    "Calculer le rayon des arcs à partir de la hauteur et du bombement.",
    "Placer le centre de l'arc bas, côté opposé au bombement.",
    "Tracer l'arc bas de A à M.",
    "Placer le centre de l'arc haut par retournement de 180° autour de M, et tracer l'arc de M à B.",
    "Refaire la même construction, décalée, avec le bombement inversé, pour le second S.",
  ],
  tips: ["Ne changez pas le réglage du compas entre l'arc bas et l'arc haut d'un même S : c'est le même rayon.", "Le point milieu M est le seul endroit où les deux arcs d'un S se touchent : la tangente doit y être franche, sans cassure."],
  commonErrors: ["Placer le centre de l'arc du même côté que le bombement — l'arc part alors dans le mauvais sens.", "Régler un rayon différent pour l'arc haut, ce qui crée une cassure visible en M."],
  finalCheck: "Contrôlez que les deux arcs d'un même S ont le même rayon, que la jonction en M est lisse, et que le second S est bien le symétrique du premier.",
  warnings: ["Un raccord d'arcs mal tangent se voit immédiatement sur une frise — vérifiez chaque point M avant de poursuivre."],
};

function prefixPoints(points: Record<string, Point2D>, prefix: string): Record<string, Point2D> {
  return Object.fromEntries(Object.entries(points).map(([id, p]) => [`${prefix}${id}`, p]));
}

/** Reporte le préfixe sur les seules références par id (`kind:"point"`) — les autres géométries embarquées sont déjà des valeurs, résolues par égalité par l'adaptateur, jamais par id. */
function prefixSteps(steps: ConstructionStep[], titlePrefix: string, idPrefix: string, pointPrefix: string): ConstructionStep[] {
  return steps.map((step) => ({
    id: `${idPrefix}-${step.id}`,
    title: step.title ? `${titlePrefix} — ${step.title}` : step.title,
    instruction: step.instruction,
    // Mesures chantier conservées telles quelles : le préfixe est une mise en page d'assemblage,
    // il ne change aucune grandeur (ENGINE-B-STEP-MEASUREMENTS-V1 §3).
    measurements: step.measurements,
    geometry: step.geometry.map((g) => (g.kind === "point" ? { ...g, id: `${pointPrefix}${g.id}` } : g)),
  }));
}

/** Assemble deux « S » (createSCurve) décalés horizontalement, bombement inversé, en une seule forme paramétrique fusionnée — aucune formule géométrique nouvelle, uniquement une mise en page (comme `spacing` l'était déjà dans l'ancien modèle). */
function buildDoubleSShape(width: number, height: number, waistRatio: number): ParametricShape<DoubleSInput> {
  const bulge = waistRatio * width;
  const spacing = 2 * bulge + width * 0.2; // écart interne entre les deux S, dérivé, non exposé — formule inchangée depuis l'ancien modèle.
  const bulgeRatio = 2 * waistRatio;

  // Mapping vérifié empiriquement (dump des centres d'arc) : bulgeRatio négatif pour le premier S
  // reproduit exactement le bombement de l'ancien `buildOgeeS(..., bulgeSign=1)`, positif pour le
  // second (bulgeSign=-1, mirroir).
  const s1 = createSCurve({ width, height, centre: { x: 0, y: height / 2 }, bulgeRatio: -bulgeRatio });
  const s2 = createSCurve({ width, height, centre: { x: spacing, y: height / 2 }, bulgeRatio: bulgeRatio });

  const primitives = emptyPrimitives();
  Object.assign(primitives.points, prefixPoints(s1.primitives.points, "S1-"), prefixPoints(s2.primitives.points, "S2-"));
  primitives.arcs.push(...s1.primitives.arcs, ...s2.primitives.arcs);

  const axisHalfExtent = Math.max(80, height * 0.08);
  const axisS1 = { start: { x: 0, y: -axisHalfExtent }, end: { x: 0, y: height + axisHalfExtent }, role: "axis" as const };
  const axisS2 = { start: { x: spacing, y: -axisHalfExtent }, end: { x: spacing, y: height + axisHalfExtent }, role: "axis" as const };
  primitives.segments.push(axisS1, axisS2);

  const constructionSteps: ConstructionStep[] = [
    { id: "step-axes", title: "Tracer les axes et repères", instruction: "Tracez l'axe vertical de chaque S.", geometry: [{ kind: "segment", segment: axisS1 }, { kind: "segment", segment: axisS2 }] },
    ...prefixSteps(s1.constructionSteps, "Premier S", "s1", "S1-"),
    ...prefixSteps(s2.constructionSteps, "Second S (bombement inversé)", "s2", "S2-"),
    {
      id: "step-final-check",
      title: "Contrôler la symétrie finale",
      instruction: "Contrôlez que les deux S ont la même hauteur et un rayon identique, et que le second est bien le symétrique du premier.",
      geometry: [{ kind: "point", id: "S1-P2" }, { kind: "point", id: "S2-P2" }],
    },
  ];

  const bounds = boundsFromPoints([...Object.values(primitives.points), ...primitives.arcs.flatMap((a) => [{ x: a.centre.x - a.radius, y: a.centre.y - a.radius }, { x: a.centre.x + a.radius, y: a.centre.y + a.radius }])], Math.max(60, width * 0.15));

  return {
    id: "double-s",
    type: "doubleSOgee",
    parameters: { width, height, waistRatio },
    primitives,
    boundingBox: bounds,
    centre: { x: spacing / 2, y: height / 2 },
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: 0,
    metadata: { bulge, spacing, radius: s1.primitives.arcs[1]?.radius },
    constructionSteps,
    quality: "exact",
  };
}

export function createDoubleSGeometry(input: DoubleSInput = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI — aucun calcul géométrique ici au-delà de la mise en page.
  const width = assertFinitePositive(input.width, "La largeur");
  const height = assertFinitePositive(input.height, "La hauteur");
  const waistRatio = input.waistRatio;
  if (!Number.isFinite(waistRatio) || waistRatio <= 0 || waistRatio >= 1) throw new Error("Le rapport de bombement doit être strictement compris entre 0 et 1.");

  // 2. Géométrie : exclusivement Engine B (deux createSCurve assemblés, cf. buildDoubleSShape).
  const shape = buildDoubleSShape(width, height, waistRatio);
  const s1M = shape.primitives.points["S1-P1"];
  const s2M = shape.primitives.points["S2-P1"];
  const s1A = shape.primitives.points["S1-P2"];
  const s1B = shape.primitives.points["S1-P0"];
  const lowerArc = shape.primitives.arcs[1]; // S1 : arc du bas (A -> M), cf. mapping vérifié dans buildDoubleSShape.

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-height", `Hauteur ${height} mm`, createVerticalDimension(s1A, s1B, -60)),
    dimensionResultToDimension("dim-bulge", `Bombement ${Math.round(shape.metadata.bulge as number)} mm`, createHorizontalDimension(s1M, { x: shape.metadata.bulge as number, y: s1M.y })),
    dimensionResultToDimension("dim-radius", `R ${Math.round(lowerArc.radius)} mm`, createRadiusDimension(lowerArc)),
    dimensionResultToDimension("dim-spacing", `Entraxe ${Math.round(shape.metadata.spacing as number)} mm`, createHorizontalDimension(s1M, s2M)),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "double-s",
    name: "Composition double-S",
    slug: "double-s",
    categoryId: "forms-design",
    difficulty: "advanced",
    tags: ["double-s", "doucine", "ogee", "frise", "non radial", "décoratif"],
    status: "preview",
    parameters: doubleSParameters,
    explanation: doubleSExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
