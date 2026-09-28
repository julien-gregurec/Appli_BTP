// ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1 — finding B-3 : l'offre (et donc les
// droits) suit le Price de forfait réellement facturé, pas la metadata posée au
// Checkout que le Portail Stripe ne met pas à jour lors d'un changement d'offre.
import { describe, expect, it } from "vitest";
import { offreFactureeDepuisSubscription } from "./stripe-abonnement";

const ENV = {
  STRIPE_PRICE_MINI_MENSUEL: "price_mini_m",
  STRIPE_PRICE_MINI_ANNUEL: "price_mini_a",
  STRIPE_PRICE_PRO_MENSUEL: "price_pro_m",
  STRIPE_PRICE_PRO_ANNUEL: "price_pro_a",
  STRIPE_PRICE_BUSINESS_MENSUEL: "price_business_m",
  STRIPE_PRICE_BUSINESS_ANNUEL: "price_business_a",
  STRIPE_PRICE_ENTREPRISE_MENSUEL: "price_entreprise_m",
  STRIPE_PRICE_ENTREPRISE_ANNUEL: "price_entreprise_a",
  STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL: "price_sup_mini_m",
};

function sub(prix: string[], metadata?: Record<string, string>) {
  return { metadata, items: { data: prix.map((id, i) => ({ id: `si_${i}`, price: { id } })) } };
}

describe("offreFactureeDepuisSubscription", () => {
  it("Checkout nominal : Price et metadata concordent", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_pro_m"], { offre: "pro", periodicite: "mensuel" }), ENV))
      .toEqual({ offre: "pro", periodicite: "mensuel", source: "prix", divergence: false });
  });

  it("montée d'offre par le Portail (Mini → Business) : les droits suivent le Price payé", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_business_m"], { offre: "mini", periodicite: "mensuel" }), ENV))
      .toEqual({ offre: "business", periodicite: "mensuel", source: "prix", divergence: true });
  });

  it("descente d'offre par le Portail (Entreprise → Mini) : aucun droit supérieur non payé", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_mini_m"], { offre: "entreprise", periodicite: "mensuel" }), ENV).offre).toBe("mini");
  });

  it("passage mensuel → annuel par le Portail : la périodicité suit le Price", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_pro_a"], { offre: "pro", periodicite: "mensuel" }), ENV))
      .toMatchObject({ offre: "pro", periodicite: "annuel", divergence: true });
  });

  it("items annexes (comptes supplémentaires) ignorés : seul le forfait décide", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_sup_mini_m", "price_mini_m"], { offre: "mini", periodicite: "mensuel" }), ENV))
      .toMatchObject({ offre: "mini", source: "prix", divergence: false });
  });

  it("Price de génération précédente (non courant) : repli sur la metadata", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_ancien_69"], { offre: "mini", periodicite: "mensuel" }), ENV))
      .toEqual({ offre: "mini", periodicite: "mensuel", source: "metadata", divergence: false });
  });

  it("deux forfaits distincts (configuration anormale) : pas de choix arbitraire, repli metadata", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_mini_m", "price_pro_m"], { offre: "pro", periodicite: "mensuel" }), ENV).source).toBe("metadata");
  });

  it("mauvaise metadata sans Price reconnu : aucune offre inventée", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_inconnu"], { offre: "platine", periodicite: "hebdo" }), ENV))
      .toEqual({ offre: null, periodicite: null, source: "inconnue", divergence: false });
  });

  it("mauvaise metadata mais Price reconnu : le Price corrige", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_entreprise_a"], { offre: "platine" }), ENV))
      .toEqual({ offre: "entreprise", periodicite: "annuel", source: "prix", divergence: false });
  });

  it("variables de prix absentes : comportement historique (metadata)", () => {
    expect(offreFactureeDepuisSubscription(sub(["price_pro_m"], { offre: "pro", periodicite: "mensuel" }), {}))
      .toMatchObject({ offre: "pro", source: "metadata" });
  });
});
