import { describe, expect, it } from "vitest";

import { DESTINATION_INTERNE_PAR_DEFAUT, cheminInterneSur } from "@/lib/redirection-sure";

const REPLI = DESTINATION_INTERNE_PAR_DEFAUT;

describe("cheminInterneSur (Réserves)", () => {
  it("accepte les chemins internes normaux", () => {
    expect(cheminInterneSur("/dashboard")).toBe("/dashboard");
    expect(cheminInterneSur("/invitation/abc?x=1#y", "/repli")).toBe("/invitation/abc?x=1#y");
    expect(cheminInterneSur("/messages")).toBe("/messages");
  });

  it.each([
    // Régression directe des exploits REDTEAM-V2 (F1/F2).
    "/\\evil.com",
    "/%5Cevil.com",
    "/%09/evil.com",
    "/%0A/evil.com",
    "/.//evil.com",
    "/..//evil.com",
    "/%2e//evil.com",
    "/a/..//evil.com",
    // Formes classiques.
    "//evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/%2f%2fevil.com",
    "/%252f%252fevil.com",
    "https://user:pass@evil.com",
    "",
    "relatif",
  ])("écarte la destination externe ou ambiguë %s", (valeur) => {
    expect(cheminInterneSur(valeur, REPLI)).toBe(REPLI);
  });

  it("ne renvoie jamais une valeur non chaîne", () => {
    expect(cheminInterneSur(undefined, REPLI)).toBe(REPLI);
    expect(cheminInterneSur(null, REPLI)).toBe(REPLI);
    expect(cheminInterneSur(42 as unknown, REPLI)).toBe(REPLI);
  });
});
