import { describe, expect, it } from "vitest";
import { isTextEntry, undoRedoShortcutFor } from "./use-undo-redo-shortcuts";

const key = (over: Partial<Parameters<typeof undoRedoShortcutFor>[0]> = {}) => ({
  key: "z",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  target: null,
  ...over,
});

/** Faux élément : le module ne lit que `tagName` et `isContentEditable`. */
const element = (tagName: string, contentEditable = false) =>
  ({ tagName, isContentEditable: contentEditable }) as unknown as EventTarget;

describe("raccourcis d'annulation", () => {
  it("annule sur Cmd+Z et sur Ctrl+Z", () => {
    expect(undoRedoShortcutFor(key({ metaKey: true }))).toBe("undo");
    expect(undoRedoShortcutFor(key({ ctrlKey: true }))).toBe("undo");
  });

  it("rétablit sur Cmd/Ctrl+Maj+Z", () => {
    expect(undoRedoShortcutFor(key({ metaKey: true, shiftKey: true }))).toBe("redo");
    expect(undoRedoShortcutFor(key({ ctrlKey: true, shiftKey: true }))).toBe("redo");
  });

  it("rétablit sur Ctrl+Y, mais laisse Cmd+Y au navigateur", () => {
    expect(undoRedoShortcutFor(key({ key: "y", ctrlKey: true }))).toBe("redo");
    expect(undoRedoShortcutFor(key({ key: "y", metaKey: true }))).toBeNull();
  });

  it("accepte la majuscule que produit Maj+Z", () => {
    expect(undoRedoShortcutFor(key({ key: "Z", metaKey: true, shiftKey: true }))).toBe("redo");
  });

  it("ignore Z sans modificateur, et les autres touches", () => {
    expect(undoRedoShortcutFor(key())).toBeNull();
    expect(undoRedoShortcutFor(key({ key: "a", metaKey: true }))).toBeNull();
    expect(undoRedoShortcutFor(key({ key: "ArrowLeft", ctrlKey: true }))).toBeNull();
  });

  /**
   * Un champ garde son annulation native : détourner le raccourci ferait remonter
   * l'historique du tracé alors que l'utilisateur croit corriger un chiffre à moitié tapé.
   */
  it("laisse les champs de saisie annuler leur propre frappe", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(undoRedoShortcutFor(key({ metaKey: true, target: element(tag) }))).toBeNull();
    }
    expect(undoRedoShortcutFor(key({ metaKey: true, target: element("DIV", true) }))).toBeNull();
  });

  it("agit malgré tout depuis le plan, qui n'est pas un champ", () => {
    expect(undoRedoShortcutFor(key({ metaKey: true, target: element("DIV") }))).toBe("undo");
  });
});

describe("isTextEntry", () => {
  it("reconnaît les champs et rien d'autre", () => {
    expect(isTextEntry(element("INPUT"))).toBe(true);
    expect(isTextEntry(element("DIV", true))).toBe(true);
    expect(isTextEntry(element("DIV"))).toBe(false);
    expect(isTextEntry(element("BUTTON"))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
    // Une cible sans `tagName` (document, window) ne doit pas faire tomber le gestionnaire.
    expect(isTextEntry({} as EventTarget)).toBe(false);
  });
});
