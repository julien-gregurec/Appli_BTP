import { describe, expect, it } from "vitest";
import { montantLigneHt, rangeesLecture, type LigneLue } from "./lecture-lignes";

const ligne = (p: Partial<LigneLue> & { id: string }): LigneLue => ({
  designation: "", description: null, type: "fourniture", type_ligne: "libre", quantite: 0, unite: "u",
  prix_unitaire_ht: 0, remise_ligne: 0, remise_section_pct: null, taux_tva: 20, ouvrage_cle: null, ...p,
});

describe("rangeesLecture", () => {
  it("rend les lignes de structure sans montant et regroupe un ouvrage avant ses composants", () => {
    const r = rangeesLecture([
      ligne({ id: "t", type_ligne: "titre", designation: "Aménagement" }),
      ligne({ id: "c1", ouvrage_cle: "ouv", designation: "Vitrage", quantite: 12.6, prix_unitaire_ht: 145 }),
      ligne({ id: "c2", ouvrage_cle: "ouv", designation: "Pose", quantite: 9.5, prix_unitaire_ht: 48 }),
      ligne({ id: "a", type_ligne: "article", designation: "Plaque", quantite: 24, prix_unitaire_ht: 13.5 }),
      ligne({ id: "k", type_ligne: "commentaire", designation: "Horaires de bureau" }),
      ligne({ id: "r", type_ligne: "remise", designation: "Remise", quantite: 1, prix_unitaire_ht: -245.4, remise_section_pct: 5 }),
      ligne({ id: "s", type_ligne: "sous_total", designation: "Sous-total" }),
      ligne({ id: "sep", type_ligne: "separateur" }),
    ], [{ cle: "ouv", ouvrage_reference: "OUV-0001", ouvrage_nom: "Cloison vitrée", libelle_client: null, quantite_principale: 12, unite_principale: "m²" }]);
    expect(r.map((x) => x.genre)).toEqual(["structure", "ouvrage", "ligne", "ligne", "ligne", "structure", "remise", "sous_total", "structure"]);
    const ouvrage = r[1];
    if (ouvrage.genre !== "ouvrage") throw new Error("ouvrage attendu");
    expect(ouvrage.reference).toBe("OUV-0001");
    expect(ouvrage.quantite).toBe(12);
    expect(ouvrage.totalHt).toBe(1827 + 456);
    expect(r[2].genre === "ligne" && r[2].composant).toBe(true);
    expect(r[4].genre === "ligne" && r[4].composant).toBe(false);
    const remise = r[6];
    if (remise.genre !== "remise") throw new Error("remise attendue");
    expect(remise.libelle).toBe("5 % de la section");
    const sousTotal = r[7];
    if (sousTotal.genre !== "sous_total") throw new Error("sous-total attendu");
    expect(sousTotal.totalHt).toBe(Math.round((1827 + 456 + 324 - 245.4) * 100) / 100);
  });

  it("repart de zéro après un sous-total et traite une ligne sans type comme chiffrée", () => {
    const r = rangeesLecture([
      ligne({ id: "a", type_ligne: null, quantite: 2, prix_unitaire_ht: 10 }),
      ligne({ id: "s1", type_ligne: "sous_total" }),
      ligne({ id: "b", type_ligne: "libre", quantite: 1, prix_unitaire_ht: 5, remise_ligne: 20 }),
      ligne({ id: "s2", type_ligne: "sous_total" }),
    ], []);
    expect(r[1].genre === "sous_total" && r[1].totalHt).toBe(20);
    expect(r[3].genre === "sous_total" && r[3].totalHt).toBe(4);
  });

  it("arrondit le montant d'une ligne au centime", () => {
    expect(montantLigneHt({ quantite: 3, prix_unitaire_ht: 10.333, remise_ligne: 0 })).toBe(31);
  });
});
