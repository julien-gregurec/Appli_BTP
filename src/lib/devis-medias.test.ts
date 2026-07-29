import { describe, expect, it } from "vitest";
import {
  detecterMimeMediaDevis,
  mimeDetecteCompatible,
  nomMediaDevisSecurise,
  resoudreMimeMediaDevis,
  validerMediaDevis,
} from "./devis-medias";

describe("médias des devis", () => {
  it("normalise le nom et retrouve le type à partir de l'extension", () => {
    expect(nomMediaDevisSecurise("../../Photo électricité été.jpg")).toBe("Photo-electricite-ete.jpg");
    expect(resoudreMimeMediaDevis("explication.m4a", "")).toBe("audio/mp4");
  });

  it("refuse les formats inconnus, les fichiers vides et les fichiers trop volumineux", () => {
    expect(validerMediaDevis({ nom: "virus.exe", mime: "application/x-msdownload", taille: 100 })).toBe(
      "Format non pris en charge",
    );
    expect(validerMediaDevis({ nom: "photo.jpg", mime: "image/jpeg", taille: 0 })).toBe("Le fichier est vide");
    expect(validerMediaDevis({ nom: "photo.jpg", mime: "image/jpeg", taille: 21 * 1024 * 1024 })).toBe(
      "Le fichier dépasse 20 Mo",
    );
  });

  it("contrôle la signature réelle du fichier", () => {
    expect(detecterMimeMediaDevis(new Uint8Array([0xff, 0xd8, 0xff, ...Array(9).fill(0)]))).toBe("image/jpeg");
    expect(
      detecterMimeMediaDevis(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...Array(8).fill(0)]),
      ),
    ).toBe("image/png");
    expect(mimeDetecteCompatible("image/jpeg", "image/png")).toBe(false);
    expect(mimeDetecteCompatible("image/heic", "image/heif")).toBe(true);
  });
});
