/**
 * C2 — Pont Engine B (`ParametricShape`) → Engine A (`TraceModel`).
 *
 * Direction de convergence retenue : Engine B est la source de vérité géométrique
 * paramétrique générique ; `TraceModel` reste le contrat UI/pédagogique consommé par
 * `TraceViewer`/`TraceSteps`/`SiteMode`. Ce fichier ne fusionne pas les deux moteurs, il
 * projette l'un vers l'autre à l'exécution — jamais de recalcul de géométrie, jamais de
 * duplication de formule, jamais de sérialisation intermédiaire (voir §15 du lot de
 * convergence : sérialiser reste `{type, parameters}`, jamais un cache de points).
 *
 * Séparation stricte : la géométrie vient uniquement de `ParametricShape` ; tout le contenu
 * pédagogique (nom, catégorie, difficulté, tags, paramètres affichés, explication, statut)
 * est fourni séparément par l'appelant via `TraceModelMetadata` — Engine B ne connaît, et ne
 * doit jamais connaître, ce vocabulaire produit/UI.
 */
import type { CategoryId } from "../../categories";
import type { Arc, Circle, Dimension, Ellipse, Point, Polygon, Polyline, Segment } from "../primitives";
import type { RealisticPreviewMetadata, TraceDifficulty, TraceExplanation, TraceModel, TraceParameter, TraceStatus } from "../trace-model";
import { validateTraceModel } from "../trace-model";
import type { Quantity, SiteStep } from "../shape-model";
import type { Arc2D, Circle2D, Ellipse2D, Point2D, Segment2D } from "../engine/types";
import { boundsFromPoints as boundsFromPoints2D } from "../engine/measure";
import type { DimensionResult } from "../engine/dimensions";
import type { ParametricShape } from "../engine/model";
import { validateGeometry } from "../engine/validate";
import { withId } from "./point-compat";

export type TraceModelMetadata = {
  /** Par défaut `shape.id` si omis. */
  id?: string;
  name: string;
  slug: string;
  categoryId: CategoryId;
  difficulty: TraceDifficulty;
  tags: readonly string[];
  status: TraceStatus;
  parameters: readonly TraceParameter[];
  explanation?: TraceExplanation;
  realisticPreview?: RealisticPreviewMetadata;
};

export type ParametricShapeAdapterOptions = {
  /**
   * Cotes déjà calculées via `engine/dimensions.ts` puis converties par
   * `dimensionResultToDimension`. L'adaptateur ne calcule aucune cote lui-même (§11 : ne pas
   * réécrire les cotes à la main).
   */
  dimensions?: readonly Dimension[];
};

const EPS = 1e-9;
const near = (a: number, b: number) => Math.abs(a - b) <= EPS;
const pointsEqual = (a: { x: number; y: number }, b: { x: number; y: number }) => near(a.x, b.x) && near(a.y, b.y);

/**
 * Résout par égalité de valeur (pas de référence — les générateurs Engine B reconstruisent
 * souvent un objet littéral équivalent plutôt que de partager une référence) une géométrie
 * embarquée dans une étape de construction vers l'entité déjà mappée correspondante.
 */
function createShapeRegistry() {
  const segments: { value: Segment2D; id: string }[] = [];
  const circles: { value: Circle2D; id: string }[] = [];
  const arcs: { value: Arc2D; id: string }[] = [];
  const ellipses: { value: Ellipse2D; id: string }[] = [];
  return {
    registerSegment: (value: Segment2D, id: string) => segments.push({ value, id }),
    registerCircle: (value: Circle2D, id: string) => circles.push({ value, id }),
    registerArc: (value: Arc2D, id: string) => arcs.push({ value, id }),
    registerEllipse: (value: Ellipse2D, id: string) => ellipses.push({ value, id }),
    findSegment: (value: Segment2D) => segments.find((e) => pointsEqual(e.value.start, value.start) && pointsEqual(e.value.end, value.end))?.id,
    findCircle: (value: Circle2D) => circles.find((e) => pointsEqual(e.value.centre, value.centre) && near(e.value.radius, value.radius))?.id,
    findArc: (value: Arc2D) =>
      arcs.find(
        (e) =>
          pointsEqual(e.value.centre, value.centre) &&
          near(e.value.radius, value.radius) &&
          near(e.value.startAngle, value.startAngle) &&
          near(e.value.endAngle, value.endAngle) &&
          (e.value.counterClockwise !== false) === (value.counterClockwise !== false),
      )?.id,
    findEllipse: (value: Ellipse2D) =>
      ellipses.find((e) => pointsEqual(e.value.centre, value.centre) && near(e.value.radiusX, value.radiusX) && near(e.value.radiusY, value.radiusY) && (e.value.rotation ?? 0) === (value.rotation ?? 0))?.id,
  };
}

/**
 * Convertit une cote calculée par `engine/dimensions.ts` en `Dimension` Engine A affichable.
 * Aucune valeur n'est recalculée : `value`/`unit`/points d'ancrage viennent tels quels du
 * résultat B. `id` et `label` sont fournis par l'appelant (Engine B ne porte ni l'un ni
 * l'autre) — jamais de contenu inventé par l'adaptateur.
 */
export function dimensionResultToDimension(id: string, label: string, result: DimensionResult): Dimension {
  const kindMap: Record<DimensionResult["kind"], Dimension["kind"]> = {
    "linear-horizontal": "linear",
    "linear-vertical": "linear",
    "linear-aligned": "aligned",
    radius: "radius",
    diameter: "diameter",
    angle: "angle",
    "centre-distance": "linear",
    coordinate: "annotation",
  };
  return {
    id,
    kind: kindMap[result.kind],
    from: withId(`${id}-from`, result.anchors.from),
    to: withId(`${id}-to`, result.anchors.to),
    label,
    value: result.value,
    unit: result.unit,
  };
}

/**
 * Pont central : projette une `ParametricShape` (Engine B) vers un `TraceModel` (Engine A),
 * exploitable immédiatement par `TraceViewer`/`TraceSteps`/`SiteMode`/`validateTraceModel`.
 * Fonction pure — aucun effet de bord, aucune persistance (§15).
 */
export function parametricShapeToTraceModel(shape: ParametricShape, metadata: TraceModelMetadata, options: ParametricShapeAdapterOptions = {}): TraceModel {
  const modelId = metadata.id ?? shape.id;
  const primitives = shape.primitives;
  const registry = createShapeRegistry();

  // Convention partagée des deux moteurs : le point nommé "O" est le centre de construction
  // (rôle "center" côté Engine A, exploité par la couche "Centres" de TraceViewer). Engine B ne
  // porte pas de rôle sur ses points ; on rétablit celui-ci sans inventer de coordonnée.
  const points: Point[] = Object.entries(primitives.points).map(([id, p]) => withId(id, p, undefined, id === "O" ? "center" : undefined));
  const pointIds = new Set(points.map((p) => p.id));

  const segments: Segment[] = [];
  const constructionLines: Segment[] = [];
  primitives.segments.forEach((segment, index) => {
    const id = `${modelId}-segment-${index}`;
    registry.registerSegment(segment, id);
    const mapped: Segment = { id, start: withId(`${id}-start`, segment.start), end: withId(`${id}-end`, segment.end), role: segment.role ?? "shape" };
    // Un segment "axis" (repère de symétrie) n'est pas le tracé final : comme "construction", il
    // rejoint constructionLines, où TraceViewer sait déjà distinguer les deux via `role` (couche
    // Axes vs couche Construction) — seul le routage groupé change, pas le rôle affiché (C4-LOT1-V1 §8).
    (segment.role === "construction" || segment.role === "axis" ? constructionLines : segments).push(mapped);
  });

  const circles: Circle[] = primitives.circles.map((circle, index) => {
    const id = `${modelId}-circle-${index}`;
    registry.registerCircle(circle, id);
    return { id, centre: withId(`${id}-centre`, circle.centre), radius: circle.radius, role: circle.role ?? "shape" };
  });

  const arcs: Arc[] = primitives.arcs.map((arc, index) => {
    const id = `${modelId}-arc-${index}`;
    registry.registerArc(arc, id);
    return { id, centre: withId(`${id}-centre`, arc.centre), radius: arc.radius, startAngle: arc.startAngle, endAngle: arc.endAngle, counterClockwise: arc.counterClockwise, role: arc.role ?? "shape" };
  });

  const ellipses: Ellipse[] = primitives.ellipses.map((ellipse, index) => {
    const id = `${modelId}-ellipse-${index}`;
    registry.registerEllipse(ellipse, id);
    return { id, centre: withId(`${id}-centre`, ellipse.centre), radiusX: ellipse.radiusX, radiusY: ellipse.radiusY, rotation: ellipse.rotation, role: ellipse.role ?? "shape" };
  });

  const polylines: Polyline[] = primitives.polylines.map((polyline, index) => {
    const id = `${modelId}-polyline-${index}`;
    return { id, points: polyline.points.map((p, i) => withId(`${id}-p${i}`, p)) };
  });

  const polygons: Polygon[] = primitives.polygons.map((polygon, index) => {
    const id = `${modelId}-polygon-${index}`;
    return { id, points: polygon.points.map((p, i) => withId(`${id}-p${i}`, p)) };
  });

  // Étapes de construction (§8) : ordre préservé tel quel. Les références à un point déjà
  // nommé deviennent `pointIds` ; toute autre géométrie embarquée est résolue par valeur vers
  // l'entité déjà mappée ci-dessus (`visibleEntityIds`), ou matérialisée à la volée comme
  // entité de construction si elle n'apparaît nulle part dans la forme finale (§9 : une
  // géométrie qui n'existe que dans une étape et jamais dans les primitives finales est
  // presque toujours une aide de construction).
  let constructionCounter = 0;
  const steps: SiteStep[] = shape.constructionSteps.map((step) => {
    const referencedPointIds: string[] = [];
    const visibleEntityIds: string[] = [];
    const materialise = <T,>(id: string, entity: T, into: T[]) => {
      into.push(entity);
      visibleEntityIds.push(id);
    };
    for (const ref of step.geometry) {
      if (ref.kind === "point") {
        if (pointIds.has(ref.id)) referencedPointIds.push(ref.id);
        continue;
      }
      if (ref.kind === "segment") {
        const existing = registry.findSegment(ref.segment);
        if (existing) { visibleEntityIds.push(existing); continue; }
        const id = `${modelId}-step-${step.id}-c${constructionCounter++}`;
        materialise(id, { id, start: withId(`${id}-start`, ref.segment.start), end: withId(`${id}-end`, ref.segment.end), role: "construction" }, constructionLines);
        continue;
      }
      if (ref.kind === "circle") {
        const existing = registry.findCircle(ref.circle);
        if (existing) { visibleEntityIds.push(existing); continue; }
        const id = `${modelId}-step-${step.id}-c${constructionCounter++}`;
        materialise(id, { id, centre: withId(`${id}-centre`, ref.circle.centre), radius: ref.circle.radius, role: "construction" }, circles);
        continue;
      }
      if (ref.kind === "arc") {
        const existing = registry.findArc(ref.arc);
        if (existing) { visibleEntityIds.push(existing); continue; }
        const id = `${modelId}-step-${step.id}-c${constructionCounter++}`;
        materialise(id, { id, centre: withId(`${id}-centre`, ref.arc.centre), radius: ref.arc.radius, startAngle: ref.arc.startAngle, endAngle: ref.arc.endAngle, counterClockwise: ref.arc.counterClockwise, role: "construction" }, arcs);
        continue;
      }
      if (ref.kind === "ellipse") {
        const existing = registry.findEllipse(ref.ellipse);
        if (existing) { visibleEntityIds.push(existing); continue; }
        const id = `${modelId}-step-${step.id}-c${constructionCounter++}`;
        materialise(id, { id, centre: withId(`${id}-centre`, ref.ellipse.centre), radiusX: ref.ellipse.radiusX, radiusY: ref.ellipse.radiusY, rotation: ref.ellipse.rotation, role: "construction" }, ellipses);
        continue;
      }
      if (ref.kind === "polyline") {
        const id = `${modelId}-step-${step.id}-c${constructionCounter++}`;
        polylines.push({ id, points: ref.polyline.points.map((p, i) => withId(`${id}-p${i}`, p)), role: "construction" });
        visibleEntityIds.push(id);
      }
    }
    return {
      id: step.id,
      // Titre court si le générateur Engine B en fournit un (`ConstructionStep.title`, champ
      // additif) ; sinon les deux portent le même texte réel plutôt que d'inventer un titre
      // qui n'existe pas côté source (§8).
      title: step.title ?? step.instruction,
      instruction: step.instruction,
      measurements: [],
      pointIds: referencedPointIds,
      visibleEntityIds: visibleEntityIds.length ? visibleEntityIds : undefined,
    };
  });

  const origin = pointIds.has("O") ? points.find((p) => p.id === "O")! : withId("O", shape.centre);

  const quantities: Quantity[] = [];
  if (shape.errorTolerance !== undefined) {
    quantities.push({ id: "q-error-tolerance", label: "Tolérance d'approximation", value: shape.errorTolerance, unit: "mm", quality: "estimate" });
  }

  // Bounds : ne pas se limiter aux points nommés (§27 C3 / C4-LOT1-V1) — un cœur ou une arche
  // n'a par exemple pas de point nommé au sommet de ses lobes/arcs, seulement leur centre. On
  // couvre donc l'enveloppe réelle de toute la géométrie (points, extrémités de segments,
  // rectangle centre±rayon des cercles/arcs/ellipses — toujours un sur-ensemble sûr même pour un
  // arc partiel —, et points des polylignes/polygones), jamais recalculée à partir d'une formule
  // de forme : uniquement des min/max sur des coordonnées déjà connues.
  const extentPoints: Point2D[] = [
    ...points.map((p) => ({ x: p.x, y: p.y })),
    ...[...segments, ...constructionLines].flatMap((s) => [s.start, s.end]),
    ...circles.flatMap((c) => [{ x: c.centre.x - c.radius, y: c.centre.y - c.radius }, { x: c.centre.x + c.radius, y: c.centre.y + c.radius }]),
    ...arcs.flatMap((a) => [{ x: a.centre.x - a.radius, y: a.centre.y - a.radius }, { x: a.centre.x + a.radius, y: a.centre.y + a.radius }]),
    ...ellipses.flatMap((e) => {
      const m = Math.max(e.radiusX, e.radiusY);
      return [{ x: e.centre.x - m, y: e.centre.y - m }, { x: e.centre.x + m, y: e.centre.y + m }];
    }),
    ...[...polylines, ...polygons].flatMap((entity) => entity.points),
  ];
  const boundsSource = extentPoints.length ? extentPoints : [origin];
  const model: TraceModel = {
    id: modelId,
    name: metadata.name,
    bounds: boundsFromPoints2D(boundsSource, Math.max(shape.width, shape.height) * 0.05 || 10),
    referenceFrame: { unit: "mm", origin, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points,
    segments,
    arcs,
    circles,
    ellipses,
    constructionLines,
    dimensions: options.dimensions ?? [],
    controls: [],
    quantities,
    steps,
    polylines: polylines.length ? polylines : undefined,
    polygons: polygons.length ? polygons : undefined,
    slug: metadata.slug,
    categoryId: metadata.categoryId,
    difficulty: metadata.difficulty,
    tags: metadata.tags,
    status: metadata.status,
    parameters: metadata.parameters,
    explanation: metadata.explanation,
    realisticPreview: metadata.realisticPreview,
  };
  return validateTraceModel(model);
}

/** Réexport stable (§17) : valide une `ParametricShape` sans exception (liste d'erreurs). */
export { validateGeometry as validateParametricShape };
export { validateTraceModel };
