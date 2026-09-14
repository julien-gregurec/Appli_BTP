import "server-only";

/** Planning v2 (GP V1, lot F) : actif seulement drapeau posé ET schéma migré. Éteint = planning historique. */
export function planningV2Actif(): boolean {
  return process.env.GP_PLANNING_V2 === "1";
}
