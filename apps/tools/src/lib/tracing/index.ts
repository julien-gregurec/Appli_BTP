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
 *
 * Import photo, calibration, redressement, vectorisation assistée et conversion du résultat
 * confirmé en tracé libre : `image-import`, `perspective`, `edge-detection`, `fitting`,
 * `symmetry`, `reliability`, `asset-store`, `free-conversion` et l'API `api`. Voir
 * docs/image-vectorization-v1.md.
 */

export * from "./geometry-port";
export * from "./measurement-origin";
export * from "./reference-image";
export * from "./image-import";
export * from "./perspective";
export * from "./edge-detection";
export * from "./fitting";
export * from "./symmetry";
export * from "./vectorization";
export * from "./reliability";
export * from "./history";
export * from "./asset-store";
export * from "./api";
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
