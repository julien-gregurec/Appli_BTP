import { afterEach, describe, expect, it, vi } from "vitest";
import {
  champsIdentiteVendeurManquants,
  etatOuvertureCommerciale,
  facturationReelleAutorisee,
  MENTION_DOCUMENT_TEST,
  MENTION_FRANCHISE_TVA,
  modeStripe,
  parametresFiscauxCheckout,
  piedDeFactureStripe,
  regimeTva,
} from "./stripe-billing-config";
import { ENV_PRIX_TEST } from "@/test/fake-stripe";

afterEach(() => vi.unstubAllEnvs());

const BASE = {
  NODE_ENV: "test",
  STRIPE_WEBHOOK_ABONNEMENT_SECRET: "whsec_fictif",
  NEXT_PUBLIC_APP_URL: "https://example.test",
  ...ENV_PRIX_TEST,
} as unknown as NodeJS.ProcessEnv;

// SIREN fictif mais valide au sens de la clé de Luhn.
const IDENTITE = {
  LIRIA_VENDEUR_DENOMINATION: "Vendeur Fictif",
  LIRIA_VENDEUR_FORME_JURIDIQUE: "EI",
  LIRIA_VENDEUR_ADRESSE: "1 rue de l'Exemple, 67000 Strasbourg",
  LIRIA_VENDEUR_EMAIL: "facturation@example.test",
  LIRIA_VENDEUR_SIREN: "732829320",
  LIRIA_FACTURE_MENTIONS_PAIEMENT: "Paiement à réception. Pénalités : 3 fois le taux d'intérêt légal. Indemnité forfaitaire de recouvrement : 40 €.",
  LIRIA_VENDEUR_IDENTITE_STRIPE_VERIFIEE: "true",
};

describe("mode Stripe", () => {
  it("se déduit du seul préfixe de la clé", () => {
    expect(modeStripe({} as NodeJS.ProcessEnv)).toBe("absent");
    expect(modeStripe({ STRIPE_SECRET_KEY: "sk_test_fictif" } as unknown as NodeJS.ProcessEnv)).toBe("test");
    expect(modeStripe({ STRIPE_SECRET_KEY: "rk_test_fictif" } as unknown as NodeJS.ProcessEnv)).toBe("test");
    expect(modeStripe({ STRIPE_SECRET_KEY: "sk_live_fictif" } as unknown as NodeJS.ProcessEnv)).toBe("live");
    expect(modeStripe({ STRIPE_SECRET_KEY: "pk_test_fictif" } as unknown as NodeJS.ProcessEnv)).toBe("inconnu");
  });
});

describe("règle d'ouverture commerciale", () => {
  it("reste fermée sans clé, sans Price ou sans décision", () => {
    expect(etatOuvertureCommerciale({} as NodeJS.ProcessEnv).ouvert).toBe(false);
    expect(etatOuvertureCommerciale({ ...BASE, STRIPE_SECRET_KEY: "sk_test_fictif" }).ouvert).toBe(false);
    const sansPrix = { ...BASE, STRIPE_SECRET_KEY: "sk_test_fictif", STRIPE_BILLING_QUALIFICATION_TEST: "true", STRIPE_PRICE_PRO_ANNUEL: "" };
    expect(etatOuvertureCommerciale(sansPrix).raisons.join()).toContain("STRIPE_PRICE_PRO_ANNUEL");
  });

  it("s'ouvre en Stripe Test uniquement sur qualification explicite", () => {
    const etat = etatOuvertureCommerciale({ ...BASE, STRIPE_SECRET_KEY: "sk_test_fictif", STRIPE_BILLING_QUALIFICATION_TEST: "true" });
    expect(etat).toEqual({ ouvert: true, mode: "test", raisons: [] });
  });

  it("n'ouvre jamais le Live sans décision, date, identité et TVA confirmées", () => {
    const live = { ...BASE, STRIPE_SECRET_KEY: "sk_live_fictif", STRIPE_BILLING_QUALIFICATION_TEST: "true" };
    const ferme = etatOuvertureCommerciale(live);
    expect(ferme.ouvert).toBe(false);
    expect(ferme.raisons).toHaveLength(4);

    const complet = {
      ...live,
      ...IDENTITE,
      STRIPE_BILLING_LIVE_AUTORISE: "true",
      ABONNEMENTS_OUVERTURE_COMMERCIALE_AT: "2026-11-01T00:00:00+01:00",
      LIRIA_TVA_REGIME: "franchise_en_base",
      LIRIA_TVA_REGIME_CONFIRME: "true",
    };
    expect(etatOuvertureCommerciale(complet, new Date("2026-10-02T12:00:00Z")).ouvert).toBe(false);
    expect(etatOuvertureCommerciale(complet, new Date("2026-10-02T12:00:00Z")).raisons[0]).toContain("ouverture commerciale prévue");
    expect(etatOuvertureCommerciale(complet, new Date("2026-11-02T12:00:00Z")).ouvert).toBe(true);
    expect(etatOuvertureCommerciale({ ...complet, LIRIA_TVA_REGIME_CONFIRME: "" }, new Date("2026-11-02T12:00:00Z")).ouvert).toBe(false);
  });
});

describe("TVA", () => {
  it("n'invente jamais le régime", () => {
    expect(regimeTva({} as NodeJS.ProcessEnv)).toEqual({ regime: null, confirme: false });
    expect(regimeTva({ LIRIA_TVA_REGIME: "assujetti" } as unknown as NodeJS.ProcessEnv)).toEqual({ regime: "assujetti", confirme: false });
    expect(regimeTva({ LIRIA_TVA_REGIME: "autre", LIRIA_TVA_REGIME_CONFIRME: "true" } as unknown as NodeJS.ProcessEnv)).toEqual({ regime: null, confirme: false });
  });

  it("n'active le calcul de taxe Stripe que pour un régime assujetti déclaré", () => {
    expect(parametresFiscauxCheckout({} as NodeJS.ProcessEnv)["automatic_tax[enabled]"]).toBeUndefined();
    expect(parametresFiscauxCheckout({ LIRIA_TVA_REGIME: "franchise_en_base" } as unknown as NodeJS.ProcessEnv)["automatic_tax[enabled]"]).toBeUndefined();
    expect(parametresFiscauxCheckout({ LIRIA_TVA_REGIME: "assujetti" } as unknown as NodeJS.ProcessEnv)).toMatchObject({
      "automatic_tax[enabled]": "true",
      "tax_id_collection[enabled]": "true",
      billing_address_collection: "required",
    });
  });
});

describe("identité vendeur", () => {
  it("exige les mentions légales, un SIREN valide et la vérification Stripe", () => {
    expect(champsIdentiteVendeurManquants({} as NodeJS.ProcessEnv)).toEqual([
      "LIRIA_VENDEUR_DENOMINATION",
      "LIRIA_VENDEUR_FORME_JURIDIQUE",
      "LIRIA_VENDEUR_ADRESSE",
      "LIRIA_VENDEUR_EMAIL",
      "LIRIA_FACTURE_MENTIONS_PAIEMENT",
      "LIRIA_VENDEUR_SIREN",
      "LIRIA_VENDEUR_IDENTITE_STRIPE_VERIFIEE",
    ]);
    expect(champsIdentiteVendeurManquants({ ...IDENTITE } as unknown as NodeJS.ProcessEnv)).toEqual([]);
    expect(champsIdentiteVendeurManquants({ ...IDENTITE, LIRIA_VENDEUR_SIREN: "732829321" } as unknown as NodeJS.ProcessEnv)).toEqual(["LIRIA_VENDEUR_SIREN"]);
    expect(champsIdentiteVendeurManquants({ ...IDENTITE, LIRIA_VENDEUR_FORME_JURIDIQUE: "SAS" } as unknown as NodeJS.ProcessEnv)).toEqual(["LIRIA_VENDEUR_RCS", "LIRIA_VENDEUR_CAPITAL"]);
    expect(champsIdentiteVendeurManquants({ ...IDENTITE, LIRIA_TVA_REGIME: "assujetti" } as unknown as NodeJS.ProcessEnv)).toEqual(["LIRIA_VENDEUR_TVA_INTRA"]);
  });

  it("n'autorise la facturation réelle qu'avec identité ET régime confirmés", () => {
    expect(facturationReelleAutorisee({ ...IDENTITE } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(facturationReelleAutorisee({ ...IDENTITE, LIRIA_TVA_REGIME: "franchise_en_base", LIRIA_TVA_REGIME_CONFIRME: "true" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("marque les factures Test comme sans valeur et porte la mention de franchise", () => {
    const pied = piedDeFactureStripe({ STRIPE_SECRET_KEY: "sk_test_fictif", ...IDENTITE, LIRIA_TVA_REGIME: "franchise_en_base" } as unknown as NodeJS.ProcessEnv);
    expect(pied).toContain(MENTION_DOCUMENT_TEST);
    expect(pied).toContain(MENTION_FRANCHISE_TVA);
    expect(pied).toContain("SIREN/SIRET 732829320");
    const live = piedDeFactureStripe({ STRIPE_SECRET_KEY: "sk_live_fictif", ...IDENTITE } as unknown as NodeJS.ProcessEnv);
    expect(live).not.toContain(MENTION_DOCUMENT_TEST);
    expect(live).not.toContain(MENTION_FRANCHISE_TVA);
  });
});
