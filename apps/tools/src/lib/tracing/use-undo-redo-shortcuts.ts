"use client";

/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §7/§8 — raccourcis clavier d'annulation.
 *
 * | geste | effet |
 * | ----- | ----- |
 * | `Cmd/Ctrl + Z` | annuler |
 * | `Cmd/Ctrl + Maj + Z` | rétablir |
 * | `Ctrl + Y` | rétablir (convention Windows) |
 *
 * `Cmd+Y` n'est volontairement PAS lié : sur macOS il appartient au navigateur (historique),
 * et le détourner casserait une attente du système pour un gain nul, `Cmd+Maj+Z` étant la
 * convention native.
 *
 * ## Les champs de saisie gardent leur propre annulation
 *
 * Quand le focus est dans un champ, l'évènement n'est pas intercepté : `Cmd+Z` y annule la
 * FRAPPE, ce que fait le navigateur nativement et bien mieux que nous. Détourner le raccourci
 * ferait perdre à l'utilisateur le moyen de corriger un chiffre à moitié tapé, et ferait
 * remonter l'historique du tracé alors qu'il croyait corriger sa saisie. Le bouton
 * « Annuler » de la barre reste accessible dans ce cas, lui.
 */

import { useEffect } from "react";

/** Un champ de saisie possède son propre historique : on ne le lui prend pas. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!target || typeof (target as Partial<HTMLElement>).tagName !== "string") return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

export type UndoRedoShortcut = "undo" | "redo" | null;

/**
 * Action désignée par un évènement clavier — pure, donc testable sans DOM ni composant.
 * `null` quand l'évènement ne concerne pas l'historique.
 */
export function undoRedoShortcutFor(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target?: EventTarget | null;
}): UndoRedoShortcut {
  if (!event.metaKey && !event.ctrlKey) return null;
  if (isTextEntry(event.target ?? null)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  // `Ctrl+Y` uniquement : `Cmd+Y` appartient au navigateur sur macOS.
  if (key === "y" && event.ctrlKey && !event.metaKey) return "redo";
  return null;
}

export function useUndoRedoShortcuts({
  onUndo,
  onRedo,
  enabled = true,
}: {
  onUndo: () => void;
  onRedo: () => void;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = undoRedoShortcutFor(event);
      if (!action) return;
      event.preventDefault();
      if (action === "undo") onUndo();
      else onRedo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onRedo, onUndo]);
}
