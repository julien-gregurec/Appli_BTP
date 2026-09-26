import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TRAIN V3 — double livraison webhook.
 *
 * Deux endpoints Stripe Test livrent aujourd'hui les mêmes huit évènements vers
 * la même route : le domaine stable et une préversion Vercel. Tant que cette
 * duplication n'est pas rationalisée, la seule chose qui empêche un double
 * traitement est le journal d'idempotence — `abonnement_evenements`, clé unique
 * sur `stripe_event_id`, réservé par `reserver_evenement_abonnement_service`.
 *
 * Ces tests le démontrent en modélisant le journal comme un ÉTAT réel : un
 * ensemble d'identifiants déjà vus, une réservation qui échoue sur doublon
 * exactement comme le fait la contrainte `unique` en base. Un booléen figé ne
 * prouverait rien — il ne distinguerait pas la première livraison de la seconde.
 */

const deps = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  recupererAbonnementStripe: vi.fn(),
  statutAbonnementDepuisStripe: vi.fn(() => "actif"),
  reconcilierAbonnementStripe: vi.fn(),
  ajouterDepassementAppareilsFacture: vi.fn(),
  ajouterDepassementStockageFacture: vi.fn(),
  calculerDepassementAppareils: vi.fn(),
  acquerirVerrouRemise: vi.fn(async () => "verrou-test"),
  libererVerrouRemise: vi.fn(),
  lireOperationActiveRemiseServeur: vi.fn(async () => null),
  reconcilierOperationRemiseSousVerrou: vi.fn(),
  synchroniserExpirationRemiseSousVerrou: vi.fn(async () => null),
  observerRemiseDepuisAbonnement: vi.fn(() => ({
    status: "absent", count: 0, discount_id: null, source_type: null, source_id: null, coupon_id: null,
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.createAdminClient }));
vi.mock("@/lib/stripe-abonnement", () => ({
  recupererAbonnementStripe: deps.recupererAbonnementStripe,
  statutAbonnementDepuisStripe: deps.statutAbonnementDepuisStripe,
  reconcilierAbonnementStripe: deps.reconcilierAbonnementStripe,
  ajouterDepassementAppareilsFacture: deps.ajouterDepassementAppareilsFacture,
  ajouterDepassementStockageFacture: deps.ajouterDepassementStockageFacture,
  calculerDepassementAppareils: deps.calculerDepassementAppareils,
  appliquerCouponAbonnement: vi.fn(), couponActifDepuisAbonnement: vi.fn(),
  creerCouponRemise: vi.fn(), retirerCouponAbonnement: vi.fn(),
  observerRemiseDepuisAbonnement: deps.observerRemiseDepuisAbonnement,
}));
class VerrouRemiseOccupe extends Error {
  constructor() { super("verrou occupé"); this.name = "VerrouRemiseOccupe"; }
}
vi.mock("@/lib/stripe-discount-server", () => ({
  VerrouRemiseOccupe,
  acquerirVerrouRemise: deps.acquerirVerrouRemise,
  libererVerrouRemise: deps.libererVerrouRemise,
  lireOperationActiveRemiseServeur: deps.lireOperationActiveRemiseServeur,
  reconcilierOperationRemiseSousVerrou: deps.reconcilierOperationRemiseSousVerrou,
  synchroniserExpirationRemiseSousVerrou: deps.synchroniserExpirationRemiseSousVerrou,
}));

const { POST } = await import("./route");

const ENTREPRISE = "11111111-1111-4111-8111-111111111111";
// Chaque endpoint Stripe porte SON secret de signature. Le domaine stable et la
// préversion sont deux déploiements distincts, chacun configuré avec le sien.
const SECRET_DOMAINE_STABLE = "whsec_test_domaine_stable";
const SECRET_PREVERSION = "whsec_test_preversion";

/**
 * Journal partagé, modélisant `abonnement_evenements` : une réservation réussit
 * une fois, puis renvoie « duplicate ». `traitements` compte les synchronisations
 * métier réellement déclenchées.
 */
function journalPartage() {
  const reserves = new Set<string>();
  const traitements: string[] = [];
  const creerAdmin = () => ({
    from() {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({
        data: { id: ENTREPRISE, stripe_customer_id: "cus_test", stripe_subscription_id: "sub_test" },
        error: null,
      });
      q.update = () => q;
      q.delete = () => q;
      q.insert = async () => ({ error: null });
      q.upsert = async () => ({ error: null });
      return q;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      if (fn === "reserver_evenement_abonnement_service") {
        const id = args.p_stripe_event_id as string;
        // Contrainte `unique` : l'insertion échoue si l'identifiant existe déjà.
        if (reserves.has(id)) return { data: "duplicate", error: null };
        reserves.add(id);
        return { data: "reserve", error: null };
      }
      if (fn === "annuler_evenement_abonnement_service") {
        reserves.delete(args.p_stripe_event_id as string);
        return { data: null, error: null };
      }
      if (fn === "synchroniser_abonnement_stripe_service") {
        traitements.push(args.p_stripe_event_id as string ?? "sans-id");
        return { data: "actif", error: null };
      }
      if (fn === "lier_subscription_entreprise_service") return { data: "lie", error: null };
      return { data: null, error: null };
    },
  });
  return { reserves, traitements, creerAdmin };
}

const evenement = (id: string) => ({
  id,
  type: "customer.subscription.updated",
  livemode: false,
  data: {
    object: {
      id: "sub_test", object: "subscription", customer: "cus_test",
      metadata: { entreprise_id: ENTREPRISE },
    },
  },
});

/** Une livraison telle que Stripe l'émet : même corps, signature propre à l'endpoint. */
function livraison(payload: object, secret: string) {
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return new Request("https://example.invalid/api/stripe/abonnement/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${signature}` },
    body,
  });
}

let journal: ReturnType<typeof journalPartage>;

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET_DOMAINE_STABLE);
  vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
  journal = journalPartage();
  deps.createAdminClient.mockImplementation(journal.creerAdmin);
  deps.recupererAbonnementStripe.mockResolvedValue({
    id: "sub_test", customer: "cus_test", status: "active", discounts: [], metadata: {},
  });
  deps.lireOperationActiveRemiseServeur.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("double livraison du même évènement", () => {
  it("deux livraisons successives ne produisent qu'un seul traitement", async () => {
    const ev = evenement("evt_double_sequentiel");
    const premiere = await POST(livraison(ev, SECRET_DOMAINE_STABLE));
    const seconde = await POST(livraison(ev, SECRET_DOMAINE_STABLE));

    expect(premiere.status).toBe(200);
    expect(seconde.status).toBe(200);
    expect(await seconde.json()).toMatchObject({ duplicate: true });
    expect(journal.traitements).toHaveLength(1);
  });

  it("deux livraisons CONCURRENTES ne produisent qu'un seul traitement", async () => {
    // Le cas réellement redouté : les deux endpoints livrent en même temps.
    const ev = evenement("evt_double_concurrent");
    const [a, b] = await Promise.all([
      POST(livraison(ev, SECRET_DOMAINE_STABLE)),
      POST(livraison(ev, SECRET_DOMAINE_STABLE)),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const corps = await Promise.all([a.json(), b.json()]);
    expect(corps.filter((c) => c.duplicate === true)).toHaveLength(1);
    expect(journal.traitements).toHaveLength(1);
  });

  it("le second traitement ne prend aucun verrou et ne relit pas Stripe", async () => {
    const ev = evenement("evt_double_sans_effet");
    await POST(livraison(ev, SECRET_DOMAINE_STABLE));
    const appelsApresPremiere = deps.recupererAbonnementStripe.mock.calls.length;
    const verrousApresPremiere = deps.acquerirVerrouRemise.mock.calls.length;

    await POST(livraison(ev, SECRET_DOMAINE_STABLE));

    expect(deps.recupererAbonnementStripe.mock.calls.length).toBe(appelsApresPremiere);
    expect(deps.acquerirVerrouRemise.mock.calls.length).toBe(verrousApresPremiere);
  });

  it("la déduplication porte sur l'identifiant d'évènement, pas sur l'expéditeur", async () => {
    // Stripe envoie le MÊME `evt_` aux deux endpoints : c'est ce qui rend la
    // déduplication possible entre deux endpoints distincts.
    const ev = evenement("evt_identique_deux_endpoints");
    await POST(livraison(ev, SECRET_DOMAINE_STABLE));
    await POST(livraison(ev, SECRET_DOMAINE_STABLE));
    expect(journal.reserves.size).toBe(1);
    expect(journal.traitements).toHaveLength(1);
  });

  it("deux évènements DISTINCTS sont bien traités tous les deux", async () => {
    // Contre-épreuve : la protection ne doit pas avaler des évènements légitimes.
    await POST(livraison(evenement("evt_premier"), SECRET_DOMAINE_STABLE));
    await POST(livraison(evenement("evt_second"), SECRET_DOMAINE_STABLE));
    expect(journal.traitements).toHaveLength(2);
  });
});

describe("secret propre à chaque endpoint", () => {
  it("une livraison signée par l'autre endpoint est refusée sans rien journaliser", async () => {
    // Un déploiement ne connaît qu'un secret. Une livraison de l'autre endpoint
    // est rejetée en 400 — et surtout n'entre pas dans le journal, donc
    // n'empêche pas la livraison légitime d'être traitée ensuite.
    const ev = evenement("evt_signe_ailleurs");
    const refusee = await POST(livraison(ev, SECRET_PREVERSION));
    expect(refusee.status).toBe(400);
    expect(journal.reserves.size).toBe(0);
    expect(journal.traitements).toHaveLength(0);

    const legitime = await POST(livraison(ev, SECRET_DOMAINE_STABLE));
    expect(legitime.status).toBe(200);
    expect(journal.traitements).toHaveLength(1);
  });
});

describe("un évènement non traité reste rejouable", () => {
  it("l'échec du traitement libère la réservation, sans double traitement au rejeu", async () => {
    // Sinon un incident transitoire perdrait silencieusement l'évènement.
    const ev = evenement("evt_rejouable");
    deps.recupererAbonnementStripe.mockRejectedValueOnce(new Error("Stripe indisponible"));
    const echec = await POST(livraison(ev, SECRET_DOMAINE_STABLE));
    expect(echec.status).toBeGreaterThanOrEqual(500);
    expect(journal.reserves.has("evt_rejouable")).toBe(false);
    expect(journal.traitements).toHaveLength(0);

    const rejeu = await POST(livraison(ev, SECRET_DOMAINE_STABLE));
    expect(rejeu.status).toBe(200);
    expect(journal.traitements).toHaveLength(1);
  });
});
