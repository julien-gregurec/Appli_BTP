/**
 * Formatage des grandeurs Engine B destinées au texte lu sur le chantier (instructions et
 * `ConstructionStep.measurements`).
 *
 * Unique source du format : les instructions des générateurs utilisaient déjà `toFixed(1)` pour
 * les millimètres et `toFixed(2)` pour les degrés — ces helpers reprennent exactement cette
 * convention, pour qu'une mesure et l'instruction qui la porte ne puissent jamais diverger.
 * Aucun calcul ici : uniquement de la mise en forme d'une valeur déjà produite par le moteur.
 */

/** `105` → `"105.0 mm"`. */
export function formatMillimetres(value: number): string {
  return `${value.toFixed(1)} mm`;
}

/** `72` → `"72.00°"`. */
export function formatDegrees(value: number): string {
  return `${value.toFixed(2)}°`;
}
