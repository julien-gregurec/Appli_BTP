// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §5) : fiche pédagogique dédiée à la méthode des
// foyers, centrée sur la construction elle-même (grand axe/petit axe/foyers/distance focale),
// SANS positionnement dans une pièce (contrairement à createEllipse de shapes.ts, couplé à
// positionInRoom : un fichier différent, pas une seconde implémentation concurrente de la même
// formule). Même formule exacte que shapes.ts : c = sqrt(a² - b²) — reprise ici littéralement,
// jamais recalculée différemment.
import { assertFinitePositive, boundsFromPoints, point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

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
  const width = assertFinitePositive(input.width, "La largeur");
  const height = assertFinitePositive(input.height, "La hauteur");
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const majorHorizontal = halfWidth >= halfHeight;
  const a = Math.max(halfWidth, halfHeight);
  const b = Math.min(halfWidth, halfHeight);
  const c = Math.sqrt(a ** 2 - b ** 2);

  const O = point("O", 0, 0, "Centre O", "center");
  const F1 = point("F1", majorHorizontal ? -c : 0, majorHorizontal ? 0 : -c, "Foyer F1");
  const F2 = point("F2", majorHorizontal ? c : 0, majorHorizontal ? 0 : c, "Foyer F2");
  const A = point("A", -halfWidth, 0, "A");
  const B = point("B", halfWidth, 0, "B");
  const C = point("C", 0, halfHeight, "C");
  const D = point("D", 0, -halfHeight, "D");

  const points = [O, F1, F2, A, B, C, D];
  const stringLength = 2 * a;

  const steps: SiteStep[] = [
    { id: "step-axes", title: "Tracer les deux axes", instruction: `Tracez les axes de ${width} mm et ${height} mm, centrés en O.`, measurements: [`${width} mm`, `${height} mm`], pointIds: ["A", "B", "C", "D", "O"], visibleEntityIds: ["axis-x", "axis-y"] },
    { id: "step-focal", title: "Calculer la distance focale", instruction: `c = √(${Math.round(a)}² − ${Math.round(b)}²) = ${Math.round(c)} mm.`, measurements: [`${Math.round(c)} mm`], pointIds: ["O"], visibleEntityIds: ["axis-x", "axis-y"] },
    { id: "step-foyers", title: "Placer les foyers", instruction: `Placez F1 et F2 à ${Math.round(c)} mm de O sur le grand axe.`, measurements: [`${Math.round(c)} mm`], pointIds: ["O", "F1", "F2"], controlId: "control-foci", visibleEntityIds: ["axis-x", "axis-y"] },
    { id: "step-string", title: "Régler la ficelle", instruction: `Nouez une ficelle de longueur totale ${Math.round(stringLength)} mm autour des deux foyers.`, measurements: [`${Math.round(stringLength)} mm`], pointIds: ["F1", "F2"], controlId: "control-string", visibleEntityIds: ["axis-x", "axis-y"] },
    { id: "step-trace", title: "Tracer l'ellipse", instruction: "Tendez la ficelle avec le crayon et parcourez tout le tour des deux foyers.", measurements: [], pointIds: ["F1", "F2", "A", "B", "C", "D"], visibleEntityIds: ["axis-x", "axis-y", "ellipse-main"] },
  ];

  const model: TraceModel = {
    id: "ellipse-pedagogical", name: "Ellipse pédagogique (méthode des foyers)", slug: "ellipse-pedagogical", categoryId: "forms-design", difficulty: "intermediate",
    tags: ["ellipse", "ovale", "foyers", "ficelle", "pédagogique"], status: "preview",
    parameters: ellipsePedagogicalParameters, explanation: ellipsePedagogicalExplanation,
    bounds: boundsFromPoints(points, Math.max(80, a * 0.12)),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [],
    circles: [],
    ellipses: [{ id: "ellipse-main", centre: O, radiusX: halfWidth, radiusY: halfHeight, role: "shape" }],
    constructionLines: [
      { id: "axis-x", start: point("axis-x-", -halfWidth - 40, 0), end: point("axis-x+", halfWidth + 40, 0), role: "axis" },
      { id: "axis-y", start: point("axis-y-", 0, -halfHeight - 40), end: point("axis-y+", 0, halfHeight + 40), role: "axis" },
    ],
    dimensions: [
      { id: "dim-major", kind: "linear", from: majorHorizontal ? A : D, to: majorHorizontal ? B : C, label: `Grand axe ${majorHorizontal ? width : height} mm`, value: majorHorizontal ? width : height, unit: "mm", offset: majorHorizontal ? -60 : 60 },
      { id: "dim-minor", kind: "linear", from: majorHorizontal ? D : A, to: majorHorizontal ? C : B, label: `Petit axe ${majorHorizontal ? height : width} mm`, value: majorHorizontal ? height : width, unit: "mm", offset: 60 },
      { id: "dim-foci", kind: "linear", from: F1, to: F2, label: `Foyers ${Math.round(2 * c)} mm`, value: 2 * c, unit: "mm" },
    ],
    controls: [
      { id: "control-foci", label: "Distance centre → chaque foyer", value: c, unit: "mm", pointIds: ["O", "F1"] },
      { id: "control-string", label: "Longueur de ficelle F1–point–F2", value: stringLength, unit: "mm", pointIds: ["F1", "A", "F2"] },
    ],
    quantities: [
      { id: "q-a", label: "Demi-grand axe (a)", value: a, unit: "mm", quality: "exact" },
      { id: "q-b", label: "Demi-petit axe (b)", value: b, unit: "mm", quality: "exact" },
      { id: "q-c", label: "Distance focale (c)", value: c, unit: "mm", quality: "exact" },
    ],
    steps,
  };
  return validateTraceModel(model);
}
