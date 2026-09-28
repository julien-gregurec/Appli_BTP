import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createSignedUrl = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ storage: { from: () => ({ createSignedUrl }) } })) }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => ({ entrepriseId: "a0000000-0000-0000-0000-000000000001" })) }));

const { POST, GET } = await import("./route");
const telechargement = await import("./[id]/telechargement/route");
const JOB = "11111111-1111-4111-8111-111111111111";

function requete(corps: unknown) {
  return new Request("https://gp.test/api/rgpd/exports", { method: "POST", body: JSON.stringify(corps) });
}

describe("API d'export RGPD", () => {
  beforeEach(() => {
    rpc.mockReset();
    createSignedUrl.mockReset();
  });

  it("export ENTREPRISE : l'entreprise vient de la session, jamais du corps (org spoof)", async () => {
    rpc.mockResolvedValue({ data: { statut: "PENDING", job_id: JOB, rejoue: false }, error: null });
    const r = await POST(requete({ type: "ENTREPRISE", entreprise_id: "b0000000-0000-0000-0000-000000000001", cle: "cle-test-0001" }));
    expect(r.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith("rgpd_export_demander", { p_type: "ENTREPRISE", p_entreprise_id: "a0000000-0000-0000-0000-000000000001", p_cle_idempotence: "cle-test-0001" });
  });

  it("export UTILISATEUR : jamais d'entreprise, jamais d'identifiant de personne transmis", async () => {
    rpc.mockResolvedValue({ data: { statut: "PENDING", job_id: JOB }, error: null });
    await POST(requete({ type: "UTILISATEUR", utilisateur_id: "20000000-0000-0000-0000-000000000001" }));
    const [, args] = rpc.mock.calls[0];
    expect(args.p_entreprise_id).toBeNull();
    expect(JSON.stringify(args)).not.toContain("20000000");
  });

  it("type invalide : 400 ; refus de la base : 403 avec code, sans détail", async () => {
    expect((await POST(requete({ type: "TOUT" }))).status).toBe(400);
    rpc.mockResolvedValue({ data: { statut: "REFUSE", code: "NON_AUTORISE" }, error: null });
    const r = await POST(requete({ type: "ENTREPRISE" }));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "Export non autorisé", code: "NON_AUTORISE" });
  });

  it("liste : réponse non mise en cache", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const r = await GET();
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("téléchargement : identifiant invalide 404 sans appel ; refus mappés (IDOR 404, expiré 410, quota 429)", async () => {
    const appel = (id: string) => telechargement.GET(new Request("https://gp.test"), { params: Promise.resolve({ id }) });
    expect((await appel("../x")).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    for (const [code, statut] of [["INTROUVABLE", 404], ["EXPIRE", 410], ["QUOTA_TELECHARGEMENT", 429], ["NON_AUTORISE", 403]] as const) {
      rpc.mockResolvedValueOnce({ data: { statut: "REFUSE", code }, error: null });
      expect((await appel(JOB)).status).toBe(statut);
    }
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("téléchargement autorisé : URL signée courte vers le seul objet, redirection 303 sans cache ni referrer", async () => {
    rpc.mockResolvedValue({ data: { statut: "AUTORISE", bucket: "rgpd-exports", chemin: `${JOB}/1.zip`, url_secondes: 300 }, error: null });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://stockage.test/sign/x?token=t" }, error: null });
    const r = await telechargement.GET(new Request("https://gp.test"), { params: Promise.resolve({ id: JOB }) });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("https://stockage.test/sign/x?token=t");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(createSignedUrl).toHaveBeenCalledWith(`${JOB}/1.zip`, 300, { download: `export-elsatia-${JOB}.zip` });
  });
});
