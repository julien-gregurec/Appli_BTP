import type { Arc2D, BoundingBox2D, Circle2D, Ellipse2D, GeometryQuality, Point2D, Polygon2D, Polyline2D, Segment2D } from "./types";

/** Collection de primitives géométriques constitutives d'une forme, nommées lorsque pertinent. */
export type ShapePrimitives = {
  points: Record<string, Point2D>;
  segments: Segment2D[];
  circles: Circle2D[];
  arcs: Arc2D[];
  ellipses: Ellipse2D[];
  polylines: Polyline2D[];
  polygons: Polygon2D[];
};

export function emptyPrimitives(): ShapePrimitives {
  return { points: {}, segments: [], circles: [], arcs: [], ellipses: [], polylines: [], polygons: [] };
}

/** Référence à un élément géométrique concret à afficher pour une étape de construction (jamais uniquement du texte). */
export type ConstructionStepGeometry =
  | { kind: "point"; id: string }
  | { kind: "segment"; segment: Segment2D }
  | { kind: "circle"; circle: Circle2D }
  | { kind: "arc"; arc: Arc2D }
  | { kind: "ellipse"; ellipse: Ellipse2D }
  | { kind: "polyline"; polyline: Polyline2D };

export type ConstructionStep = {
  id: string;
  /**
   * Titre court optionnel (champ additif). Quand il est renseigné, le pont
   * `geometry/adapters` l'utilise comme `SiteStep.title` et garde `instruction` pour le texte
   * complet ; absent, `title` retombe sur `instruction` (comportement historique inchangé).
   */
  title?: string;
  instruction: string;
  geometry: ConstructionStepGeometry[];
};

/**
 * Modèle paramétrique : le type et les paramètres priment sur les primitives, qui sont
 * toujours reconstruites à partir d'eux (jamais une liste figée de pixels — §22).
 */
export type ParametricShape<TParameters = unknown> = {
  id: string;
  type: string;
  parameters: TParameters;
  primitives: ShapePrimitives;
  boundingBox: BoundingBox2D;
  centre: Point2D;
  width: number;
  height: number;
  rotation: number;
  metadata: Record<string, unknown>;
  constructionSteps: ConstructionStep[];
  quality: GeometryQuality;
  errorTolerance?: number;
};

export type ShapeGenerator<TParameters = unknown> = (parameters: TParameters) => ParametricShape<TParameters>;

const registry = new Map<string, ShapeGenerator<unknown>>();

/** Enregistre un générateur pour un type de forme paramétrique (auto-appelé par chaque module de générateur). */
export function registerShapeGenerator<TParameters>(type: string, generator: ShapeGenerator<TParameters>): void {
  registry.set(type, generator as unknown as ShapeGenerator<unknown>);
}

export function listRegisteredShapeTypes(): string[] {
  return [...registry.keys()];
}

/** Reconstruit intégralement la géométrie d'un type de forme à partir de ses paramètres. */
export function buildParametricShape<TParameters = unknown>(type: string, parameters: TParameters): ParametricShape<TParameters> {
  const generator = registry.get(type);
  if (!generator) throw new Error(`Type de forme paramétrique inconnu : "${type}".`);
  return generator(parameters) as ParametricShape<TParameters>;
}

/** Sérialisation JSON stricte (les fonctions ne sont jamais incluses ; tout est recalculable depuis `type` + `parameters`). */
export function serializeShape(shape: ParametricShape): string {
  return JSON.stringify({ id: shape.id, type: shape.type, parameters: shape.parameters, metadata: shape.metadata });
}

/** Recharge une forme depuis sa forme sérialisée en reconstruisant la géométrie (jamais depuis un cache de points). */
export function deserializeShape(serialized: string): ParametricShape {
  const parsed = JSON.parse(serialized) as { type: string; parameters: unknown; id?: string; metadata?: Record<string, unknown> };
  const shape = buildParametricShape(parsed.type, parsed.parameters);
  return { ...shape, id: parsed.id ?? shape.id, metadata: { ...shape.metadata, ...parsed.metadata } };
}
