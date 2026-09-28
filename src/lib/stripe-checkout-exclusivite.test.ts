import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Re-Checkout et concurrence Checkout (ELSATIA_STRIPE_TRIAL_SYNCHRONIZATION_V1 §6-§7).
 *
 * Faux Stripe à états : sessions (open / complete / expired, expiration 24 h),
 * subscriptions par client, idempotence stricte, `GET subscriptions`,
 * `GET checkout/sessions?status=open`, `POST checkout/sessions/:id/expire`
 * (refusé si la session n'est plus ouverte). Chaque appel cède la main
 * (délai pseudo-aléatoire) pour entrelacer réellement les requêtes.
 *
 * Invariants vérifiés :
 * - aucune session n'envoie `trial_period_days` ; tout `trial_end` = fin locale ;
 * - au plus UNE subscription vivante par client, quel que soit l'entrelacement ;
 * - une subscription annulée ou un Checkout abandonné/expiré ne rouvre jamais
 *   30 jours d'essai.
 */

const createAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const { AbonnementStripeDejaRattache, ClientStripeInvalide, ouvrirCheckoutAbonnement } = await import("./stripe-abonnement");

const ENTREPRISE = "33333333-3333-4333-8333-333333333333";
const ENV = {
  STRIPE_PRICE_PRO_MENSUEL: "price_pro_mensuel_courant",
  STRIPE_PRICE_PRO_ANNUEL: "price_pro_annuel_courant",
  NEXT_PUBLIC_APP_URL: "https://app.exemple.invalid",
};
const JOUR = 86_400;
const FIN_LOCALE = Date.parse("2026-10-31T23:59:59Z") / 1000;

type Ligne = {
  id: string; nom: string; raison_sociale: null; adresse: null; code_postal: null; ville: null;
  abonnement_essai_debut: string | null; abonnement_essai_fin: string | null;
  stripe_customer_id: string | null; stripe_subscription_id: string | null;
};

function ligne(partiel: Partial<Ligne> = {}): Ligne {
  return {
    id: ENTREPRISE, nom: "SARL Course", raison_sociale: null, adresse: null, code_postal: null, ville: null,
    abonnement_essai_debut: "2026-10-01", abonnement_essai_fin: "2026-10-31",
    stripe_customer_id: "cus_course", stripe_subscription_id: null, ...partiel,
  };
}

function baseFake(entreprise: Ligne) {
  return {
    from(table: string) {
      if (table !== "entreprises") throw new Error(`Table non prévue : ${table}`);
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.is = async () => ({ error: null });
      q.single = async () => ({ data: { ...entreprise }, error: null });
      q.update = () => q;
      return q;
    },
  };
}

type Session = {
  id: string; url: string; status: "open" | "complete" | "expired"; mode: "subscription";
  metadata: Record<string, string>; customer: string; creeeA: number; params: Record<string, string>;
};
type Subscription = { id: string; customer: string; status: string; trial_end: number | null; cancel_at_period_end?: boolean };

/** Générateur pseudo-aléatoire déterministe (reproductible). */
function mulberry32(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stripeFake(horloge: { maintenant: number }, alea: () => number = () => 0) {
  const sessions = new Map<string, Session>();
  const subscriptions: Subscription[] = [];
  const idempotence = new Map<string, { corps: string; reponse: unknown }>();
  const appels: string[] = [];
  const clientsSupprimes = new Set<string>();
  let compteur = 0;
  const ceder = async () => {
    const tours = Math.floor(alea() * 4);
    for (let i = 0; i < tours; i++) await new Promise((r) => setImmediate(r));
  };
  const rafraichir = () => {
    for (const s of sessions.values()) {
      if (s.status === "open" && horloge.maintenant > s.creeeA + JOUR) s.status = "expired";
    }
  };
  const fetchFake = vi.fn(async (url: string, options: { method?: string; body?: URLSearchParams; headers?: Record<string, string> } = {}) => {
    await ceder();
    rafraichir();
    const [chemin, requete = ""] = url.replace("https://api.stripe.com/v1/", "").split("?");
    const methode = options.method ?? "GET";
    appels.push(`${methode} ${chemin}`);
    const corps = options.body?.toString() ?? "";
    const cle = options.headers?.["Idempotency-Key"];
    const repondre = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => structuredClone(json) });
    if (cle && idempotence.has(cle)) {
      const precedent = idempotence.get(cle)!;
      if (precedent.corps !== corps) return repondre(400, { error: { message: "Idempotency key reused with different parameters." } });
      // Stripe rejoue la réponse d'origine : état de session figé à la création.
      return repondre(200, precedent.reponse);
    }
    const q = new URLSearchParams(requete);
    let reponse: unknown;
    if (methode === "GET" && /^customers\/[^/]+$/.test(chemin)) {
      const id = decodeURIComponent(chemin.split("/")[1]);
      reponse = clientsSupprimes.has(id) ? { id, deleted: true } : { id };
    } else if (methode === "GET" && /^subscriptions\/[^/]+$/.test(chemin)) {
      const sub = subscriptions.find((s) => s.id === decodeURIComponent(chemin.split("/")[1]));
      if (!sub) return repondre(404, { error: { message: "No such subscription" } });
      reponse = sub;
    } else if (methode === "POST" && chemin === "customers") {
      reponse = { id: `cus_cree_${++compteur}` };
    } else if (methode === "GET" && chemin === "subscriptions") {
      reponse = { data: subscriptions.filter((s) => s.customer === q.get("customer")) };
    } else if (methode === "GET" && chemin === "checkout/sessions") {
      reponse = { data: [...sessions.values()].filter((s) => s.customer === q.get("customer") && (!q.get("status") || s.status === q.get("status"))) };
    } else if (methode === "GET" && /^checkout\/sessions\/[^/]+$/.test(chemin)) {
      const session = sessions.get(decodeURIComponent(chemin.split("/")[2]));
      if (!session) return repondre(404, { error: { message: "No such checkout.session" } });
      reponse = { id: session.id, url: session.url, status: session.status, mode: session.mode, metadata: session.metadata };
    } else if (methode === "POST" && chemin === "checkout/sessions") {
      const params = Object.fromEntries(new URLSearchParams(corps));
      const trialEnd = params["subscription_data[trial_end]"];
      if (trialEnd && Number(trialEnd) < horloge.maintenant + 48 * 3600) {
        return repondre(400, { error: { message: "trial_end must be at least 48 hours in the future." } });
      }
      const id = `cs_${++compteur}`;
      const session: Session = {
        id, url: `https://checkout.stripe.invalid/${id}`, status: "open", mode: "subscription",
        metadata: { entreprise_id: params["metadata[entreprise_id]"] }, customer: params.customer,
        creeeA: horloge.maintenant, params,
      };
      sessions.set(id, session);
      reponse = { id, url: session.url, status: "open", mode: "subscription", metadata: session.metadata };
    } else if (methode === "POST" && /^checkout\/sessions\/[^/]+\/expire$/.test(chemin)) {
      const session = sessions.get(decodeURIComponent(chemin.split("/")[2]));
      if (!session || session.status !== "open") {
        return repondre(400, { error: { message: "Only Checkout Sessions with a status in [\"open\"] can be expired." } });
      }
      session.status = "expired";
      reponse = { id: session.id, status: "expired" };
    } else {
      throw new Error(`Appel Stripe non prévu : ${methode} ${chemin}`);
    }
    if (cle) idempotence.set(cle, { corps, reponse });
    return repondre(200, reponse);
  });
  /** Le client paie sur la page Checkout : atomique vis-à-vis de l'expiration. */
  function completer(sessionId: string): Subscription | null {
    rafraichir();
    const session = sessions.get(sessionId);
    if (!session || session.status !== "open") return null;
    session.status = "complete";
    const trialEnd = session.params["subscription_data[trial_end]"];
    const jours = session.params["subscription_data[trial_period_days]"];
    const fin = trialEnd ? Number(trialEnd) : jours ? horloge.maintenant + Number(jours) * JOUR : null;
    const sub = { id: `sub_${sessionId}`, customer: session.customer, status: fin && fin > horloge.maintenant ? "trialing" : "active", trial_end: fin };
    subscriptions.push(sub);
    return sub;
  }
  const vivantes = () => subscriptions.filter((s) => ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"].includes(s.status));
  return { fetchFake, completer, sessions, subscriptions, vivantes, appels, clientsSupprimes };
}

let horloge: { maintenant: number };
beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_simulation_uniquement");
  horloge = { maintenant: Date.parse("2026-10-10T08:00:00Z") / 1000 };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function ouvrir(entreprise: Ligne, periodicite: "mensuel" | "annuel" = "mensuel") {
  return ouvrirCheckoutAbonnement({
    entrepriseId: ENTREPRISE, email: "gerant@exemple.invalid", offre: "pro", periodicite,
    maintenant: new Date(horloge.maintenant * 1000), environnement: ENV,
  });
}

function sansSecondEssai(stripe: ReturnType<typeof stripeFake>) {
  for (const s of stripe.sessions.values()) {
    expect(s.params["subscription_data[trial_period_days]"]).toBeUndefined();
    const fin = s.params["subscription_data[trial_end]"];
    if (fin !== undefined) expect(Number(fin)).toBe(FIN_LOCALE);
  }
}

describe("re-Checkout", () => {
  it("Checkout abandonné (retour cancel_url) puis relancé : même session ouverte, même trial_end", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    createAdminClient.mockReturnValue(baseFake(ligne()));
    const premier = await ouvrir(ligne());
    horloge.maintenant += 2 * 3600;
    const relance = await ouvrir(ligne());
    expect(relance.session.id).toBe(premier.session.id);
    expect(stripe.sessions.get(premier.session.id)!.status).toBe("open");
    sansSecondEssai(stripe);
  });

  it("Checkout expiré (24 h) puis relancé : nouvelle session ouverte, essai = reliquat, jamais 30 jours", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    createAdminClient.mockReturnValue(baseFake(ligne()));
    const premier = await ouvrir(ligne());
    horloge.maintenant += JOUR + 60;
    // Stripe conserve la clé : la réponse rejouée annonce encore « open ».
    const relance = await ouvrir(ligne());
    expect(stripe.sessions.get(premier.session.id)!.status).toBe("expired");
    expect(relance.session.id).not.toBe(premier.session.id);
    expect(stripe.sessions.get(relance.session.id)!.status).toBe("open");
    sansSecondEssai(stripe);
  });

  it("retour à une offre dont la session a été expirée par le balayage : nouvelle session, pas l'URL morte", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    createAdminClient.mockReturnValue(baseFake(ligne()));
    const mensuel = await ouvrir(ligne(), "mensuel");
    await ouvrir(ligne(), "annuel");
    horloge.maintenant += 60;
    const retour = await ouvrir(ligne(), "mensuel");
    expect(stripe.sessions.get(mensuel.session.id)!.status).toBe("expired");
    expect(retour.session.id).not.toBe(mensuel.session.id);
    expect([...stripe.sessions.values()].filter((s) => s.status === "open").map((s) => s.id)).toEqual([retour.session.id]);
    sansSecondEssai(stripe);
  });

  it("changement d'offre en cours de Checkout : l'ancienne session est expirée, une seule reste payable", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    createAdminClient.mockReturnValue(baseFake(ligne()));
    const mensuel = await ouvrir(ligne(), "mensuel");
    const annuel = await ouvrir(ligne(), "annuel");
    expect(stripe.sessions.get(mensuel.session.id)!.status).toBe("expired");
    expect(stripe.completer(mensuel.session.id)).toBeNull();
    expect(stripe.completer(annuel.session.id)?.trial_end).toBe(FIN_LOCALE);
    expect(stripe.vivantes()).toHaveLength(1);
  });

  it("subscription Stripe vivante mais webhook pas encore reçu (base vide) : refus, aucune session créée", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    createAdminClient.mockReturnValue(baseFake(ligne()));
    const premier = await ouvrir(ligne());
    stripe.completer(premier.session.id);
    const avant = stripe.sessions.size;
    await expect(ouvrir(ligne(), "annuel")).rejects.toBeInstanceOf(AbonnementStripeDejaRattache);
    expect(stripe.sessions.size).toBe(avant);
    expect(stripe.vivantes()).toHaveLength(1);
  });

  // Évolution ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1 : une subscription annulée
  // n'est plus un refus définitif. Le réabonnement est autorisé, sans essai.
  it("subscription précédente annulée (liée en base) : réabonnement autorisé, JAMAIS d'essai", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    stripe.subscriptions.push({ id: "sub_ancienne", customer: "cus_course", status: "canceled", trial_end: null });
    createAdminClient.mockReturnValue(baseFake(ligne({ stripe_subscription_id: "sub_ancienne" })));
    const { essai, session, customerId } = await ouvrir(ligne({ stripe_subscription_id: "sub_ancienne" }));
    expect(essai).toMatchObject({ mode: "aucun", raison: "essai_consomme" });
    expect(customerId).toBe("cus_course");
    expect(stripe.sessions.get(session.id)!.params["subscription_data[trial_end]"]).toBeUndefined();
    sansSecondEssai(stripe);
  });

  it("subscription annulée chez Stripe seulement (base non liée) : Checkout autorisé, essai consommé → aucun essai", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    stripe.subscriptions.push({ id: "sub_orpheline", customer: "cus_course", status: "canceled", trial_end: null });
    createAdminClient.mockReturnValue(baseFake(ligne()));
    const { essai } = await ouvrir(ligne());
    expect(essai).toMatchObject({ mode: "aucun", raison: "essai_consomme" });
    sansSecondEssai(stripe);
  });

  it("essai expiré puis re-Checkout : aucune session ne porte d'essai", async () => {
    horloge.maintenant = Date.parse("2026-11-20T08:00:00Z") / 1000;
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    createAdminClient.mockReturnValue(baseFake(ligne()));
    await ouvrir(ligne());
    horloge.maintenant += 25 * 3600;
    await ouvrir(ligne());
    for (const s of stripe.sessions.values()) {
      expect(s.params["subscription_data[trial_end]"]).toBeUndefined();
      expect(s.params["subscription_data[trial_period_days]"]).toBeUndefined();
    }
  });
});

describe("concurrence : deux Checkout simultanés", () => {
  it.each([
    ["offres/périodicités différentes", "mensuel", "annuel"],
    ["même offre (même clé d'idempotence)", "mensuel", "mensuel"],
  ] as const)("%s : 500 entrelacements, jamais deux subscriptions vivantes", async (_l, p1, p2) => {
    let deuxSessionsPayables = 0;
    for (let graine = 1; graine <= 500; graine++) {
      horloge.maintenant = Date.parse("2026-10-10T08:00:00Z") / 1000;
      const alea = mulberry32(graine);
      const stripe = stripeFake(horloge, alea);
      vi.stubGlobal("fetch", stripe.fetchFake);
      createAdminClient.mockReturnValue(baseFake(ligne()));
      // Chaque onglet paie dès qu'il reçoit son URL, après un délai aléatoire.
      const onglet = async (periodicite: "mensuel" | "annuel") => {
        try {
          const { session } = await ouvrir(ligne(), periodicite);
          for (let i = Math.floor(alea() * 6); i > 0; i--) await new Promise((r) => setImmediate(r));
          return stripe.completer(session.id);
        } catch (e) {
          if (!(e instanceof AbonnementStripeDejaRattache)) throw e;
          return null;
        }
      };
      await Promise.all([onglet(p1), onglet(p2)]);
      expect(stripe.vivantes().length, `graine ${graine}`).toBeLessThanOrEqual(1);
      if ([...stripe.sessions.values()].filter((s) => s.status === "open").length > 1) deuxSessionsPayables++;
      sansSecondEssai(stripe);
    }
    expect(deuxSessionsPayables).toBe(0);
  }, 60_000);

  it("contre-épreuve : sans balayage, deux Checkout simultanés produisent deux subscriptions facturées", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    createAdminClient.mockReturnValue(baseFake(ligne()));
    const { creerSessionAbonnementStripe, preparerCheckoutAbonnement } = await import("./stripe-abonnement");
    const essai = await preparerCheckoutAbonnement(ENTREPRISE, new Date(horloge.maintenant * 1000));
    const [a, b] = await Promise.all((["mensuel", "annuel"] as const).map((periodicite) =>
      creerSessionAbonnementStripe({ entrepriseId: ENTREPRISE, customerId: "cus_course", offre: "pro", periodicite, essai, environnement: ENV })));
    stripe.completer(a.id);
    stripe.completer(b.id);
    expect(stripe.vivantes()).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1 — parcours de réabonnement (Checkout)
// ─────────────────────────────────────────────────────────────────────────────

describe("réabonnement : réactivation préférée, sinon nouveau Checkout sans essai", () => {
  function avecAncienne(stripe: ReturnType<typeof stripeFake>, sub: Partial<Subscription> & { status: string }) {
    stripe.subscriptions.push({ id: "sub_ancienne", customer: "cus_course", trial_end: null, ...sub });
    const entreprise = ligne({ stripe_subscription_id: "sub_ancienne" });
    createAdminClient.mockReturnValue(baseFake(entreprise));
    return entreprise;
  }

  it.each(["canceled", "incomplete_expired"])("%s : nouveau Checkout, même client, aucun essai, retour « réabonnement »", async (status) => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    const entreprise = avecAncienne(stripe, { status });
    const { session, customerId, essai } = await ouvrir(entreprise);
    const params = stripe.sessions.get(session.id)!.params;
    expect(customerId).toBe("cus_course");
    expect(stripe.appels).not.toContain("POST customers");
    expect(params.customer).toBe("cus_course");
    expect(essai).toMatchObject({ mode: "aucun", raison: "essai_consomme" });
    expect(params["subscription_data[trial_end]"]).toBeUndefined();
    expect(params["subscription_data[trial_period_days]"]).toBeUndefined();
    expect(params.success_url).toContain("reabonnement=1");
    expect(params.cancel_url).toContain("reabonnement=1");
    // La subscription créée est payante dès la souscription.
    expect(stripe.completer(session.id)?.status).toBe("active");
    expect(stripe.vivantes()).toHaveLength(1);
  });

  it.each([
    ["cancel_at_period_end (active)", { status: "active", cancel_at_period_end: true }, "reprendre_portail"],
    ["cancel_at_period_end (trialing)", { status: "trialing", cancel_at_period_end: true }, "reprendre_portail"],
    ["past_due", { status: "past_due" }, "paiement_requis"],
    ["unpaid", { status: "unpaid" }, "paiement_requis"],
    ["incomplete", { status: "incomplete" }, "paiement_requis"],
    ["active", { status: "active" }, "actif"],
    ["paused", { status: "paused" }, "support"],
  ] as const)("%s : réactivable ou vivante → aucun Checkout, parcours %s", async (_l, sub, parcours) => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    const entreprise = avecAncienne(stripe, sub);
    const refus = await ouvrir(entreprise).catch((e: unknown) => e);
    expect(refus).toBeInstanceOf(AbonnementStripeDejaRattache);
    expect((refus as InstanceType<typeof AbonnementStripeDejaRattache>).parcours).toBe(parcours);
    // Lecture seule : ni client, ni session, ni seconde subscription.
    expect(stripe.appels.every((a) => a.startsWith("GET "))).toBe(true);
    expect(stripe.sessions.size).toBe(0);
  });

  it("ancienne annulée mais une AUTRE subscription vit chez Stripe (webhook pas encore reçu) : refus", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    const entreprise = avecAncienne(stripe, { status: "canceled" });
    stripe.subscriptions.push({ id: "sub_nouvelle", customer: "cus_course", status: "active", trial_end: null });
    await expect(ouvrir(entreprise)).rejects.toBeInstanceOf(AbonnementStripeDejaRattache);
    expect(stripe.sessions.size).toBe(0);
  });

  it("customer existant sans abonnement (jamais souscrit) : client réutilisé, essai = reliquat local", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    createAdminClient.mockReturnValue(baseFake(ligne()));
    const { customerId, essai } = await ouvrir(ligne());
    expect(customerId).toBe("cus_course");
    expect(stripe.appels).not.toContain("POST customers");
    expect(essai.mode).toBe("trial_end");
    sansSecondEssai(stripe);
  });

  it("customer supprimé chez Stripe : refus explicite, aucun nouveau client créé, aucune session", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    stripe.clientsSupprimes.add("cus_course");
    const entreprise = avecAncienne(stripe, { status: "canceled" });
    await expect(ouvrir(entreprise)).rejects.toBeInstanceOf(ClientStripeInvalide);
    expect(stripe.appels).not.toContain("POST customers");
    expect(stripe.sessions.size).toBe(0);
  });

  it("réabonnement relancé après abandon : même session ouverte, toujours sans essai", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    const entreprise = avecAncienne(stripe, { status: "canceled" });
    const premier = await ouvrir(entreprise);
    horloge.maintenant += 3600;
    const relance = await ouvrir(entreprise);
    expect(relance.session.id).toBe(premier.session.id);
    expect([...stripe.sessions.values()].filter((s) => s.status === "open")).toHaveLength(1);
  });

  it("réabonnement terminé puis nouveau réabonnement le même jour : clé rejouée « complete » → nouvelle session, jamais l'URL morte", async () => {
    const stripe = stripeFake(horloge);
    vi.stubGlobal("fetch", stripe.fetchFake);
    const entreprise = avecAncienne(stripe, { status: "canceled" });
    const premier = await ouvrir(entreprise);
    const sub = stripe.completer(premier.session.id)!;
    sub.status = "canceled"; // résiliée immédiatement (ex. remboursement)
    const second = await ouvrir(ligne({ stripe_subscription_id: sub.id }));
    expect(second.session.id).not.toBe(premier.session.id);
    expect(stripe.sessions.get(second.session.id)!.status).toBe("open");
  });

  it.each([
    ["offres/périodicités différentes", "mensuel", "annuel"],
    ["même offre", "mensuel", "mensuel"],
  ] as const)("concurrence (%s) : 500 entrelacements de réabonnement, jamais deux subscriptions vivantes ni d'essai", async (_l, p1, p2) => {
    let deuxPayables = 0;
    for (let graine = 1; graine <= 500; graine++) {
      horloge.maintenant = Date.parse("2026-12-10T08:00:00Z") / 1000;
      const alea = mulberry32(graine);
      const stripe = stripeFake(horloge, alea);
      vi.stubGlobal("fetch", stripe.fetchFake);
      const entreprise = avecAncienne(stripe, { status: "canceled" });
      const onglet = async (periodicite: "mensuel" | "annuel") => {
        try {
          const { session } = await ouvrir(entreprise, periodicite);
          for (let i = Math.floor(alea() * 6); i > 0; i--) await new Promise((r) => setImmediate(r));
          return stripe.completer(session.id);
        } catch (e) {
          if (!(e instanceof AbonnementStripeDejaRattache)) throw e;
          return null;
        }
      };
      await Promise.all([onglet(p1), onglet(p2)]);
      expect(stripe.vivantes().length, `graine ${graine}`).toBeLessThanOrEqual(1);
      if ([...stripe.sessions.values()].filter((s) => s.status === "open").length > 1) deuxPayables++;
      for (const s of stripe.sessions.values()) expect(s.params["subscription_data[trial_end]"]).toBeUndefined();
    }
    expect(deuxPayables).toBe(0);
  }, 60_000);
});
