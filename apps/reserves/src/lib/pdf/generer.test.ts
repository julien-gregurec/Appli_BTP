import { describe, expect, it } from "vitest";
import { nomFichierChantier } from "./generer";

describe("nom de fichier d'un document de chantier", () => {
  it("porte le chantier, et l'entreprise quand l'export lui est restreint", () => {
    expect(nomFichierChantier("Résidence Les Tilleuls", null))
      .toBe("reserves-Residence-Les-Tilleuls.pdf");
    expect(nomFichierChantier("Résidence Les Tilleuls", "Peinture C"))
      .toBe("reserves-Residence-Les-Tilleuls-Peinture-C.pdf");
  });

  it("ne laisse passer aucun séparateur ni guillemet venu d'une saisie", () => {
    // Le nom part dans un en-tête `Content-Disposition` : un guillemet ou une barre
    // oblique y seraient une injection d'en-tête, pas une coquetterie de nommage.
    const nom = nomFichierChantier('../../etc/"passwd', null);
    expect(nom).not.toContain("/");
    expect(nom).not.toContain('"');
    expect(nom).not.toContain("..");
    expect(nom.endsWith(".pdf")).toBe(true);
  });

  it("borne la longueur pour rester un nom de fichier valide", () => {
    expect(nomFichierChantier("A".repeat(300), "B".repeat(300)).length)
      .toBeLessThanOrEqual("reserves-".length + 60 + 1 + 60 + ".pdf".length);
  });

  it("retombe sur un nom neutre quand la saisie ne contient rien d'utilisable", () => {
    expect(nomFichierChantier("///", null)).toBe("reserves-document.pdf");
  });
});
