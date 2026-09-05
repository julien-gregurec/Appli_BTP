import type { Arc, Axis, BoundingBox, Circle, Dimension, Ellipse, Point, Segment } from "./primitives";

// "centers" ajouté de façon additive (ENGINE-FOUNDATION-V1) pour permettre de distinguer à terme
// les centres de construction des autres points — actuellement confondus dans "points" par
// AdvancedPlan.tsx, qui n'est pas modifié dans ce lot et continue de fonctionner à l'identique.
export type ShapeLayer = "shape" | "construction" | "dimensions" | "axes" | "points" | "labels" | "centers";
export type Quantity = { id: string; label: string; value: number; unit: "mm" | "mm²" | "m²" | "°"; quality: "exact" | "estimate" };
export type SiteControl = { id: string; label: string; value: number; unit: "mm" | "°"; pointIds: readonly string[] };
export type SiteStep = { id: string; title: string; instruction: string; measurements: readonly string[]; pointIds: readonly string[]; controlId?: string };
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
};

export function validateShapeGeometry(model: ShapeGeometry) {
  const serialized = JSON.stringify(model);
  if (/NaN|Infinity/.test(serialized)) throw new Error("Le modèle géométrique contient une valeur non finie.");
  const ids = [...model.points, ...model.axes, ...model.segments, ...model.arcs, ...model.circles, ...model.ellipses, ...model.constructionLines, ...model.dimensions, ...model.controls, ...model.steps].map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Le modèle géométrique contient des identifiants dupliqués.");
  const pointIds = new Set(model.points.map((item) => item.id));
  for (const step of model.steps) for (const id of step.pointIds) if (!pointIds.has(id)) throw new Error(`L’étape ${step.id} référence le point absent ${id}.`);
  for (const control of model.controls) for (const id of control.pointIds) if (!pointIds.has(id)) throw new Error(`Le contrôle ${control.id} référence le point absent ${id}.`);
  return model;
}
