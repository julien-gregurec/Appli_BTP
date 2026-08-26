import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const dependances = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  ajouterDepassementAppareilsFacture: vi.fn(),
  ajouterDepassementStockageFacture: vi.fn(),
  calculerDepassementAppareils: vi.fn(),
  reconcilierAbonnementStripe: vi.fn(),
  recupererAbonnementStripe: vi.fn(),
  statutAbonnementDepuisStripe: vi.fn(() => "actif"),
  synchroniserExpirationRemise: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: dependances.createAdminClient }));
vi.mock("@/lib/stripe-abonnement", () => ({
  ajouterDepassementAppareilsFacture: dependances.ajouterDepassementAppareilsFacture,
  ajouterDepassementStockageFacture: dependances.ajouterDepassementStockageFacture,
  calculerDepassementAppareils: dependances.calculerDepassementAppareils,
  reconcilierAbonnementStripe: dependances.reconcilierAbonnementStripe,
  recupererAbonnementStripe: dependances.recupererAbonnementStripe,
  statutAbonnementDepuisStripe: dependances.statutAbonnementDepuisStripe,
  synchroniserExpirationRemise: dependances.synchroniserExpirationRemise,
}));

const { POST } = await import("./route");

const SECRET = "whsec_test_uniquement";
const ENTREPRISE_ID = "11111111-1111-4111-8111-111111111111";

type ParametresFake = {
  entreprise?: Record<string, unknown> | null;
  erreurLecture?: { code: string; message?: string } | null;
  erreurReservation?: { code: string; message?: string } | null;
};

function supabaseFake(parametres: ParametresFake = {}) {
  const appels: Array<{ table: string; methode: string; donnees?: unknown }> = [];
  const entreprise = parametres.entreprise === undefined
    ? { id: ENTREPRISE_ID, stripe_customer_id: null, stripe_subscription_id: null }
    : parametres.entreprise;
  return {
    appels,
    from(table: string) {
      let methode = "";
      const requete: Record<string, unknown> = {};
      requete.select = () => { methode = "select"; return requete; };
      requete.eq = () => {
        if (["update", "delete"].includes(methode)) return Promise.resolve({ data: null, error: null });
        return requete;
      };
      requete.maybeSingle = async () => ({ data: entreprise, error: parametres.erreurLecture ?? null });
      requete.insert = (donnees: unknown) => {
        appels.push({ table, methode: "insert", donnees });
        return Promise.resolve({ data: null, error: parametres.erreurReservation ?? null });
      };
      requete.update = (donnees: unknown) => {
        methode = "update";
        appels.push({ table, methode, donnees });
        return requete;
      };
      requete.delete = () => {
        methode = "delete";
        appels.push({ table, methode });
        return requete;
      };
      requete.upsert = (donnees: unknown) => {
        appels.push({ table, methode: "upsert", donnees });
        return Promise.resolve({ data: null, error: null });
      };
      return requete;
    },
  };
}

function evenement(params: { livemode: boolean; entrepriseId?: string | null; type?: string; id?: string }) {
  const metadata = params.entrepriseId === null ? {} : { entreprise_id: params.entrepriseId ?? ENTREPRISE_ID };
  return {
    id: params.id ?? "evt_webhook_test",
    type: params.type ?? "webhook.cloisonnement.test",
    livemode: params.livemode,
    data: { object: { id: "objet_test", metadata } },
  };
}

function requeteSignee(payload: object, secret = SECRET) {
  const corps = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${corps}`).digest("hex");
  return new Request("https://example.invalid/api/stripe/abonnement/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    body: corps,
  });
}

async function appeler(payload: object) {
  return POST(requeteSignee(payload));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("cloisonnement du webhook abonnement", () => {
  it.each([
    ["test", false],
    ["live", true],
  ])("autorise un événement du mode %s sur le bon endpoint", async (mode, livemode) => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", mode);
    const fake = supabaseFake();
    dependances.createAdminClient.mockReturnValue(fake);

    const reponse = await appeler(evenement({ livemode }));

    expect(reponse.status).toBe(200);
    expect(fake.appels.filter((appel) => appel.table === "abonnement_evenements" && appel.methode === "insert")).toHaveLength(1);
  });

  it("ignore en 200 un événement Test reçu par l'endpoint Live sans appeler Supabase", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "live");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const reponse = await appeler(evenement({ livemode: false }));

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ received: true, ignored: true });
    expect(dependances.createAdminClient).not.toHaveBeenCalled();
  });

  it("renvoie 503 pour un événement Live reçu par l'endpoint Test afin d'éviter une perte silencieuse", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const reponse = await appeler(evenement({ livemode: true }));

    expect(reponse.status).toBe(503);
    expect(dependances.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "preview"])("reste fermé pour une configuration %s", async (mode) => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    if (mode !== undefined) vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", mode);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const reponse = await appeler(evenement({ livemode: false }));

    expect(reponse.status).toBe(503);
    expect(dependances.createAdminClient).not.toHaveBeenCalled();
  });

  it("refuse une signature invalide avant tout appel Supabase", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");

    const reponse = await POST(requeteSignee(evenement({ livemode: false }), "mauvais_secret"));

    expect(reponse.status).toBe(400);
    expect(dependances.createAdminClient).not.toHaveBeenCalled();
  });

  it("n'écrit rien si l'identifiant entreprise est absent", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = supabaseFake();
    dependances.createAdminClient.mockReturnValue(fake);

    const reponse = await appeler(evenement({ livemode: false, entrepriseId: null }));

    expect(reponse.status).toBe(422);
    expect(fake.appels).toHaveLength(0);
  });

  it("n'écrit rien si l'identifiant entreprise est mal formé", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = supabaseFake();
    dependances.createAdminClient.mockReturnValue(fake);

    const reponse = await appeler(evenement({ livemode: false, entrepriseId: "preview-entreprise" }));

    expect(reponse.status).toBe(422);
    expect(fake.appels).toHaveLength(0);
  });

  it("refuse une entreprise inconnue avant l'insertion du journal", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = supabaseFake({ entreprise: null });
    dependances.createAdminClient.mockReturnValue(fake);

    const reponse = await appeler(evenement({ livemode: false }));

    expect(reponse.status).toBe(503);
    expect(fake.appels).toHaveLength(0);
  });

  it("conserve l'idempotence des événements déjà réservés", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    const fake = supabaseFake({ erreurReservation: { code: "23505" } });
    dependances.createAdminClient.mockReturnValue(fake);

    const reponse = await appeler(evenement({ livemode: false }));

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ received: true, duplicate: true });
  });

  it("catégorise une erreur Supabase tout en gardant une réponse publique générique", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    const journal = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = supabaseFake({ erreurReservation: { code: "42P01", message: "table privée absente" } });
    dependances.createAdminClient.mockReturnValue(fake);

    const reponse = await appeler(evenement({ livemode: false }));
    const corps = await reponse.text();
    const logs = JSON.stringify(journal.mock.calls);

    expect(reponse.status).toBe(503);
    expect(corps).toContain("Journal indisponible");
    expect(corps).not.toContain("table privée");
    expect(logs).toContain("table_ou_migration_absente");
    expect(logs).not.toContain("table privée");
  });

  it("ne journalise ni secret, ni identifiant Stripe brut, ni donnée personnelle", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "live");
    const journal = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const id = "evt_identifiant_confidentiel";

    await appeler(evenement({ livemode: false, id }));
    const logs = JSON.stringify(journal.mock.calls);

    expect(logs).not.toContain(SECRET);
    expect(logs).not.toContain(id);
    expect(logs).not.toContain("@");
    expect(logs).toContain("empreinte_evenement");
  });
});
