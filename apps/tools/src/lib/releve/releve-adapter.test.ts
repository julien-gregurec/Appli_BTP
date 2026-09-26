import { describe, expect, it } from "vitest";
import { ReleveConflictError, ReleveService } from "@elsatia/releve-domain";
import { actorContextFromRow } from "./actor-context";
import { etageFromRow, relevePatchToRow, releveFromRow, type ReleveRow } from "./mapping";
import { ReleveRemoteError, SupabaseReleveRepository, type ReleveSupabaseClient } from "./supabase-repository";

const TENANT = "a0000000-0000-0000-0000-000000000001";
const USER = "10000000-0000-0000-0000-000000000003";
const row: ReleveRow = {
  id: "e1000000-0000-0000-0000-000000000001", entreprise_id: TENANT, proprietaire_id: USER, schema_version: 1, nom: "Relevé T3",
  reference: null, statut: "brouillon", visibilite: "prive", chantier_nom: "Rue des Lilas", chantier_adresse: null, chantier_code_postal: "67000",
  chantier_ville: null, chantier_gp_id: null, client_nom: null, client_gp_id: null, date_releve: null, notes: null, revision: "3",
  created_at: "2026-09-26T10:00:00Z", updated_at: "2026-09-26T10:05:00Z", created_by: USER, updated_by: USER, deleted_at: null,
};

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };

/** Faux client PostgREST : enregistre les appels et rejoue des réponses programmées. */
function fakeClient(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const builder = {
        select() { return builder; },
        insert(payload: unknown) { call.op = "insert"; call.payload = payload; return builder; },
        update(payload: unknown) { call.op = "update"; call.payload = payload; return builder; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return builder; },
        order() { return builder; },
        single() { return Promise.resolve(responses.shift()); },
        maybeSingle() { return Promise.resolve(responses.shift()); },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(responses.shift()).then(resolve); },
      };
      return builder;
    },
    rpc(name: string, args: unknown) { calls.push({ table: name, op: "rpc", payload: args, filters: [] }); return Promise.resolve(responses.shift()); },
  };
  return { client: client as unknown as ReleveSupabaseClient, calls };
}

describe("mapping SQL ↔ domaine", () => {
  it("convertit un relevé, y compris les numériques renvoyés en chaîne", () => {
    expect(releveFromRow(row)).toMatchObject({ id: row.id, kind: "releve", revision: 3, chantier: { nom: "Rue des Lilas", codePostal: "67000", gpChantierId: null } });
    expect(etageFromRow({ ...row, id: "e3", releve_id: row.id, batiment_id: "b", nom: "RDC", niveau: 0, altitude_mm: null, hauteur_sous_plafond_mm: "2500.0", etat: "existant", ordre: 0 }).hauteurSousPlafondMm).toBe(2500);
  });

  it("n'envoie jamais de métadonnées serveur dans un patch", () => {
    expect(relevePatchToRow({ nom: "X", chantierGpId: null, ...({ revision: 9, entrepriseId: "forgé" } as object) })).toEqual({ nom: "X", chantier_gp_id: null });
  });

  it("contexte d'acteur : rôle inconnu ignoré, booléens stricts", () => {
    expect(actorContextFromRow(USER, { entreprise_id: TENANT, tenant_has_tools: true, has_releve_capability: true, role: "tools_releve_admin", gp_gerer_ouvrages: false }).role).toBe("tools_releve_admin");
    expect(actorContextFromRow(USER, { entreprise_id: TENANT, tenant_has_tools: true, has_releve_capability: true, role: "gestion_pro_admin", gp_gerer_ouvrages: false }).role).toBeNull();
  });
});

describe("SupabaseReleveRepository", () => {
  it("création : identifiant client, tenant explicite, aucune colonne de propriété envoyée", async () => {
    const { client, calls } = fakeClient([{ data: row, error: null }]);
    const service = new ReleveService(new SupabaseReleveRepository(client), actorContextFromRow(USER, { entreprise_id: TENANT, tenant_has_tools: true, has_releve_capability: true, role: "tools_releve_metreur", gp_gerer_ouvrages: false }), () => row.id);
    await service.create({ nom: "Relevé T3", chantierNom: "Rue des Lilas" });
    expect(calls[0]).toMatchObject({ table: "tools_releves", op: "insert" });
    expect(calls[0].payload).toMatchObject({ id: row.id, entreprise_id: TENANT, nom: "Relevé T3", chantier_nom: "Rue des Lilas" });
    expect(calls[0].payload).not.toHaveProperty("proprietaire_id");
    expect(calls[0].payload).not.toHaveProperty("revision");
  });

  it("mise à jour conditionnée par la révision ; conflit détecté", async () => {
    const { client, calls } = fakeClient([{ data: null, error: null }, { data: { revision: 4 }, error: null }]);
    await expect(new SupabaseReleveRepository(client).updateReleve(row.id as never, { nom: "Y" }, 3)).rejects.toBeInstanceOf(ReleveConflictError);
    expect(calls[0].filters).toEqual([["id", row.id], ["revision", 3]]);
  });

  it("refus RLS traduit en message utilisateur, sans détail SQL", async () => {
    const { client } = fakeClient([{ data: null, error: { code: "42501", message: "new row violates row-level security policy for table tools_releves" } }]);
    const promise = new SupabaseReleveRepository(client).createBatiment({ id: "b" as never, releveId: row.id as never, nom: "A", ordre: 0, notes: null });
    await expect(promise).rejects.toBeInstanceOf(ReleveRemoteError);
    await expect(promise).rejects.not.toThrow(/row-level/);
  });

  it("versions : RPC serveur, jamais d'écriture directe", async () => {
    const { client, calls } = fakeClient([{ data: { id: "v", entreprise_id: TENANT, releve_id: row.id, numero: 1, libelle: null, revision_source: 3, empreinte: "a".repeat(64), created_at: "2026-09-26T10:00:00Z", created_by: USER }, error: null }]);
    const version = await new SupabaseReleveRepository(client).createVersion(row.id as never, null);
    expect(calls[0]).toMatchObject({ table: "tools_releve_creer_version", op: "rpc", payload: { p_releve_id: row.id, p_libelle: null } });
    expect(version.numero).toBe(1);
  });
});
