import { afterEach, describe, expect, it, vi } from "vitest";

const createAdminClient = vi.fn();
const reconcilierAbonnementStripe = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/stripe-abonnement", () => ({
  ajouterOptionIAAbonnement: vi.fn(),
  estPalierOptionIA: vi.fn(),
  estPeriodiciteAbonnement: vi.fn(),
  reconcilierAbonnementStripe,
}));

const { GET } = await import("./route");

afterEach(() => vi.unstubAllEnvs());

describe("cron abonnements", () => {
  it("s'arrête avant tout accès administratif lorsqu'il est désactivé", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "false");
    const reponse = await GET(new Request("http://localhost/api/cron/abonnements"));
    expect(reponse.status).toBe(404);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(reconcilierAbonnementStripe).not.toHaveBeenCalled();
  });
});
