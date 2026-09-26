import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 : après la migration 255, service_role ne lit plus employes ni
// bulletins_paie ; l'import passe par deux RPC de service (préparation, enregistrement atomique).

const deps = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "entreprises") throw new Error(`lecture directe inattendue : ${table}`);
      const requete: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) requete[m] = () => requete;
      requete.maybeSingle = async () => ({ data: { id: "ent-1" }, error: null });
      return requete;
    },
    rpc: deps.rpc,
    storage: { from: () => ({ upload: deps.upload, remove: deps.remove }) },
  }),
}));

const { POST } = await import("./route");
const SECRET = "s".repeat(40);

function requete() {
  const formData = new FormData();
  formData.set("entreprise_reference", "ENT-1");
  formData.set("employe_reference", "EMP-1");
  formData.set("periode", "2031-01");
  formData.set("montant_net_a_payer", "1234.56");
  formData.set("bulletin", new File([new TextEncoder().encode("%PDF-1.7 test")], "bulletin.pdf", { type: "application/pdf" }));
  return new NextRequest("https://exemple.test/api/paie/import", { method: "POST", headers: { authorization: `Bearer ${SECRET}` }, body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYROLL_IMPORT_SECRET", SECRET);
  deps.upload.mockResolvedValue({ error: null });
  deps.remove.mockResolvedValue({ error: null });
});

describe("import des bulletins de paie (chemin de service)", () => {
  it("résout le salarié puis enregistre bulletin et trace par RPC", async () => {
    deps.rpc.mockImplementation(async (nom: string) => (nom === "paie_import_preparer_bulletin_service"
      ? { data: [{ employe_id: "emp-1", version: 2 }], error: null }
      : { data: "bulletin-1", error: null }));
    const reponse = await POST(requete());
    expect(reponse.status).toBe(201);
    expect(deps.rpc).toHaveBeenCalledWith("paie_import_preparer_bulletin_service", { p_entreprise_id: "ent-1", p_employe_reference: "EMP-1", p_periode: "2031-01-01" });
    const [, params] = deps.rpc.mock.calls.find(([nom]) => nom === "paie_import_enregistrer_bulletin_service")!;
    expect(params).toMatchObject({ p_entreprise_id: "ent-1", p_employe_id: "emp-1", p_version: 2, p_montant_net: 1234.56 });
    expect(String(params.p_storage_path)).toMatch(/^ent-1\/emp-1\/2031-01\/v2-/);
    expect(await reponse.json()).toMatchObject({ id: "bulletin-1", statut: "a_verifier" });
  });

  it("répond « Salarié introuvable » quand la préparation ne renvoie aucune ligne", async () => {
    deps.rpc.mockResolvedValue({ data: [], error: null });
    const reponse = await POST(requete());
    expect(reponse.status).toBe(404);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("ne confond plus une panne de lecture avec un salarié inconnu", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    const reponse = await POST(requete());
    expect(reponse.status).toBe(503);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("retire le PDF déposé si l'enregistrement échoue", async () => {
    deps.rpc.mockImplementation(async (nom: string) => (nom === "paie_import_preparer_bulletin_service"
      ? { data: [{ employe_id: "emp-1", version: 1 }], error: null }
      : { data: null, error: { code: "23505" } }));
    const reponse = await POST(requete());
    expect(reponse.status).toBe(500);
    expect(deps.remove).toHaveBeenCalledTimes(1);
  });
});
