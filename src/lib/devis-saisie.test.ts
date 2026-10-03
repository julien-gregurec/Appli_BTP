import { describe, expect, it } from "vitest";
import { erreurSaisieDevis } from "./devis";
import { dateDocumentFr } from "@/components/DocumentImprimable";

const ligne = (p: Partial<{ designation: string; quantite: number; prix_unitaire_ht: number; remise_ligne: number; taux_tva: number }> = {}) => ({
  designation: "L", quantite: 1, prix_unitaire_ht: 100, remise_ligne: 0, taux_tva: 20, ...p,
});

describe("garde-fous de saisie devis (B05)", () => {
  it("accepte un devis normal, y compris une ligne de remise à prix négatif", () => {
    expect(erreurSaisieDevis(3, [ligne(), ligne({ prix_unitaire_ht: -20 })])).toBeNull();
  });
  it("refuse une quantité négative", () => {
    expect(erreurSaisieDevis(0, [ligne({ quantite: -2, prix_unitaire_ht: 120 })])).toMatch(/Quantité négative/);
  });
  it("refuse une remise de ligne hors 0–100 %", () => {
    expect(erreurSaisieDevis(0, [ligne({ remise_ligne: 150 })])).toMatch(/remise de la ligne/);
    expect(erreurSaisieDevis(0, [ligne({ remise_ligne: -1 })])).toMatch(/remise de la ligne/);
  });
  it("refuse une remise globale hors 0–100 %", () => {
    expect(erreurSaisieDevis(101, [ligne()])).toMatch(/remise globale/);
  });
  it("refuse un total négatif", () => {
    expect(erreurSaisieDevis(0, [ligne({ prix_unitaire_ht: -500 })])).toMatch(/total du devis/);
  });
});

describe("dates imprimées au format français (B06)", () => {
  it("convertit AAAA-MM-JJ sans décalage de fuseau", () => {
    expect(dateDocumentFr("2026-10-02")).toBe("02/10/2026");
    expect(dateDocumentFr("2026-12-31T23:30:00+00:00")).toBe("31/12/2026");
  });
  it("laisse intacte une valeur non ISO et gère l'absence", () => {
    expect(dateDocumentFr("02/10/2026")).toBe("02/10/2026");
    expect(dateDocumentFr(null)).toBe("");
  });
});
