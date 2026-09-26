// Famille décorative (DECORATIVE-FAMILIES-V1 §5) : « Fleur 6 pétales allongés ». Variante
// RÉELLEMENT différente de rosette-6 : chaque pétale est une ELLIPSE orientée radialement (grand
// axe = longueur du pétale, petit axe = largeur), pas un cercle plein superposé.
//
// C4-LOT5-FLOWER6-V1 — Migré vers Engine B : aucun générateur spécialisé n'a été créé — une seule
// ellipse "source" (canonique, placée le long de +X) est répétée par
// `engine/radial-pattern.ts::createRadialPattern` (count=6), qui gère déjà nativement Ellipse2D
// (rotation ET centre transformés ensemble par `transformGeometry`, vérifié algébriquement
// équivalent à l'ancienne formule `theta - π/2` point par point). Le cercle directeur, le petit
// cercle central et l'axe vertical restent des ajouts de mise en page côté modèle (comme
// `spacing` l'était déjà pour double-s), pas remontés dans Engine B.
import { degToRad } from "../engine/angles";
import { createAlignedDimension, createAngleDimension, createDiameterDimension } from "../engine/dimensions";
import { emptyPrimitives, type ConstructionStep, type ParametricShape } from "../engine/model";
import { pointAtPolar } from "../engine/measure";
import { createRadialPattern } from "../engine/radial-pattern";
import { assertFinitePositive, type Ellipse2D } from "../engine/types";
import { dimensionResultToDimension, parametricShapeToTraceModel, type TraceModelMetadata } from "../adapters";
import type { Dimension } from "../primitives";
import type { TraceExplanation, TraceModel, TraceParameter } from "../trace-model";

export type Flower6ElongatedInput = { diameter: number; rotation?: number };

export const flower6ElongatedParameters: readonly TraceParameter[] = [
  { id: "diameter", label: "Diamètre", unit: "mm", min: 100, max: 20000, defaultValue: 1800 },
  { id: "rotation", label: "Orientation initiale", unit: "°", min: -360, max: 360, step: 1, defaultValue: -90 },
];

const DEFAULT_INPUT: Flower6ElongatedInput = { diameter: 1800, rotation: -90 };
const PETALS = 6;
const WIDTH_RATIO = 0.42; // largeur du pétale = 42% de sa longueur — pétale visiblement allongé, pas rond (inchangé depuis l'ancien modèle).

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

/** Assemble le motif à 6 pétales-ellipse via createRadialPattern (source canonique le long de +X, comme rosettes.ts) + les ajouts de mise en page (cercle directeur, cercle central, axe). */
function buildFlower6Shape(outerRadius: number, rotationDegrees: number): ParametricShape<Flower6ElongatedInput> {
  const petalLength = outerRadius;
  const petalHalfLength = petalLength / 2;
  const petalHalfWidth = (petalLength * WIDTH_RATIO) / 2;
  const centralRadius = petalHalfWidth * 0.5;
  const O = { x: 0, y: 0 };

  // Ellipse source canonique : placée le long de +X (angle 0), pointe vers l'extérieur (rotation
  // -π/2 aligne son grand axe — radiusY — sur la direction radiale). `createRadialPattern`
  // applique ensuite la même rotation (centre ET orientation) à chaque copie — vérifié
  // algébriquement équivalent à l'ancienne formule `theta - π/2` par instance.
  const source: Ellipse2D = { centre: { x: petalHalfLength, y: 0 }, radiusX: petalHalfWidth, radiusY: petalHalfLength, rotation: -Math.PI / 2, role: "shape" };
  const pattern = createRadialPattern({ source, centre: O, count: PETALS, startAngleDegrees: rotationDegrees });

  const primitives = emptyPrimitives();
  primitives.points.O = O;
  primitives.ellipses.push(...pattern.primitives.ellipses);
  const centreIds = Array.from({ length: PETALS }, (_, i) => `C${i + 1}`);
  pattern.primitives.ellipses.forEach((ellipse, i) => { primitives.points[centreIds[i]] = ellipse.centre; });

  const circleOuter = { centre: O, radius: outerRadius, role: "construction" as const };
  const circleCentral = { centre: O, radius: centralRadius, role: "shape" as const };
  primitives.circles.push(circleOuter, circleCentral);

  const axisHalfExtent = Math.max(60, outerRadius * 1.15);
  const axisY = { start: { x: 0, y: -axisHalfExtent }, end: { x: 0, y: axisHalfExtent }, role: "axis" as const };
  primitives.segments.push(axisY);

  const sectorDegrees = 360 / PETALS;
  const constructionSteps: ConstructionStep[] = [
    { id: "step-centre", title: "Repérer le centre", instruction: "Matérialiser le centre O.", geometry: [{ kind: "point", id: "O" }] },
    { id: "step-outer", title: "Tracer le cercle directeur", instruction: `Tracer le cercle directeur de rayon ${outerRadius.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: circleOuter }] },
    { id: "step-divide", title: `Diviser en ${PETALS}`, instruction: `Diviser en ${PETALS} directions de ${sectorDegrees.toFixed(1)}°.`, geometry: centreIds.map((id) => ({ kind: "point" as const, id })) },
    { id: "step-petals", title: "Tracer les pétales", instruction: `Tracer chaque pétale : ${petalLength.toFixed(1)} mm de long, ${(petalHalfWidth * 2).toFixed(1)} mm de large, orienté vers l'extérieur.`, geometry: pattern.primitives.ellipses.map((ellipse) => ({ kind: "ellipse" as const, ellipse })) },
    { id: "step-centre-circle", title: "Tracer le centre", instruction: `Terminer avec un petit cercle central de rayon ${centralRadius.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: circleCentral }] },
    { id: "step-check", title: "Contrôle final", instruction: "Contrôler que les 6 pétales sont identiques par rotation de 60°, et que chaque pointe touche le cercle directeur.", geometry: centreIds.map((id) => ({ kind: "point" as const, id })) },
  ];

  return {
    id: "flower-6-elongated",
    type: "flower6Elongated",
    parameters: { diameter: outerRadius * 2, rotation: rotationDegrees },
    primitives,
    boundingBox: pattern.boundingBox,
    centre: O,
    width: pattern.boundingBox.maxX - pattern.boundingBox.minX,
    height: pattern.boundingBox.maxY - pattern.boundingBox.minY,
    rotation: degToRad(rotationDegrees),
    metadata: { petalLength, petalHalfLength, petalHalfWidth, centralRadius },
    constructionSteps,
    quality: "exact",
  };
}

export function createFlower6ElongatedGeometry(input: Flower6ElongatedInput = DEFAULT_INPUT): TraceModel {
  // 1. Traduction des paramètres UI — aucun calcul géométrique ici au-delà de la mise en page.
  const diameter = assertFinitePositive(input.diameter, "Le diamètre");
  const rotationDegrees = input.rotation ?? -90;
  if (!Number.isFinite(rotationDegrees)) throw new Error("L'orientation initiale doit être une valeur finie.");
  const outerRadius = diameter / 2;

  // 2. Géométrie : exclusivement Engine B (createRadialPattern sur une ellipse source).
  const shape = buildFlower6Shape(outerRadius, rotationDegrees);
  const O = shape.primitives.points.O;
  const c1 = shape.primitives.points.C1;
  const c2 = shape.primitives.points.C2;
  const petalHalfLength = shape.metadata.petalHalfLength as number;
  const petalHalfWidth = shape.metadata.petalHalfWidth as number;
  const rotationRadians = degToRad(rotationDegrees);
  const farTip = pointAtPolar(O, 2 * petalHalfLength, rotationRadians); // pointe du premier pétale, exactement sur le cercle directeur.
  const petal0 = shape.primitives.ellipses[0];
  const widthAxisAngle = petal0.rotation ?? 0; // direction du petit axe (axe local X de l'ellipse, perpendiculaire au grand axe radial).
  const widthTipA = pointAtPolar(petal0.centre, petalHalfWidth, widthAxisAngle);
  const widthTipB = pointAtPolar(petal0.centre, petalHalfWidth, widthAxisAngle + Math.PI);

  // 3. Cotations : moteur de cotation Engine B, valeurs jamais réécrites à la main.
  const dimensions: Dimension[] = [
    dimensionResultToDimension("dim-diameter", `Ø directeur ${diameter} mm`, createDiameterDimension({ centre: O, radius: outerRadius })),
    dimensionResultToDimension("dim-major-axis", `Grand axe ${Math.round(2 * petalHalfLength)} mm`, createAlignedDimension(O, farTip)),
    dimensionResultToDimension("dim-minor-axis", `Petit axe ${Math.round(2 * petalHalfWidth)} mm`, createAlignedDimension(widthTipA, widthTipB)),
    dimensionResultToDimension("dim-sector", `${Number((360 / PETALS).toFixed(2))}°`, createAngleDimension(O, c1, c2)),
  ];

  // 4. Métadonnées pédagogiques — couche UI uniquement.
  const metadata: TraceModelMetadata = {
    id: "flower-6-elongated",
    name: "Fleur 6 pétales allongés",
    slug: "flower-6-elongated",
    categoryId: "forms-design",
    difficulty: "advanced",
    tags: ["fleur", "6 pétales", "allongé", "ellipse", "décoratif"],
    status: "preview",
    parameters: flower6ElongatedParameters,
    explanation: flower6ElongatedExplanation,
  };

  return parametricShapeToTraceModel(shape, metadata, { dimensions });
}
