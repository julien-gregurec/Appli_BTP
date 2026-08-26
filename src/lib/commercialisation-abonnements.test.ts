import { afterEach, describe, expect, it } from "vitest";
import { OFFRES_TARIFAIRES } from "./tarification";
import { URL_CONTACT_COMMERCIAL } from "./brand";
import { abonnementsPublicsOuverts, destinationCtaOffreTarifaire, MESSAGE_OUVERTURE_PROCHAINE } from "./commercialisation-abonnements";

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

  it("dirige les cinq CTA tarifaires vers le contact commercial quand les souscriptions sont fermées", () => {
    const destinations = OFFRES_TARIFAIRES.map((offre) => destinationCtaOffreTarifaire({
      cleOffre: offre.cle,
      devisObligatoire: offre.devisObligatoire,
      paiementConfigure: true,
      abonnementsOuverts: false,
    }));

    expect(destinations).toHaveLength(5);
    expect(destinations).toEqual(Array(5).fill(URL_CONTACT_COMMERCIAL));
    expect(destinations.every((destination) => !destination.startsWith("mailto:"))).toBe(true);
  });

  it("ne rend une inscription possible qu’après ouverture explicite", () => {
    expect(destinationCtaOffreTarifaire({
      cleOffre: "mini",
      devisObligatoire: false,
      paiementConfigure: true,
      abonnementsOuverts: true,
    })).toBe("/signup?offre=mini");

    expect(destinationCtaOffreTarifaire({
      cleOffre: "sur_mesure",
      devisObligatoire: true,
      paiementConfigure: true,
      abonnementsOuverts: true,
    })).toBe(URL_CONTACT_COMMERCIAL);
  });
});
