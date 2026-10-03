import { describe, expect, it } from "vitest";
import { autorisationCronValide, secretsEgaux } from "./cron-auth";

describe("autorisationCronValide", () => {
  it("accepte exactement le jeton Bearer attendu", () => {
    expect(autorisationCronValide("Bearer s3cret-long", "s3cret-long")).toBe(true);
  });

  it("refuse un jeton différent, préfixé ou sans schéma", () => {
    expect(autorisationCronValide("Bearer autre", "s3cret-long")).toBe(false);
    expect(autorisationCronValide("Bearer s3cret-long ", "s3cret-long")).toBe(false);
    expect(autorisationCronValide("s3cret-long", "s3cret-long")).toBe(false);
  });

  it("échoue fermé sans secret ou sans en-tête", () => {
    expect(autorisationCronValide("Bearer ", "")).toBe(false);
    expect(autorisationCronValide("Bearer undefined", undefined)).toBe(false);
    expect(autorisationCronValide(null, "s3cret-long")).toBe(false);
  });
});

describe("secretsEgaux", () => {
  it("compare exactement, échoue fermé sur valeur absente", () => {
    expect(secretsEgaux("abc", "abc")).toBe(true);
    expect(secretsEgaux("abd", "abc")).toBe(false);
    expect(secretsEgaux(null, "abc")).toBe(false);
    expect(secretsEgaux("", "")).toBe(false);
    expect(secretsEgaux("abc", undefined)).toBe(false);
  });
});
