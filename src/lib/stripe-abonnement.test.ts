import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBaseAdmin, type BaseFausse } from "@/test/fakeSupabaseAdmin";

const { adminRef } = vi.hoisted(() => ({ adminRef: { current: null as ReturnType<typeof creerFausseBaseAdmin> | null } }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminRef.current,
}));

import {
  calculerFacturationStockage,
  prixOptionIAStripePour,
  prixStripePour,
  statutAbonnementDepuisStripe,
  stripeBillingEstConfigure,
  variablesStripeBillingManquantes,
  changerOffreStripe,
  reconcilierAbonnementStripe,
} from "./stripe-abonnement";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

type AppelStripe = { url: string; methode: string; corps?: URLSearchParams };

function simulerFetchStripe(reponses: Record<string, unknown>) {
  const appels: AppelStripe[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: URLSearchParams }) => {
      const methode = init?.method ?? "POST";
      appels.push({ url, methode, corps: init?.body });
      const trouve = Object.entries(reponses).find(([motif]) => {
        const [methodeAttendue, ...reste] = motif.split(" ");
        return methode === methodeAttendue && url.includes(reste.join(" "));
      });
      if (!trouve) throw new Error(`Appel Stripe non simulé : ${methode} ${url}`);
      return new Response(JSON.stringify(trouve[1]), { status: 200 });
    }),
  );
  return appels;
}

// Upgrade/downgrade en self-service (section 3 de la mission) : `changerOffreStripe`
// est la seule fonction qui sait changer le plan de base côté Stripe avec proration.
// Elle existe et fonctionne (ce test le prouve), mais n'est appelée par aucune action
// serveur ni aucun bouton de l'app (grep négatif dans le rapport de qualification) :
// tant qu'elle n'est pas câblée, l'upgrade/downgrade en self-service dépend entièrement
// du Portail Stripe hébergé, configuré manuellement en dehors du dépôt.
describe("changement d'offre (upgrade/downgrade)", () => {
  beforeEach(() => vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xxx"));

  it("change la ligne d'abonnement Stripe vers le nouveau prix avec proration", async () => {
    const appels = simulerFetchStripe({
      "GET https://api.stripe.com/v1/subscriptions/sub_1": {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        items: { data: [{ id: "si_1", quantity: 1, price: { id: "price_pro_mensuel" } }] },
      },
      "POST https://api.stripe.com/v1/subscriptions/sub_1": { id: "sub_1", customer: "cus_1", status: "active" },
    });
    vi.stubEnv("STRIPE_PRICE_BUSINESS_MENSUEL", "price_business_mensuel");

    await changerOffreStripe("sub_1", "business", "mensuel");

    expect(appels).toHaveLength(2);
    expect(appels[0]).toMatchObject({ methode: "GET" });
    expect(appels[1].methode).toBe("POST");
    const corps = appels[1].corps!;
    expect(corps.get("items[0][id]")).toBe("si_1");
    expect(corps.get("items[0][price]")).toBe("price_business_mensuel");
    expect(corps.get("proration_behavior")).toBe("create_prorations");
    expect(corps.get("metadata[offre]")).toBe("business");
    expect(corps.get("metadata[periodicite]")).toBe("mensuel");
  });

  it("échoue proprement si le prix Stripe cible n'est pas configuré", async () => {
    simulerFetchStripe({
      "GET https://api.stripe.com/v1/subscriptions/sub_1": {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        items: { data: [{ id: "si_1", quantity: 1, price: { id: "price_pro_mensuel" } }] },
      },
    });
    await expect(changerOffreStripe("sub_1", "business", "mensuel")).rejects.toThrow(/introuvable/);
  });
});

// Part variable "comptes supplémentaires" (reconciliation nocturne, section 3/6) :
// vérifie les trois branches (ajout / mise à jour de quantité / suppression) selon
// que le nombre de comptes facturables dépasse ou non le quota inclus dans l'offre.
describe("reconcilierAbonnementStripe (comptes supplémentaires)", () => {
  let base: BaseFausse;

  beforeEach(() => {
    base = { entreprises: [], employes: [] };
    adminRef.current = creerFausseBaseAdmin(base);
    vi.stubEnv("STRIPE_PRICE_COMPTE_SUP_BUSINESS_MENSUEL", "price_sup_business_mensuel");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_xxx");
  });

  it("ajoute une ligne de comptes supplémentaires quand le quota inclus est dépassé", async () => {
    base.entreprises!.push({ id: "ent_1", stripe_subscription_id: "sub_1", abonnement_offre: "business", abonnement_periodicite: "mensuel" });
    for (let i = 0; i < 32; i += 1) {
      base.employes!.push({ id: `emp_${i}`, entreprise_id: "ent_1", compte_application_statut: "actif" });
    }
    const appels = simulerFetchStripe({
      "GET https://api.stripe.com/v1/subscriptions/sub_1": { id: "sub_1", customer: "cus_1", status: "active", items: { data: [] } },
      "POST https://api.stripe.com/v1/subscription_items": { id: "sit_nouveau" },
    });

    const resultat = await reconcilierAbonnementStripe("ent_1");

    expect(resultat).toMatchObject({ synchronise: true, quantite: 2 }); // 32 comptes - 30 inclus (Business)
    const ajout = appels.find((a) => a.url.endsWith("/v1/subscription_items"));
    expect(ajout?.corps?.get("subscription")).toBe("sub_1");
    expect(ajout?.corps?.get("price")).toBe("price_sup_business_mensuel");
    expect(ajout?.corps?.get("quantity")).toBe("2");
  });

  it("retire la ligne de comptes supplémentaires quand l'entreprise repasse sous le quota inclus", async () => {
    base.entreprises!.push({ id: "ent_1", stripe_subscription_id: "sub_1", abonnement_offre: "business", abonnement_periodicite: "mensuel" });
    // Aucun employé facturable au-delà du quota inclus (30) : la ligne existante doit être retirée.
    const appels = simulerFetchStripe({
      "GET https://api.stripe.com/v1/subscriptions/sub_1": {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        items: { data: [{ id: "sit_existant", quantity: 3, price: { id: "price_sup_business_mensuel" } }] },
      },
      "DELETE https://api.stripe.com/v1/subscription_items/sit_existant": { id: "sit_existant", deleted: true },
    });

    const resultat = await reconcilierAbonnementStripe("ent_1");

    expect(resultat).toMatchObject({ synchronise: true, quantite: 0 });
    const suppression = appels.find((a) => a.methode === "DELETE");
    expect(suppression?.url).toContain("sit_existant");
  });
});
