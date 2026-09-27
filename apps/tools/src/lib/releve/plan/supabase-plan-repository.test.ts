import { describe, expect, it } from "vitest";
import { ReleveConflictError } from "@elsatia/releve-domain";
import { planHref, readPlanSelection } from "../navigation";
import { ReleveRemoteError, type ReleveSupabaseClient } from "../supabase-repository";
import { SupabasePlanRepository, type PlanRow } from "./supabase-plan-repository";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row: PlanRow = {
  id: U(1), entreprise_id: U(2), releve_id: U(3), etage_id: U(4), etat_documente: "initial", numero: 1, plan_base_id: null, libelle: null,
  cadre: { minX: 0, minY: 0, maxX: 20000, maxY: 15000 }, reglages: null, contours: [{ pieceId: U(5), points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], murIds: [], graine: null, surfaceMm2: 0.5 }],
  revision: "3", fige_le: null, fige_par: null, version_id: null, empreinte: null, created_at: "t", updated_at: "t", deleted_at: null,
};

type Call = { kind: "from" | "rpc"; name: string; args?: unknown; filters: string[] };

function fakeClient(responses: Record<string, { data: unknown; error: unknown }>, calls: Call[] = []): ReleveSupabaseClient {
  const builder = (call: Call) => {
    const result = () => responses[call.name] ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "order"]) chain[method] = (...args: unknown[]) => { call.filters.push(`${method}:${args.join(",")}`); return chain; };
    chain.maybeSingle = async () => result();
    chain.then = (resolve: (value: unknown) => void) => resolve(result());
    return chain;
  };
  return {
    from: (table: string) => { const call: Call = { kind: "from", name: table, filters: [] }; calls.push(call); return builder(call); },
    rpc: async (name: string, args: unknown) => { calls.push({ kind: "rpc", name, args, filters: [] }); return responses[name] ?? { data: null, error: null }; },
  } as unknown as ReleveSupabaseClient;
}

describe("SupabasePlanRepository", () => {
  it("liste et charge un plan (murs, ouvertures) depuis PostgREST sous RLS", async () => {
    const calls: Call[] = [];
    const repo = new SupabasePlanRepository(fakeClient({
      tools_releves_plans: { data: row, error: null },
      tools_releves_elements: { data: [
        { id: U(11), type: "mur", piece_id: null, parent_element_id: null, donnees: { a: { x: 0, y: 0 }, b: { x: 3000, y: 0 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" } },
        { id: U(12), type: "ouverture", piece_id: null, parent_element_id: U(11), donnees: { decalageMm: 100, largeurMm: 800, hauteurMm: 2040, allegeMm: null, typeOuverture: "porte", sens: "gauche" } },
      ], error: null },
    }, calls));
    const loaded = await repo.loadPlan(U(1));
    expect(loaded.plan.revision).toBe(3);
    expect(loaded.plan.reglages).toEqual({});
    expect(loaded.document.murs[0]).toMatchObject({ id: U(11), b: { x: 3000, y: 0 } });
    expect(loaded.document.ouvertures[0]).toMatchObject({ murId: U(11), largeurMm: 800 });
    expect(calls.find((c) => c.name === "tools_releves_elements")!.filters).toEqual(expect.arrayContaining([`eq:plan_id,${U(1)}`, "is:deleted_at,"]));
  });

  it("écritures par RPC uniquement ; conflit PT409 (HTTP 409) → ReleveConflictError avec la révision serveur", async () => {
    const calls: Call[] = [];
    const repo = new SupabasePlanRepository(fakeClient({
      tools_releve_plan_enregistrer: { data: null, error: { code: "PT409", message: "Plan modifié ailleurs", details: "7" } },
      tools_releve_plan_creer: { data: row, error: null },
      tools_releve_plan_figer: { data: null, error: { code: "42501", message: "Plan figé : créez un plan corrigé" } },
    }, calls));
    const error = await repo.savePlan(U(1), 3, { murs: [], ouvertures: [], supprimes: [] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReleveConflictError);
    expect((error as ReleveConflictError).currentRevision).toBe(7);
    expect(calls[0]).toMatchObject({ kind: "rpc", name: "tools_releve_plan_enregistrer", args: { p_plan_id: U(1), p_revision: 3 } });
    expect((await repo.createPlan(U(4), "initial")).id).toBe(U(1));
    await expect(repo.freezePlan(U(1), 3)).rejects.toBeInstanceOf(ReleveRemoteError);
    expect(calls.every((call) => call.kind === "rpc")).toBe(true);
  });
});

describe("navigation du plan", () => {
  it("portée étage / zone / pièce dans l'URL (route statique)", () => {
    expect(planHref({ releveId: U(3), etageId: U(4) })).toBe(`/releves/plan?id=${U(3)}&etage=${U(4)}`);
    expect(planHref({ releveId: U(3), etageId: U(4), zoneId: U(6), pieceId: U(5) })).toBe(`/releves/plan?id=${U(3)}&etage=${U(4)}&piece=${U(5)}`);
    expect(readPlanSelection(`?id=${U(3)}&etage=${U(4)}&zone=${U(6)}&plan=${U(1)}`)).toEqual({ releveId: U(3), etageId: U(4), zoneId: U(6), pieceId: null, planId: U(1) });
    expect(readPlanSelection(`?id=${U(3)}`)).toBeNull();
    expect(readPlanSelection(`?id=${U(3)}&etage=x&zone=y`)).toBeNull();
  });
});
