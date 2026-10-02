import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV_PRIX_TEST, FakeStripe, PRIX_TEST } from "@/test/fake-stripe";
import {
  calculerFacturationStockage,
  creerSessionAbonnementStripe,
  ligneOffreAbonnement,
  offreDepuisPrix,
  periodeAbonnement,
  type StripeSubscription,
  prixOptionIAStripePour,
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
      STRIPE_PRICE_MINI_MENSUEL: "price_mm",
      STRIPE_PRICE_MINI_ANNUEL: "price_ma",
      STRIPE_PRICE_BUSINESS_MENSUEL: "price_bm",
      STRIPE_PRICE_BUSINESS_ANNUEL: "price_ba",
      STRIPE_PRICE_ENTREPRISE_MENSUEL: "price_xxm",
      STRIPE_PRICE_ENTREPRISE_ANNUEL: "price_xxa",
    } as NodeJS.ProcessEnv;
    expect(prixStripePour("essentiel", "mensuel", env)).toBe("price_em");
    expect(prixStripePour("pro", "annuel", env)).toBe("price_pa");
    expect(prixStripePour("premium", "mensuel", env)).toBe("price_xm");
    expect(prixStripePour("mini", "mensuel", env)).toBe("price_mm");
    expect(prixStripePour("business", "annuel", env)).toBe("price_ba");
  });

  it("associe chaque palier IA à son prix et à sa périodicité", () => {
    const env = {
      NODE_ENV: "test",
      STRIPE_PRICE_OPTION_IA_100_MENSUEL: "price_ia_100_m",
      STRIPE_PRICE_OPTION_IA_300_ANNUEL: "price_ia_300_a",
      STRIPE_PRICE_OPTION_IA_ILLIMITE_MENSUEL: "price_ia_infini_m",
    } as NodeJS.ProcessEnv;
    expect(prixOptionIAStripePour("100", "mensuel", env)).toBe("price_ia_100_m");
    expect(prixOptionIAStripePour("300", "annuel", env)).toBe("price_ia_300_a");
    expect(prixOptionIAStripePour("illimite", "mensuel", env)).toBe("price_ia_infini_m");
    expect(prixOptionIAStripePour("100", "annuel", env)).toBeNull();
  });

  it("signale précisément les variables absentes", () => {
    const manquantes = variablesStripeBillingManquantes({} as NodeJS.ProcessEnv);
    expect(manquantes).toContain("STRIPE_SECRET_KEY");
    expect(manquantes).toContain("STRIPE_PRICE_ENTREPRISE_ANNUEL");
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

describe("droits dérivés du Price facturé", () => {
  const env = { NODE_ENV: "test", ...ENV_PRIX_TEST } as unknown as NodeJS.ProcessEnv;

  it("résout l'offre depuis l'identifiant du Price, puis depuis ses métadonnées", () => {
    expect(offreDepuisPrix(PRIX_TEST.price_business_a, env)).toEqual({ offre: "business", periodicite: "annuel" });
    expect(offreDepuisPrix(PRIX_TEST.price_pro_a_v2, env)).toEqual({ offre: "pro", periodicite: "annuel" });
    expect(offreDepuisPrix(PRIX_TEST.price_inconnu, env)).toBeNull();
    expect(offreDepuisPrix(undefined, env)).toBeNull();
  });

  it("ignore les lignes d'options et lit la période sur les lignes (API basil)", () => {
    const abonnement: StripeSubscription = {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      items: { data: [
        { id: "si_ia", price: { id: "price_option_ia" }, current_period_start: 100, current_period_end: 200 },
        { id: "si_base", price: PRIX_TEST.price_mini_m, current_period_start: 100, current_period_end: 200 },
      ] },
    };
    expect(ligneOffreAbonnement(abonnement, env)?.ligne.id).toBe("si_base");
    expect(periodeAbonnement(abonnement)).toEqual({ debut: 100, fin: 200 });
    expect(periodeAbonnement({ ...abonnement, current_period_start: 1, current_period_end: 2 })).toEqual({ debut: 1, fin: 2 });
  });
});

describe("session Checkout", () => {
  function preparer() {
    const stripe = new FakeStripe();
    vi.stubGlobal("fetch", stripe.fetch);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fictif");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.test");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUEL", "price_pro_a");
    return stripe;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("n'accorde l'essai qu'à la première souscription", async () => {
    const stripe = preparer();
    await creerSessionAbonnementStripe({ entrepriseId: "e1", customerId: "cus_1", offre: "pro", periodicite: "annuel", essai: true });
    await creerSessionAbonnementStripe({ entrepriseId: "e1", customerId: "cus_1", offre: "pro", periodicite: "annuel", essai: false });
    const [premiere, reactivation] = stripe.appelsVers("checkout/sessions");
    expect(premiere.corps!.get("subscription_data[trial_period_days]")).toBe("30");
    expect(reactivation.corps!.get("subscription_data[trial_period_days]")).toBeNull();
    expect(premiere.corps!.get("line_items[0][price]")).toBe("price_pro_a");
    expect(premiere.corps!.get("billing_address_collection")).toBe("required");
    expect(premiere.corps!.get("automatic_tax[enabled]")).toBeNull();
  });

  it("déduplique un double clic sans bloquer une nouvelle tentative ultérieure", async () => {
    const stripe = preparer();
    const base = { entrepriseId: "e1", customerId: "cus_1", offre: "pro" as const, periodicite: "annuel" as const, essai: true };
    await creerSessionAbonnementStripe({ ...base, maintenant: new Date("2026-10-02T10:00:00Z") });
    await creerSessionAbonnementStripe({ ...base, maintenant: new Date("2026-10-02T10:05:00Z") });
    await creerSessionAbonnementStripe({ ...base, maintenant: new Date("2026-10-02T11:00:00Z") });
    const cles = stripe.appelsVers("checkout/sessions").map((appel) => appel.idempotence);
    expect(cles[0]).toBe(cles[1]);
    expect(cles[2]).not.toBe(cles[0]);
  });
});
