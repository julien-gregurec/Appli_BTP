import { describe, expect, it } from "vitest";
import { chantierExportFileName, validateChantierExportDocument, type ChantierExportDocument } from "./chantier-document";

const base: ChantierExportDocument = {
  project: { id: "trace-1", name: "Plafond salle réunion", units: "mm", generatedAt: "2026-09-05T12:00:00.000Z" },
};

describe("contrat ChantierExportDocument", () => {
  it("accepte un document minimal (project seul)", () => {
    expect(validateChantierExportDocument(base)).toBe(base);
  });

  it("refuse un identifiant de projet manquant", () => {
    expect(() => validateChantierExportDocument({ project: { ...base.project, id: "" } })).toThrow(/identifiant/i);
  });

  it("refuse une unité inconnue", () => {
    expect(() => validateChantierExportDocument({ project: { ...base.project, units: "pouce" as never } })).toThrow(/unité/i);
  });

  it("refuse un type d'ouvrage inconnu", () => {
    expect(() => validateChantierExportDocument({ project: { ...base.project, ouvrageType: "roof" as never } })).toThrow(/ouvrage/i);
  });

  it("refuse une dimension de pièce hors limites", () => {
    expect(() => validateChantierExportDocument({ project: { ...base.project, roomWidthMm: -5 } })).toThrow(/limites/i);
    expect(() => validateChantierExportDocument({ project: { ...base.project, roomWidthMm: 10_000_000 } })).toThrow(/limites/i);
  });

  it("refuse une date de génération invalide", () => {
    expect(() => validateChantierExportDocument({ project: { ...base.project, generatedAt: "pas une date" } })).toThrow(/date/i);
  });

  it("borne la longueur des notes", () => {
    expect(() => validateChantierExportDocument({ ...base, notes: "x".repeat(5000) })).toThrow(/notes/i);
  });
});

describe("chantierExportFileName", () => {
  it("utilise le chantier plutôt que le nom du projet quand il est renseigné", () => {
    const name = chantierExportFileName({ ...base, project: { ...base.project, siteName: "Lidl Strasbourg" } }, "pdf");
    expect(name).toBe("elsatia-tools-chantier-lidl-strasbourg-2026-09-05.pdf");
  });

  it("retombe sur le nom du projet et nettoie les caractères dangereux", () => {
    const name = chantierExportFileName({ ...base, project: { ...base.project, name: "Étage / réunion:*?" } }, "svg");
    expect(name).toBe("elsatia-tools-chantier-etage-reunion-2026-09-05.svg");
  });

  it("insère un suffixe (ex. mosaïque)", () => {
    const name = chantierExportFileName(base, "pdf", "mosaique");
    expect(name).toBe("elsatia-tools-chantier-plafond-salle-reunion-mosaique-2026-09-05.pdf");
  });
});
