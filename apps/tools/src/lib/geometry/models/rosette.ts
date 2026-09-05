// Modèle réel n°3 (FIRST-FUNCTIONAL-LOT-V1) : rosace à 6 pétales simple, construction
// géométrique classique et générique (compas/règle, connue depuis l'Antiquité — parfois appelée
// "fleur à 6 pétales" ou motif de rosace radiale), PAS une reproduction d'une création tierce
// spécifique. Formule : un cercle directeur de rayon R divisé en 6 points ; depuis chacun de ces
// 6 points, un cercle de MÊME rayon R. Comme les 6 centres sont eux-mêmes à distance R de O et
// à distance R les uns des autres (division en 6 d'un cercle de rayon R = triangle équilatéral
// entre O et deux centres voisins), chaque cercle secondaire passe exactement par O et par ses
// deux voisins : c'est cette propriété — vérifiable par calcul, pas approximative — qui produit
// le motif à 6 pétales. Non référencé par catalog.ts : reste interne/preview.
import { assertFinitePositive, boundsFromPoints, circleCircleIntersections, divideCircle, point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

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
  tips: ["Gardez le même réglage de compas du début à la fin : c'est le même rayon R partout.", "Tracez les 6 cercles secondaires dans le même ordre pour ne pas en oublier."],
  commonErrors: ["Changer le réglage du compas entre deux cercles secondaires.", "Décaler légèrement le centre O en cours de tracé."],
  finalCheck: "Chaque centre secondaire doit être exactement à R du centre O, et les cercles voisins doivent se croiser précisément sur le centre O.",
  warnings: ["Un tracé décoratif au plafond doit être vérifié en plusieurs points avant peinture ou perçage définitif."],
};

export function createRosetteGeometry(input: RosetteInput = DEFAULT_INPUT): TraceModel {
  const diameter = assertFinitePositive(input.diameter, "Le diamètre directeur");
  const rotationDegrees = input.rotation ?? 0;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");
  const rotationRadians = (rotationDegrees * Math.PI) / 180;

  const R = diameter / 2;
  const O = point("O", 0, 0, "Centre O", "center");
  const secondaryCentres = divideCircle(O, R, PETALS, rotationRadians, "C").map((item) => ({ ...item, role: "center" as const }));

  const secondaryCircles = secondaryCentres.map((centre, index) => ({ id: `petal-${index + 1}`, centre, radius: R, role: "shape" as const }));

  // Pointe de chaque pétale = la seconde intersection (la première étant toujours O lui-même,
  // par construction — voir la note de tête de fichier) de deux cercles secondaires voisins.
  const tips = secondaryCircles.map((circle, index) => {
    const next = secondaryCircles[(index + 1) % PETALS];
    const intersections = circleCircleIntersections(circle, next, `tip-${index + 1}-`);
    const tip = intersections.find((candidate) => Math.hypot(candidate.x - O.x, candidate.y - O.y) > R / 2);
    if (!tip) throw new Error(`Impossible de déterminer la pointe du pétale ${index + 1} : construction géométrique invalide.`);
    return { ...tip, id: `T${index + 1}`, label: `T${index + 1}`, role: "reference" as const };
  });

  const points = [O, ...secondaryCentres, ...tips];
  const sectorAngle = 360 / PETALS;

  const axisHalfExtent = Math.max(80, R * 2.4);
  const constructionLines = [
    { id: "axis-x", start: point("axis-x-", -axisHalfExtent, 0), end: point("axis-x+", axisHalfExtent, 0), role: "axis" as const },
    { id: "axis-y", start: point("axis-y-", 0, -axisHalfExtent), end: point("axis-y+", 0, axisHalfExtent), role: "axis" as const },
  ];

  const dimensions = [
    { id: "dim-radius", kind: "radius" as const, from: O, to: secondaryCentres[0], label: `R ${R} mm`, value: R, unit: "mm" as const },
    { id: "dim-sector", kind: "angle" as const, from: secondaryCentres[0], to: secondaryCentres[1], label: `${sectorAngle}°`, value: sectorAngle, unit: "°" as const },
  ];

  const steps: SiteStep[] = [
    { id: "step-directing", title: "Tracer le cercle directeur", instruction: `Réglez le compas au rayon ${R} mm et tracez le cercle directeur depuis O.`, measurements: [`${R} mm`], pointIds: ["O"], visibleEntityIds: ["axis-x", "axis-y", "circle-directing"] },
    { id: "step-divide", title: "Diviser en 6", instruction: `Reportez les 6 centres secondaires, espacés de ${sectorAngle}°.`, measurements: [`${sectorAngle}°`], pointIds: secondaryCentres.map((c) => c.id), controlId: "control-1", visibleEntityIds: ["axis-x", "axis-y", "circle-directing"] },
    { id: "step-petals", title: "Tracer les 6 pétales", instruction: `Sans changer le réglage du compas, tracez un cercle de rayon ${R} mm depuis chaque centre secondaire.`, measurements: [`${R} mm`], pointIds: secondaryCircles.map((c) => c.centre.id), visibleEntityIds: [...secondaryCircles.map((c) => c.id)] },
    { id: "step-check", title: "Vérifier le recouvrement", instruction: "Contrôlez que chaque cercle passe bien par O et par ses deux voisins.", measurements: [], pointIds: ["O", ...tips.map((t) => t.id)], visibleEntityIds: [...secondaryCircles.map((c) => c.id)] },
  ];

  const model: TraceModel = {
    id: "rosette-6", name: "Rosace 6 pétales simple", slug: "rosette-6", categoryId: "forms-design", difficulty: "easy",
    tags: ["rosace", "6 pétales", "radial", "plafond", "compas"], status: "preview",
    parameters: rosetteParameters, explanation: rosetteExplanation,
    // Padding = R (un rayon complet) : chaque cercle secondaire s'étend jusqu'à `centre + R`, et
    // chaque centre est déjà à R de O — un point du modèle atteint donc au plus R avant padding,
    // +R de padding garantit de couvrir l'extension réelle des 6 cercles (jusqu'à 2R depuis O).
    bounds: boundsFromPoints(points, Math.max(150, R)),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [], points, segments: [], arcs: [],
    circles: [{ id: "circle-directing", centre: O, radius: R, role: "construction" }, ...secondaryCircles],
    ellipses: [], constructionLines, dimensions,
    controls: secondaryCentres.map((item, index) => ({ id: `control-${index + 1}`, label: `Distance O → ${item.id}`, value: R, unit: "mm" as const, pointIds: ["O", item.id] })),
    quantities: [
      { id: "q-radius", label: "Rayon (directeur = secondaire)", value: R, unit: "mm", quality: "exact" },
      { id: "q-sector", label: "Angle entre centres secondaires", value: sectorAngle, unit: "°", quality: "exact" },
      // Propriété du triangle équilatéral O-Ci-Ci+1 (voir note de tête de fichier) : la pointe de
      // chaque pétale est à R√3 du centre O — valeur exacte, pas une estimation.
      { id: "q-tip-distance", label: "Distance centre → pointe de pétale", value: R * Math.sqrt(3), unit: "mm", quality: "exact" },
    ],
    steps,
  };
  return validateTraceModel(model);
}
