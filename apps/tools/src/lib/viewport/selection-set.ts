/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — ensemble d'entités sélectionnées.
 *
 * Module pur : pas de React, pas de DOM. Une sélection est une LISTE ORDONNÉE d'identifiants
 * sans doublon, pas un `Set` :
 *
 * - l'ordre porte une information — le dernier ajouté est l'entité ACTIVE, celle dont le
 *   panneau propriétés montre le détail et celle que `selectedEntityId` continue de désigner.
 *   Un `Set` la perdrait à la première itération réordonnée ;
 * - une liste se compare par valeur et se rend directement, sans conversion à chaque trame.
 *
 * ## Compatibilité avec `selectedEntityId`
 *
 * Le viewport, le panneau propriétés et les poignées ont été écrits autour d'un identifiant
 * unique. Rien de tout cela n'est réécrit : `primarySelection` projette l'ensemble sur cet
 * identifiant unique, et une sélection simple reste une liste d'un élément. Un appelant qui
 * ignore la multisélection voit donc exactement le comportement d'avant ce lot.
 */

export type SelectionSet = readonly string[];

export const EMPTY_SELECTION: SelectionSet = [];

/**
 * Entité ACTIVE — la dernière désignée. C'est elle que `selectedEntityId` reçoit, elle dont
 * les propriétés sont détaillées, et elle que le cycle de sélection fait avancer.
 */
export function primarySelection(selection: SelectionSet): string | null {
  return selection.length === 0 ? null : selection[selection.length - 1];
}

export function isSelected(selection: SelectionSet, entityId: string): boolean {
  return selection.includes(entityId);
}

/**
 * Sélection simple : remplace tout. `null` vide la sélection. Renvoie la référence courante
 * quand rien ne change, pour ne pas déclencher de rendu inutile.
 */
export function selectSingle(selection: SelectionSet, entityId: string | null): SelectionSet {
  if (entityId === null) return selection.length === 0 ? selection : EMPTY_SELECTION;
  if (selection.length === 1 && selection[0] === entityId) return selection;
  return [entityId];
}

/**
 * Ajout / retrait (Shift + clic, §8). Une entité déjà présente est RETIRÉE : c'est la
 * convention universelle du clic additif, et c'est aussi la seule qui permette de corriger une
 * erreur de désignation sans repartir de zéro.
 *
 * Une entité ajoutée va en fin de liste : elle devient l'entité active, donc celle que le
 * panneau détaille — le retour visuel suit toujours le dernier geste.
 */
export function toggleSelection(selection: SelectionSet, entityId: string): SelectionSet {
  if (!selection.includes(entityId)) return [...selection, entityId];
  const kept = selection.filter((item) => item !== entityId);
  return kept.length === 0 ? EMPTY_SELECTION : kept;
}

/**
 * Restreint la sélection aux entités qui existent encore. Appelé quand la scène change :
 * changer d'étape de chantier masque des entités, et une sélection fantôme afficherait des
 * propriétés d'un objet qui n'est plus dessiné.
 *
 * Renvoie la référence courante si rien n'a disparu — aucune scène inchangée ne provoque de
 * rendu supplémentaire.
 */
export function retainExisting(selection: SelectionSet, existingIds: ReadonlySet<string>): SelectionSet {
  if (selection.length === 0) return selection;
  const kept = selection.filter((item) => existingIds.has(item));
  if (kept.length === selection.length) return selection;
  return kept.length === 0 ? EMPTY_SELECTION : kept;
}

/** Deux sélections désignent-elles la même chose, dans le même ordre ? */
export function sameSelection(a: SelectionSet, b: SelectionSet): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
