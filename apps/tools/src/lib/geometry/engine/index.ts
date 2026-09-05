/**
 * Moteur géométrique paramétrique ELSATIA Tools (unité canonique : mm).
 * Point d'entrée unique : importe tous les générateurs (pour leur auto-enregistrement
 * auprès de `buildParametricShape`) et republie l'API publique du moteur.
 */
export * from "./types";
export * from "./angles";
export * from "./transform";
export * from "./measure";
export * from "./area";
export * from "./intersections";
export * from "./circle-tools";
export * from "./geometry-ops";
export * from "./model";
export * from "./validate";
export * from "./offset";
export * from "./simplify";
export * from "./snap";
export * from "./constraints";
export * from "./dimensions";
export * from "./report";

export * from "./basic-shapes";
export * from "./polygons";
export * from "./stars";
export * from "./arches";
export * from "./radial-pattern";
export * from "./petals";
export * from "./rosettes";
export * from "./spirals";
export * from "./curves";
export * from "./hearts";

export * from "./api";
