import { formatMillimetres } from "./format";
import { distance } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ConstructionStep, type ParametricShape } from "./model";
import { assertFinitePositive, type Circle2D, type Point2D, type Segment2D } from "./types";

export type ArchPointedness = "gentle" | "equilateral" | "sharp";
const POINTEDNESS_RATIO: Record<ArchPointedness, number> = { gentle: 0.5, equilateral: 1, sharp: 1.6 };

export type ArchParameters =
  | { type: "semicircular"; width: number; springHeight?: number; thickness?: number }
  | { type: "segmental"; width: number; rise: number; springHeight?: number; thickness?: number }
  | { type: "lancet"; width: number; rise?: number; pointedness?: ArchPointedness; springHeight?: number; thickness?: number }
  | { type: "compound"; width: number; haunchRadius: number; crownRadius: number; springHeight?: number; thickness?: number };

function buildFromRadiusAndRise(width: number, rise: number, springHeight: number) {
  const half = width / 2;
  const radius = (half ** 2 + rise ** 2) / (2 * rise);
  const centreY = springHeight + rise - radius;
  const centre: Point2D = { x: half, y: centreY };
  const A: Point2D = { x: 0, y: springHeight };
  const B: Point2D = { x: width, y: springHeight };
  const S: Point2D = { x: half, y: springHeight + rise };
  const startAngle = Math.atan2(A.y - centre.y, A.x - centre.x);
  const endAngle = Math.atan2(B.y - centre.y, B.x - centre.x);
  return { radius, centre, A, B, S, startAngle, endAngle };
}

function jambsAndSteps(A: Point2D, B: Point2D, springHeight: number, radius: number, extra: ConstructionStep[]): { L: Point2D; R: Point2D; steps: ConstructionStep[] } {
  const L: Point2D = { x: A.x, y: 0 };
  const R: Point2D = { x: B.x, y: 0 };
  const steps: ConstructionStep[] = [
    // Mesures chantier (ENGINE-B-STEP-MEASUREMENTS-V1 §5) : uniquement les grandeurs déjà
    // calculées et déjà énoncées par l'instruction de l'étape — écart des jambages, hauteur de
    // naissance, ouverture de compas. Rien de recalculé ici.
    { id: "step-jambs", title: "Implanter les jambages", instruction: `Implanter les pieds de jambage L et R, distants de ${formatMillimetres(distance(A, B))}.`, measurements: [formatMillimetres(distance(A, B))], geometry: [{ kind: "point", id: "L" }, { kind: "point", id: "R" }, { kind: "segment", segment: { start: L, end: A } }, { kind: "segment", segment: { start: R, end: B } }] },
    { id: "step-spring", title: "Tracer la ligne de naissance", instruction: springHeight > 0 ? `Tracer la ligne de départ A-B à ${formatMillimetres(springHeight)} au-dessus des pieds.` : "Tracer la ligne de départ A-B.", measurements: springHeight > 0 ? [formatMillimetres(springHeight)] : undefined, geometry: [{ kind: "point", id: "A" }, { kind: "point", id: "B" }, { kind: "segment", segment: { start: A, end: B } }] },
    ...extra,
    { id: "step-radius", title: "Régler le compas", instruction: `Régler le rayon de traçage à ${formatMillimetres(radius)}.`, measurements: [formatMillimetres(radius)], geometry: [] },
  ];
  return { L, R, steps };
}

function archResult(
  type: ArchParameters["type"],
  width: number,
  thickness: number,
  arcs: { centre: Point2D; radius: number; startAngle: number; endAngle: number }[],
  namedPoints: Record<string, Point2D>,
  steps: ConstructionStep[],
  parameters: ArchParameters,
  extra: { segments?: Segment2D[]; circles?: Circle2D[] } = {},
): ParametricShape<ArchParameters> {
  const primitives = emptyPrimitives();
  Object.assign(primitives.points, namedPoints);
  for (const arc of arcs) {
    primitives.arcs.push({ ...arc, counterClockwise: false });
    if (thickness > 0) primitives.arcs.push({ ...arc, radius: arc.radius - thickness, counterClockwise: false });
  }
  const extraSegments = extra.segments ?? [];
  const extraCircles = extra.circles ?? [];
  primitives.segments.push(...extraSegments);
  primitives.circles.push(...extraCircles);
  const allPoints = Object.values(namedPoints);
  const arcSamplePoints = arcs.flatMap((arc) => [
    { x: arc.centre.x + arc.radius * Math.cos(arc.startAngle), y: arc.centre.y + arc.radius * Math.sin(arc.startAngle) },
    { x: arc.centre.x + arc.radius * Math.cos(arc.endAngle), y: arc.centre.y + arc.radius * Math.sin(arc.endAngle) },
    { x: arc.centre.x, y: arc.centre.y + arc.radius },
  ]);
  // Les guides de construction additifs (ligne de naissance, jambages, cercles complets, axe)
  // entrent aussi dans l'enveloppe calculée ici — un sur-ensemble sûr (centre±rayon) même pour
  // un cercle entier, cohérent avec le correctif de bounds de l'adaptateur (C4-LOT1-V1 §36).
  const segmentPoints = extraSegments.flatMap((s) => [s.start, s.end]);
  const circlePoints = extraCircles.flatMap((c) => [
    { x: c.centre.x - c.radius, y: c.centre.y - c.radius },
    { x: c.centre.x + c.radius, y: c.centre.y + c.radius },
  ]);
  const points = [...allPoints, ...arcSamplePoints, ...segmentPoints, ...circlePoints];
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y), 0);
  const maxY = Math.max(...points.map((p) => p.y));
  const margin = Math.max(50, width * 0.08);
  const boundingBox = { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
  return {
    id: `arch-${type}`,
    type: "arch",
    parameters,
    primitives,
    boundingBox,
    centre: { x: width / 2, y: (minY + maxY) / 2 },
    width: boundingBox.maxX - boundingBox.minX,
    height: boundingBox.maxY - boundingBox.minY,
    rotation: 0,
    metadata: { archType: type },
    constructionSteps: steps,
    quality: "exact",
  };
}

function createSemicircularOrSegmentalArch(params: Extract<ArchParameters, { type: "semicircular" | "segmental" }>): ParametricShape<ArchParameters> {
  const width = assertFinitePositive(params.width, "La largeur");
  const springHeight = params.springHeight ?? 0;
  const thickness = Math.max(0, params.thickness ?? 0);
  const rise = params.type === "semicircular" ? width / 2 : assertFinitePositive(params.rise, "La flèche");
  const { radius, centre, A, B, S, startAngle, endAngle } = buildFromRadiusAndRise(width, rise, springHeight);
  if (thickness >= radius) throw new Error("L'épaisseur supprime la géométrie intérieure de l'arche.");
  const { L, R, steps } = jambsAndSteps(A, B, springHeight, radius, [
    { id: "step-centre", title: "Repérer le centre", instruction: `Placer le centre O sur l'axe, à ${formatMillimetres(Math.abs(radius - rise))} ${radius - rise >= 0 ? "sous" : "au-dessus de"} la ligne de départ.`, measurements: Math.abs(radius - rise) > 1e-9 ? [formatMillimetres(Math.abs(radius - rise))] : undefined, geometry: [{ kind: "point", id: "O" }] },
  ]);
  steps.push(
    { id: "step-trace", title: "Tracer le demi-cercle", instruction: "Piquer en O et tracer l'arc de A à B en passant par le sommet S.", geometry: [{ kind: "arc", arc: { centre, radius, startAngle, endAngle, counterClockwise: false } }] },
    { id: "step-control", title: "Contrôler", instruction: `Contrôler que O est exactement à ${formatMillimetres(radius)} de A et de B, et que le sommet S est au bon niveau.`, measurements: [formatMillimetres(radius)], geometry: [{ kind: "point", id: "O" }, { kind: "point", id: "A" }, { kind: "point", id: "B" }, { kind: "point", id: "S" }] },
  );
  // Guides de construction additifs (C4-LOT2-V1 §10) : ligne de naissance (masquée par défaut,
  // couche Construction), jambages (tracé final, uniquement si non dégénérés — un springHeight
  // nul, cas de l'arche plein cintre, place L exactement sur A : un segment de longueur nulle ne
  // serait ni visible ni traçable/décalable), axe vertical de symétrie (couche Axes, visible par
  // défaut) — restitue la pédagogie de l'ancien modèle (`shapes.ts::createAdvancedArch`) sans
  // dupliquer sa formule.
  const springLine: Segment2D = { start: A, end: B, role: "construction" };
  const jambs: Segment2D[] = springHeight > 0 ? [{ start: L, end: A, role: "shape" }, { start: R, end: B, role: "shape" }] : [];
  const axisMargin = Math.max(50, width * 0.1);
  const axis: Segment2D = { start: { x: centre.x, y: Math.min(0, springHeight) - axisMargin }, end: { x: centre.x, y: springHeight + rise + axisMargin }, role: "axis" };
  return archResult(params.type, width, thickness, [{ centre, radius, startAngle, endAngle }], { O: centre, A, B, S, L, R }, steps, params, { segments: [springLine, ...jambs, axis] });
}

function createLancetArch(params: Extract<ArchParameters, { type: "lancet" }>): ParametricShape<ArchParameters> {
  const width = assertFinitePositive(params.width, "La largeur");
  const half = width / 2;
  const springHeight = params.springHeight ?? 0;
  const thickness = Math.max(0, params.thickness ?? 0);
  let offset: number;
  if (params.rise !== undefined) {
    const rise = assertFinitePositive(params.rise, "La flèche");
    if (rise <= half) throw new Error("La flèche d'une ogive doit dépasser la demi-largeur (sinon utiliser une arche segmentaire).");
    offset = (rise ** 2 - half ** 2) / (2 * half);
  } else {
    offset = half * POINTEDNESS_RATIO[params.pointedness ?? "equilateral"];
  }
  const radius = half + offset;
  const rise = Math.sqrt(Math.max(0, radius ** 2 - offset ** 2));
  const A: Point2D = { x: 0, y: springHeight };
  const B: Point2D = { x: width, y: springHeight };
  const S: Point2D = { x: half, y: springHeight + rise };
  const L: Point2D = { x: 0, y: 0 };
  const R: Point2D = { x: width, y: 0 };
  // Arc gauche (A → S) centré à droite ; arc droit (S → B) centré à gauche, par symétrie.
  const centreRight: Point2D = { x: half + offset, y: springHeight };
  const centreLeft: Point2D = { x: half - offset, y: springHeight };
  if (thickness >= radius) throw new Error("L'épaisseur supprime la géométrie intérieure de l'ogive.");
  const leftArc = { centre: centreRight, radius, startAngle: Math.atan2(A.y - centreRight.y, A.x - centreRight.x), endAngle: Math.atan2(S.y - centreRight.y, S.x - centreRight.x) };
  const rightArc = { centre: centreLeft, radius, startAngle: Math.atan2(S.y - centreLeft.y, S.x - centreLeft.x), endAngle: Math.atan2(B.y - centreLeft.y, B.x - centreLeft.x) };
  // Steps bespoke (C4-LOT2-V1 §8) : `jambsAndSteps` (jambages + départ générique) ne correspond
  // pas à la pédagogie de l'ogive (aucun jambage, les centres sont le cœur de la construction) —
  // séquence dédiée : naissance / centres / rayon / arc gauche / arc droit / sommet.
  const steps: ConstructionStep[] = [
    { id: "step-baseline", title: "Tracer la ligne de naissance", instruction: `Positionner A et B à ${formatMillimetres(width)} l'un de l'autre.`, measurements: [formatMillimetres(width)], geometry: [{ kind: "point", id: "A" }, { kind: "point", id: "B" }, { kind: "segment", segment: { start: A, end: B } }] },
    { id: "step-centres", title: "Placer les deux centres", instruction: `Placer les deux centres CG et CD sur la ligne de naissance, symétriques par rapport à l'axe, distants de ${formatMillimetres(2 * offset)}.`, measurements: [formatMillimetres(2 * offset)], geometry: [{ kind: "point", id: "CG" }, { kind: "point", id: "CD" }] },
    { id: "step-radius", title: "Régler le rayon", instruction: `Régler le compas au rayon ${formatMillimetres(radius)} — la même ouverture sert aux deux arcs.`, measurements: [formatMillimetres(radius)], geometry: [] },
    { id: "step-arc-left", title: "Tracer l'arc gauche", instruction: "Depuis CD, tracer l'arc de A jusqu'au sommet S.", geometry: [{ kind: "arc", arc: { ...leftArc, counterClockwise: false } }] },
    { id: "step-arc-right", title: "Tracer l'arc droit", instruction: "Sans changer l'ouverture, depuis CG, tracer l'arc de S jusqu'à B.", geometry: [{ kind: "arc", arc: { ...rightArc, counterClockwise: false } }] },
    { id: "step-apex", title: "Vérifier le sommet", instruction: "Contrôler que les deux arcs se rejoignent en un point unique S, sur l'axe médian.", geometry: [{ kind: "point", id: "S" }] },
  ];
  // Guides de construction additifs (C4-LOT2-V1 §10) : les deux cercles complets dont les arcs
  // ne sont qu'une portion (rôle "construction", masqués par défaut), et l'axe horizontal de la
  // ligne de naissance (rôle "axis", visible par défaut) — restitue la pédagogie de l'ancien
  // modèle `models/ogive.ts` (cercles + axe-x) sans dupliquer sa formule.
  const circleRight: Circle2D = { centre: centreRight, radius, role: "construction" };
  const circleLeft: Circle2D = { centre: centreLeft, radius, role: "construction" };
  const axisMargin = Math.max(80, width * 0.15);
  const axis: Segment2D = { start: { x: -axisMargin, y: springHeight }, end: { x: width + axisMargin, y: springHeight }, role: "axis" };
  return archResult("lancet", width, thickness, [leftArc, rightArc], { A, B, S, L, R, CG: centreLeft, CD: centreRight }, steps, params, { segments: [axis], circles: [circleRight, circleLeft] });
}

/** Point de tangence interne entre deux cercles dont les centres sont distants de |r2 - r1|. */
function internalTangentPoint(c1: Point2D, r1: number, c2: Point2D, r2: number): Point2D {
  const d = distance(c1, c2);
  if (d < 1e-9) throw new Error("Construction impossible : centres confondus, tangence indéfinie.");
  if (r2 >= r1) return { x: c1.x + ((c1.x - c2.x) / d) * r1, y: c1.y + ((c1.y - c2.y) / d) * r1 };
  return { x: c2.x + ((c2.x - c1.x) / d) * r2, y: c2.y + ((c2.y - c1.y) / d) * r2 };
}

function createCompoundArch(params: Extract<ArchParameters, { type: "compound" }>): ParametricShape<ArchParameters> {
  const width = assertFinitePositive(params.width, "La largeur");
  const half = width / 2;
  const springHeight = params.springHeight ?? 0;
  const thickness = Math.max(0, params.thickness ?? 0);
  const haunchRadius = assertFinitePositive(params.haunchRadius, "Le rayon des naissances");
  const crownRadius = assertFinitePositive(params.crownRadius, "Le rayon de la clé");
  if (haunchRadius >= half) throw new Error("Le rayon des naissances doit être inférieur à la demi-largeur pour une arche à quatre centres.");
  if (crownRadius <= haunchRadius) throw new Error("Le rayon de clé doit être supérieur au rayon des naissances pour une arche à quatre centres.");
  // Centres des arcs de naissance sur la ligne de départ, à haunchRadius des retombées A et B.
  const haunchCentreRight: Point2D = { x: haunchRadius, y: springHeight };
  const haunchCentreLeft: Point2D = { x: width - haunchRadius, y: springHeight };
  const centreDx = half - haunchRadius;
  const discriminant = (crownRadius - haunchRadius) ** 2 - centreDx ** 2;
  if (discriminant < 0) throw new Error("Construction impossible : ces deux rayons ne permettent pas une tangence sur l'axe (arche à quatre centres non constructible).");
  const dy = Math.sqrt(discriminant);
  // Le centre de clé est sur l'axe, à distance (crownRadius - haunchRadius) du centre de naissance (tangence interne).
  const crownCentre: Point2D = { x: half, y: springHeight + dy };
  const S: Point2D = { x: half, y: crownCentre.y + crownRadius };
  const A: Point2D = { x: 0, y: springHeight };
  const B: Point2D = { x: width, y: springHeight };
  const L: Point2D = { x: 0, y: 0 };
  const R: Point2D = { x: width, y: 0 };
  const tangentLeft = internalTangentPoint(haunchCentreRight, haunchRadius, crownCentre, crownRadius);
  const tangentRight = internalTangentPoint(haunchCentreLeft, haunchRadius, crownCentre, crownRadius);
  if (thickness >= Math.min(haunchRadius, crownRadius)) throw new Error("L'épaisseur supprime la géométrie intérieure de l'arche composée.");
  const haunchLeftArc = { centre: haunchCentreRight, radius: haunchRadius, startAngle: Math.atan2(A.y - haunchCentreRight.y, A.x - haunchCentreRight.x), endAngle: Math.atan2(tangentLeft.y - haunchCentreRight.y, tangentLeft.x - haunchCentreRight.x) };
  const crownLeftArc = { centre: crownCentre, radius: crownRadius, startAngle: Math.atan2(tangentLeft.y - crownCentre.y, tangentLeft.x - crownCentre.x), endAngle: Math.atan2(S.y - crownCentre.y, S.x - crownCentre.x) };
  const crownRightArc = { centre: crownCentre, radius: crownRadius, startAngle: Math.atan2(S.y - crownCentre.y, S.x - crownCentre.x), endAngle: Math.atan2(tangentRight.y - crownCentre.y, tangentRight.x - crownCentre.x) };
  const haunchRightArc = { centre: haunchCentreLeft, radius: haunchRadius, startAngle: Math.atan2(tangentRight.y - haunchCentreLeft.y, tangentRight.x - haunchCentreLeft.x), endAngle: Math.atan2(B.y - haunchCentreLeft.y, B.x - haunchCentreLeft.x) };
  const { steps } = jambsAndSteps(A, B, springHeight, haunchRadius, [
    { id: "step-haunch-centres", instruction: `Placer les centres de naissance à ${formatMillimetres(haunchRadius)} de A et de B sur la ligne de départ.`, measurements: [formatMillimetres(haunchRadius)], geometry: [{ kind: "point", id: "CH1" }, { kind: "point", id: "CH2" }] },
    { id: "step-crown-centre", instruction: `Placer le centre de clé C sur l'axe, permettant la tangence avec un rayon de ${formatMillimetres(crownRadius)}.`, measurements: [formatMillimetres(crownRadius)], geometry: [{ kind: "point", id: "C" }] },
  ]);
  steps.push({ id: "step-trace", instruction: "Tracer les quatre arcs successifs, tangents deux à deux, des retombées jusqu'au sommet.", geometry: [haunchLeftArc, crownLeftArc, crownRightArc, haunchRightArc].map((arc) => ({ kind: "arc" as const, arc: { ...arc, counterClockwise: false } })) });
  return archResult("compound", width, thickness, [haunchLeftArc, crownLeftArc, crownRightArc, haunchRightArc], { A, B, S, L, R, CH1: haunchCentreRight, CH2: haunchCentreLeft, C: crownCentre }, steps, params);
}

export function createArch(params: ArchParameters): ParametricShape<ArchParameters> {
  if (params.type === "semicircular" || params.type === "segmental") return createSemicircularOrSegmentalArch(params);
  if (params.type === "lancet") return createLancetArch(params);
  return createCompoundArch(params);
}

registerShapeGenerator<ArchParameters>("arch", createArch);
