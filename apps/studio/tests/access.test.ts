import { describe, expect, it } from "vitest";
import {
  isStudioSignupAllowlisted,
  studioEnabled,
  studioLegalPublished,
  studioSignupMode,
} from "@elsatia/studio-domain";
describe("studioEnabled (kill switch, fail-open by design)", () => {
  it("reste actif par défaut", () => {
    expect(studioEnabled(undefined)).toBe(true);
    expect(studioEnabled("")).toBe(true);
    expect(studioEnabled("1")).toBe(true);
    expect(studioEnabled("garbage")).toBe(true);
  });
  it("s'éteint seulement sur une valeur explicite", () => {
    for (const off of ["0", "false", "off", "OFF", " False "])
      expect(studioEnabled(off)).toBe(false);
  });
});
describe("studioSignupMode (fail-closed)", () => {
  it("refuse tout ce qui n'est pas explicitement open ou allowlist", () => {
    expect(studioSignupMode(undefined)).toBe("closed");
    expect(studioSignupMode("")).toBe("closed");
    expect(studioSignupMode("closed")).toBe("closed");
    expect(studioSignupMode("Open")).toBe("closed");
    expect(studioSignupMode("garbage")).toBe("closed");
  });
  it("accepte exactement les deux modes ouverts", () => {
    expect(studioSignupMode("open")).toBe("open");
    expect(studioSignupMode("allowlist")).toBe("allowlist");
  });
});
describe("isStudioSignupAllowlisted (fail-closed)", () => {
  it("refuse quand la liste est vide ou absente", () => {
    expect(isStudioSignupAllowlisted("a@elsatia.fr", undefined)).toBe(false);
    expect(isStudioSignupAllowlisted("a@elsatia.fr", "")).toBe(false);
    expect(isStudioSignupAllowlisted("a@elsatia.fr", " , ,")).toBe(false);
  });
  it("autorise une adresse exacte, insensible à la casse", () => {
    expect(
      isStudioSignupAllowlisted("A@Elsatia.fr", "a@elsatia.fr,x@y.z"),
    ).toBe(true);
  });
  it("autorise un domaine entier via @domaine", () => {
    expect(isStudioSignupAllowlisted("new@elsatia.fr", "@elsatia.fr")).toBe(
      true,
    );
    expect(isStudioSignupAllowlisted("new@evil.test", "@elsatia.fr")).toBe(
      false,
    );
  });
  it("ne fait jamais de correspondance partielle de domaine", () => {
    expect(
      isStudioSignupAllowlisted("a@notelsatia.fr", "@elsatia.fr"),
    ).toBe(false);
    expect(
      isStudioSignupAllowlisted("a@elsatia.fr.evil.test", "@elsatia.fr"),
    ).toBe(false);
  });
});
describe("studioLegalPublished (fail-closed)", () => {
  it("exige exactement la valeur 1", () => {
    expect(studioLegalPublished(undefined)).toBe(false);
    expect(studioLegalPublished("")).toBe(false);
    expect(studioLegalPublished("true")).toBe(false);
    expect(studioLegalPublished("0")).toBe(false);
    expect(studioLegalPublished("1")).toBe(true);
  });
});
