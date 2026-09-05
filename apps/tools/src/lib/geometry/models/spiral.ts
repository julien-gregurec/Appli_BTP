// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §6) : spirale d'Archimède r(θ) = a + bθ, rendue en
// Polyline échantillonnée (jamais Bezier). Le nombre d'échantillons est calculé en interne
// (jamais exposé comme paramètre utilisateur), plafonné pour rester léger sur mobile.
import { assertFinitePositive, boundsFromPoints, point } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type SpiralInput = { startRadius: number; endRadius: number; turns: number; rotation?: number };

export const spiralParameters: readonly TraceParameter[] = [
  { id: "startRadius", label: "Rayon de départ", unit: "mm", min: 0, max: 5000, defaultValue: 50 },
  { id: "endRadius", label: "Rayon final", unit: "mm", min: 10, max: 20000, defaultValue: 1000 },
  { id: "turns", label: "Nombre de tours", min: 0.25, max: 12, step: 0.25, defaultValue: 3 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: 0 },
];

const DEFAULT_INPUT: SpiralInput = { startRadius: 50, endRadius: 1000, turns: 3, rotation: 0 };
// Échantillons par tour : assez pour une courbe visuellement lisse à l'écran (confirmé en
// prévisualisation navigateur), plafonné en nombre total pour rester léger sur mobile même avec
// un grand nombre de tours (§22 : pas de Web Worker, pas de Canvas — un chemin SVG raisonnable).
const SAMPLES_PER_TURN = 48;
const MAX_SAMPLES = 480;

export const spiralExplanation: TraceExplanation = {
  objective: "Tracer une spirale à rayon régulièrement croissant, sans courbe approximative à main levée.",
  usage: "Motif décoratif de plafond ou de sol, ferronnerie, gabarit d'escalier en colimaçon simplifié.",
  materials: ["Rapporteur", "Règle graduée ou décamètre", "Crayon"],
  preparation: "Tracez d'abord le centre et un rayon de référence pour repérer l'angle 0°.",
  principle: "Une spirale d'Archimède a un rayon qui croît proportionnellement à l'angle parcouru : r(θ) = a + bθ. Le rayon augmente donc de la même quantité à chaque tour complet — contrairement à une spirale logarithmique, la progression est linéaire, pas exponentielle.",
  steps: [
    "Marquer le centre O et l'angle de départ.",
    "Reporter des points à intervalles angulaires réguliers, à rayon croissant.",
    "Relier les points par une courbe continue et régulière.",
    "Contrôler le rayon de départ et le rayon final.",
  ],
  tips: ["Plus les points sont rapprochés (petits intervalles d'angle), plus la courbe finale sera régulière.", "Reportez toujours les rayons dans le même sens de rotation."],
  commonErrors: ["Changer de sens de rotation en cours de tracé.", "Espacer irrégulièrement les points, ce qui donne une courbe saccadée."],
  finalCheck: "Contrôlez que le rayon croît de façon régulière du centre vers l'extérieur, sans à-coup ni rétrécissement.",
  warnings: ["Un tracé décoratif complexe doit être vérifié par étapes avant réalisation définitive."],
};

export function createSpiralGeometry(input: SpiralInput = DEFAULT_INPUT): TraceModel {
  const startRadius = input.startRadius;
  if (!Number.isFinite(startRadius) || startRadius < 0) throw new Error("Le rayon de départ doit être positif ou nul.");
  const endRadius = assertFinitePositive(input.endRadius, "Le rayon final");
  if (endRadius < startRadius) throw new Error("Le rayon final doit être supérieur ou égal au rayon de départ (spirale croissante).");
  const turns = input.turns;
  if (!Number.isFinite(turns) || turns <= 0) throw new Error("Le nombre de tours doit être strictement positif.");
  const rotationDegrees = input.rotation ?? 0;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");
  const rotationRadians = (rotationDegrees * Math.PI) / 180;

  const thetaMax = turns * 2 * Math.PI;
  const b = thetaMax > 0 ? (endRadius - startRadius) / thetaMax : 0;
  const sampleCount = Math.min(MAX_SAMPLES, Math.max(16, Math.round(turns * SAMPLES_PER_TURN)));

  const O = point("O", 0, 0, "Centre O", "center");
  const spiralPoints = Array.from({ length: sampleCount + 1 }, (_, index) => {
    const t = index / sampleCount;
    const theta = t * thetaMax;
    const radius = startRadius + b * theta;
    const angle = theta + rotationRadians;
    return point(`SP${index}`, O.x + radius * Math.cos(angle), O.y + radius * Math.sin(angle));
  });

  const first = spiralPoints[0];
  const last = spiralPoints[spiralPoints.length - 1];
  const points = [O, first, last];
  const halfExtent = Math.max(60, endRadius * 0.12);

  const steps: SiteStep[] = [
    { id: "step-centre", title: "Marquer le centre", instruction: "Marquez le centre O et l'angle de départ.", measurements: [], pointIds: ["O"], visibleEntityIds: [] },
    { id: "step-start", title: "Reporter le rayon de départ", instruction: `Reportez le premier point à ${Math.round(startRadius)} mm du centre.`, measurements: [`${Math.round(startRadius)} mm`], pointIds: ["O", "SP0"], visibleEntityIds: ["axis-x"] },
    { id: "step-progress", title: "Reporter les points à rayon croissant", instruction: `Reportez des points réguliers, jusqu'à ${Math.round(endRadius)} mm après ${turns} tour${turns > 1 ? "s" : ""}.`, measurements: [`${Math.round(endRadius)} mm`, `${turns} tour${turns > 1 ? "s" : ""}`], pointIds: ["O"], visibleEntityIds: ["axis-x", "spiral-curve"] },
    { id: "step-link", title: "Relier les points", instruction: "Reliez tous les points par une courbe continue et régulière.", measurements: [], pointIds: [], visibleEntityIds: ["axis-x", "spiral-curve"] },
  ];

  const model: TraceModel = {
    id: "spiral-archimedes", name: "Spirale d'Archimède", slug: "spiral-archimedes", categoryId: "forms-design", difficulty: "advanced",
    tags: ["spirale", "archimède", "courbe", "décoratif"], status: "preview",
    parameters: spiralParameters, explanation: spiralExplanation,
    bounds: boundsFromPoints([O, ...spiralPoints], halfExtent),
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [],
    circles: [],
    ellipses: [],
    constructionLines: [{ id: "axis-x", start: point("axis-x-", -halfExtent, 0), end: point("axis-x+", endRadius + halfExtent, 0), role: "axis" }],
    dimensions: [
      { id: "dim-start-radius", kind: "radius", from: O, to: first, label: `R départ ${Math.round(startRadius)} mm`, value: startRadius, unit: "mm" },
      { id: "dim-end-radius", kind: "radius", from: O, to: last, label: `R final ${Math.round(endRadius)} mm`, value: endRadius, unit: "mm" },
    ],
    controls: [
      { id: "control-start", label: "Distance O → premier point", value: startRadius, unit: "mm", pointIds: ["O", "SP0"] },
      { id: "control-end", label: "Distance O → dernier point", value: endRadius, unit: "mm", pointIds: ["O", "SP" + sampleCount] },
    ],
    quantities: [
      { id: "q-start-radius", label: "Rayon de départ", value: startRadius, unit: "mm", quality: "exact" },
      { id: "q-end-radius", label: "Rayon final", value: endRadius, unit: "mm", quality: "exact" },
      // Quantity.unit n'accepte pas de valeur "sans unité" : le nombre de tours (grandeur
      // adimensionnelle) est déjà disponible via ses paramètres/dimensions, pas dupliqué ici.
    ],
    steps,
    polylines: [{ id: "spiral-curve", points: spiralPoints, role: "shape" }],
  };
  return validateTraceModel(model);
}
