import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClient = vi.fn();
const reconcilierAbonnementStripe = vi.fn();
const traiterRelancesAutomatiques = vi.fn(async () => ({ actif: false, entreprisesTraitees: 0, envoyees: 0, ignorees: 0, echecs: 0, dejaEnCours: 0, details: [] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/stripe-abonnement", () => ({
  ajouterOptionIAAbonnement: vi.fn(),
  estPalierOptionIA: vi.fn(),
  estPeriodiciteAbonnement: vi.fn(),
  reconcilierAbonnementStripe,
}));
vi.mock("@/lib/relances-cron", () => ({ traiterRelancesAutomatiques }));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  createAdminClient.mockReturnValue({
    from: () => ({
      select: () => ({
        not: () => ({ in: () => ({ data: [], error: null }) }),
        eq: () => ({ lt: () => ({ data: [], error: null }) }),
        in: () => ({ data: [], error: null }),
      }),
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("cron abonnements", () => {
  it("s'arrête avant tout accès administratif lorsqu'il est désactivé", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "false");
    const reponse = await GET(new Request("http://localhost/api/cron/abonnements"));
    expect(reponse.status).toBe(404);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(reconcilierAbonnementStripe).not.toHaveBeenCalled();
  });

  it("24. secret cron manquant -> 503, aucun accès administratif", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "");
    const reponse = await GET(new Request("http://localhost/api/cron/abonnements"));
    expect(reponse.status).toBe(503);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("25. auth cron invalide -> 401, aucun accès administratif", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    const reponse = await GET(new Request("http://localhost/api/cron/abonnements", { headers: { authorization: "Bearer mauvais-secret" } }));
    expect(reponse.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("24bis. auth cron valide -> traite la requête, appelle le job relances", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    const reponse = await GET(new Request("http://localhost/api/cron/abonnements", { headers: { authorization: "Bearer le-vrai-secret" } }));
    expect(reponse.status).toBe(200);
    expect(traiterRelancesAutomatiques).toHaveBeenCalledTimes(1);
  });
});
