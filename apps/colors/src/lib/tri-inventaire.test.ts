import { describe, expect, it } from "vitest";
import { colonnesTri, fenetrePage, lirePage, lireTri, TAILLE_PAGE_INVENTAIRE, TRI_PAR_DEFAUT } from "@/lib/tri-inventaire";

describe("tri de l’inventaire", () => {
  it("conserve le tri historique par défaut", () => {
    expect(TRI_PAR_DEFAUT).toBe("recent");
    expect(lireTri(undefined)).toBe("recent");
    expect(lireTri("updated_at desc; drop table")).toBe("recent");
  });

  it("accepte les tris par date d’ajout dans les deux sens", () => {
    expect(colonnesTri(lireTri("ajout_recent"))[0]).toEqual({ colonne: "created_at", ascendant: false });
    expect(colonnesTri(lireTri("ajout_ancien"))[0]).toEqual({ colonne: "created_at", ascendant: true });
  });

  it("départage les égalités par un second critère stable", () => {
    for (const tri of ["recent", "ajout_recent", "ajout_ancien", "nom"] as const) {
      expect(colonnesTri(tri).length).toBeGreaterThan(1);
    }
  });

  it("trie par marque puis produit pour le tri alphabétique", () => {
    expect(colonnesTri("nom").map((c) => c.colonne)).toEqual(["marque", "produit"]);
  });
});

describe("pagination de l’inventaire", () => {
  it("borne le numéro de page reçu par l’URL", () => {
    expect(lirePage("3")).toBe(3);
    expect(lirePage("0")).toBe(1);
    expect(lirePage("-4")).toBe(1);
    expect(lirePage("100000")).toBe(1);
    expect(lirePage("page")).toBe(1);
  });

  it("calcule une fenêtre contiguë sans trou ni recouvrement", () => {
    const premiere = fenetrePage(1);
    const seconde = fenetrePage(2);
    expect(premiere).toEqual({ debut: 0, fin: TAILLE_PAGE_INVENTAIRE - 1 });
    expect(seconde.debut).toBe(premiere.fin + 1);
  });
});
