import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ELSATIA POST-V9 HARDENING V1 — SEC-6 (Security V2 §7 ; train V9 §4) : import paie à
// secret global unique (PAYROLL_IMPORT_SECRET), le tenant étant choisi par le champ
// `entreprise_reference` du corps.
//
// Statut : DECISION_REQUIRED (credential par tenant / HMAC : provisioning et remise au
// cabinet comptable à arbitrer). Ce témoin reste EN ÉCHEC ATTENDU (`it.fails`) tant que le
// défaut est ouvert ; il passera au rouge (donc à convertir en `it`) le jour du correctif.
// La route est par ailleurs fermée en V9 : les RPC paie_import_*_service ne sont pas
// portées (voir 20261002001301), l'import répond 503 avant toute écriture.

const deps = vi.hoisted(() => ({ entreprisesLues: [] as string[], rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const requete: Record<string, unknown> = {};
      requete.select = () => requete;
      requete.eq = (_colonne: string, valeur: string) => {
        deps.entreprisesLues.push(valeur);
        return requete;
      };
      requete.maybeSingle = async () => ({ data: { id: `id-${deps.entreprisesLues.at(-1)}` }, error: null });
      return requete;
    },
    rpc: deps.rpc,
    storage: { from: () => ({ upload: vi.fn(), remove: vi.fn() }) },
  }),
}));

const { POST } = await import("./route");
const SECRET = "s".repeat(40);

function requete(entreprise: string) {
  const formData = new FormData();
  formData.set("entreprise_reference", entreprise);
  formData.set("employe_reference", "EMP-1");
  formData.set("periode", "2031-01");
  formData.set("montant_net_a_payer", "10");
  formData.set("bulletin", new File([new TextEncoder().encode("%PDF-1.7")], "b.pdf", { type: "application/pdf" }));
  return new NextRequest("https://exemple.test/api/paie/import", { method: "POST", headers: { authorization: `Bearer ${SECRET}` }, body: formData });
}

beforeEach(() => {
  deps.entreprisesLues.length = 0;
  vi.stubEnv("PAYROLL_IMPORT_SECRET", SECRET);
  deps.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "absente" } });
});

describe("SEC-6 — import paie à secret global", () => {
  it("V9 : l'import reste fermé (RPC de service non portées → 503, aucune écriture)", async () => {
    const reponse = await POST(requete("ENT-A"));
    expect(reponse.status).toBe(503);
  });

  it.fails("SEC-6 ouvert : un même secret ne devrait pas pouvoir viser deux tenants différents", async () => {
    await POST(requete("ENT-A"));
    await POST(requete("ENT-B"));
    // Attendu après correctif : le tenant est lié au credential, le corps ne le choisit pas.
    expect(new Set(deps.entreprisesLues).size).toBeLessThanOrEqual(1);
  });
});
