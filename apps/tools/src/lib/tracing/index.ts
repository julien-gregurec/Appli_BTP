/**
 * Workflow production ELSATIA Tools — étage « image / croquis → tracé ».
 * Voir docs/production-workflow.md.
 *
 * Socle projet de l'Atelier (persistance locale, migration, autosave, récupération de
 * brouillon) : voir docs/atelier-project-persistence.md.
 *
 * Tracé libre (source utilisateur, par opposition à la géométrie dérivée d'Engine B) :
 * `free-geometry` (contrat), `free-shape` (projection scène/export), `free-history`
 * (annulation par opérations) et `free-handles` (poignées de classe C). Voir
 * docs/ATELIER_FREE_DRAWING_V1.md.
 */

export * from "./geometry-port";
export * from "./measurement-origin";
export * from "./reference-image";
export * from "./vectorization";
export * from "./project";
export * from "./migration";
export * from "./repository";
export * from "./draft";
export * from "./autosave";
export * from "./free-geometry";
export * from "./free-shape";
export * from "./free-history";
export * from "./free-handles";
export * from "./atelier-models";
export * from "./model-resolver";
export * from "./atelier";
