/**
 * Jeu fermé des nuances affichables sur les pages terminales de refus.
 *
 * `motif` arrive par l'URL : il ne peut donc désigner qu'un libellé connu.
 * Un motif inconnu retombe silencieusement sur l'explication par défaut.
 */

export const MOTIF_APPARTENANCE = "appartenance";

const MOTIFS = new Map<string, string>([
  [
    MOTIF_APPARTENANCE,
    "Votre compte ELSATIA n’est rattaché à aucune organisation exploitable par Colors.",
  ],
]);

export const MOTIF_PAR_DEFAUT =
  "Votre compte n’a pas d’habilitation Colors active. Contactez l’administrateur Colors de votre organisation.";

/** Explication associée au motif, ou l'explication par défaut si le motif est inconnu. */
export function explicationRefus(motif: unknown): string {
  return (typeof motif === "string" ? MOTIFS.get(motif) : undefined) ?? MOTIF_PAR_DEFAUT;
}
