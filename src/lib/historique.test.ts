import { describe, expect, it } from "vitest";
import { libelleAction, libelleChamp, resumeEntree, valeurLisible } from "./historique";

describe("libellés", () => {
  it("traduit les actions et champs connus, garde les autres lisibles", () => {
    expect(libelleAction("reference_modifiee")).toBe("Référence modifiée");
    expect(libelleAction("action_future")).toBe("action future");
    expect(libelleChamp("prix_unitaire_ht")).toBe("prix de vente HT");
    expect(libelleChamp(null)).toBeNull();
  });
});

describe("valeurLisible", () => {
  it("nombres et décimales à la française, absence explicite", () => {
    expect(valeurLisible("20.00")).toBe("20,00");
    expect(valeurLisible(12.5)).toBe("12,5");
    expect(valeurLisible(null)).toBe("—");
    expect(valeurLisible("")).toBe("—");
    expect(valeurLisible(true)).toBe("oui");
  });

  it("objets des codes distributeurs et coefficients", () => {
    expect(valeurLisible({ fournisseur_id: "x", code: "DIS-9001" })).toBe("DIS-9001");
    expect(valeurLisible({ coefficient: 1.6, mode_prix: "calcule" })).toBe("1,6 (prix calculé)");
  });

  it("ne réécrit pas une référence qui ressemble à un nombre entier", () => {
    expect(valeurLisible("0042")).toBe("0042");
  });
});

describe("resumeEntree", () => {
  it("modification avec avant et après", () => {
    expect(resumeEntree({ action: "modification", champ: "prix_unitaire_ht", avant: "20.00", apres: "21.00" }))
      .toBe("Modification — prix de vente HT : 20,00 → 21,00");
  });

  it("référence attribuée", () => {
    expect(resumeEntree({ action: "reference_attribuee", champ: "reference_interne", avant: null, apres: "ART-00012" }))
      .toBe("Référence attribuée — référence interne : — → ART-00012");
  });

  it("archivage sans détail superflu", () => {
    expect(resumeEntree({ action: "archivage", champ: "actif", avant: true, apres: false })).toBe("Archivé");
  });

  it("création et duplication résument l'objet ou la source", () => {
    expect(resumeEntree({ action: "creation", champ: null, avant: null, apres: { libelle: "Plaque BA13", reference_interne: "ART-1" } }))
      .toBe("Création — Plaque BA13");
    expect(resumeEntree({ action: "duplication", champ: null, avant: null, apres: { source_id: "x", source_reference: "ART-7" } }))
      .toBe("Créé par duplication — depuis ART-7");
  });
});
