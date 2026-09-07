/**
 * `@elsatia/drone-core` — noyau typé et contrats d'ELSATIA Drone.
 *
 * Périmètre de ce package, et il est volontairement étroit :
 *
 * - des **types** et des **contrats**, avec leurs invariants ;
 * - des fonctions **pures** (unités, provenance, idempotence, sérialisation stable) ;
 * - des **interfaces** de stockage, de drone, de moteur de reconstruction et d'écosystème ;
 * - des **jeux d'essai anonymes**.
 *
 * Ce qu'il ne contient pas, et ne doit pas contenir :
 *
 * - aucune migration SQL — le ledger de la cible cutover reste figé à 263 ;
 * - aucun accès réseau, aucun client Supabase, aucun secret ;
 * - aucune implémentation DJI, ODM ou Metashape ;
 * - aucune interface utilisateur : Drone héritera de la cible UI-V2, pas de l'UI actuelle.
 */

export * from "./units";
export * from "./ids";
export * from "./common";
export * from "./storage-ref";
export * from "./serialization";
export * from "./provenance";
export * from "./quality";
export * from "./project";
export * from "./mission";
export * from "./device";
export * from "./media";
export * from "./reconstruction";
export * from "./idempotency";
export * from "./roof";
export * from "./measurement";
export * from "./solar";
export * from "./inspection";
export * from "./export-artifact";
export * from "./exports";
export * from "./ports";
export * from "./validation";
