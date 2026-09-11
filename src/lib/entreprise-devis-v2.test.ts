import { describe, expect, it } from "vitest";
import { OPACITE_MAX } from "@/lib/devis/filigrane";
import { filigranesPourEnregistrement, lireReglagesFiligranes, lireSeuilStocke, validerSeuilTauxMarque } from "@/lib/entreprise-devis-v2";

describe("filigranesPourEnregistrement", () => {
  it("assainit chaque filigrane (bornes de lisibilité appliquées)", () => {
    const r = filigranesPourEnregistrement({
      defaut: { type: "texte", preset: "BROUILLON", opacite: 0.9, couleur: "rouge" },
      brouillon: null,
    });
    expect(r.defaut?.opacite).toBe(OPACITE_MAX);
    expect(r.defaut?.couleur).toBe("#1f2937");
    expect(r.defaut?.texte).toBe("BROUILLON");
    expect(r.brouillon).toBeNull();
  });
  it("toute forme inattendue devient null, jamais une valeur brute", () => {
    expect(filigranesPourEnregistrement({ defaut: "<script>", brouillon: [1, 2] })).toEqual({ defaut: null, brouillon: null });
    expect(filigranesPourEnregistrement({ defaut: undefined, brouillon: 42 })).toEqual({ defaut: null, brouillon: null });
  });
  it("garde « aucun » comme réglage explicite, distinct de l'absence de réglage", () => {
    expect(filigranesPourEnregistrement({ defaut: { type: "aucun" }, brouillon: null }).defaut?.type).toBe("aucun");
  });
});

describe("lireReglagesFiligranes", () => {
  it("relit le jsonb stocké, ou rien", () => {
    expect(lireReglagesFiligranes(null)).toEqual({ defaut: null, brouillon: null });
    expect(lireReglagesFiligranes("x")).toEqual({ defaut: null, brouillon: null });
    expect(lireReglagesFiligranes({ brouillon: { type: "texte", preset: "A_VALIDER" } }).brouillon?.texte).toBe("À VALIDER");
  });
});

describe("seuil de taux de marque", () => {
  it("vide → aucun seuil", () => {
    expect(validerSeuilTauxMarque("")).toEqual({ valeur: null });
    expect(validerSeuilTauxMarque(null)).toEqual({ valeur: null });
  });
  it("accepte 0 à 100, virgule comprise, arrondi à deux décimales", () => {
    expect(validerSeuilTauxMarque("25,5")).toEqual({ valeur: 25.5 });
    expect(validerSeuilTauxMarque(0)).toEqual({ valeur: 0 });
    expect(validerSeuilTauxMarque("100")).toEqual({ valeur: 100 });
    expect(validerSeuilTauxMarque("12.345")).toEqual({ valeur: 12.35 });
  });
  it("refuse hors bornes, négatif, texte ou objet", () => {
    expect(validerSeuilTauxMarque("101")).toHaveProperty("erreur");
    expect(validerSeuilTauxMarque("-1")).toHaveProperty("erreur");
    expect(validerSeuilTauxMarque("vingt")).toHaveProperty("erreur");
    expect(validerSeuilTauxMarque({})).toHaveProperty("erreur");
  });
  it("relit le seuil stocké (numeric renvoyé en texte)", () => {
    expect(lireSeuilStocke("18.50")).toBe(18.5);
    expect(lireSeuilStocke(null)).toBeNull();
    expect(lireSeuilStocke("abc")).toBeNull();
  });
});
