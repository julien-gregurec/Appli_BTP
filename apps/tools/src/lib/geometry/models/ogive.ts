// Modèle fondamental (FUNDAMENTAL-MODELS-V1 §4, libellé corrigé en DECORATIVE-FAMILIES-V1 §1) :
// OGIVE ÉQUILATÉRALE À DEUX CENTRES — une seule variante, nommée explicitement, comme demandé.
// Nom retenu : "équilatérale" est directement vérifiable par la géométrie elle-même (le
// triangle A-B-S a ses trois côtés égaux à la largeur, prouvé dans les tests). L'appellation
// "en tiers-point" avait été assimilée sans preuve dans le rapport FUNDAMENTAL-MODELS-V1 ; une
// vérification a posteriori (Wikipédia FR, « Arc brisé »/« Ogive (architecture) ») confirme que
// les deux termes désignent historiquement la même construction (rayon = portée) — mentionné
// ci-dessous à titre de synonyme documenté, mais "équilatérale à deux centres" reste le nom
// principal et sûr du modèle. Ne prétend pas couvrir les autres familles d'ogives (lancéolée,
// surhaussée...). Aucun défaut géométrique identifié — la géométrie n'est pas modifiée.
//
// Construction et preuve : chaque centre est le point de naissance OPPOSÉ, avec un rayon égal à
// la largeur d'ouverture. Le cercle centré en A (largeur W) passe par B (distance A-B = W = rayon)
// et réciproquement — la géométrie est donc auto-cohérente par construction, pas approximée.
// Le sommet commun aux deux arcs est calculé par circleCircleIntersections (déjà présent dans
// primitives.ts), plutôt que par une formule trigonométrique séparée : la vérification
// mathématique demandée par l'énoncé est donc la primitive d'intersection elle-même, déjà
// testée indépendamment (primitives.test.ts). Aucune référence tierce.
import { assertFinitePositive, boundsFromPoints, circleCircleIntersections, distance, point, type Dimension } from "../primitives";
import type { SiteStep } from "../shape-model";
import { validateTraceModel, type TraceExplanation, type TraceModel, type TraceParameter } from "../trace-model";

export type OgiveInput = { width: number };

export const ogiveParameters: readonly TraceParameter[] = [
  { id: "width", label: "Largeur d'ouverture", unit: "mm", min: 100, max: 20000, defaultValue: 1200 },
];

const DEFAULT_INPUT: OgiveInput = { width: 1200 };

export const ogiveExplanation: TraceExplanation = {
  objective: "Tracer une ogive équilatérale à deux centres, une construction gothique classique et vérifiable géométriquement.",
  usage: "Baie ou porte en ogive, niche pointue, habillage décoratif d'une ouverture.",
  materials: ["Compas de chantier ou ficelle + crayon de longueur égale à la largeur d'ouverture", "Cordeau pour la ligne de naissance"],
  preparation: "Implantez les deux points de naissance A et B avant de chercher les centres : ce sont eux-mêmes les centres des arcs.",
  principle: "Dans cette variante équilatérale (parfois nommée « en tiers-point » dans la littérature architecturale, le rayon étant égal à la portée), chaque centre est le point de naissance opposé et le rayon est égal à la largeur d'ouverture. Le cercle centré en A passe exactement par B, et réciproquement — les deux arcs se croisent alors nécessairement au sommet, sans réglage supplémentaire.",
  steps: [
    "Tracer la ligne de naissance A–B à la largeur exacte.",
    "Piquer le compas en A, ouverture réglée sur la largeur A–B.",
    "Tracer l'arc depuis B jusqu'au sommet.",
    "Piquer le compas en B, même ouverture (sans la modifier).",
    "Tracer l'arc depuis A jusqu'au sommet : les deux arcs se rejoignent exactement.",
  ],
  tips: ["Ne changez jamais le réglage du compas entre les deux arcs : c'est le même rayon, la largeur d'ouverture, pour les deux.", "Le sommet doit être un point unique, jamais un petit décalage entre les deux arcs — sinon l'ouverture du compas n'était pas identique."],
  commonErrors: ["Piquer les centres ailleurs qu'aux points de naissance eux-mêmes.", "Régler un rayon différent pour le second arc."],
  finalCheck: "Contrôlez que les deux arcs se rejoignent en un point unique sur l'axe médian, et que chaque centre est bien à la largeur exacte de son point de naissance opposé.",
  warnings: ["Cette variante ne couvre que l'ogive équilatérale — d'autres ogives (lancéolée, surhaussée) utilisent des rayons différents de la largeur."],
};

export function createOgiveGeometry(input: OgiveInput = DEFAULT_INPUT): TraceModel {
  const width = assertFinitePositive(input.width, "La largeur");
  const radius = width;

  const A = point("A", 0, 0, "Naissance A / centre droit");
  const B = point("B", width, 0, "Naissance B / centre gauche");
  const circleFromA = { id: "circle-a", centre: A, radius, role: "construction" as const };
  const circleFromB = { id: "circle-b", centre: B, radius, role: "construction" as const };

  const intersections = circleCircleIntersections(circleFromA, circleFromB, "S");
  const apex = intersections.find((candidate) => candidate.y > 0);
  if (!apex) throw new Error("Construction d'ogive invalide : les deux arcs ne se croisent pas au-dessus de la ligne de naissance.");
  const S = { ...apex, id: "S", label: "Sommet S" };

  const startAngleRightArc = Math.atan2(B.y - A.y, B.x - A.x);
  const endAngleRightArc = Math.atan2(S.y - A.y, S.x - A.x);
  const startAngleLeftArc = Math.atan2(S.y - B.y, S.x - B.x);
  const endAngleLeftArc = Math.atan2(A.y - B.y, A.x - B.x);

  const height = S.y;
  const points = [A, B, S];
  const halfExtent = Math.max(80, width * 0.15);

  const dimensions: Dimension[] = [
    { id: "dim-width", kind: "linear", from: A, to: B, label: `Largeur ${width} mm`, value: width, unit: "mm", offset: -70 },
    { id: "dim-height", kind: "linear", from: point("h-base", width / 2, 0), to: S, label: `Hauteur ${Math.round(height)} mm`, value: height, unit: "mm", offset: 70 },
    { id: "dim-radius", kind: "radius", from: A, to: B, label: `R ${radius} mm`, value: radius, unit: "mm" },
  ];

  const steps: SiteStep[] = [
    { id: "step-baseline", title: "Tracer la ligne de naissance", instruction: `Positionnez A et B à ${width} mm l'un de l'autre.`, measurements: [`${width} mm`], pointIds: ["A", "B"], visibleEntityIds: [] },
    { id: "step-arc-right", title: "Tracer le premier arc", instruction: `Piquez en A, ouverture ${radius} mm, tracez l'arc depuis B vers le sommet.`, measurements: [`${radius} mm`], pointIds: ["A", "B"], controlId: "control-radius-a", visibleEntityIds: ["axis-x", "arc-from-a"] },
    { id: "step-arc-left", title: "Tracer le second arc", instruction: `Sans changer l'ouverture, piquez en B et tracez l'arc depuis A vers le sommet.`, measurements: [`${radius} mm`], pointIds: ["A", "B"], controlId: "control-radius-b", visibleEntityIds: ["axis-x", "arc-from-a", "arc-from-b"] },
    { id: "step-apex", title: "Vérifier le sommet", instruction: "Contrôlez que les deux arcs se rejoignent en un point unique.", measurements: [], pointIds: ["S"], visibleEntityIds: ["axis-x", "arc-from-a", "arc-from-b"] },
  ];

  const model: TraceModel = {
    id: "ogive-equilateral", name: "Ogive équilatérale à deux centres", slug: "ogive-equilateral", categoryId: "tracing", difficulty: "intermediate",
    tags: ["ogive", "équilatérale", "gothique", "arc"], status: "preview",
    parameters: ogiveParameters, explanation: ogiveExplanation,
    bounds: boundsFromPoints(points, halfExtent),
    referenceFrame: { unit: "mm", origin: A, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments: [],
    arcs: [
      { id: "arc-from-a", centre: A, radius, startAngle: startAngleRightArc, endAngle: endAngleRightArc, counterClockwise: true, role: "shape" },
      { id: "arc-from-b", centre: B, radius, startAngle: startAngleLeftArc, endAngle: endAngleLeftArc, counterClockwise: true, role: "shape" },
    ],
    circles: [],
    ellipses: [],
    constructionLines: [{ id: "axis-x", start: point("axis-x-", -halfExtent, 0), end: point("axis-x+", width + halfExtent, 0), role: "axis" }],
    dimensions,
    controls: [
      { id: "control-radius-a", label: "Distance A → B (rayon du premier arc)", value: distance(A, B), unit: "mm", pointIds: ["A", "B"] },
      { id: "control-radius-b", label: "Distance B → A (rayon du second arc)", value: distance(B, A), unit: "mm", pointIds: ["A", "B"] },
      { id: "control-apex", label: "Distance A → sommet (doit valoir le rayon)", value: distance(A, S), unit: "mm", pointIds: ["A", "S"] },
    ],
    quantities: [
      { id: "q-radius", label: "Rayon (= largeur)", value: radius, unit: "mm", quality: "exact" },
      { id: "q-height", label: "Hauteur au sommet", value: height, unit: "mm", quality: "exact" },
    ],
    steps,
  };
  return validateTraceModel(model);
}
