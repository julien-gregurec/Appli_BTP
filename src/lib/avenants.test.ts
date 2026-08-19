import { describe, expect, it } from "vitest";
import { AVENANT_STATUTS, TRANSITIONS_AVENANTS, statutAvenant, statutsAvenantAccessibles, calcTotauxAvenant, numeroAvenant, variationLabel } from "./avenants";
import { euros } from "./devis";

describe("avenants — logique pure (AVENANTS-V1)", () => {
  it("statutAvenant retrouve le bon statut par clé", () => {
    expect(statutAvenant("accepte")).toEqual({ cle: "accepte", libelle: "Accepté", couleur: "#3e7c5a" });
  });

  it("statutAvenant se replie sur brouillon pour une clé inconnue", () => {
    expect(statutAvenant("inexistant")).toEqual(AVENANT_STATUTS[0]);
  });

  it("figer la machine à états : un avenant accepté est terminal, aucune transition au-delà", () => {
    expect(TRANSITIONS_AVENANTS).toEqual({
      brouillon: ["envoye", "annule"],
      envoye: ["accepte", "refuse", "annule"],
      accepte: [],
      refuse: [],
      annule: [],
    });
  });

  it("statutsAvenantAccessibles d'un avenant accepté ne contient que lui-même", () => {
    expect(statutsAvenantAccessibles("accepte").map((s) => s.cle)).toEqual(["accepte"]);
  });

  it("statutsAvenantAccessibles inclut le statut courant et ses transitions autorisées, jamais plus", () => {
    expect(statutsAvenantAccessibles("envoye").map((s) => s.cle).sort()).toEqual(["accepte", "annule", "envoye", "refuse"].sort());
  });

  it("calcTotauxAvenant calcule HT/TVA/TTC sur une ligne positive", () => {
    expect(calcTotauxAvenant([{ designation: "x", description: null, type: "fourniture", quantite: 20, unite: "h", prix_unitaire_ht: 100, remise_ligne: 0, taux_tva: 20 }])).toEqual({
      ht: 2000,
      tva: 400,
      ttc: 2400,
    });
  });

  it("calcTotauxAvenant propage le signe négatif d'une ligne de moins-value", () => {
    const totaux = calcTotauxAvenant([{ designation: "x", description: null, type: "fourniture", quantite: -1, unite: "forfait", prix_unitaire_ht: 500, remise_ligne: 0, taux_tva: 20 }]);
    expect(totaux.ht).toBe(-500);
    expect(totaux.tva).toBe(-100);
    expect(totaux.ttc).toBe(-600);
  });

  it("calcTotauxAvenant additionne plusieurs lignes, plus-value et moins-value mêlées", () => {
    const lignes = [
      { designation: "a", description: null, type: "fourniture", quantite: 1, unite: "forfait", prix_unitaire_ht: 2000, remise_ligne: 0, taux_tva: 20 },
      { designation: "b", description: null, type: "fourniture", quantite: -1, unite: "forfait", prix_unitaire_ht: 500, remise_ligne: 0, taux_tva: 20 },
    ];
    expect(calcTotauxAvenant(lignes)).toEqual({ ht: 1500, tva: 300, ttc: 1800 });
  });

  it("calcTotauxAvenant renvoie 0 pour un avenant sans ligne", () => {
    expect(calcTotauxAvenant([])).toEqual({ ht: 0, tva: 0, ttc: 0 });
  });

  it("numeroAvenant dérive un numéro lisible à partir du numéro de devis et de l'ordre", () => {
    expect(numeroAvenant("DEV-2026-001", 1)).toBe("DEV-2026-001-AV01");
    expect(numeroAvenant("DEV-2026-001", 12)).toBe("DEV-2026-001-AV12");
  });

  it("numeroAvenant se replie proprement si le numéro de devis est absent", () => {
    expect(numeroAvenant(null, 1)).toBe("DEVIS-AV01");
  });

  it("variationLabel affiche un signe + explicite pour une plus-value", () => {
    expect(variationLabel(2000)).toBe(`+${euros(2000)}`);
  });

  it("variationLabel n'ajoute pas de signe supplémentaire pour une moins-value (déjà négative)", () => {
    expect(variationLabel(-500)).toBe(euros(-500));
  });
});
