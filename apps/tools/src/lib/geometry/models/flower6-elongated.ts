// Famille décorative (DECORATIVE-FAMILIES-V1 §5) : « Fleur 6 pétales allongés ». Variante
// RÉELLEMENT différente de rosette-6 (FUNDAMENTAL-MODELS-V1) : rosette-6 superpose 6 cercles
// pleins de même rayon que le cercle directeur (les pétales naissent du recouvrement des
// cercles) ; ici, chaque pétale est une ELLIPSE orientée radialement (grand axe = longueur du
// pétale, petit axe = largeur), ce qui donne des pétales allongés et pointus plutôt que des
// lobes ronds qui se chevauchent — une composition géométrique différente, pas une reprise
// visuelle de rosette-6. Utilise Ellipse (primitive déjà existante) + divideCircle + rotation
// individuelle de chaque pétale pour l'aligner radialement. Aucune primitive nouvelle.
import { assertFinitePositive, boundsFromPoints, divideCircle, point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type Flower6ElongatedInput = { diameter: number; rotation?: number };

export const flower6ElongatedParameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre", unit: "mm", min: 100, max: 20000, defaultValue: 1800 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: -90 },
];

const DEFAULT_INPUT: Flower6ElongatedInput = { diameter: 1800, rotation: -90 };
const PETALS = 6;
const WIDTH_RATIO = 0.42; // largeur du pétale = 42% de sa longueur — pétale visiblement allongé, pas rond.

export const flower6ElongatedExplanation: TraceExplanation = {
  objective: "Tracer une fleur à 6 pétales allongés et pointus, différente d'une rosace à lobes ronds superposés.",
  usage: "Motif de plafond décoratif, gabarit de découpe, marquage central d'une grande pièce.",
  materials: ["Ficelle + deux piquets (méthode des foyers pour chaque pétale) ou gabarit ovale", "Rapporteur pour les 6 divisions de 60°", "Décamètre"],
  preparation: "Tracez le cercle directeur et les 6 divisions avant de dessiner le premier pétale.",
  principle: "Le cercle directeur de rayon R est divisé en 6 directions à 60°. Chaque pétale est une ellipse allongée, orientée radialement (pointe vers l'extérieur), centrée à mi-rayon : contrairement à une rosace à cercles pleins qui se chevauchent, chaque pétale reste ici une forme fermée et indépendante.",
  steps: [
    "Tracer le cercle directeur de rayon R.",
    "Diviser ce cercle en 6 directions, espacées de 60°.",
    "Sur chaque direction, marquer le centre du pétale à mi-rayon.",
    "Tracer chaque pétale comme une ellipse allongée orientée vers l'extérieur.",
    "Vérifier que les 6 pétales sont identiques par rotation de 60°.",
  ],
  tips: ["Un gabarit en carton découpé pour un seul pétale, puis reporté 6 fois par rotation, garantit des pétales rigoureusement identiques.", "La pointe de chaque pétale doit toucher le bord du cercle directeur."],
  commonErrors: ["Dessiner des pétales ronds au lieu d'ellipses allongées — le motif perd alors sa silhouette pointue caractéristique.", "Ne pas orienter le pétale radialement, ce qui casse la symétrie."],
  finalCheck: "Contrôlez que les 6 pétales ont la même longueur et la même largeur, et que l'angle entre deux pétales consécutifs vaut 60°.",
  warnings: ["Un motif à pétales allongés est plus sensible aux petites erreurs d'orientation qu'un motif à lobes ronds — vérifiez chaque pétale avant de passer au suivant."],
};

export function createFlower6ElongatedGeometry(input: Flower6ElongatedInput = DEFAULT_INPUT): TraceModel {
  const diameter = assertFinitePositive(input.diameter, "Le diamètre");
  const rotationDegrees = input.rotation ?? -90;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");
  const rotationRadians = (rotationDegrees * Math.PI) / 180;

  const outerRadius = diameter / 2;
  const petalLength = outerRadius;
  const petalHalfLength = petalLength / 2;
  const petalHalfWidth = (petalLength * WIDTH_RATIO) / 2;
  const O = point("O", 0, 0, "Centre O", "center");

  const petalCentres = divideCircle(O, petalHalfLength, PETALS, rotationRadians, "C").map((item) => ({ ...item, role: "center" as const }));
  const sectorAngle = 360 / PETALS;
  const points = [O, ...petalCentres];
  const axisHalfExtent = Math.max(60, outerRadius * 1.15);

  const petals = petalCentres.map((centre, index) => {
    const theta = rotationRadians + index * ((2 * Math.PI) / PETALS);
    return { id: `petal-${index + 1}`, centre, radiusX: petalHalfWidth, radiusY: petalHalfLength, rotation: theta - Math.PI / 2, role: "shape" as const };
  });

  const centralRadius = petalHalfWidth * 0.5;

  const steps: SiteStep[] = [
    { id: "step-outer", title: "Tracer le cercle directeur", instruction: `Tracez le cercle directeur de rayon ${outerRadius} mm.`, measurements: [`${outerRadius} mm`], pointIds: ["O"], visibleEntityIds: ["circle-outer"] },
    { id: "step-divide", title: "Diviser en 6", instruction: `Reportez 6 divisions régulières de ${sectorAngle}° chacune.`, measurements: [`${sectorAngle}°`], pointIds: petalCentres.map((c) => c.id), controlId: "control-sector", visibleEntityIds: ["circle-outer"] },
    { id: "step-centres", title: "Placer les centres de pétales", instruction: `Sur chaque direction, marquez un centre à ${Math.round(petalHalfLength)} mm de O.`, measurements: [`${Math.round(petalHalfLength)} mm`], pointIds: petalCentres.map((c) => c.id), visibleEntityIds: ["circle-outer"] },
    { id: "step-petals", title: "Tracer les 6 pétales", instruction: `Tracez chaque pétale : ${Math.round(petalLength)} mm de long, ${Math.round(petalHalfWidth * 2)} mm de large, orienté vers l'extérieur.`, measurements: [`${Math.round(petalLength)} mm`, `${Math.round(petalHalfWidth * 2)} mm`], pointIds: petalCentres.map((c) => c.id), visibleEntityIds: [...petals.map((p) => p.id)] },
    { id: "step-centre-circle", title: "Tracer le centre", instruction: `Terminez avec un petit cercle central de rayon ${Math.round(centralRadius)} mm.`, measurements: [`${Math.round(centralRadius)} mm`], pointIds: ["O"], visibleEntityIds: [...petals.map((p) => p.id), "circle-central"] },
  ];

  const model: TraceModel = {
    id: "flower-6-elongated", name: "Fleur 6 pétales allongés", slug: "flower-6-elongated", categoryId: "forms-design", difficulty: "advanced",
    tags: ["fleur", "6 pétales", "allongé", "ellipse", "décoratif"], status: "preview",
    parameters: flower6ElongatedParameters, explanation: flower6ElongatedExplanation,
    bounds: boundsFromPoints(points, Math.max(80, outerRadius * 0.2)),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [],
    circles: [
      { id: "circle-outer", centre: O, radius: outerRadius, role: "construction" },
      { id: "circle-central", centre: O, radius: centralRadius, role: "shape" },
    ],
    ellipses: petals,
    constructionLines: [{ id: "axis-y", start: point("axis-y-", 0, -axisHalfExtent), end: point("axis-y+", 0, axisHalfExtent), role: "axis" }],
    dimensions: [
      { id: "dim-length", kind: "linear", from: O, to: petalCentres[0], label: `Longueur ${Math.round(petalHalfLength)} mm (demi)`, value: petalHalfLength, unit: "mm" },
      { id: "dim-sector", kind: "angle", from: petalCentres[0], to: petalCentres[1], label: `${sectorAngle}°`, value: sectorAngle, unit: "°" },
    ],
    controls: [
      { id: "control-sector", label: "Angle entre deux pétales", value: sectorAngle, unit: "°", pointIds: [petalCentres[0].id, petalCentres[1].id] },
    ],
    quantities: [
      { id: "q-petal-half-length", label: "Demi-longueur de chaque pétale", value: petalHalfLength, unit: "mm", quality: "exact" },
      { id: "q-petal-half-width", label: "Demi-largeur de chaque pétale", value: petalHalfWidth, unit: "mm", quality: "exact" },
      { id: "q-sector", label: "Angle entre pétales", value: sectorAngle, unit: "°", quality: "exact" },
    ],
    steps,
  };
  return validateTraceModel(model);
}
