import { describe, expect, it } from "vitest";
import { classifierCodeScanne } from "@/lib/qr-identification";

describe("classement automatique des QR internes", () => {
  it.each([
    ["LGP-EMP-ABC12345", "employe"],
    ["LGP-ART-ABC12345", "article"],
    ["LGP-CH-ABC12345", "chantier"],
    ["LGP-VEH-ABC12345", "vehicule"],
    ["LGP-OUT-ABC12345", "outil"],
  ] as const)("classe %s dans %s", (code, type) => {
    expect(classifierCodeScanne(code, "article")).toBe(type);
  });

  it("traite un EAN sans préfixe comme un article", () => {
    expect(classifierCodeScanne("3760123456789")).toBe("article");
  });
});
