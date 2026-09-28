import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EtatIncident } from "@elsatia/incident-control";

/*
 * Mode sûr (incident) — exécution réelle de `updateSession` : seuls le client Supabase, la
 * limitation de débit et la lecture de l'état d'incident sont simulés.
 */

let etatCourant: EtatIncident | null = null;
const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
const appliquerRateLimit = vi.fn();

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn(() => ({ auth: { getUser } })) }));
vi.mock("@/lib/security/rate-limit", () => ({
  politiquesRateLimitPour: () => [{ cle: "x", maximum: 1, fenetreSecondes: 1, portee: "ip" }],
  appliquerRateLimit,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/incident/etat", () => ({
  lecteurEtatIncident: () => ({ lire: async () => etatCourant, invalider() {} }),
}));

const { updateSession } = await import("@/lib/supabase/proxy");

const etat = (...c: Array<[string, string]>) =>
  ({ generation: 1, controles: c.map(([portee, controle]) => ({ portee, controle })), statuts: {} }) as EtatIncident;

function requete(chemin: string, method = "GET", entetes: Record<string, string> = {}) {
  return new NextRequest(new URL(chemin, "https://gp.example.com"), { method, headers: entetes });
}

describe("proxy Gestion Pro — mode sûr", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    etatCourant = null;
    getUser.mockClear();
    appliquerRateLimit.mockReset();
    appliquerRateLimit.mockResolvedValue({ autorise: true });
  });

  it("coupure : 503 HTML avant tout appel à la base ou à Auth", async () => {
    etatCourant = etat(["global", "app_coupee"]);
    const r = await updateSession(requete("/dashboard", "GET", { accept: "text/html" }));
    expect(r.status).toBe(503);
    expect(r.headers.get("x-elsatia-safe-mode")).toBe("SAFE_MODE_APP_OFF");
    expect(r.headers.get("retry-after")).toBe("300");
    expect(await r.text()).toContain("Maintenance en cours");
    expect(getUser).not.toHaveBeenCalled();
    expect(appliquerRateLimit).not.toHaveBeenCalled();
  });

  it("coupure : API en JSON avec code stable", async () => {
    etatCourant = etat(["gestion_pro", "app_coupee"]);
    const r = await updateSession(requete("/api/referentiels/vehicules"));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ code: "SAFE_MODE_APP_OFF" });
  });

  it("coupure d'une AUTRE application : Gestion Pro sert normalement", async () => {
    etatCourant = etat(["reserves", "app_coupee"], ["studio", "app_coupee"]);
    const r = await updateSession(requete("/dashboard"));
    expect(r.status).not.toBe(503);
  });

  it("coupure : la santé reste servie sans session (sonde externe)", async () => {
    etatCourant = etat(["global", "app_coupee"]);
    const r = await updateSession(requete("/api/health"));
    expect(r.status).toBe(200);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("lecture seule : mutation d'API refusée, lecture servie", async () => {
    etatCourant = etat(["global", "lecture_seule"]);
    const post = await updateSession(requete("/api/inventaires/1/cloture", "POST"));
    expect(post.status).toBe(503);
    expect(await post.json()).toMatchObject({ code: "SAFE_MODE_READ_ONLY" });
    const get = await updateSession(requete("/chantiers"));
    expect(get.status).not.toBe(503);
  });

  it("lecture seule : webhook Stripe refusé en 503 (Stripe rejouera)", async () => {
    etatCourant = etat(["global", "lecture_seule"]);
    const r = await updateSession(requete("/api/stripe/abonnement/webhook", "POST"));
    expect(r.status).toBe(503);
  });

  it("lecture seule : Server Action transmise (la base tranche), déconnexion possible", async () => {
    etatCourant = etat(["global", "lecture_seule"]);
    const r = await updateSession(requete("/dashboard", "POST", { "next-action": "abc" }));
    expect(r.status).not.toBe(503);
  });

  it("liens publics bloqués sans toucher à l'application", async () => {
    etatCourant = etat(["gestion_pro", "liens_publics"]);
    expect((await updateSession(requete("/document/jeton"))).status).toBe(503);
    expect((await updateSession(requete("/api/documents/partage/jeton/pdf"))).status).toBe(503);
  });

  it("état inconnu (base injoignable) : aucun blocage ajouté par le proxy", async () => {
    etatCourant = null;
    const r = await updateSession(requete("/api/stripe/webhook", "POST"));
    expect(r.status).not.toBe(503);
  });
});
