import { describe, expect, it } from "vitest";
import { calculerForfaitGrandDeplacement, phaseBareme } from "./grands-deplacements";

describe("grands déplacements", () => {
  it("applique les trois phases du barème", () => {
    expect(phaseBareme("2026-01-01", "2026-03-31")).toBe("phase1");
    expect(phaseBareme("2026-01-01", "2026-04-01")).toBe("phase2");
    expect(phaseBareme("2024-01-01", "2026-01-01")).toBe("phase3");
  });

  it("calcule repas et logement sans arrondi flottant résiduel", () => {
    expect(calculerForfaitGrandDeplacement({
      dateOrigine: "2026-01-01",
      dateDebut: "2026-01-10",
      nbRepas: 2,
      nbNuits: 1,
      zone: "province",
    })).toMatchObject({ phase: "phase1", montant: 99.6, tauxRepas: 21.4, tauxLogement: 56.8 });
  });
});
