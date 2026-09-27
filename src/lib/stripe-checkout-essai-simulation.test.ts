import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Simulation Checkout ↔ Stripe ↔ base (ELSATIA_STRIPE_TRIAL_SYNCHRONIZATION_V1).
 *
 * Un faux Stripe reproduit les règles utiles de l'API réelle :
 * - `subscription_data[trial_end]` doit être ≥ création + 48 h (sinon 400) ;
 * - `subscription_data[trial_period_days]` part de la COMPLÉTION de la session ;
 * - une clé d'idempotence rejouée avec d'autres paramètres est refusée (400),
 *   rejouée à l'identique elle renvoie la même session.
 * La subscription produite est ensuite confrontée au prédicat de la contrainte
 * `entreprises_essai_dates_coherentes` (la borne SQL elle-même est prouvée par
 * supabase/tests/stripe_trial_synchronization_v1.test.sql).
 */

const createAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const {
  AbonnementStripeDejaRattache,
  creerOuRecupererClientStripe,
  creerSessionAbonnementStripe,
  preparerCheckoutAbonnement,
} = await import("./stripe-abonnement");
const { dateDepuisUnix } = await import("./stripe-abonnement-synchronisation");

const ENTREPRISE = "22222222-2222-4222-8222-222222222222";
const ENV = {
  STRIPE_PRICE_PRO_MENSUEL: "price_pro_mensuel_courant",
  NEXT_PUBLIC_APP_URL: "https://app.exemple.invalid",
};
const JOUR = 86_400;

type LigneEntreprise = {
  id: string;
  nom: string;
  raison_sociale: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  abonnement_essai_debut: string | null;
  abonnement_essai_fin: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

function ligne(partiel: Partial<LigneEntreprise> = {}): LigneEntreprise {
  return {
    id: ENTREPRISE, nom: "SARL Essai", raison_sociale: null, adresse: null, code_postal: null, ville: null,
    abonnement_essai_debut: "2026-10-01", abonnement_essai_fin: "2026-10-31",
    stripe_customer_id: null, stripe_subscription_id: null, ...partiel,
  };
}

function baseFake(entreprise: LigneEntreprise) {
  return {
    from(table: string) {
      if (table !== "entreprises") throw new Error(`Table non prévue : ${table}`);
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.is = async () => ({ error: null });
      q.single = async () => ({ data: entreprise, error: null });
      q.update = (donnees: Partial<LigneEntreprise>) => {
        if (donnees.stripe_customer_id && !entreprise.stripe_customer_id) entreprise.stripe_customer_id = donnees.stripe_customer_id;
        return q;
      };
      return q;
    },
  };
}

type Session = { id: string; url: string; creeeA: number; params: Record<string, string>; statut: "open" | "complete" | "expired" };
type Subscription = { id: string; trial_end: number | null; status: "trialing" | "active" };

function stripeFake(horloge: { maintenant: number }) {
  const sessions = new Map<string, Session>();
  const idempotence = new Map<string, { corps: string; reponse: unknown }>();
  const appels: string[] = [];
  let compteur = 0;
  const fetchFake = vi.fn(async (url: string, options: { method?: string; body?: URLSearchParams; headers?: Record<string, string> } = {}) => {
    const chemin = url.replace("https://api.stripe.com/v1/", "");
    appels.push(chemin);
    const corps = options.body?.toString() ?? "";
    const cle = options.headers?.["Idempotency-Key"];
    const repondre = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json });
    if (cle && idempotence.has(cle)) {
      const precedent = idempotence.get(cle)!;
      if (precedent.corps !== corps) {
        return repondre(400, { error: { message: "Keys for idempotent requests can only be used with the same parameters they were first used with." } });
      }
      return repondre(200, precedent.reponse);
    }
    let reponse: unknown;
    if (chemin === "customers") {
      reponse = { id: `cus_sim_${++compteur}` };
    } else if (chemin === "checkout/sessions") {
      const params = Object.fromEntries(new URLSearchParams(corps));
      const trialEnd = params["subscription_data[trial_end]"];
      if (trialEnd && Number(trialEnd) < horloge.maintenant + 48 * 3600) {
        return repondre(400, { error: { message: "subscription_data.trial_end must be at least 48 hours in the future." } });
      }
      const session: Session = { id: `cs_sim_${++compteur}`, url: `https://checkout.stripe.invalid/${compteur}`, creeeA: horloge.maintenant, params, statut: "open" };
      sessions.set(session.id, session);
      reponse = { id: session.id, url: session.url };
    } else {
      throw new Error(`Appel Stripe non prévu : ${chemin}`);
    }
    if (cle) idempotence.set(cle, { corps, reponse });
    return repondre(200, reponse);
  });
  function completer(sessionId: string, completeeA: number): Subscription {
    const session = sessions.get(sessionId)!;
    if (session.statut !== "open" || completeeA > session.creeeA + JOUR) throw new Error("Session expirée");
    session.statut = "complete";
    const trialEnd = session.params["subscription_data[trial_end]"];
    const jours = session.params["subscription_data[trial_period_days]"];
    const fin = trialEnd ? Number(trialEnd) : jours ? completeeA + Number(jours) * JOUR : null;
    return { id: `sub_${sessionId}`, trial_end: fin, status: fin && fin > completeeA ? "trialing" : "active" };
  }
  return { fetchFake, completer, appels, sessions, expirer: (id: string) => { sessions.get(id)!.statut = "expired"; } };
}

/** Prédicat de `entreprises_essai_dates_coherentes` appliqué à la valeur brute renvoyée par Stripe. */
function contrainteAccepte(debut: string, trialEnd: number | null) {
  const fin = dateDepuisUnix(trialEnd);
  if (fin === null) return false; // NOT NULL
  const d = Date.parse(`${debut}T00:00:00Z`);
  const f = Date.parse(`${fin}T00:00:00Z`);
  return f >= d && f <= d + 30 * JOUR * 1000;
}

async function parcoursCheckout(entreprise: LigneEntreprise, maintenantIso: string, stripe: ReturnType<typeof stripeFake>, horloge: { maintenant: number }) {
  horloge.maintenant = Date.parse(maintenantIso) / 1000;
  createAdminClient.mockReturnValue(baseFake(entreprise));
  const essai = await preparerCheckoutAbonnement(ENTREPRISE, new Date(maintenantIso));
  const customerId = await creerOuRecupererClientStripe({ entrepriseId: ENTREPRISE, email: "gerant@exemple.invalid" });
  const session = await creerSessionAbonnementStripe({ entrepriseId: ENTREPRISE, customerId, offre: "pro", periodicite: "mensuel", essai, environnement: ENV });
  return { essai, session, params: stripe.sessions.get(session.id)!.params };
}

let horloge: { maintenant: number };
let stripe: ReturnType<typeof stripeFake>;
beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_simulation_uniquement");
  horloge = { maintenant: 0 };
  stripe = stripeFake(horloge);
  vi.stubGlobal("fetch", stripe.fetchFake);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Checkout → subscription → base, selon le jour de souscription", () => {
  const cas: Array<[string, string, "trialing" | "active"]> = [
    ["jour 0", "2026-10-01T08:00:00Z", "trialing"],
    ["jour 1", "2026-10-02T08:00:00Z", "trialing"],
    ["jour 15", "2026-10-16T08:00:00Z", "trialing"],
    ["jour 28", "2026-10-29T08:00:00Z", "trialing"],
    ["jour 29", "2026-10-30T08:00:00Z", "active"],
    ["jour 30", "2026-10-31T08:00:00Z", "active"],
    ["essai expiré", "2026-11-12T08:00:00Z", "active"],
  ];
  it.each(cas)("%s : trial Stripe ≤ essai local, jamais de 500 au retour", async (_l, maintenant, statutAttendu) => {
    const { session, params } = await parcoursCheckout(ligne(), maintenant, stripe, horloge);
    expect(params["subscription_data[trial_period_days]"]).toBeUndefined();
    // Complétion tardive (23 h plus tard, session encore ouverte).
    const subscription = stripe.completer(session.id, horloge.maintenant + 23 * 3600);
    expect(subscription.status).toBe(statutAttendu);
    if (subscription.trial_end !== null) {
      expect(subscription.trial_end).toBe(Date.parse("2026-10-31T23:59:59Z") / 1000);
      expect(contrainteAccepte("2026-10-01", subscription.trial_end)).toBe(true);
    } else {
      // Sans essai : la RPC conserve l'essai local (pgTAP), trial_end n'est jamais écrit.
      expect(params["subscription_data[trial_end]"]).toBeUndefined();
    }
  });

  it("contre-épreuve : l'ancien Checkout (trial_period_days=30) au jour 15 violait la contrainte (F-1)", () => {
    const creation = Date.parse("2026-10-16T08:00:00Z") / 1000;
    const legacy = creation + 30 * JOUR;
    expect(dateDepuisUnix(legacy)).toBe("2026-11-15");
    expect(contrainteAccepte("2026-10-01", legacy)).toBe(false);
    // … et un abonnement sans essai renvoyait trial_end = null (NOT NULL violé).
    expect(contrainteAccepte("2026-10-01", null)).toBe(false);
  });
});

describe("client / subscription Stripe existants", () => {
  it("client Stripe existant : réutilisé, aucun nouveau customer", async () => {
    const { params } = await parcoursCheckout(ligne({ stripe_customer_id: "cus_existant" }), "2026-10-10T08:00:00Z", stripe, horloge);
    expect(params.customer).toBe("cus_existant");
    expect(stripe.appels).not.toContain("customers");
    expect(params["subscription_data[trial_end]"]).toBe(String(Date.parse("2026-10-31T23:59:59Z") / 1000));
  });

  it("subscription existante : refus AVANT tout appel Stripe (pas de seconde subscription facturée)", async () => {
    createAdminClient.mockReturnValue(baseFake(ligne({ stripe_customer_id: "cus_x", stripe_subscription_id: "sub_x" })));
    await expect(preparerCheckoutAbonnement(ENTREPRISE, new Date("2026-10-10T08:00:00Z"))).rejects.toBeInstanceOf(AbonnementStripeDejaRattache);
    expect(stripe.fetchFake).not.toHaveBeenCalled();
  });

  it("checkout échoué puis relancé le même jour : même session (idempotence stable), même trial_end", async () => {
    const entreprise = ligne();
    const premier = await parcoursCheckout(entreprise, "2026-10-10T08:00:00Z", stripe, horloge);
    const relance = await parcoursCheckout(entreprise, "2026-10-10T19:00:00Z", stripe, horloge);
    expect(relance.session.id).toBe(premier.session.id);
    expect(stripe.appels.filter((c) => c === "customers")).toHaveLength(1);
  });

  it("checkout relancé après passage sous 48 h : nouvelle clé, sans essai (pas d'erreur d'idempotence Stripe)", async () => {
    const entreprise = ligne();
    const premier = await parcoursCheckout(entreprise, "2026-10-29T08:00:00Z", stripe, horloge);
    expect(premier.params["subscription_data[trial_end]"]).toBeDefined();
    stripe.expirer(premier.session.id);
    const relance = await parcoursCheckout(entreprise, "2026-10-30T09:00:00Z", stripe, horloge);
    expect(relance.session.id).not.toBe(premier.session.id);
    expect(relance.params["subscription_data[trial_end]"]).toBeUndefined();
    expect(stripe.completer(relance.session.id, horloge.maintenant + 60).status).toBe("active");
  });

  it("ancienne session avec essai complétée tard (avant expiration) : toujours dans la fenêtre", async () => {
    const entreprise = ligne();
    const premier = await parcoursCheckout(entreprise, "2026-10-29T20:00:00Z", stripe, horloge);
    const subscription = stripe.completer(premier.session.id, horloge.maintenant + 23 * 3600 + 59 * 60);
    expect(subscription.trial_end).toBe(Date.parse("2026-10-31T23:59:59Z") / 1000);
    expect(contrainteAccepte("2026-10-01", subscription.trial_end)).toBe(true);
  });

  it("dates locales incohérentes : Checkout sans essai (fail-closed)", async () => {
    const { params } = await parcoursCheckout(ligne({ abonnement_essai_fin: "2026-09-01" }), "2026-10-05T08:00:00Z", stripe, horloge);
    expect(params["subscription_data[trial_end]"]).toBeUndefined();
    expect(params["subscription_data[trial_period_days]"]).toBeUndefined();
  });
});
