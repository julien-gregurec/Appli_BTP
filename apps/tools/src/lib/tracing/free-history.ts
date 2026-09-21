/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §9 — pile d'annulation du tracé libre.
 *
 * ## Ce qui est empilé : l'OPÉRATION, jamais l'état
 *
 * `param-history.ts` empile les surcharges avant/après, ce qui est l'état source minimal d'un
 * modèle paramétrique — quelques nombres. Le même choix ne se transpose pas ici : l'état
 * source du tracé libre EST la liste complète des entités, et en garder cent instantanés
 * ferait porter à un téléphone cent copies du tracé.
 *
 * On empile donc l'opération, et le tracé s'obtient en la rejouant ou en la défaisant. Une
 * entrée pèse ce qu'elle a réellement changé : un sommet pour un déplacement, une entité pour
 * une création. C'est la même exigence que §9 — « état source minimal », « jamais un
 * instantané du `TraceModel` dérivé » — appliquée à une source qui, elle, est volumineuse.
 *
 * Chaque opération porte de quoi être défaite exactement : une création connaît son entité,
 * une suppression connaît les entités ET leur rang, un déplacement connaît la position d'avant.
 * Aucune ne demande de relire le tracé pour être inversée, ce qui les rend rejouables dans
 * n'importe quel ordre depuis n'importe quel état cohérent.
 *
 * Module pur : ni React, ni persistance, ni horloge.
 */

import {
  addFreeEntity,
  insertFreeEntities,
  moveFreeVertex,
  removeFreeEntities,
  type FreeEntity,
  type FreeEntityRemoval,
  type FreeGeometry,
  type FreeVertex,
} from "./free-geometry";

/**
 * Une modification du tracé libre, portant de quoi être rejouée ET défaite.
 *
 * Les trois natures correspondent aux trois gestes du lot (§9) : créer une primitive,
 * supprimer une sélection, déplacer un sommet. La création d'un point, d'un segment et d'une
 * polyligne ne font qu'une seule nature d'opération parce qu'elles ne diffèrent que par
 * l'entité créée — les distinguer dupliquerait le code d'annulation sans rien apporter.
 */
export type FreeEditOperation =
  | { kind: "create"; entity: FreeEntity }
  | { kind: "delete"; removed: readonly FreeEntityRemoval[] }
  | { kind: "move-vertex"; entityId: string; index: number; before: FreeVertex; after: FreeVertex };

export type FreeHistoryEntry = {
  /** Ce que l'annulation dira à l'utilisateur : « Segment libre sg-2 ». */
  label: string;
  /** Clé de fusion. Deux entrées consécutives fusionnables et de même clé n'en font qu'une. */
  source: string;
  coalesce: boolean;
  operation: FreeEditOperation;
};

export type FreeHistory = {
  past: readonly FreeHistoryEntry[];
  future: readonly FreeHistoryEntry[];
};

export const EMPTY_FREE_HISTORY: FreeHistory = { past: [], future: [] };

/** Même profondeur que l'historique paramétrique : les deux piles se comportent pareil (§9). */
export const FREE_HISTORY_LIMIT = 100;

/** Une opération qui ne change rien n'a pas à être empilée — un `Cmd+Z` muet passe pour un bug. */
export function isNoopFreeOperation(operation: FreeEditOperation): boolean {
  switch (operation.kind) {
    case "create":
      return false;
    case "delete":
      return operation.removed.length === 0;
    case "move-vertex":
      return operation.before.x === operation.after.x && operation.before.y === operation.after.y;
  }
}

/** Applique une opération dans le sens « faire » (création initiale et rétablissement). */
export function applyFreeOperation(geometry: FreeGeometry, operation: FreeEditOperation): FreeGeometry {
  switch (operation.kind) {
    case "create":
      return addFreeEntity(geometry, operation.entity);
    case "delete":
      return removeFreeEntities(
        geometry,
        operation.removed.map((removal) => removal.entity.id),
      ).geometry;
    case "move-vertex":
      return moveFreeVertex(geometry, operation.entityId, operation.index, operation.after);
  }
}

/** Applique une opération dans le sens « défaire ». Exactement l'inverse de `applyFreeOperation`. */
export function revertFreeOperation(geometry: FreeGeometry, operation: FreeEditOperation): FreeGeometry {
  switch (operation.kind) {
    case "create":
      return removeFreeEntities(geometry, [operation.entity.id]).geometry;
    case "delete":
      return insertFreeEntities(geometry, operation.removed);
    case "move-vertex":
      return moveFreeVertex(geometry, operation.entityId, operation.index, operation.before);
  }
}

/**
 * Fusionne deux déplacements consécutifs du MÊME sommet en un seul, en conservant la position
 * d'avant le premier. Utile quand un geste est publié en plusieurs validations (clavier,
 * saisie assistée) ; un glissement à la souris, lui, ne valide qu'une fois au relâchement et
 * ne se déclare pas fusionnable — deux glissements restent deux annulations (§9).
 */
function merge(previous: FreeHistoryEntry, next: FreeHistoryEntry): FreeHistoryEntry | null {
  if (previous.operation.kind !== "move-vertex" || next.operation.kind !== "move-vertex") return null;
  if (previous.operation.entityId !== next.operation.entityId) return null;
  if (previous.operation.index !== next.operation.index) return null;
  return { ...next, operation: { ...next.operation, before: previous.operation.before } };
}

/**
 * Empile une modification. Toute nouvelle action **invalide le futur** — règle universelle
 * d'un historique linéaire, et la seule qui évite de rejouer un « refaire » devenu incohérent.
 */
export function pushFreeHistory(history: FreeHistory, entry: FreeHistoryEntry): FreeHistory {
  if (isNoopFreeOperation(entry.operation)) return history;

  const last = history.past[history.past.length - 1];
  // La fusion ne vaut que sur le sommet de pile ET quand rien n'a été annulé entre-temps :
  // fusionner par-dessus un « refaire » disponible masquerait une branche abandonnée.
  if (last && entry.coalesce && last.coalesce && last.source === entry.source && history.future.length === 0) {
    const merged = merge(last, entry);
    if (merged) {
      if (isNoopFreeOperation(merged.operation)) return { past: history.past.slice(0, -1), future: [] };
      return { past: [...history.past.slice(0, -1), merged], future: [] };
    }
  }

  const past = [...history.past, entry];
  return { past: past.length > FREE_HISTORY_LIMIT ? past.slice(past.length - FREE_HISTORY_LIMIT) : past, future: [] };
}

export function canUndoFree(history: FreeHistory): boolean {
  return history.past.length > 0;
}

export function canRedoFree(history: FreeHistory): boolean {
  return history.future.length > 0;
}

export type FreeHistoryMove = {
  history: FreeHistory;
  /** Tracé libre après le mouvement joué. */
  geometry: FreeGeometry;
  /** Libellé de l'action jouée, pour un retour visible à l'utilisateur. */
  label: string;
};

/** `null` quand il n'y a rien à annuler — l'appelant n'a alors rien à enregistrer. */
export function undoFreeHistory(history: FreeHistory, geometry: FreeGeometry): FreeHistoryMove | null {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    geometry: revertFreeOperation(geometry, entry.operation),
    label: entry.label,
  };
}

/** `null` quand il n'y a rien à rétablir. */
export function redoFreeHistory(history: FreeHistory, geometry: FreeGeometry): FreeHistoryMove | null {
  const entry = history.future[0];
  if (!entry) return null;
  return {
    history: { past: [...history.past, entry], future: history.future.slice(1) },
    geometry: applyFreeOperation(geometry, entry.operation),
    label: entry.label,
  };
}
