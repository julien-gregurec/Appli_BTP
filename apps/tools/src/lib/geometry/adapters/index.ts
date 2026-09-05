/**
 * API stable du pont de convergence Engine A ↔ Engine B (§17). Surface volontairement
 * minimale — l'implémentation interne (`createShapeRegistry`, les fonctions `_proof*`…)
 * reste privée à ce dossier.
 */
export { withId, asPoint2D } from "./point-compat";
export { parametricShapeToTraceModel, dimensionResultToDimension, validateParametricShape, validateTraceModel, type TraceModelMetadata, type ParametricShapeAdapterOptions } from "./parametric-to-trace-model";
export { buildParametricShape } from "../engine/model";
