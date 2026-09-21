// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §6) : spirale d'Archimède r(θ) = a + bθ, rendue en
// Polyline échantillonnée (jamais Bezier).
//
// C4-LOT4-CURVES-V1 — Migré vers Engine B : la formule mathématique r(θ) vit exclusivement dans
// `engine/spirals.ts::createMathematicalSpiral`. Cette couche ne fait que traduire les paramètres
// UI (startRadius/endRadius/turns) vers ceux d'Engine B (startRadius/growthPerTurn/turns), et
// reproduit le plafond d'échantillonnage historique (jamais exposé comme paramètre utilisateur,
// toujours recalculé) en dérivant `samplesPerTurn` du plafond total, sans dupliquer le calcul du
// rayon lui-même.
import { createRadiusDimension } from "../engine/dimensions";
import { createMathematicalSpiral } from "../engine/spirals";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type SpiralInput = { startRadius: number; endRadius: number; turns: number; rotation?: number };

export const spiralParameters: readonly TraceParameter[] = [
  { id: "startRadius", label: "Rayon de départ", unit: "mm", min: 0, max: 5000, defaultValue: 50 },
  { id: "endRadius", label: "Rayon final", unit: "mm", min: 10, max: 20000, defaultValue: 1000 },
  { id: "turns", label: "Nombre de tours", min: 0.25, max: 12, step: 0.25, defaultValue: 3 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: 0 },
];

const DEFAULT_INPUT: SpiralInput = { startRadius: 50, endRadius: 1000, turns: 3, rotation: 0 };
// Échantillons par tour / plafond total : identiques à l'historique (jamais exposés comme
// paramètre utilisateur), pour rester léger sur mobile même avec un grand nombre de tours (§22 :
// pas de Web Worker, pas de Canvas — un chemin SVG raisonnable).
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
  // 1. Traduction des paramètres UI vers Engine B — aucun calcul géométrique ici.
  const startRadius = input.startRadius;
  if (!Number.isFinite(startRadius) || startRadius < 0) throw new Error("Le rayon de départ doit être positif ou nul.");
  const endRadius = input.endRadius;
  if (!Number.isFinite(endRadius) || endRadius <= 0) throw new Error("Le rayon final doit être positif.");
  if (endRadius < startRadius) throw new Error("Le rayon final doit être supérieur ou égal au rayon de départ (spirale croissante).");
  const turns = input.turns;
  if (!Number.isFinite(turns) || turns <= 0) throw new Error("Le nombre de tours doit être strictement positif.");
  const rotationDegrees = input.rotation ?? 0;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");

  const growthPerTurn = (endRadius - startRadius) / turns;
  // Reproduit exactement le plafond d'échantillonnage historique
  // (min(MAX_SAMPLES, max(16, round(turns·SAMPLES_PER_TURN)))) en l'exprimant comme un nombre
  // d'échantillons PAR TOUR, seule unité acceptée par Engine B — celui-ci reste la seule source
  // du calcul des points (theta/rayon), cette couche ne fait que doser sa densité d'échantillonnage.
  const cappedTotalSamples = Math.min(MAX_SAMPLES, Math.max(16, Math.round(turns * SAMPLES_PER_TURN)));
  const samplesPerTurn = cappedTotalSamples / turns;

  // 2. Géométrie : exclusivement Engine B.
  const shape = createMathematicalSpiral({ centre: { x: 0, y: 0 }, startRadius, growthPerTurn, turns, startAngleDegrees: rotationDegrees, samplesPerTurn });
  const O = shape.primitives.points.O;

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-start-radius", `R départ ${Math.round(startRadius)} mm`, createRadiusDimension({ centre: O, radius: startRadius })),
    dimensionResultToDimension("dim-end-radius", `R final ${Math.round(endRadius)} mm`, createRadiusDimension({ centre: O, radius: endRadius })),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "spiral-archimedes",
    name: "Spirale d'Archimède",
    slug: "spiral-archimedes",
    categoryId: "forms-design",
    difficulty: "advanced",
    tags: ["spirale", "archimède", "courbe", "décoratif"],
    status: "preview",
    parameters: spiralParameters,
    explanation: spiralExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
