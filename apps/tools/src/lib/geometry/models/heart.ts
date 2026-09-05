// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §2) : cœur géométrique par tangence, construction
// classique de traçage (deux cercles tangents + tangentes droites vers une pointe basse) — pas
// une courbe décorative arbitraire, chaque point est constructible au compas et à la règle.
// Réutilise tangentPoints (déjà présent dans primitives.ts, jamais utilisé jusqu'ici) plutôt que
// d'inventer une seconde formule de tangence. Aucune référence tierce.
import { assertFinitePositive, boundsFromPoints, distance, point, tangentPoints, type Dimension } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

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
  const width = assertFinitePositive(input.width, "La largeur");
  const height = assertFinitePositive(input.height, "La hauteur");
  const radius = width / 4;
  if (!(height > radius)) throw new Error("La hauteur doit être strictement supérieure à un quart de la largeur pour que la pointe reste en dehors des cercles.");

  const centreLeft = point("C1", -radius, 0, "Centre bulbe gauche", "center");
  const centreRight = point("C2", radius, 0, "Centre bulbe droit", "center");
  const notch = point("N", 0, 0, "Creux N");
  const tip = point("P", 0, radius - height, "Pointe P");

  const [rightA, rightB] = tangentPoints(tip, { id: "circle-right", centre: centreRight, radius }, "TR");
  const [leftA, leftB] = tangentPoints(tip, { id: "circle-left", centre: centreLeft, radius }, "TL");
  const tangentRight = rightA.x >= rightB.x ? { ...rightA, id: "T-right", label: "T droit" } : { ...rightB, id: "T-right", label: "T droit" };
  const tangentLeft = leftA.x <= leftB.x ? { ...leftA, id: "T-left", label: "T gauche" } : { ...leftB, id: "T-left", label: "T gauche" };

  const angleAt = (centre: typeof centreLeft, target: typeof notch) => Math.atan2(target.y - centre.y, target.x - centre.x);
  const notchAngleFromLeft = angleAt(centreLeft, notch);
  const notchAngleFromRight = angleAt(centreRight, notch);
  const tangentAngleLeft = angleAt(centreLeft, tangentLeft);
  const tangentAngleRight = angleAt(centreRight, tangentRight);

  const points = [notch, tip, centreLeft, centreRight, tangentLeft, tangentRight];
  const axisHalfExtent = Math.max(60, width * 0.15);

  const dimensions: Dimension[] = [
    { id: "dim-width", kind: "linear", from: point("w-a", -2 * radius, 0), to: point("w-b", 2 * radius, 0), label: `Largeur ${width} mm`, value: width, unit: "mm", offset: 60 },
    { id: "dim-height", kind: "linear", from: point("h-a", 0, radius), to: tip, label: `Hauteur ${height} mm`, value: height, unit: "mm", offset: -60 },
    { id: "dim-radius", kind: "radius", from: centreRight, to: point("r-edge", 2 * radius, 0), label: `R ${radius} mm`, value: radius, unit: "mm" },
  ];

  const steps: SiteStep[] = [
    { id: "step-axis", title: "Tracer l'axe vertical", instruction: "Tracez l'axe vertical de symétrie du cœur.", measurements: [], pointIds: [], visibleEntityIds: ["axis-vertical"] },
    { id: "step-centres", title: "Placer les deux centres", instruction: `Placez les deux centres à ${radius} mm de part et d'autre de l'axe.`, measurements: [`${radius} mm`], pointIds: ["C1", "C2"], visibleEntityIds: ["axis-vertical"] },
    { id: "step-circles", title: "Tracer les deux bulbes", instruction: `Réglez le compas au rayon ${radius} mm et tracez les deux cercles : ils se touchent sur l'axe.`, measurements: [`${radius} mm`], pointIds: ["C1", "C2", "N"], visibleEntityIds: ["axis-vertical", "circle-left", "circle-right"] },
    { id: "step-tip", title: "Placer la pointe", instruction: `Sur l'axe, placez la pointe P à ${height} mm sous le sommet des bulbes.`, measurements: [`${height} mm`], pointIds: ["P"], visibleEntityIds: ["axis-vertical", "circle-left", "circle-right"] },
    { id: "step-tangents", title: "Tracer les deux tangentes", instruction: "Depuis la pointe, tracez les deux droites tangentes aux cercles pour fermer le contour.", measurements: [], pointIds: ["P", "T-left", "T-right"], visibleEntityIds: ["circle-left", "circle-right", "tangent-left", "tangent-right", "arc-left", "arc-right"] },
  ];

  const model: TraceModel = {
    id: "heart", name: "Cœur géométrique", slug: "heart", categoryId: "forms-design", difficulty: "intermediate",
    tags: ["cœur", "tangence", "décoratif", "symétrie"], status: "preview",
    parameters: heartParameters, explanation: heartExplanation,
    bounds: boundsFromPoints([...points, point("top-left", -2 * radius, radius), point("top-right", 2 * radius, radius)], Math.max(80, width * 0.12)),
    referenceFrame: { unit: "mm", origin: notch, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [
      { id: "tangent-left", start: tip, end: tangentLeft, role: "shape" },
      { id: "tangent-right", start: tip, end: tangentRight, role: "shape" },
    ],
    arcs: [
      { id: "arc-left", centre: centreLeft, radius, startAngle: tangentAngleLeft, endAngle: notchAngleFromLeft, counterClockwise: false, role: "shape" },
      { id: "arc-right", centre: centreRight, radius, startAngle: notchAngleFromRight, endAngle: tangentAngleRight, counterClockwise: false, role: "shape" },
    ],
    circles: [
      { id: "circle-left", centre: centreLeft, radius, role: "construction" },
      { id: "circle-right", centre: centreRight, radius, role: "construction" },
    ],
    ellipses: [],
    constructionLines: [{ id: "axis-vertical", start: point("axis-v-", 0, -axisHalfExtent - height), end: point("axis-v+", 0, radius + axisHalfExtent), role: "axis" }],
    dimensions,
    controls: [
      { id: "control-radius", label: "Rayon des deux bulbes", value: radius, unit: "mm", pointIds: ["C1", "C2"] },
      { id: "control-tangent-right", label: "Longueur tangente P → T droit", value: distance(tip, tangentRight), unit: "mm", pointIds: ["P", "T-right"] },
    ],
    quantities: [
      { id: "q-radius", label: "Rayon des bulbes", value: radius, unit: "mm", quality: "exact" },
      { id: "q-tangent-length", label: "Longueur de chaque tangente", value: distance(tip, tangentRight), unit: "mm", quality: "exact" },
    ],
    steps,
  };
  return validateTraceModel(model);
}
