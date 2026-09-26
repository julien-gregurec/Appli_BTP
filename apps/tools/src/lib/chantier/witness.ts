/**
 * §15 — Cote témoin.
 *
 * Chaque gabarit imprimable doit pouvoir porter une ligne de contrôle de longueur connue,
 * afin de détecter une mise à l'échelle imprimante incorrecte.
 */

export type WitnessDimension = {
  lengthMm: number;
  text: string;
};

export const DEFAULT_WITNESS_MM = 100;

export function witnessDimension(lengthMm: number = DEFAULT_WITNESS_MM): WitnessDimension {
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) throw new Error("La cote témoin doit être supérieure à 0.");
  const rounded = Math.round(lengthMm * 10) / 10;
  return {
    lengthMm: rounded,
    text: `Vérifier après impression : cette ligne doit mesurer exactement ${rounded} mm.`,
  };
}
