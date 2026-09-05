// ENGINE A — générateurs de formes du moteur Pro historique (`ShapeGeometry`).
//
// Vivant et non remplaçable : consommé par `pro-engine.ts` (arche avancée, niche cintrée,
// plafond circulaire, ellipse en pièce, couronne, motif radial). Sa spécificité est le
// positionnement dans une pièce (`positionInRoom`), absent d'Engine B.
//
// Un NOUVEAU tracé de la bibliothèque / de l'Atelier ne s'ajoute PAS ici : il s'écrit dans
// `geometry/engine/` (Engine B) puis se projette via `geometry/adapters/`.
// Frontière complète : `apps/tools/docs/GEOMETRY_ENGINES_BOUNDARY_V1.md`.
import { arcLength, assertFinitePositive, boundsFromPoints, distance, point, polar, sagitta, type Arc, type Axis, type Circle, type Dimension, type Ellipse, type Point, type Segment } from "./primitives";
import { validateShapeGeometry, type Quantity, type ShapeGeometry, type SiteControl, type SiteStep } from "./shape-model";

const mm = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const degree = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const formatMm = (value: number) => `${mm.format(value)} mm`;
const formatDegree = (value: number) => `${degree.format(value)}°`;

function base(id: string, name: string, points: Point[], bounds = boundsFromPoints(points, Math.max(100, (Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))) * .08))) {
  const origin = points.find((item) => item.id === "O") ?? point("O", 0, 0, "O");
  return { id, name, bounds, referenceFrame: { unit: "mm" as const, origin, xLabel: "X" as const, yLabel: "Y" as const, yOrientation: "up" as const }, axes: [] as Axis[], points, segments: [] as Segment[], arcs: [] as Arc[], circles: [] as Circle[], ellipses: [] as Ellipse[], constructionLines: [] as Segment[], dimensions: [] as Dimension[], controls: [] as SiteControl[], quantities: [] as Quantity[], steps: [] as SiteStep[] };
}

function dimension(id: string, kind: Dimension["kind"], from: Point, to: Point, label: string, value: number, unit: Dimension["unit"] = "mm", offset = 0): Dimension {
  return { id, kind, from, to, label, value, unit, offset };
}

export type ArchMode = "semicircle" | "segmental" | "radius" | "total-spring" | "width-rise";
export type AdvancedArchInput = { width: number; mode: ArchMode; rise?: number; radius?: number; totalHeight?: number; springHeight?: number; thickness?: number };

export function createAdvancedArch(input: AdvancedArchInput, shapeId = "advanced-arch", shapeName = "Arche avancée"): ShapeGeometry {
  const width = assertFinitePositive(input.width, "La largeur"); const half = width / 2;
  let rise: number;
  if (input.mode === "semicircle") rise = half;
  else if (input.mode === "radius") {
    const radiusInput = assertFinitePositive(input.radius ?? 0, "Le rayon");
    if (radiusInput < half) throw new Error("Le rayon imposé doit être au moins égal à la demi-largeur.");
    rise = sagitta(radiusInput, width);
  } else if (input.mode === "total-spring") {
    const total = assertFinitePositive(input.totalHeight ?? 0, "La hauteur totale"); const spring = assertFinitePositive(input.springHeight ?? 0, "Le départ du cintre");
    if (spring >= total) throw new Error("Le départ du cintre doit être sous la hauteur totale.");
    rise = total - spring;
  } else rise = assertFinitePositive(input.rise ?? 0, "La flèche");
  const radius = (half ** 2 + rise ** 2) / (2 * rise);
  const centreOffset = radius - rise;
  const angle = rise <= half ? 2 * Math.asin(half / radius) : 2 * Math.PI - 2 * Math.asin(half / radius);
  const thickness = Math.max(0, input.thickness ?? 0);
  if (thickness >= radius) throw new Error("L’épaisseur supprime la géométrie intérieure de l’arche.");
  const springHeight = input.mode === "total-spring" ? input.springHeight! : 0;
  const O = point("O", half, springHeight - centreOffset, "Centre O", "construction");
  const A = point("A", 0, springHeight, "Départ gauche A"); const B = point("B", width, springHeight, "Départ droit B"); const S = point("S", half, springHeight + rise, "Sommet S");
  const L = point("L", 0, 0, "Pied gauche L"); const R = point("R", width, 0, "Pied droit R");
  const points = [O, A, B, S, L, R]; const model = base(shapeId, shapeName, points, boundsFromPoints(points, Math.max(120, width * .12)));
  const startAngle = Math.atan2(A.y - O.y, A.x - O.x); const endAngle = Math.atan2(B.y - O.y, B.x - O.x);
  model.arcs.push({ id: "arc-outer", centre: O, radius, startAngle, endAngle, counterClockwise: false, role: "shape" });
  if (thickness > 0) model.arcs.push({ id: "arc-inner", centre: O, radius: radius - thickness, startAngle, endAngle, counterClockwise: false, role: "shape" });
  model.segments.push({ id: "jamb-left", start: L, end: A, role: "shape" }, { id: "jamb-right", start: R, end: B, role: "shape" });
  model.constructionLines.push({ id: "spring-line", start: A, end: B, role: "construction" }, { id: "radius-left", start: O, end: A, role: "construction" }, { id: "radius-right", start: O, end: B, role: "construction" }, { id: "centre-axis", start: point("axis-bottom", half, model.bounds.minY), end: point("axis-top", half, model.bounds.maxY), role: "axis" });
  model.axes.push({ id: "axis-y", origin: O, direction: { x: 0, y: 1 }, label: "Axe de symétrie" });
  model.dimensions.push(dimension("dim-width", "linear", A, B, `Largeur ${formatMm(width)}`, width, "mm", -80), dimension("dim-rise", "linear", point("rise-base", half, springHeight), S, `Flèche ${formatMm(rise)}`, rise, "mm", 70), dimension("dim-radius", "radius", O, A, `R ${formatMm(radius)}`, radius));
  if (springHeight > 0) model.dimensions.push(dimension("dim-spring", "linear", L, A, `Départ ${formatMm(springHeight)}`, springHeight, "mm", -70));
  model.controls.push({ id: "control-width", label: "Largeur entre A et B", value: distance(A, B), unit: "mm", pointIds: ["A", "B"] }, { id: "control-radius-a", label: "Distance O → A", value: distance(O, A), unit: "mm", pointIds: ["O", "A"] }, { id: "control-radius-b", label: "Distance O → B", value: distance(O, B), unit: "mm", pointIds: ["O", "B"] }, { id: "control-height", label: "Flèche au sommet", value: rise, unit: "mm", pointIds: ["A", "S"] });
  model.quantities.push({ id: "q-radius", label: "Rayon de traçage", value: radius, unit: "mm", quality: "exact" }, { id: "q-arc", label: "Longueur géométrique de l’arc", value: arcLength(radius, angle), unit: "mm", quality: "exact" }, { id: "q-angle", label: "Angle au centre", value: angle * 180 / Math.PI, unit: "°", quality: "exact" });
  model.steps.push(
    { id: "step-jambs", title: "Implanter les jambages", instruction: `Positionnez A et B à ${formatMm(width)} l’un de l’autre.`, measurements: [formatMm(width)], pointIds: ["A", "B"], controlId: "control-width" },
    { id: "step-spring", title: "Tracer le départ du cintre", instruction: springHeight > 0 ? `Tracez la ligne A–B à ${formatMm(springHeight)} au-dessus des pieds.` : "Tracez la ligne de départ A–B et son axe médian.", measurements: springHeight > 0 ? [formatMm(springHeight)] : [], pointIds: ["A", "B", "L", "R"] },
    { id: "step-centre", title: "Localiser le centre", instruction: `Sur l’axe, placez O à ${formatMm(Math.abs(centreOffset))} ${centreOffset >= 0 ? "sous" : "au-dessus de"} A–B.`, measurements: [formatMm(Math.abs(centreOffset))], pointIds: ["O", "A", "B"] },
    { id: "step-radius", title: "Régler la ficelle", instruction: `Réglez le compas ou la ficelle au rayon exact ${formatMm(radius)}.`, measurements: [formatMm(radius)], pointIds: ["O", "A"], controlId: "control-radius-a" },
    { id: "step-trace", title: "Tracer l’arc", instruction: "Piquez en O et tracez sans modifier le réglage, de A à B en passant par S.", measurements: [formatMm(rise)], pointIds: ["O", "A", "S", "B"], controlId: "control-height" },
  );
  return validateShapeGeometry(model);
}

export type RoomPositionInput = { roomLength: number; roomWidth: number; shapeWidth: number; shapeHeight: number; mode: "centred" | "coordinates" | "from-walls"; centreX?: number; centreY?: number; left?: number; bottom?: number };
export function positionInRoom(input: RoomPositionInput) {
  const roomLength = assertFinitePositive(input.roomLength, "La longueur de pièce"); const roomWidth = assertFinitePositive(input.roomWidth, "La largeur de pièce");
  const shapeWidth = assertFinitePositive(input.shapeWidth, "La largeur de forme"); const shapeHeight = assertFinitePositive(input.shapeHeight, "La hauteur de forme");
  let centreX = roomLength / 2; let centreY = roomWidth / 2;
  if (input.mode === "coordinates") { centreX = input.centreX ?? 0; centreY = input.centreY ?? 0; }
  if (input.mode === "from-walls") { centreX = (input.left ?? 0) + shapeWidth / 2; centreY = (input.bottom ?? 0) + shapeHeight / 2; }
  const distances = { left: centreX - shapeWidth / 2, right: roomLength - centreX - shapeWidth / 2, bottom: centreY - shapeHeight / 2, top: roomWidth - centreY - shapeHeight / 2 };
  if (Object.values(distances).some((value) => !Number.isFinite(value) || value < 0)) throw new Error("La forme dépasse les limites de la pièce.");
  return { roomLength, roomWidth, centre: point("O", centreX, centreY, "Centre O", "construction"), distances };
}

function addRoom(model: ReturnType<typeof base>, placement: ReturnType<typeof positionInRoom>, shapePoints: Point[]) {
  const P0 = point("P0", 0, 0, "Origine pièce"); const P1 = point("P1", placement.roomLength, 0, "Angle pièce"); const P2 = point("P2", placement.roomLength, placement.roomWidth, "Angle pièce"); const P3 = point("P3", 0, placement.roomWidth, "Angle pièce");
  model.points.splice(0, model.points.length, P0, P1, P2, P3, placement.centre, ...shapePoints);
  model.bounds = boundsFromPoints([P0, P1, P2, P3], Math.max(150, placement.roomLength * .05));
  model.constructionLines.push({ id: "room-bottom", start: P0, end: P1, role: "construction" }, { id: "room-right", start: P1, end: P2, role: "construction" }, { id: "room-top", start: P2, end: P3, role: "construction" }, { id: "room-left", start: P3, end: P0, role: "construction" }, { id: "axis-x", start: point("axis-x-start", 0, placement.centre.y), end: point("axis-x-end", placement.roomLength, placement.centre.y), role: "axis" }, { id: "axis-y", start: point("axis-y-start", placement.centre.x, 0), end: point("axis-y-end", placement.centre.x, placement.roomWidth), role: "axis" });
  model.axes.push({ id: "room-x", origin: P0, direction: { x: 1, y: 0 }, label: "X" }, { id: "room-y", origin: P0, direction: { x: 0, y: 1 }, label: "Y" });
}

export function createRoomCircle(input: Omit<RoomPositionInput, "shapeWidth" | "shapeHeight"> & { diameter: number }): ShapeGeometry {
  const diameter = assertFinitePositive(input.diameter, "Le diamètre"); const radius = diameter / 2;
  const placement = positionInRoom({ ...input, shapeWidth: diameter, shapeHeight: diameter }); const O = placement.centre;
  const N = point("N", O.x, O.y + radius, "Nord N"); const E = point("E", O.x + radius, O.y, "Est E"); const S = point("S", O.x, O.y - radius, "Sud S"); const W = point("W", O.x - radius, O.y, "Ouest W");
  const model = base("room-circle", "Plafond circulaire", [O, N, E, S, W]); addRoom(model, placement, [N, E, S, W]);
  model.circles.push({ id: "circle-main", centre: O, radius, role: "shape" });
  model.dimensions.push(dimension("dim-diameter", "diameter", W, E, `Ø ${formatMm(diameter)}`, diameter), dimension("dim-left", "linear", point("left-wall-o", 0, O.y), O, `Axe X ${formatMm(O.x)}`, O.x, "mm", 70), dimension("dim-bottom", "linear", point("bottom-wall-o", O.x, 0), O, `Axe Y ${formatMm(O.y)}`, O.y, "mm", 70));
  const wallControls = [["left", O.x], ["right", placement.roomLength - O.x], ["bottom", O.y], ["top", placement.roomWidth - O.y]] as const;
  for (const [side, value] of wallControls) model.controls.push({ id: `control-${side}`, label: `Centre → mur ${side}`, value, unit: "mm", pointIds: ["O", side === "left" || side === "bottom" ? "P0" : "P2"] });
  model.quantities.push({ id: "q-radius", label: "Rayon", value: radius, unit: "mm", quality: "exact" }, { id: "q-circumference", label: "Longueur géométrique du pourtour", value: 2 * Math.PI * radius, unit: "mm", quality: "exact" }, { id: "q-area", label: "Surface géométrique", value: Math.PI * radius ** 2 / 1_000_000, unit: "m²", quality: "exact" });
  model.steps.push({ id: "step-axis-x", title: "Tracer l’axe horizontal", instruction: `Tracez l’axe à ${formatMm(O.y)} du mur bas.`, measurements: [formatMm(O.y)], pointIds: ["P0", "O"], controlId: "control-bottom" }, { id: "step-axis-y", title: "Tracer l’axe vertical", instruction: `Tracez l’axe à ${formatMm(O.x)} du mur gauche.`, measurements: [formatMm(O.x)], pointIds: ["P0", "O"], controlId: "control-left" }, { id: "step-centre", title: "Matérialiser O", instruction: "L’intersection des deux axes donne le centre O.", measurements: [], pointIds: ["O"] }, { id: "step-radius", title: "Régler la ficelle", instruction: `Réglez la ficelle à ${formatMm(radius)} depuis O.`, measurements: [formatMm(radius)], pointIds: ["O", "E"] }, { id: "step-circle", title: "Tracer et contrôler", instruction: "Tracez le cercle puis contrôlez les quatre points cardinaux.", measurements: [formatMm(diameter)], pointIds: ["N", "E", "S", "W"] });
  return validateShapeGeometry(model);
}

export function createRoomEllipse(input: Omit<RoomPositionInput, "shapeWidth" | "shapeHeight"> & { width: number; height: number }): ShapeGeometry {
  const width = assertFinitePositive(input.width, "La largeur"); const height = assertFinitePositive(input.height, "La hauteur");
  if (height > width) throw new Error("La largeur du grand axe doit être supérieure ou égale à la hauteur du petit axe.");
  const placement = positionInRoom({ ...input, shapeWidth: width, shapeHeight: height }); const O = placement.centre; const a = width / 2; const b = height / 2;
  const majorHorizontal = a >= b; const major = Math.max(a, b); const minor = Math.min(a, b); const focal = Math.sqrt(major ** 2 - minor ** 2);
  const F1 = point("F1", O.x + (majorHorizontal ? -focal : 0), O.y + (majorHorizontal ? 0 : -focal), "Foyer F1", "construction"); const F2 = point("F2", O.x + (majorHorizontal ? focal : 0), O.y + (majorHorizontal ? 0 : focal), "Foyer F2", "construction");
  const A = point("A", O.x - a, O.y, "A"); const B = point("B", O.x + a, O.y, "B"); const C = point("C", O.x, O.y + b, "C"); const D = point("D", O.x, O.y - b, "D");
  const model = base("ellipse", "Ovale / ellipse", [O, F1, F2, A, B, C, D]); addRoom(model, placement, [F1, F2, A, B, C, D]);
  model.ellipses.push({ id: "ellipse-main", centre: O, radiusX: a, radiusY: b, role: "shape" });
  model.dimensions.push(dimension("dim-major", "linear", A, B, `Grand axe ${formatMm(width)}`, width, "mm", -70), dimension("dim-minor", "linear", D, C, `Petit axe ${formatMm(height)}`, height, "mm", 70), dimension("dim-foci", "linear", F1, F2, `Foyers ${formatMm(2 * focal)}`, 2 * focal));
  model.controls.push({ id: "control-string", label: "Longueur de ficelle F1–P–F2", value: 2 * major, unit: "mm", pointIds: ["F1", "A", "F2"] }, { id: "control-foci", label: "Distance entre foyers", value: 2 * focal, unit: "mm", pointIds: ["F1", "F2"] });
  const h = ((a - b) ** 2) / ((a + b) ** 2); const perimeter = Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
  model.quantities.push({ id: "q-focus", label: "Distance centre → foyer", value: focal, unit: "mm", quality: "exact" }, { id: "q-string", label: "Longueur géométrique de ficelle", value: 2 * major, unit: "mm", quality: "exact" }, { id: "q-area", label: "Surface géométrique", value: Math.PI * a * b / 1_000_000, unit: "m²", quality: "exact" }, { id: "q-perimeter", label: "Périmètre (approximation de Ramanujan)", value: perimeter, unit: "mm", quality: "estimate" });
  model.steps.push({ id: "step-axes", title: "Tracer les axes", instruction: `Tracez les axes de ${formatMm(width)} et ${formatMm(height)} qui se croisent en O.`, measurements: [formatMm(width), formatMm(height)], pointIds: ["A", "B", "C", "D", "O"] }, { id: "step-foci", title: "Placer les foyers", instruction: `Placez F1 et F2 à ${formatMm(focal)} de O sur le grand axe.`, measurements: [formatMm(focal)], pointIds: ["O", "F1", "F2"], controlId: "control-foci" }, { id: "step-string", title: "Régler la ficelle", instruction: `Formez une boucle donnant une somme F1–P–F2 constante de ${formatMm(2 * major)}.`, measurements: [formatMm(2 * major)], pointIds: ["F1", "A", "F2"], controlId: "control-string" }, { id: "step-trace", title: "Tracer l’ellipse", instruction: "Gardez la ficelle tendue et déplacez le crayon tout autour des deux foyers.", measurements: [], pointIds: ["F1", "F2", "A", "B", "C", "D"] });
  return validateShapeGeometry(model);
}

export function createRing(outerDiameter: number, innerDiameter?: number, bandWidth?: number): ShapeGeometry {
  const outside = assertFinitePositive(outerDiameter, "Le diamètre extérieur"); const outerRadius = outside / 2;
  const inside = innerDiameter && innerDiameter > 0 ? innerDiameter : outside - 2 * assertFinitePositive(bandWidth ?? 0, "La largeur de bande");
  if (!Number.isFinite(inside) || inside <= 0 || inside >= outside) throw new Error("Le diamètre intérieur doit être positif et inférieur au diamètre extérieur.");
  const innerRadius = inside / 2; const O = point("O", 0, 0, "Centre O", "construction"); const A = point("A", -outerRadius, 0); const B = point("B", outerRadius, 0); const C = point("C", innerRadius, 0);
  const model = base("ring", "Double cercle / couronne", [O, A, B, C], { minX: -outerRadius * 1.2, minY: -outerRadius * 1.2, maxX: outerRadius * 1.2, maxY: outerRadius * 1.2 });
  model.circles.push({ id: "outer-circle", centre: O, radius: outerRadius, role: "shape" }, { id: "inner-circle", centre: O, radius: innerRadius, role: "shape" });
  model.constructionLines.push({ id: "axis-x", start: point("X-", -outerRadius, 0), end: point("X+", outerRadius, 0), role: "axis" }, { id: "axis-y", start: point("Y-", 0, -outerRadius), end: point("Y+", 0, outerRadius), role: "axis" });
  model.dimensions.push(dimension("dim-outer", "diameter", A, B, `Ø ext. ${formatMm(outside)}`, outside), dimension("dim-band", "linear", C, B, `Bande ${formatMm(outerRadius - innerRadius)}`, outerRadius - innerRadius));
  model.controls.push({ id: "control-common-centre", label: "Rayon extérieur O → B", value: outerRadius, unit: "mm", pointIds: ["O", "B"] }, { id: "control-band", label: "Largeur de bande", value: outerRadius - innerRadius, unit: "mm", pointIds: ["C", "B"] });
  model.quantities.push({ id: "q-outer", label: "Circonférence extérieure", value: 2 * Math.PI * outerRadius, unit: "mm", quality: "exact" }, { id: "q-inner", label: "Circonférence intérieure", value: 2 * Math.PI * innerRadius, unit: "mm", quality: "exact" }, { id: "q-area", label: "Surface géométrique de la couronne", value: Math.PI * (outerRadius ** 2 - innerRadius ** 2) / 1_000_000, unit: "m²", quality: "exact" });
  model.steps.push({ id: "step-centre", title: "Tracer les axes", instruction: "Tracez deux axes perpendiculaires et matérialisez leur intersection O.", measurements: [], pointIds: ["O"] }, { id: "step-outer", title: "Tracer l’extérieur", instruction: `Réglez la ficelle à ${formatMm(outerRadius)} et tracez le cercle extérieur.`, measurements: [formatMm(outerRadius)], pointIds: ["O", "B"], controlId: "control-common-centre" }, { id: "step-inner", title: "Tracer l’intérieur", instruction: `Sans déplacer O, réglez la ficelle à ${formatMm(innerRadius)} et tracez le cercle intérieur.`, measurements: [formatMm(innerRadius)], pointIds: ["O", "C"], controlId: "control-band" });
  return validateShapeGeometry(model);
}

export function createRadialMotif(input: { diameter: number; centralDiameter: number; sectors: 4 | 5 | 6 | 8; rotationDegrees?: number; kind?: "flower" | "rosette" }): ShapeGeometry {
  const diameter = assertFinitePositive(input.diameter, "Le diamètre général"); const centralDiameter = assertFinitePositive(input.centralDiameter, "Le diamètre central");
  if (centralDiameter >= diameter) throw new Error("Le diamètre central doit être inférieur au diamètre général.");
  const outerRadius = diameter / 2; const petalRadius = outerRadius / 2; const centreRadius = outerRadius - petalRadius; const rotation = (input.rotationDegrees ?? -90) * Math.PI / 180; const O = point("O", 0, 0, "Centre O", "construction");
  const radialPoints = Array.from({ length: input.sectors }, (_, index) => polar(O, outerRadius, rotation + index * 2 * Math.PI / input.sectors, `P${index + 1}`));
  const petalCentres = Array.from({ length: input.sectors }, (_, index) => polar(O, centreRadius, rotation + index * 2 * Math.PI / input.sectors, `C${index + 1}`));
  const Q = polar(O, outerRadius, rotation + Math.PI, "Q");
  const points = [O, Q, ...radialPoints, ...petalCentres]; const name = input.kind === "rosette" ? "Rosace radiale simple" : `Fleur ${input.sectors} pétales`; const model = base(`radial-${input.kind ?? "flower"}-${input.sectors}`, name, points, { minX: -outerRadius * 1.2, minY: -outerRadius * 1.2, maxX: outerRadius * 1.2, maxY: outerRadius * 1.2 });
  for (let index = 0; index < input.sectors; index++) {
    model.circles.push({ id: `petal-${index + 1}`, centre: petalCentres[index], radius: petalRadius, role: "shape" });
    model.constructionLines.push({ id: `radial-${index + 1}`, start: O, end: radialPoints[index], role: "axis" });
  }
  model.circles.push({ id: "central-circle", centre: O, radius: centralDiameter / 2, role: "shape" }, { id: "construction-circle", centre: O, radius: centreRadius, role: "construction" });
  model.dimensions.push(dimension("dim-diameter", "diameter", Q, radialPoints[0], `Ø général ${formatMm(diameter)}`, diameter), dimension("dim-sector", "angle", O, radialPoints[0], `Secteur ${formatDegree(360 / input.sectors)}`, 360 / input.sectors, "°"));
  model.controls.push({ id: "control-diameter", label: "Distance P1 → Q / diamètre", value: diameter, unit: "mm", pointIds: ["P1", "Q"] }, { id: "control-sector", label: "Angle de secteur", value: 360 / input.sectors, unit: "°", pointIds: ["O", "P1", "P2"] });
  model.quantities.push({ id: "q-sector", label: "Angle de secteur", value: 360 / input.sectors, unit: "°", quality: "exact" }, { id: "q-petal-radius", label: "Rayon de chaque pétale", value: petalRadius, unit: "mm", quality: "exact" }, { id: "q-profile", label: "Longueur géométrique des cercles pétales", value: input.sectors * 2 * Math.PI * petalRadius, unit: "mm", quality: "exact" });
  model.steps.push({ id: "step-centre", title: "Matérialiser le centre", instruction: "Tracez deux axes perpendiculaires et marquez O.", measurements: [], pointIds: ["O"] }, { id: "step-outer", title: "Tracer le cercle directeur", instruction: `Tracez un cercle directeur de rayon ${formatMm(outerRadius)}.`, measurements: [formatMm(outerRadius)], pointIds: ["O", "P1"], controlId: "control-diameter" }, { id: "step-sectors", title: "Diviser régulièrement", instruction: `Reportez ${input.sectors} secteurs de ${formatDegree(360 / input.sectors)} à partir de l’orientation ${formatDegree((input.rotationDegrees ?? -90 + 360) % 360)}.`, measurements: [formatDegree(360 / input.sectors)], pointIds: ["O", ...radialPoints.map((item) => item.id)], controlId: "control-sector" }, { id: "step-centres", title: "Placer les centres de pétales", instruction: `Sur chaque rayon, placez C1…C${input.sectors} à ${formatMm(centreRadius)} de O.`, measurements: [formatMm(centreRadius)], pointIds: ["O", ...petalCentres.map((item) => item.id)] }, { id: "step-petals", title: "Tracer les pétales", instruction: `Depuis chaque centre C, tracez un cercle de rayon ${formatMm(petalRadius)}. Conservez les arcs formant le motif.`, measurements: [formatMm(petalRadius)], pointIds: [...petalCentres.map((item) => item.id), ...radialPoints.map((item) => item.id)] }, { id: "step-centre-circle", title: "Tracer le centre", instruction: `Depuis O, tracez le cercle central de rayon ${formatMm(centralDiameter / 2)}.`, measurements: [formatMm(centralDiameter / 2)], pointIds: ["O"] });
  return validateShapeGeometry(model);
}

export function createArchedNiche(input: AdvancedArchInput & { depth: number }): ShapeGeometry {
  const depth = assertFinitePositive(input.depth, "La profondeur"); const model = createAdvancedArch(input, "arched-niche", "Niche cintrée");
  const width = input.width; const spring = input.mode === "total-spring" ? input.springHeight! : 0; const radius = model.quantities.find((q) => q.id === "q-radius")!.value; const angle = model.quantities.find((q) => q.id === "q-angle")!.value * Math.PI / 180;
  const segmentArea = radius ** 2 / 2 * (angle - Math.sin(angle)); const faceArea = width * spring + segmentArea; const perimeter = width + spring * 2 + model.quantities.find((q) => q.id === "q-arc")!.value;
  const cutY = model.bounds.minY - 220; const Z0 = point("Z0", 0, cutY, "Coupe Z0"); const Z1 = point("Z1", depth, cutY, "Coupe Z1"); const Z2 = point("Z2", depth, cutY + 120, "Coupe Z2"); const Z3 = point("Z3", 0, cutY + 120, "Coupe Z3");
  return validateShapeGeometry({
    ...model,
    bounds: boundsFromPoints([...model.points, Z0, Z1, Z2, Z3], 120),
    points: [...model.points, Z0, Z1, Z2, Z3],
    segments: [...model.segments, { id: "cut-bottom", start: Z0, end: Z1, role: "shape" }, { id: "cut-end", start: Z1, end: Z2, role: "shape" }, { id: "cut-top", start: Z2, end: Z3, role: "shape" }, { id: "cut-face", start: Z3, end: Z0, role: "shape" }],
    quantities: [...model.quantities, { id: "q-face-area", label: "Surface géométrique de face", value: faceArea / 1_000_000, unit: "m²", quality: "exact" }, { id: "q-perimeter", label: "Périmètre intérieur de face", value: perimeter, unit: "mm", quality: "exact" }, { id: "q-interior", label: "Surface intérieure développée approximative", value: (perimeter * depth + faceArea) / 1_000_000, unit: "m²", quality: "estimate" }],
    dimensions: [...model.dimensions, dimension("dim-depth", "linear", Z0, Z1, `Coupe · profondeur ${formatMm(depth)}`, depth, "mm", -55)],
    controls: [...model.controls, { id: "control-depth", label: "Profondeur nette Z0 → Z1", value: depth, unit: "mm", pointIds: ["Z0", "Z1"] }],
    steps: [model.steps[0], { id: "step-depth", title: "Contrôler la profondeur", instruction: `Dans la coupe, contrôlez Z0–Z1 à ${formatMm(depth)} avant le tracé de face.`, measurements: [formatMm(depth)], pointIds: ["Z0", "Z1"], controlId: "control-depth" }, ...model.steps.slice(1)],
  });
}
