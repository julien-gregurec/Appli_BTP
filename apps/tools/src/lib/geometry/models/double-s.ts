// Famille décorative NON radiale (DECORATIVE-FAMILIES-V1 §7) : composition double-S. Chaque « S »
// (courbe en doucine / ogee) est fait de DEUX arcs de cercle de même rayon, raccordés au point
// milieu avec la MÊME tangente — la continuité C1 est garantie par construction : le second arc
// est l'image du premier par rotation de 180° autour du point milieu (rotate, primitive
// existante), ce qui préserve la direction de la tangente. La seconde courbe en S est la MÊME
// construction, décalée et à bombement inversé (composition « complémentaire » demandée).
// Aucune courbe libre, aucun Bezier : tout est traçable au compas. Le rayon de chaque arc est
// obtenu par la relation corde + flèche -> rayon, la même que celle déjà utilisée par
// createAdvancedArch (shapes.ts) : radius = (demi-corde² + flèche²) / (2 · flèche).
import { assertFinitePositive, boundsFromPoints, point, rotate, type Arc, type Point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type DoubleSInput = { width: number; height: number; waistRatio: number };

export const doubleSParameters: readonly TraceParameter[] = [
  { id: "width", label: "Largeur (bombement d'un S)", unit: "mm", min: 100, max: 20000, defaultValue: 800 },
  { id: "height", label: "Hauteur d'un S", unit: "mm", min: 100, max: 20000, defaultValue: 2000 },
  { id: "waistRatio", label: "Rapport de bombement", unit: "ratio", min: 0.05, max: 0.9, step: 0.01, defaultValue: 0.3 },
];

const DEFAULT_INPUT: DoubleSInput = { width: 800, height: 2000, waistRatio: 0.3 };

// Retourne l'arc mineur (le plus court des deux) passant par `fromPoint` et `toPoint` sur le
// cercle de centre `centre` et de rayon `radius`. Choisit automatiquement le sens de balayage
// en normalisant delta dans (-π, π] — évite d'avoir à raisonner à la main sur counterClockwise
// pour chaque arc (technique locale de composition, pas une primitive ajoutée au moteur).
function minorArc(id: string, centre: Point, radius: number, fromPoint: Point, toPoint: Point, role: Arc["role"]): Arc {
  const a1 = Math.atan2(fromPoint.y - centre.y, fromPoint.x - centre.x);
  const a2 = Math.atan2(toPoint.y - centre.y, toPoint.x - centre.x);
  let delta = a2 - a1;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  return { id, centre, radius, startAngle: a1, endAngle: a1 + delta, counterClockwise: delta >= 0, role };
}

type OgeeS = { a: Point; m: Point; b: Point; centreLower: Point; centreUpper: Point; radius: number; arcLower: Arc; arcUpper: Arc };

function buildOgeeS(prefix: string, originX: number, height: number, bulge: number, bulgeSign: 1 | -1, role: Arc["role"]): OgeeS {
  // Corde verticale A -> M (moitié basse du S). demi-corde = height/4, flèche = bulge.
  const halfChord = height / 4;
  const radius = (halfChord ** 2 + bulge ** 2) / (2 * bulge);
  const a = point(`${prefix}A`, originX, 0, `${prefix} bas`);
  const m = point(`${prefix}M`, originX, height / 2, `${prefix} milieu`);
  const b = point(`${prefix}B`, originX, height, `${prefix} haut`);
  // Centre de l'arc bas : sur la perpendiculaire à la corde (donc horizontale), du côté opposé
  // au bombement, à la distance (radius - bulge) du milieu de corde.
  const centreLower = point(`${prefix}CL`, originX - bulgeSign * (radius - bulge), height / 4, `${prefix} centre bas`, "center");
  // Arc haut : image de l'arc bas par rotation de 180° autour de M -> tangente identique en M.
  const centreUpper = { ...rotate(centreLower, m, Math.PI, `${prefix}CU`), label: `${prefix} centre haut`, role: "center" as const };
  return {
    a, m, b, centreLower, centreUpper, radius,
    arcLower: minorArc(`${prefix}arc-lower`, centreLower, radius, a, m, role),
    arcUpper: minorArc(`${prefix}arc-upper`, centreUpper, radius, m, b, role),
  };
}

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

export function createDoubleSGeometry(input: DoubleSInput = DEFAULT_INPUT): TraceModel {
  const width = assertFinitePositive(input.width, "La largeur");
  const height = assertFinitePositive(input.height, "La hauteur");
  const waistRatio = input.waistRatio;
  if (!Number.isFinite(waistRatio) || waistRatio <= 0 || waistRatio >= 1) throw new Error("Le rapport de bombement doit être strictement compris entre 0 et 1.");

  const bulge = waistRatio * width;
  const spacing = 2 * bulge + width * 0.2; // écart interne entre les deux S, dérivé, non exposé.

  const s1 = buildOgeeS("S1-", 0, height, bulge, 1, "shape");
  const s2 = buildOgeeS("S2-", spacing, height, bulge, -1, "shape");

  const points = [s1.a, s1.m, s1.b, s1.centreLower, s1.centreUpper, s2.a, s2.m, s2.b, s2.centreLower, s2.centreUpper];
  const axisHalfExtent = Math.max(80, height * 0.08);

  const steps: SiteStep[] = [
    { id: "step-axis", title: "Tracer les axes et repères", instruction: "Tracez l'axe vertical du premier S et placez A (bas), M (milieu), B (haut).", measurements: [`${height} mm`], pointIds: ["S1-A", "S1-M", "S1-B"], visibleEntityIds: ["axis-s1"] },
    { id: "step-radius", title: "Calculer le rayon", instruction: `Rayon des arcs : ${Math.round(s1.radius)} mm (déduit de la demi-hauteur ${Math.round(height / 4)} mm et du bombement ${Math.round(bulge)} mm).`, measurements: [`${Math.round(s1.radius)} mm`], pointIds: ["S1-A", "S1-M"], visibleEntityIds: ["axis-s1"] },
    { id: "step-arc-lower", title: "Tracer l'arc bas du premier S", instruction: `Placez le centre à ${Math.round(s1.radius - bulge)} mm de la corde, côté opposé au bombement, et tracez l'arc de A à M.`, measurements: [`${Math.round(s1.radius)} mm`], pointIds: ["S1-CL", "S1-A", "S1-M"], controlId: "control-radius-s1", visibleEntityIds: ["axis-s1", "S1-arc-lower"] },
    { id: "step-arc-upper", title: "Tracer l'arc haut du premier S", instruction: "Placez le centre de l'arc haut par retournement de 180° autour de M, puis tracez l'arc de M à B.", measurements: [], pointIds: ["S1-CU", "S1-M", "S1-B"], visibleEntityIds: ["axis-s1", "S1-arc-lower", "S1-arc-upper"] },
    { id: "step-second-s", title: "Tracer le second S", instruction: `Refaites la même construction, décalée de ${Math.round(spacing)} mm, avec le bombement inversé.`, measurements: [`${Math.round(spacing)} mm`], pointIds: ["S2-A", "S2-M", "S2-B"], visibleEntityIds: ["S1-arc-lower", "S1-arc-upper", "S2-arc-lower", "S2-arc-upper"] },
  ];

  const model: TraceModel = {
    id: "double-s", name: "Composition double-S", slug: "double-s", categoryId: "forms-design", difficulty: "advanced",
    tags: ["double-s", "doucine", "ogee", "frise", "non radial", "décoratif"], status: "preview",
    parameters: doubleSParameters, explanation: doubleSExplanation,
    bounds: boundsFromPoints(points, axisHalfExtent),
    referenceFrame: { unit: "mm", origin: s1.a, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [s1.arcLower, s1.arcUpper, s2.arcLower, s2.arcUpper],
    circles: [],
    ellipses: [],
    constructionLines: [
      { id: "axis-s1", start: point("axis-s1-", 0, -axisHalfExtent), end: point("axis-s1+", 0, height + axisHalfExtent), role: "axis" },
      { id: "axis-s2", start: point("axis-s2-", spacing, -axisHalfExtent), end: point("axis-s2+", spacing, height + axisHalfExtent), role: "axis" },
    ],
    dimensions: [
      { id: "dim-height", kind: "linear", from: s1.a, to: s1.b, label: `Hauteur ${height} mm`, value: height, unit: "mm", offset: -60 },
      { id: "dim-bulge", kind: "linear", from: s1.m, to: point("bulge-tip", bulge, height / 4), label: `Bombement ${Math.round(bulge)} mm`, value: bulge, unit: "mm", offset: 0 },
      { id: "dim-radius", kind: "radius", from: s1.centreLower, to: s1.a, label: `R ${Math.round(s1.radius)} mm`, value: s1.radius, unit: "mm" },
    ],
    controls: [
      { id: "control-radius-s1", label: "Rayon des arcs du premier S (O bas → A)", value: s1.radius, unit: "mm", pointIds: ["S1-CL", "S1-A"] },
      { id: "control-symmetry", label: "Hauteur identique des deux S", value: height, unit: "mm", pointIds: ["S1-A", "S2-A"] },
    ],
    quantities: [
      { id: "q-radius", label: "Rayon de chaque arc", value: s1.radius, unit: "mm", quality: "exact" },
      { id: "q-bulge", label: "Bombement de chaque S", value: bulge, unit: "mm", quality: "exact" },
      { id: "q-spacing", label: "Décalage entre les deux S", value: spacing, unit: "mm", quality: "exact" },
    ],
    steps,
  };
  return validateTraceModel(model);
}
