import { describe, expect, it } from "vitest";
import { prefixeIdentifiantEntreprise } from "./identifiants";

describe("prefixeIdentifiantEntreprise", () => {
  it("prend les trois premières lettres utiles du nom", () => {
    expect(prefixeIdentifiantEntreprise("Liria Concept")).toBe("LIR");
  });

  it("retire les accents et les séparateurs", () => {
    expect(prefixeIdentifiantEntreprise("Élan Bâtiment")).toBe("ELA");
  });

  it("complète les noms courts et fournit un repli sûr", () => {
    expect(prefixeIdentifiantEntreprise("AB")).toBe("ABX");
    expect(prefixeIdentifiantEntreprise("---")).toBe("DEP");
  });
});
