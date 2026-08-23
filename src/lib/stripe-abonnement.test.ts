import { afterEach, describe, expect, it, vi } from "vitest";

const createAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const {
  appliquerCouponAbonnement,
  calculerFacturationStockage,
  creerCouponRemise,
  prixOptionIAStripePour,
  prixStripePour,
  reconcilierAbonnementStripe,
  retirerCouponAbonnement,
  statutAbonnementDepuisStripe,
  stripeBillingEstConfigure,
  synchroniserExpirationRemise,
  variablesStripeBillingManquantes,
} = await import("./stripe-abonnement");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// Fabrique un client Supabase minimal couvrant exactement les requêtes faites par
// reconcilierAbonnementStripe : l'entreprise (abonnement Stripe + offre/périodicité) et
// le comptage des comptes facturables (compte_application_statut actif/pause).
function supabaseFakePourReconciliation(params: { entreprise: Record<string, unknown> | null; nbComptes: number }) {
  return {
    from(table: string) {
      if (table === "entreprises") {
        const requete: Record<string, unknown> = {};
        for (const methode of ["select", "eq"]) requete[methode] = () => requete;
        requete.maybeSingle = async () => ({ data: params.entreprise, error: null });
        return requete;
      }
      if (table === "employes") {
        const requete: Record<string, unknown> = {};
        for (const methode of ["select", "eq"]) requete[methode] = () => requete;
        requete.in = () => Promise.resolve({ count: params.nbComptes, error: null });
        return requete;
      }
      throw new Error(`Table non prévue par ce mock : ${table}`);
    },
  };
}

// Fabrique un fetch global minimal : répond à la lecture de l'abonnement (GET
// subscriptions/{id}) et enregistre tous les appels d'écriture (subscription_items) pour
// vérification, sans jamais appeler le vrai réseau Stripe.
function fetchFakeStripe(params: { itemExistant?: { id: string; price: { id: string } } }) {
  const appels: Array<{ url: string; methode: string; corps: string | null }> = [];
  const fauxFetch = vi.fn(async (url: string, options: { method?: string; body?: URLSearchParams } = {}) => {
    const methode = options.method ?? "GET";
    appels.push({ url, methode, corps: options.body ? options.body.toString() : null });
    if (url.includes("/subscriptions/") && !url.includes("subscription_items") && methode === "GET") {
      return {
        ok: true,
        json: async () => ({
          id: "sub_test",
          customer: "cus_test",
          status: "active",
          items: { data: params.itemExistant ? [params.itemExistant] : [] },
        }),
      };
    }
    return { ok: true, json: async () => ({ id: "si_nouveau" }) };
  });
  return { fauxFetch, appels };
}

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

// COMPTES-SUPPLEMENTAIRES-V1 : reconcilierAbonnementStripe echouait silencieusement en
// l'absence des variables STRIPE_PRICE_COMPTE_SUP_{offre}_{periodicite}. Ces tests couvrent
// les quatre issues reelles (creation/mise a jour/suppression de l'item Stripe, et l'echec
// explicite si la configuration manque) plutot que le seul symptome (no-op silencieux).
describe("réconciliation des comptes supplémentaires (COMPTES-SUPPLEMENTAIRES-V1)", () => {
  function stubEnvPrixMini() {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL", "price_compte_sup_mini_m");
  }

  it("ne fait rien et le signale si le Price du compte supplémentaire n'est pas configuré", async () => {
    vi.stubEnv("NODE_ENV", "test");
    createAdminClient.mockReturnValue(supabaseFakePourReconciliation({
      entreprise: { stripe_subscription_id: "sub_test", abonnement_offre: "mini", abonnement_periodicite: "mensuel" },
      nbComptes: 5,
    }));
    const { fauxFetch, appels } = fetchFakeStripe({});
    vi.stubGlobal("fetch", fauxFetch);

    const resultat = await reconcilierAbonnementStripe("entreprise-1");

    expect(resultat).toEqual({ synchronise: false, raison: "prix_supplement_absent" });
    expect(appels).toHaveLength(0);
  });

  it("signale l'absence d'abonnement Stripe sans tenter aucun appel", async () => {
    vi.stubEnv("NODE_ENV", "test");
    createAdminClient.mockReturnValue(supabaseFakePourReconciliation({
      entreprise: { stripe_subscription_id: null, abonnement_offre: "mini", abonnement_periodicite: "mensuel" },
      nbComptes: 5,
    }));
    const { fauxFetch, appels } = fetchFakeStripe({});
    vi.stubGlobal("fetch", fauxFetch);

    const resultat = await reconcilierAbonnementStripe("entreprise-1");

    expect(resultat).toEqual({ synchronise: false, raison: "abonnement_absent" });
    expect(appels).toHaveLength(0);
  });

  it("ne crée aucun item si aucun compte ne dépasse le quota inclus", async () => {
    vi.stubEnv("NODE_ENV", "test");
    stubEnvPrixMini();
    createAdminClient.mockReturnValue(supabaseFakePourReconciliation({
      entreprise: { stripe_subscription_id: "sub_test", abonnement_offre: "mini", abonnement_periodicite: "mensuel" },
      nbComptes: 3, // Mini inclut déjà 3 comptes.
    }));
    const { fauxFetch, appels } = fetchFakeStripe({});
    vi.stubGlobal("fetch", fauxFetch);

    const resultat = await reconcilierAbonnementStripe("entreprise-1");

    expect(resultat).toEqual({ synchronise: true, quantite: 0 });
    expect(appels.filter((a) => a.methode !== "GET")).toHaveLength(0);
  });

  it("crée l'item Stripe du compte supplémentaire au bon Price et à la bonne quantité", async () => {
    vi.stubEnv("NODE_ENV", "test");
    stubEnvPrixMini();
    createAdminClient.mockReturnValue(supabaseFakePourReconciliation({
      entreprise: { stripe_subscription_id: "sub_test", abonnement_offre: "mini", abonnement_periodicite: "mensuel" },
      nbComptes: 5, // 3 inclus + 2 supplémentaires.
    }));
    const { fauxFetch, appels } = fetchFakeStripe({});
    vi.stubGlobal("fetch", fauxFetch);

    const resultat = await reconcilierAbonnementStripe("entreprise-1");

    expect(resultat).toEqual({ synchronise: true, quantite: 2 });
    const creation = appels.find((a) => a.url.endsWith("/subscription_items") && a.methode === "POST");
    expect(creation?.corps).toContain("price=price_compte_sup_mini_m");
    expect(creation?.corps).toContain("quantity=2");
    expect(creation?.corps).toContain("subscription=sub_test");
  });

  it("met à jour la quantité d'un item de compte supplémentaire déjà présent", async () => {
    vi.stubEnv("NODE_ENV", "test");
    stubEnvPrixMini();
    createAdminClient.mockReturnValue(supabaseFakePourReconciliation({
      entreprise: { stripe_subscription_id: "sub_test", abonnement_offre: "mini", abonnement_periodicite: "mensuel" },
      nbComptes: 6, // 3 supplémentaires désormais.
    }));
    const { fauxFetch, appels } = fetchFakeStripe({ itemExistant: { id: "si_existant", price: { id: "price_compte_sup_mini_m" } } });
    vi.stubGlobal("fetch", fauxFetch);

    const resultat = await reconcilierAbonnementStripe("entreprise-1");

    expect(resultat).toEqual({ synchronise: true, quantite: 3 });
    const mise_a_jour = appels.find((a) => a.url.endsWith("/subscription_items/si_existant") && a.methode === "POST");
    expect(mise_a_jour?.corps).toContain("quantity=3");
  });

  it("supprime l'item Stripe quand plus aucun compte ne dépasse le quota", async () => {
    vi.stubEnv("NODE_ENV", "test");
    stubEnvPrixMini();
    createAdminClient.mockReturnValue(supabaseFakePourReconciliation({
      entreprise: { stripe_subscription_id: "sub_test", abonnement_offre: "mini", abonnement_periodicite: "mensuel" },
      nbComptes: 3, // Retour au quota inclus.
    }));
    const { fauxFetch, appels } = fetchFakeStripe({ itemExistant: { id: "si_existant", price: { id: "price_compte_sup_mini_m" } } });
    vi.stubGlobal("fetch", fauxFetch);

    const resultat = await reconcilierAbonnementStripe("entreprise-1");

    expect(resultat).toEqual({ synchronise: true, quantite: 0 });
    const suppression = appels.find((a) => a.url.endsWith("/subscription_items/si_existant") && a.methode === "DELETE");
    expect(suppression).toBeDefined();
  });
});

describe("expiration naturelle d'une remise Stripe (REMISES-CLIENTS-V1)", () => {
  function supabaseFakePourExpiration(params: { entreprise: Record<string, unknown> | null }) {
    const appels: Array<{ table: string; methode: string; donnees?: Record<string, unknown> }> = [];
    return {
      appels,
      from(table: string) {
        const requete: Record<string, unknown> = {};
        requete.select = () => requete;
        requete.eq = () => requete;
        requete.maybeSingle = async () => ({ data: params.entreprise, error: null });
        requete.update = (donnees: Record<string, unknown>) => {
          appels.push({ table, methode: "update", donnees });
          return requete;
        };
        requete.insert = (donnees: Record<string, unknown>) => {
          appels.push({ table, methode: "insert", donnees });
          return Promise.resolve({ data: null, error: null });
        };
        return requete;
      },
    };
  }

  it("ne fait rien si le champ discounts est absent (payload sans cette info)", async () => {
    const fake = supabaseFakePourExpiration({ entreprise: { remise_stripe_coupon_id: "c1", remise_description: "10 %" } });
    createAdminClient.mockReturnValue(fake);
    await synchroniserExpirationRemise("entreprise-1", { id: "sub", customer: "cus", status: "active" });
    expect(fake.appels).toHaveLength(0);
  });

  it("ne fait rien si un discount Stripe est toujours actif", async () => {
    const fake = supabaseFakePourExpiration({ entreprise: { remise_stripe_coupon_id: "c1", remise_description: "10 %" } });
    createAdminClient.mockReturnValue(fake);
    await synchroniserExpirationRemise("entreprise-1", { id: "sub", customer: "cus", status: "active", discounts: ["di_actif"] });
    expect(fake.appels).toHaveLength(0);
  });

  it("ne fait rien si la fiche entreprise n'a déjà aucune remise enregistrée", async () => {
    const fake = supabaseFakePourExpiration({ entreprise: { remise_stripe_coupon_id: null, remise_description: null } });
    createAdminClient.mockReturnValue(fake);
    await synchroniserExpirationRemise("entreprise-1", { id: "sub", customer: "cus", status: "active", discounts: [] });
    expect(fake.appels).toHaveLength(0);
  });

  it("efface la remise et journalise 'remise_expiree' quand Stripe n'a plus de discount actif", async () => {
    const fake = supabaseFakePourExpiration({ entreprise: { remise_stripe_coupon_id: "c1", remise_description: "10 % une fois" } });
    createAdminClient.mockReturnValue(fake);
    await synchroniserExpirationRemise("entreprise-1", { id: "sub", customer: "cus", status: "active", discounts: [] });

    const maj = fake.appels.find((a) => a.table === "entreprises" && a.methode === "update");
    expect(maj?.donnees).toMatchObject({ remise_stripe_coupon_id: null, remise_description: null, remise_motif_interne: null });

    const journal = fake.appels.find((a) => a.table === "historique_tarification" && a.methode === "insert");
    expect(journal?.donnees).toMatchObject({
      entreprise_id: "entreprise-1",
      utilisateur_id: null,
      action: "remise_expiree",
      motif: null,
      ancien: { remise_stripe_coupon_id: "c1", remise_description: "10 % une fois" },
    });
  });
});

describe("remises commerciales (REMISES-CLIENTS-V1)", () => {
  it("crée un coupon pourcentage avec la bonne durée", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const { fauxFetch, appels } = fetchFakeStripe({});
    vi.stubGlobal("fetch", fauxFetch);

    await creerCouponRemise({ type: "pourcentage", valeur: 15, duree: "once", nom: "Test — 15 %" });

    const appel = appels[0];
    expect(appel.url).toContain("/coupons");
    expect(appel.corps).toContain("percent_off=15");
    expect(appel.corps).toContain("duration=once");
    expect(appel.corps).not.toContain("amount_off");
  });

  it("crée un coupon montant fixe en centimes, devise EUR", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const { fauxFetch, appels } = fetchFakeStripe({});
    vi.stubGlobal("fetch", fauxFetch);

    await creerCouponRemise({ type: "montant", valeur: 20, duree: "forever", nom: "Test — 20 € à vie" });

    const appel = appels[0];
    expect(appel.corps).toContain("amount_off=2000");
    expect(appel.corps).toContain("currency=eur");
    expect(appel.corps).toContain("duration=forever");
  });

  it("exige un nombre de mois pour une remise 'repeating'", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    await expect(
      creerCouponRemise({ type: "pourcentage", valeur: 10, duree: "repeating", nom: "Test" }),
    ).rejects.toThrow(/mois/);
  });

  it("applique le coupon via discounts[0][coupon] (billing_mode flexible, cf. audit REMISES-CLIENTS-V1) et non via le paramètre coupon= classique", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const { fauxFetch, appels } = fetchFakeStripe({});
    vi.stubGlobal("fetch", fauxFetch);

    await appliquerCouponAbonnement("sub_test", "coupon_abc");

    const appel = appels[0];
    expect(appel.url).toContain("/subscriptions/sub_test");
    expect(appel.corps).toContain("discounts%5B0%5D%5Bcoupon%5D=coupon_abc");
    expect(appel.corps).not.toMatch(/^coupon=|&coupon=/);
  });

  it("retire la remise via l'endpoint discount de l'abonnement", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    const { fauxFetch, appels } = fetchFakeStripe({});
    vi.stubGlobal("fetch", fauxFetch);

    await retirerCouponAbonnement("sub_test");

    const appel = appels[0];
    expect(appel.url).toContain("/subscriptions/sub_test/discount");
    expect(appel.methode).toBe("DELETE");
  });
});
