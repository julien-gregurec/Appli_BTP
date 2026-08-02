import { describe, expect, it } from "vitest";
import { classifierCodeScanne, normaliserCodeIdentification } from "@/lib/qr-identification";

describe("classement automatique des QR internes", () => {
  it.each([
    ["LGP-EMP-ABC12345", "employe"],
    ["LGP-ART-ABC12345", "article"],
    ["LGP-CH-ABC12345", "chantier"],
    ["LGP-VEH-ABC12345", "vehicule"],
    ["LGP-OUT-ABC12345", "outil"],
  ] as const)("classe l'ancien format %s dans %s", (code, type) => {
    expect(classifierCodeScanne(code, "article")).toBe(type);
  });

  it.each([
    ["ELS-EMP-ABC12345", "employe"],
    ["ELS-ART-ABC12345", "article"],
    ["ELS-CH-ABC12345", "chantier"],
    ["ELS-VEH-ABC12345", "vehicule"],
    ["ELS-OUT-ABC12345", "outil"],
  ] as const)("classe le nouveau format %s dans %s", (code, type) => {
    expect(classifierCodeScanne(code, "article")).toBe(type);
  });

  it("traite un EAN sans préfixe comme un article", () => {
    expect(classifierCodeScanne("3760123456789")).toBe("article");
  });

  it("rejette un préfixe inconnu et retourne la cible demandée", () => {
    expect(classifierCodeScanne("XYZ-99-ABC12345", "chantier")).toBe("chantier");
    expect(classifierCodeScanne("XYZ-99-ABC12345")).toBe("article");
  });
});

describe("normalisation d'un code scanné vers le préfixe actuel (ELS-REC-004)", () => {
  it.each([
    ["LGP-EMP-ABC12345", "ELS-EMP-ABC12345"],
    ["LGP-ART-ABC12345", "ELS-ART-ABC12345"],
    ["LGP-CH-ABC12345", "ELS-CH-ABC12345"],
    ["LGP-VEH-ABC12345", "ELS-VEH-ABC12345"],
    ["LGP-OUT-ABC12345", "ELS-OUT-ABC12345"],
  ] as const)("convertit l'ancienne étiquette %s en %s", (ancien, attendu) => {
    expect(normaliserCodeIdentification(ancien)).toBe(attendu);
  });

  it("laisse un code déjà au format actuel inchangé", () => {
    expect(normaliserCodeIdentification("ELS-CH-ABC12345")).toBe("ELS-CH-ABC12345");
  });

  it("laisse inchangé un code sans préfixe reconnu (EAN, référence, identifiant salarié personnel)", () => {
    expect(normaliserCodeIdentification("3760123456789")).toBe("3760123456789");
    expect(normaliserCodeIdentification("ELS-0001")).toBe("ELS-0001");
    expect(normaliserCodeIdentification("REF-ARTICLE-42")).toBe("REF-ARTICLE-42");
  });

  it("préserve exactement le suffixe, quelle que soit sa longueur", () => {
    expect(normaliserCodeIdentification("lgp-veh-851efd11")).toBe("ELS-VEH-851EFD11");
    expect(normaliserCodeIdentification("LGP-OUT-19D5EA1FZZZZ")).toBe("ELS-OUT-19D5EA1FZZZZ");
  });

  it("normalise avant recherche : l'ancien et le nouveau code d'une même ressource convergent vers la même clé de recherche", () => {
    const ancienneEtiquette = "LGP-CH-1129E65E";
    const codeStockeApresMigration = "ELS-CH-1129E65E";
    expect(normaliserCodeIdentification(ancienneEtiquette)).toBe(codeStockeApresMigration);
    expect(normaliserCodeIdentification(codeStockeApresMigration)).toBe(codeStockeApresMigration);
  });
});
