import { describe, expect, it } from "vitest";
import { creerCsv, creerManifeste, nomJustificatifExport } from "./export";

describe("export comptable", () => {
  it("neutralise les caractères interdits dans les noms", () => {
    const nom = nomJustificatifExport("2026-07-12", "Fournisseur / test", 125.5, "EXP-000123", "pdf");
    expect(nom).toBe("2026-07-12_Fournisseur-test_125-50EUR_EXP-000123.pdf");
  });

  it("protège les cellules CSV", () => {
    expect(creerCsv(["Nom"], [["A; \"B\""]])).toBe('"Nom"\n"A; ""B"""');
  });

  it("associe chaque fichier à son empreinte dans le manifeste", () => {
    const fichiers = [{ chemin: "justificatifs/a.pdf", sha256: "a".repeat(64), taille: 10, noteReference: "EXP-1", documentVersionId: "v1" }];
    const manifeste = creerManifeste({ entrepriseId: "e1", entrepriseNom: "Liria", periodeDebut: "2026-07-01", periodeFin: "2026-07-31", genereAt: "2026-08-01T00:00:00Z", fichiers });
    expect(manifeste.fichiers).toEqual(fichiers);
    expect(manifeste.schema).toBe("liria-gestion-pro/expense-export/v1");
  });
});
