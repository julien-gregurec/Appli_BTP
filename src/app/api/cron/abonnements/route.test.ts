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

let selectEntreprisesAppele = false;
let rpcPaiePointageAppele = false;

beforeEach(() => {
  vi.clearAllMocks();
  selectEntreprisesAppele = false;
  rpcPaiePointageAppele = false;
  createAdminClient.mockReturnValue({
    from: (table: string) => ({
      select: () => ({
        not: () => ({ in: () => { if (table === "entreprises") selectEntreprisesAppele = true; return { data: [], error: null }; } }),
        eq: () => ({ lt: () => ({ data: [], error: null }) }),
        in: () => ({ data: [], error: null }),
      }),
    }),
    rpc: vi.fn(async () => { rpcPaiePointageAppele = true; return { data: null, error: null }; }),
  });
});
afterEach(() => vi.unstubAllEnvs());

function requeteAvecSecret() {
  return new Request("http://localhost/api/cron/abonnements", { headers: { authorization: "Bearer le-vrai-secret" } });
}

describe("cron abonnements — auth", () => {
  it("§11 : les deux flags désactivés -> 404, aucun accès administratif (comportement préexistant conservé)", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "false");
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "false");
    const reponse = await GET(new Request("http://localhost/api/cron/abonnements"));
    expect(reponse.status).toBe(404);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(reconcilierAbonnementStripe).not.toHaveBeenCalled();
    expect(traiterRelancesAutomatiques).not.toHaveBeenCalled();
  });

  it("secret cron manquant -> 503, aucun accès administratif", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "");
    const reponse = await GET(new Request("http://localhost/api/cron/abonnements"));
    expect(reponse.status).toBe(503);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("auth cron invalide -> 401, aucun accès administratif", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    const reponse = await GET(new Request("http://localhost/api/cron/abonnements", { headers: { authorization: "Bearer mauvais-secret" } }));
    expect(reponse.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("auth cron valide -> traite la requête", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    const reponse = await GET(requeteAvecSecret());
    expect(reponse.status).toBe(200);
  });
});

describe("cron abonnements — découplage des deux portes (RELANCES-AUTO-PROD-ACTIVATION-V1 §9-14)", () => {
  it("§12 : FEATURE_CRONS_ENABLED=false, FEATURE_RELANCES_AUTO_ENABLED=true -> jobs historiques NON exécutés", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "false");
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    const reponse = await GET(requeteAvecSecret());
    expect(reponse.status).toBe(200);
    expect(reconcilierAbonnementStripe).not.toHaveBeenCalled();
    expect(selectEntreprisesAppele).toBe(false);
    expect(rpcPaiePointageAppele).toBe(false);
    const corps = await reponse.json();
    expect(corps.jobsHistoriques).toEqual({ executes: false });
  });

  it("§13 : FEATURE_CRONS_ENABLED=false, FEATURE_RELANCES_AUTO_ENABLED=true -> les relances SONT exécutées (point central du lot)", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "false");
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    const reponse = await GET(requeteAvecSecret());
    expect(reponse.status).toBe(200);
    expect(traiterRelancesAutomatiques).toHaveBeenCalledTimes(1);
    expect(createAdminClient).toHaveBeenCalledTimes(1); // un seul client admin, partagé
  });

  it("FEATURE_CRONS_ENABLED=true, FEATURE_RELANCES_AUTO_ENABLED=false -> jobs historiques exécutés, relances no-op (délégué au sous-flag interne)", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "false");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    const reponse = await GET(requeteAvecSecret());
    expect(reponse.status).toBe(200);
    expect(selectEntreprisesAppele).toBe(true);
    expect(traiterRelancesAutomatiques).toHaveBeenCalledTimes(1); // appelée, mais no-op en interne (testé dans relances-cron.test.ts)
  });

  it("§14 : les deux flags activés -> jobs historiques ET relances exécutés", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    const reponse = await GET(requeteAvecSecret());
    expect(reponse.status).toBe(200);
    expect(selectEntreprisesAppele).toBe(true);
    expect(traiterRelancesAutomatiques).toHaveBeenCalledTimes(1);
  });

  it("une erreur dans les jobs historiques (500) n'empêche pas les relances de s'être déjà exécutées", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", "le-vrai-secret");
    createAdminClient.mockReturnValue({
      from: () => ({ select: () => ({ not: () => ({ in: () => ({ data: null, error: { message: "boom" } }) }) }) }),
      rpc: vi.fn(async () => ({ data: null, error: null })),
    });
    const reponse = await GET(requeteAvecSecret());
    expect(reponse.status).toBe(500);
    expect(traiterRelancesAutomatiques).toHaveBeenCalledTimes(1);
  });
});
