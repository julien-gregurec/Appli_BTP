import { afterEach, describe, expect, it } from "vitest";
import { abonnementsPublicsOuverts, MESSAGE_OUVERTURE_PROCHAINE } from "./commercialisation-abonnements";

const valeurInitiale = process.env.ABONNEMENTS_PUBLICS_OUVERTS;

afterEach(() => {
  if (valeurInitiale === undefined) delete process.env.ABONNEMENTS_PUBLICS_OUVERTS;
  else process.env.ABONNEMENTS_PUBLICS_OUVERTS = valeurInitiale;
});

describe("verrou de commercialisation des abonnements", () => {
  it("reste fermé par défaut", () => {
    delete process.env.ABONNEMENTS_PUBLICS_OUVERTS;
    expect(abonnementsPublicsOuverts()).toBe(false);
    expect(MESSAGE_OUVERTURE_PROCHAINE).toContain("ouvriront prochainement");
  });

  it("ne s’ouvre que sur activation explicite", () => {
    process.env.ABONNEMENTS_PUBLICS_OUVERTS = "false";
    expect(abonnementsPublicsOuverts()).toBe(false);
    process.env.ABONNEMENTS_PUBLICS_OUVERTS = "true";
    expect(abonnementsPublicsOuverts()).toBe(true);
  });
});
