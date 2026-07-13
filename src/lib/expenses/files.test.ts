import { describe, expect, it } from "vitest";
import { detecterMimeReel, nomFichierSur, validerJustificatif } from "./files";

describe("validation des justificatifs", () => {
  it("détecte un PDF par sa signature", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 contenu");
    expect(detecterMimeReel(pdf)).toBe("application/pdf");
  });

  it("refuse un exécutable renommé", () => {
    expect(() => validerJustificatif(new Uint8Array([0x4d, 0x5a, 0x90]), "facture.pdf", 1024)).toThrow(/contenu réel/);
  });

  it("refuse un fichier supérieur à la limite configurée", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 contenu trop long");
    expect(() => validerJustificatif(pdf, "facture.pdf", 5)).toThrow(/dépasse la taille/);
  });

  it("nettoie le nom utilisé dans un export", () => {
    expect(nomFichierSur("2026/07 Facturé: café?.pdf")).toBe("2026-07-Facture-cafe-.pdf");
  });
});
