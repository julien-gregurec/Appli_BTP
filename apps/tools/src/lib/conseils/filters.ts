import type { ConseilFiche, ConseilFilter } from "./types";

/**
 * Applique les filtres de la preview interne (catégorie / métier / difficulté).
 * Un filtre `null` ou `undefined` est ignoré. Le métier `tous` d'une fiche la rend
 * visible quel que soit le métier demandé.
 */
export function filterConseils(
  fiches: readonly ConseilFiche[],
  filter: ConseilFilter,
): ConseilFiche[] {
  return fiches.filter((fiche) => {
    if (filter.category && fiche.category !== filter.category) return false;
    if (filter.difficulty && fiche.difficulty !== filter.difficulty) return false;
    if (filter.trade && !fiche.trades.includes(filter.trade) && !fiche.trades.includes("tous")) {
      return false;
    }
    return true;
  });
}

/** `true` si au moins un critère de filtrage est actif. */
export function hasActiveFilter(filter: ConseilFilter): boolean {
  return Boolean(filter.category || filter.trade || filter.difficulty);
}
