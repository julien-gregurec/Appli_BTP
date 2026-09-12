import { describe, expect, it } from "vitest";
import { champModifiable, estChiffree, exigeDesignation, normaliserSelonType, porteMontant, TYPES_LIGNE_GRILLE, typeDe } from "./types-ligne";

const ligne = { designation: "X", quantite: 3, prixUnitaireHt: 10, remiseLignePct: 5, remiseSectionPct: null as number | null };

describe("types de lignes", () => {
  it("dix types, deux chiffrés", () => {
    expect(TYPES_LIGNE_GRILLE).toHaveLength(10);
    expect(TYPES_LIGNE_GRILLE.filter((t) => t.chiffree).map((t) => t.cle)).toEqual(["article", "libre"]);
  });
  it("une ligne sans type est chiffrée « libre » (données historiques)", () => {
    expect(typeDe({})).toBe("libre");
    expect(estChiffree(typeDe({ typeLigne: null }))).toBe(true);
  });
  it("seules les lignes chiffrées et les remises portent un montant", () => {
    expect(porteMontant("remise")).toBe(true);
    expect(porteMontant("sous_total")).toBe(false);
    expect(porteMontant("titre")).toBe(false);
  });
  it("la mise en page n'exige pas de désignation, le reste oui", () => {
    expect(exigeDesignation("vide")).toBe(false);
    expect(exigeDesignation("saut_page")).toBe(false);
    expect(exigeDesignation("commentaire")).toBe(true);
  });
  it("champs modifiables par type", () => {
    expect(champModifiable("titre", "prixUnitaireHt")).toBe(false);
    expect(champModifiable("remise", "prixUnitaireHt")).toBe(true);
    expect(champModifiable("remise", "quantite")).toBe(false);
    expect(champModifiable("vide", "designation")).toBe(false);
  });
});

describe("normaliserSelonType — même règle que la contrainte SQL", () => {
  it("un titre passe à 0 / 0 / 0 et garde sa désignation", () => {
    expect(normaliserSelonType({ ...ligne, typeLigne: "titre" })).toMatchObject({ designation: "X", quantite: 0, prixUnitaireHt: 0, remiseLignePct: 0 });
  });
  it("un sous-total sans désignation en reçoit une", () => {
    expect(normaliserSelonType({ ...ligne, designation: "", typeLigne: "sous_total" }).designation).toBe("Sous-total");
  });
  it("une remise : quantité 1, prix ramené à un négatif, remise de ligne 0", () => {
    expect(normaliserSelonType({ ...ligne, typeLigne: "remise" })).toMatchObject({ quantite: 1, prixUnitaireHt: 0, remiseLignePct: 0 });
    expect(normaliserSelonType({ ...ligne, prixUnitaireHt: -30, typeLigne: "remise" }).prixUnitaireHt).toBe(-30);
  });
  it("une ligne vide perd sa désignation ; une ligne chiffrée perd son pourcentage de section", () => {
    expect(normaliserSelonType({ ...ligne, typeLigne: "vide" }).designation).toBe("");
    expect(normaliserSelonType({ ...ligne, remiseSectionPct: 5, typeLigne: "libre" }).remiseSectionPct).toBeNull();
  });
});
