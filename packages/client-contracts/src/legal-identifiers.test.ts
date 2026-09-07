import { describe, expect, it } from "vitest";

import {
  buildFrenchVatNumber,
  computeFrenchVatKey,
  isPlausibleEmail,
  isPlausiblePhoneNumber,
  isValidActivityCode,
  isValidPostalCode,
  isValidSiren,
  isValidSiret,
  isValidVatNumber,
  sirenFromSiret,
} from "./legal-identifiers";
import { LA_POSTE_SIRET, VALID_SIREN, VALID_SIRET, VALID_VAT } from "./fixtures";

describe("SIREN", () => {
  it("accepte un SIREN valide, y compris mis en forme", () => {
    expect(isValidSiren(VALID_SIREN)).toBe(true);
    expect(isValidSiren("732 829 320")).toBe(true);
  });

  it("refuse une longueur fausse ou une clé fausse", () => {
    expect(isValidSiren("73282932")).toBe(false);
    expect(isValidSiren("123456789")).toBe(false);
    expect(isValidSiren(null)).toBe(false);
  });
});

describe("SIRET", () => {
  it("accepte un SIRET valide et en extrait le SIREN", () => {
    expect(isValidSiret(VALID_SIRET)).toBe(true);
    expect(sirenFromSiret(VALID_SIRET)).toBe(VALID_SIREN);
  });

  it("refuse un SIRET de clé fausse", () => {
    expect(isValidSiret("73282932000008")).toBe(false);
  });

  it("accepte l'exception documentée de La Poste", () => {
    // Clé de Luhn fausse, mais somme des chiffres multiple de 5 : refuser ces SIRET
    // reviendrait à interdire de facturer La Poste.
    expect(isValidSiret(LA_POSTE_SIRET)).toBe(true);
  });

  it("ne relâche pas la règle pour un SIREN qui n'est pas celui de La Poste", () => {
    expect(isValidSiret("35600000100001")).toBe(false);
  });
});

describe("TVA intracommunautaire", () => {
  it("vérifie la clé française", () => {
    expect(computeFrenchVatKey(VALID_SIREN)).toBe("44");
    expect(buildFrenchVatNumber(VALID_SIREN)).toBe(VALID_VAT);
    expect(isValidVatNumber(VALID_VAT)).toBe(true);
    expect(isValidVatNumber("FR 44 732 829 320")).toBe(true);
  });

  it("refuse une clé française fausse", () => {
    expect(isValidVatNumber("FR45732829320")).toBe(false);
  });

  it("accepte un numéro étranger sur le format seul", () => {
    expect(isValidVatNumber("DE123456789")).toBe(true);
    expect(isValidVatNumber("XX")).toBe(false);
  });
});

describe("code APE et code postal", () => {
  it("normalise le code APE avant de le valider", () => {
    expect(isValidActivityCode("4332A")).toBe(true);
    expect(isValidActivityCode("43.32A")).toBe(true);
    expect(isValidActivityCode("4332")).toBe(false);
  });

  it("impose cinq chiffres en France et reste souple ailleurs", () => {
    expect(isValidPostalCode("67000", "FR")).toBe(true);
    expect(isValidPostalCode("6700", "FR")).toBe(false);
    expect(isValidPostalCode("SW1A 1AA", "GB")).toBe(true);
    expect(isValidPostalCode("", "GB")).toBe(false);
  });
});

describe("e-mail et téléphone", () => {
  it("écarte les saisies manifestement fausses sans prétendre appliquer la RFC", () => {
    expect(isPlausibleEmail("contact@muller.example.fr")).toBe(true);
    expect(isPlausibleEmail("contact@localhost")).toBe(false);
    expect(isPlausibleEmail("contact muller@example.fr")).toBe(false);
  });

  it("borne le nombre de chiffres d'un téléphone", () => {
    expect(isPlausiblePhoneNumber("+33 6 12 34 56 78")).toBe(true);
    expect(isPlausiblePhoneNumber("12345")).toBe(false);
  });
});
