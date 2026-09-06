/**
 * §38 — Historique annuler / rétablir du traçage.
 *
 * Volontairement local au workflow de traçage et purement fonctionnel : aucun couplage à
 * l'atelier ni à React. Une pile générique bornée, que l'interface branche sur l'état qu'elle
 * juge utile (points, calibration, simplification, validation de contour).
 */

export type HistoryEntry<T> = {
  state: T;
  /** Libellé affiché dans « Annuler … » — décrit l'action qui a produit cet état. */
  label: string;
};

export type History<T> = {
  entries: readonly HistoryEntry<T>[];
  /** Index de l'état courant dans `entries`. */
  index: number;
  limit: number;
};

/** Nombre d'étapes conservées par défaut : suffisant pour un relevé, borné pour la mémoire mobile. */
export const DEFAULT_HISTORY_LIMIT = 50;

export function createHistory<T>(initial: T, label = "État initial", limit = DEFAULT_HISTORY_LIMIT): History<T> {
  if (!Number.isInteger(limit) || limit < 2) throw new Error("La profondeur d'historique doit être un entier ≥ 2.");
  return { entries: [{ state: initial, label }], index: 0, limit };
}

/**
 * Empile un nouvel état. Tout ce qui avait été annulé puis non rétabli est abandonné, comme
 * dans n'importe quel éditeur.
 */
export function pushHistory<T>(history: History<T>, state: T, label: string): History<T> {
  const kept = history.entries.slice(0, history.index + 1);
  kept.push({ state, label });
  const overflow = Math.max(0, kept.length - history.limit);
  const entries = overflow > 0 ? kept.slice(overflow) : kept;
  return { entries, index: entries.length - 1, limit: history.limit };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.index > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.index < history.entries.length - 1;
}

export function undo<T>(history: History<T>): History<T> {
  return canUndo(history) ? { ...history, index: history.index - 1 } : history;
}

export function redo<T>(history: History<T>): History<T> {
  return canRedo(history) ? { ...history, index: history.index + 1 } : history;
}

export function currentState<T>(history: History<T>): T {
  return history.entries[history.index].state;
}

/** Libellé de l'action annulable, ou chaîne vide s'il n'y a rien à annuler. */
export function undoLabel<T>(history: History<T>): string {
  return canUndo(history) ? history.entries[history.index].label : "";
}

export function redoLabel<T>(history: History<T>): string {
  return canRedo(history) ? history.entries[history.index + 1].label : "";
}

/** Repart de l'état courant, historique vidé (après un enregistrement, par exemple). */
export function resetHistory<T>(history: History<T>, label = "État initial"): History<T> {
  return createHistory(currentState(history), label, history.limit);
}
