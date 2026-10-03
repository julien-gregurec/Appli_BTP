import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClient = vi.fn();
const traiterNotificationPush = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/push", () => ({ traiterNotificationPush }));

const { GET } = await import("./route");

function requete() {
  return new Request("http://localhost/api/cron/notifications-push", { headers: { authorization: "Bearer secret-cron" } });
}

// File simulée : chaque appel à push_reserver_lot_service rend le lot suivant.
function adminAvecLots(lots: Array<Array<{ id: string }>>, erreur: unknown = null) {
  let i = 0;
  const rpc = vi.fn(async (nom: string) => {
    if (nom !== "push_reserver_lot_service") return { data: null, error: null };
    if (erreur) return { data: null, error: erreur };
    return { data: lots[i++] ?? [], error: null };
  });
  createAdminClient.mockReturnValue({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.stubEnv("FEATURE_CRONS_ENABLED", "true");
  vi.stubEnv("CRON_SECRET", "secret-cron");
  traiterNotificationPush.mockReset();
  createAdminClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cron notifications push", () => {
  it("s'arrête avant tout accès administratif lorsqu'il est désactivé", async () => {
    vi.stubEnv("FEATURE_CRONS_ENABLED", "false");
    const reponse = await GET(new Request("http://localhost/api/cron/notifications-push"));
    expect(reponse.status).toBe(404);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(traiterNotificationPush).not.toHaveBeenCalled();
  });

  it("boucle sur les lots réservés jusqu'à file vide, sans plafond de 200", async () => {
    const lots = Array.from({ length: 3 }, (_, l) => Array.from({ length: 100 }, (_, k) => ({ id: `n-${l}-${k}` })));
    const rpc = adminAvecLots(lots);
    traiterNotificationPush.mockResolvedValue("envoyee");
    const reponse = await GET(requete());
    const corps = await reponse.json();
    expect(corps).toMatchObject({ traitees: 300, envoyees: 300, lots: 3, budget_epuise: false });
    expect(rpc).toHaveBeenCalledTimes(4);
    expect(rpc).toHaveBeenCalledWith("push_reserver_lot_service", { p_limite: 100, p_par_entreprise: 25 });
    expect(traiterNotificationPush).toHaveBeenCalledWith(expect.anything(), "n-2-99", { dejaReservee: true });
  });

  it("compte échecs et ignorées sans interrompre le lot (poison)", async () => {
    adminAvecLots([[{ id: "poison" }, { id: "sain" }, { id: "pris" }]]);
    traiterNotificationPush.mockImplementation(async (_a: unknown, id: string) => (id === "poison" ? "echec" : id === "pris" ? "ignoree" : "envoyee"));
    const corps = await (await GET(requete())).json();
    expect(corps).toMatchObject({ traitees: 3, envoyees: 1, echecs: 1, ignorees: 1 });
  });

  it("renvoie 500 si la file est illisible dès le premier lot", async () => {
    adminAvecLots([], { code: "42501" });
    const reponse = await GET(requete());
    expect(reponse.status).toBe(500);
    expect(traiterNotificationPush).not.toHaveBeenCalled();
  });
});
