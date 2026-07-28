import { describe, expect, it } from "vitest";
import {
  detecterMimeMediaMessagerie,
  mimeDetecteCompatible,
  nomMediaMessagerieSecurise,
  resoudreMimeMediaMessagerie,
  validerMediaMessagerie,
} from "./messagerie-medias";

describe("médias de messagerie", () => {
  it("valide les images et vidéos autorisées", () => {
    expect(validerMediaMessagerie({ nom: "chantier.jpg", mime: "image/jpeg", taille: 1200 })).toBeNull();
    expect(validerMediaMessagerie({ nom: "visite.mov", mime: "video/quicktime", taille: 1200 })).toBeNull();
  });

  it("refuse les fichiers vides, trop grands ou non autorisés", () => {
    expect(validerMediaMessagerie({ nom: "x.jpg", mime: "image/jpeg", taille: 0 })).toContain("vide");
    expect(validerMediaMessagerie({ nom: "x.exe", mime: "application/octet-stream", taille: 10 })).toContain("Format");
    expect(validerMediaMessagerie({ nom: "x.mp4", mime: "video/mp4", taille: 20 * 1024 * 1024 + 1 })).toContain("20 Mo");
  });

  it("reconnaît le type d’un média mobile quand le navigateur l’omet", () => {
    expect(resoudreMimeMediaMessagerie("photo.HEIC", "")).toBe("image/heic");
    expect(resoudreMimeMediaMessagerie("chantier.mov", "")).toBe("video/quicktime");
  });

  it("nettoie le nom sans conserver de chemin", () => {
    expect(nomMediaMessagerieSecurise("../../vidéo été.mov")).toBe("video-ete.mov");
    expect(nomMediaMessagerieSecurise("///")).toBe("media");
  });

  it("détecte les signatures réelles", () => {
    expect(detecterMimeMediaMessagerie(Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(detecterMimeMediaMessagerie(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("video/webm");
    expect(mimeDetecteCompatible("video/quicktime", "video/mp4")).toBe(true);
  });
});
