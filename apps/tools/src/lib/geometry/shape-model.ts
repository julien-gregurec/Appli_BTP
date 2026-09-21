import type { Arc, Axis, BoundingBox, Circle, Dimension, Ellipse, Point, Polygon, Polyline, Segment } from "./primitives";

// "centers" ajouté de façon additive (ENGINE-FOUNDATION-V1) pour permettre de distinguer à terme
// les centres de construction des autres points — actuellement confondus dans "points" par
// AdvancedPlan.tsx, qui n'est pas modifié dans ce lot et continue de fonctionner à l'identique.
export type ShapeLayer = "shape" | "construction" | "dimensions" | "axes" | "points" | "labels" | "centers";
export type Quantity = { id: string; label: string; value: number; unit: "mm" | "mm²" | "m²" | "°"; quality: "exact" | "estimate" };
export type SiteControl = { id: string; label: string; value: number; unit: "mm" | "°"; pointIds: readonly string[] };
// visibleEntityIds/highlightEntityIds ajoutés de façon additive et optionnelle
// (FIRST-FUNCTIONAL-LOT-V1) : une étape référence des ids d'entités déjà présentes dans le
// modèle (segments/arcs/circles/points/...), elle ne duplique jamais de géométrie. Les 10 outils
// Pro existants ne renseignent pas ces champs et continuent de fonctionner à l'identique
// (ProCalculatorWorkspace.tsx ne les lit pas).
export type SiteStep = {
  id: string; title: string; instruction: string; measurements: readonly string[]; pointIds: readonly string[]; controlId?: string;
  visibleEntityIds?: readonly string[];
  highlightEntityIds?: readonly string[];
};
export type ReferenceFrame = { unit: "mm"; origin: Point; xLabel: "X"; yLabel: "Y"; yOrientation: "up" };

export type ShapeGeometry = {
  id: string;
  name: string;
  bounds: BoundingBox;
  referenceFrame: ReferenceFrame;
  axes: readonly Axis[];
  points: readonly Point[];
  segments: readonly Segment[];
  arcs: readonly Arc[];
  circles: readonly Circle[];
  ellipses: readonly Ellipse[];
  constructionLines: readonly Segment[];
  dimensions: readonly Dimension[];
  controls: readonly SiteControl[];
  quantities: readonly Quantity[];
  steps: readonly SiteStep[];
  // Optionnels et additifs (FIRST-FUNCTIONAL-LOT-V1) : absents chez les 10 outils Pro existants
  // (undefined), nécessaires pour le contour fermé de l'étoile (polygons) — aucun outil existant
  // n'a besoin de les renseigner.
  polylines?: readonly Polyline[];
  polygons?: readonly Polygon[];
};

export function validateShapeGeometry(model: ShapeGeometry) {
  const serialized = JSON.stringify(model);
  if (/NaN|Infinity/.test(serialized)) throw new Error("Le modèle géométrique contient une valeur non finie.");
  const ids = [...model.points, ...model.axes, ...model.segments, ...model.arcs, ...model.circles, ...model.ellipses, ...model.constructionLines, ...model.dimensions, ...model.controls, ...model.steps, ...(model.polylines ?? []), ...(model.polygons ?? [])].map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Le modèle géométrique contient des identifiants dupliqués.");
  const pointIds = new Set(model.points.map((item) => item.id));
  for (const step of model.steps) for (const id of step.pointIds) if (!pointIds.has(id)) throw new Error(`L’étape ${step.id} référence le point absent ${id}.`);
  for (const control of model.controls) for (const id of control.pointIds) if (!pointIds.has(id)) throw new Error(`Le contrôle ${control.id} référence le point absent ${id}.`);
  return model;
}
