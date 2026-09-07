import { describe, expect, it } from "vitest";

import {
  SEARCH_MAX_TOKENS,
  buildSearchDocument,
  keepDigits,
  normalizeActivityCode,
  normalizePhoneNumber,
  normalizeSearchText,
  normalizeVatNumber,
  tokenizeSearchTerm,
} from "./normalization";

describe("normalizeSearchText", () => {
  it("met en minuscules et retire les accents", () => {
    expect(normalizeSearchText("MENUISERIE MÜLLER")).toBe("menuiserie muller");
    expect(normalizeSearchText("Châtenay-Malabry")).toBe("chatenay malabry");
  });

  it("traite les ligatures", () => {
    expect(normalizeSearchText("CŒUR DE VILLE")).toBe("coeur de ville");
    expect(normalizeSearchText("Ærø")).toBe("aero");
  });

  it("rend équivalentes les écritures avec tiret, apostrophe et point", () => {
    expect(normalizeSearchText("SAINT-DENIS")).toBe(normalizeSearchText("SAINT DENIS"));
    expect(normalizeSearchText("L'HÔPITAL")).toBe(normalizeSearchText("L HOPITAL"));
    expect(normalizeSearchText("43.32A")).toBe("43 32a");
  });

  it("réduit les espaces et rogne les bords", () => {
    expect(normalizeSearchText("  MULLER   \t SAS \n")).toBe("muller sas");
  });

  it("rend la chaîne vide pour une entrée nulle", () => {
    expect(normalizeSearchText(null)).toBe("");
    expect(normalizeSearchText(undefined)).toBe("");
  });
});

describe("normalizePhoneNumber", () => {
  it("ramène les écritures françaises à une forme unique", () => {
    for (const written of ["06 12 34 56 78", "+33 6 12 34 56 78", "06.12.34.56.78", "0033612345678"]) {
      expect(normalizePhoneNumber(written)).toBe("0612345678");
    }
  });

  it("conserve un numéro étranger sous forme internationale", () => {
    expect(normalizePhoneNumber("+49 30 123456")).toBe("+4930123456");
  });

  it("retourne null pour une entrée vide", () => {
    expect(normalizePhoneNumber("   ")).toBeNull();
    expect(normalizePhoneNumber(null)).toBeNull();
  });
});

describe("autres normalisations", () => {
  it("normalise TVA, APE et chiffres", () => {
    expect(normalizeVatNumber("fr 44 732 829 320")).toBe("FR44732829320");
    expect(normalizeActivityCode("43.32a")).toBe("4332A");
    expect(keepDigits("73282932 000 009")).toBe("73282932000009");
  });
});

describe("tokenizeSearchTerm", () => {
  it("découpe en jetons normalisés", () => {
    expect(tokenizeSearchTerm("MARTIN Strasbourg")).toEqual(["martin", "strasbourg"]);
    expect(tokenizeSearchTerm("DUPONT 67100")).toEqual(["dupont", "67100"]);
    expect(tokenizeSearchTerm("43.32A STRASBOURG")).toEqual(["43", "32a", "strasbourg"]);
  });

  it("ignore les jetons d'un seul caractère", () => {
    expect(tokenizeSearchTerm("a martin")).toEqual(["martin"]);
  });

  it("plafonne le nombre de jetons", () => {
    const term = "un deux trois quatre cinq six sept huit neuf";
    expect(tokenizeSearchTerm(term)).toHaveLength(SEARCH_MAX_TOKENS);
  });

  it("rend une liste vide pour un terme vide — comportement de liste, pas de recherche", () => {
    expect(tokenizeSearchTerm("   ")).toEqual([]);
  });
});

describe("buildSearchDocument", () => {
  it("concatène les fragments normalisés en écartant les vides", () => {
    expect(
      buildSearchDocument(["CLI-0042", "MENUISERIE MÜLLER", null, "", "67000", "Strasbourg"]),
    ).toBe("cli 0042 menuiserie muller 67000 strasbourg");
  });
});
