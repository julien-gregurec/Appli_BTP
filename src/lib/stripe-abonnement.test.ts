import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculerFacturationStockage,
  prixStripePour,
  statutAbonnementDepuisStripe,
  stripeBillingEstConfigure,
  variablesStripeBillingManquantes,
} from "./stripe-abonnement";

afterEach(() => vi.unstubAllEnvs());

describe("tarifs Stripe Billing", () => {
  it("associe chaque offre et périodicité au bon prix", () => {
    const env = {
      NODE_ENV: "test",
      STRIPE_PRICE_ESSENTIEL_MENSUEL: "price_em",
      STRIPE_PRICE_ESSENTIEL_ANNUEL: "price_ea",
      STRIPE_PRICE_PRO_MENSUEL: "price_pm",
      STRIPE_PRICE_PRO_ANNUEL: "price_pa",
      STRIPE_PRICE_PREMIUM_MENSUEL: "price_xm",
      STRIPE_PRICE_PREMIUM_ANNUEL: "price_xa",
    } as NodeJS.ProcessEnv;
    expect(prixStripePour("essentiel", "mensuel", env)).toBe("price_em");
    expect(prixStripePour("pro", "annuel", env)).toBe("price_pa");
    expect(prixStripePour("premium", "mensuel", env)).toBe("price_xm");
  });

  it("signale précisément les variables absentes", () => {
    const manquantes = variablesStripeBillingManquantes({} as NodeJS.ProcessEnv);
    expect(manquantes).toContain("STRIPE_SECRET_KEY");
    expect(manquantes).toContain("STRIPE_PRICE_PREMIUM_ANNUEL");
    expect(stripeBillingEstConfigure({} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("statuts Stripe Billing", () => {
  it.each([
    ["trialing", "essai"],
    ["active", "actif"],
    ["past_due", "suspendu"],
    ["unpaid", "suspendu"],
    ["incomplete", "suspendu"],
    ["paused", "suspendu"],
    ["canceled", "annule"],
    ["incomplete_expired", "annule"],
  ])("convertit %s en %s", (stripe, attendu) => {
    expect(statutAbonnementDepuisStripe(stripe)).toBe(attendu);
  });
});

describe("facturation du stockage", () => {
  it("ne facture rien sous le quota", () => {
    expect(calculerFacturationStockage({
      octetsUtilises: 4_500_000_000,
      quotaGo: 5,
      periodicite: "mensuel",
    })).toMatchObject({ depassementGo: 0, montantHt: 0, nombreMois: 1 });
  });

  it("arrondit le dépassement au centième de Go", () => {
    expect(calculerFacturationStockage({
      octetsUtilises: 6_001_000_000,
      quotaGo: 5,
      periodicite: "mensuel",
    })).toMatchObject({ depassementGo: 1.01, montantHt: 0.51 });
  });

  it("applique douze mois sur une facture annuelle", () => {
    expect(calculerFacturationStockage({
      octetsUtilises: 27_000_000_000,
      quotaGo: 25,
      periodicite: "annuel",
    })).toMatchObject({ depassementGo: 2, montantHt: 12, nombreMois: 12 });
  });
});
