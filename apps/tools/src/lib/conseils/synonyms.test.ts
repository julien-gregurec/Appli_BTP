import { describe, expect, it } from "vitest";
import { expandSynonyms, SYNONYM_GROUPS_FOR_TEST } from "./synonyms";
import { normalizeText } from "./text";

describe("table de synonymes métier", () => {
  it("n'utilise que des termes déjà normalisés", () => {
    for (const group of SYNONYM_GROUPS_FOR_TEST) {
      for (const term of group) {
        expect(normalizeText(term)).toBe(term);
      }
    }
  });

  it("ne déclare pas deux fois le même terme dans un groupe", () => {
    for (const group of SYNONYM_GROUPS_FOR_TEST) {
      expect(new Set(group).size).toBe(group.length);
    }
  });

  it("place le jeton d'origine en tête de son expansion", () => {
    expect(expandSynonyms("placo")[0]).toBe("placo");
    expect(expandSynonyms("placo")).toContain("plaque de platre");
  });

  it("est symétrique", () => {
    expect(expandSynonyms("vitre")).toContain("vitrage");
    expect(expandSynonyms("vitrage")).toContain("vitre");
  });

  it("laisse un terme inconnu inchangé", () => {
    expect(expandSynonyms("zzzinconnu")).toEqual(["zzzinconnu"]);
  });
});
