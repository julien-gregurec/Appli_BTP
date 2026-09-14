import { describe, expect, it } from "vitest";
import { annuler, creerHistorique, peutAnnuler, peutRetablir, pousser, remplacerPresent, retablir } from "./historique-edition";

describe("annuler / rétablir", () => {
  it("annule dans l'ordre inverse et rétablit dans l'ordre", () => {
    let h = creerHistorique("a");
    h = pousser(h, "b");
    h = pousser(h, "c");
    expect(peutAnnuler(h)).toBe(true);
    h = annuler(h);
    expect(h.present).toBe("b");
    h = annuler(h);
    expect(h.present).toBe("a");
    expect(peutAnnuler(h)).toBe(false);
    h = retablir(h);
    expect(h.present).toBe("b");
    h = retablir(h);
    expect(h.present).toBe("c");
    expect(peutRetablir(h)).toBe(false);
  });
  it("une modification après une annulation efface le futur", () => {
    let h = pousser(pousser(creerHistorique("a"), "b"), "c");
    h = annuler(h);
    h = pousser(h, "d");
    expect(peutRetablir(h)).toBe(false);
    expect(annuler(h).present).toBe("b");
  });
  it("borne la pile et ignore un état identique", () => {
    let h = creerHistorique(0, 3);
    for (let i = 1; i <= 10; i += 1) h = pousser(h, i);
    expect(h.passe).toEqual([7, 8, 9]);
    const meme = pousser(h, h.present);
    expect(meme).toBe(h);
  });
  it("remplacer le présent (révision reçue de la base) ne crée pas d'entrée", () => {
    const h = remplacerPresent(pousser(creerHistorique("a"), "b"), "b'");
    expect(h.present).toBe("b'");
    expect(h.passe).toEqual(["a"]);
  });
  it("annuler ou rétablir sans rien à faire rend le même objet", () => {
    const h = creerHistorique("a");
    expect(annuler(h)).toBe(h);
    expect(retablir(h)).toBe(h);
  });
});
