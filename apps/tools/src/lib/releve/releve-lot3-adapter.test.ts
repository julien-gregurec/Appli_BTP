import { describe, expect, it } from "vitest";
import {
  CHANTIER_STATUTS, ETAGE_CATEGORIES, JOURNAL_ACTIONS, PIECE_STATUTS, PIECE_USAGES, ReleveConflictError, ReleveNotFoundError, ZONE_TYPES,
  type TenantId,
} from "@elsatia/releve-domain";
import { CHANTIER_STATUT_LABELS, ETAGE_CATEGORIE_CHOIX, JOURNAL_ACTION_LABELS, PIECE_STATUT_LABELS, USAGE_LABELS, ZONE_TYPE_LABELS, ZONE_TYPES_PROPOSES } from "@/components/releve/labels";
import { chantierFromRow, etageFromRow, nodePatchToRow, pieceFromRow, type ChantierRow, type PieceRow } from "./mapping";
import { pieceHref, readPieceSelection } from "./navigation";
import { SupabaseReleveRepository, type ReleveSupabaseClient } from "./supabase-repository";

const META = { entreprise_id: "a0000000-0000-0000-0000-000000000001", created_at: "2026-09-28T10:00:00Z", updated_at: "2026-09-28T10:00:00Z", created_by: null, updated_by: null, revision: "4", deleted_at: null };

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };
function fakeClient(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] }; calls.push(call);
      const builder = {
        select() { return builder; }, order() { return builder; }, limit() { return builder; },
        update(payload: unknown) { call.op = "update"; call.payload = payload; return builder; },
        eq(column: string, value: unknown) { call.filters.push([column, value]); return builder; },
        is(column: string, value: unknown) { call.filters.push([`is:${column}`, value]); return builder; },
        maybeSingle() { return Promise.resolve(responses.shift()); },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(responses.shift()).then(resolve); },
      };
      return builder;
    },
    rpc(name: string, args: unknown) { calls.push({ table: name, op: "rpc", payload: args, filters: [] }); return Promise.resolve(responses.shift()); },
  };
  return { client: client as unknown as ReleveSupabaseClient, calls };
}

describe("adaptateur Supabase — Lot 3", () => {
  it("modification versionnée : ne vise que la révision lue ; 0 ligne → conflit (ligne encore active) ou introuvable", async () => {
    const ok = fakeClient([{ data: { revision: 5 }, error: null }]);
    expect(await new SupabaseReleveRepository(ok.client).updateNode("piece", "p1", { statut: "relevee", surfaceDeclareeMm2: 12e6 }, 4)).toBe(5);
    expect(ok.calls[0]).toMatchObject({ table: "tools_releves_pieces", op: "update", payload: { statut: "relevee", surface_declaree_mm2: 12e6 }, filters: [["id", "p1"], ["revision", 4], ["is:deleted_at", null]] });
    const conflict = fakeClient([{ data: null, error: null }, { data: { revision: 7, deleted_at: null }, error: null }]);
    await expect(new SupabaseReleveRepository(conflict.client).updateNode("chantier", "c1", { nom: "X" }, 4)).rejects.toBeInstanceOf(ReleveConflictError);
    const gone = fakeClient([{ data: null, error: null }, { data: { revision: 7, deleted_at: "2026-09-28" }, error: null }]);
    await expect(new SupabaseReleveRepository(gone.client).updateNode("zone", "z1", { nom: "X" }, 4)).rejects.toBeInstanceOf(ReleveNotFoundError);
    expect(() => nodePatchToRow({ releveId: "x" })).toThrow(/non modifiable/);
  });

  it("réordre, duplication, recherche, journal : RPC et mapping", async () => {
    const { client, calls } = fakeClient([
      { data: 2, error: null }, { data: "new-id", error: null },
      { data: [{ type: "piece", id: "p", releve_id: "r", libelle: "Séjour", contexte: null, releve_nom: "R", releve_statut: "en_cours", updated_at: "2026-09-28T10:00:00Z" }], error: null },
      { data: [{ id: 12, entite: "piece", entite_id: "p", action: "reordre", champs: ["ordre"], auteur_id: null, created_at: "2026-09-28T10:00:00Z" }], error: null },
    ]);
    const repository = new SupabaseReleveRepository(client);
    await repository.reorder("etage", ["a", "b"]);
    expect(await repository.duplicate("batiment", "b1", null)).toBe("new-id");
    expect(await repository.search("t" as TenantId, "séj", "recent")).toEqual([{ type: "piece", id: "p", releveId: "r", libelle: "Séjour", contexte: "", releveNom: "R", releveStatut: "en_cours", updatedAt: "2026-09-28T10:00:00Z" }]);
    expect(await repository.listJournal("r" as never)).toEqual([{ id: "12", entite: "piece", entiteId: "p", action: "reordre", champs: ["ordre"], auteurId: null, createdAt: "2026-09-28T10:00:00Z" }]);
    expect(calls.filter((call) => call.op === "rpc").map((call) => [call.table, call.payload])).toEqual([
      ["tools_releve_reordonner", { p_entite: "etage", p_ids: ["a", "b"] }],
      ["tools_releve_dupliquer", { p_entite: "batiment", p_id: "b1", p_nom: null }],
      ["tools_releve_rechercher", { p_entreprise_id: "t", p_texte: "séj", p_filtre: "recent", p_limite: 50 }],
    ]);
  });

  it("lignes Lot 3 (numeric en chaîne) et lignes antérieures (colonnes absentes) lues sans erreur", () => {
    const chantier = chantierFromRow({ ...META, id: "c", releve_id: "r", nom: "N", adresse: null, code_postal: null, ville: null, chantier_gp_id: null, ordre: 0, notes: null, client_nom: "SCI", statut: "termine", date_releve: "2026-09-28" } as ChantierRow);
    expect(chantier).toMatchObject({ clientNom: "SCI", statut: "termine", dateReleve: "2026-09-28", reference: null, revision: 4 });
    expect(chantierFromRow({ ...META, id: "c", releve_id: "r", nom: "N", adresse: null, code_postal: null, ville: null, chantier_gp_id: null, ordre: 0, notes: null } as ChantierRow).statut).toBe("en_cours");
    expect(etageFromRow({ ...META, id: "e", releve_id: "r", batiment_id: "b", nom: "Combles", niveau: null, altitude_mm: null, hauteur_sous_plafond_mm: "2400.0", etat: "existant", ordre: 3, categorie_niveau: "combles" })).toMatchObject({ niveau: null, categorieNiveau: "combles", hauteurSousPlafondMm: 2400 });
    expect(etageFromRow({ ...META, id: "e", releve_id: "r", batiment_id: "b", nom: "Entresol", niveau: "0.5", altitude_mm: null, hauteur_sous_plafond_mm: null, etat: "existant", ordre: 0 }).niveau).toBe(0.5);
    expect(pieceFromRow({ ...META, id: "p", releve_id: "r", etage_id: "e", zone_id: null, nom: "S", usage: "stockage", hauteur_sous_plafond_mm: null, ordre: 0, surface_declaree_mm2: "12000000.0", statut: "verifiee" } as PieceRow)).toMatchObject({ surfaceDeclareeMm2: 12e6, statut: "verifiee", commentaire: null });
  });
});

describe("interface — libellés et navigation", () => {
  it("chaque valeur d'énumération a un libellé (aucun code brut à l'écran)", () => {
    for (const [values, labels] of [[PIECE_USAGES, USAGE_LABELS], [ZONE_TYPES, ZONE_TYPE_LABELS], [CHANTIER_STATUTS, CHANTIER_STATUT_LABELS], [PIECE_STATUTS, PIECE_STATUT_LABELS], [JOURNAL_ACTIONS, JOURNAL_ACTION_LABELS]] as const) {
      for (const value of values) expect((labels as Record<string, string>)[value], value).toBeTruthy();
    }
    expect([...ZONE_TYPES_PROPOSES].sort()).toEqual([...ZONE_TYPES].sort());
    expect([...ETAGE_CATEGORIE_CHOIX].sort()).toEqual([...ETAGE_CATEGORIES].sort());
  });

  it("fiche pièce : route statique, identifiants validés", () => {
    const R = "e1000000-0000-0000-0000-000000000001"; const P = "e5000000-0000-0000-0000-000000000001";
    expect(pieceHref(R, P)).toBe(`/releves/piece?id=${R}&piece=${P}`);
    expect(readPieceSelection(`?id=${R}&piece=${P}`)).toEqual({ releveId: R, pieceId: P });
    expect(readPieceSelection(`?id=${R}&piece=../x`)).toBeNull();
    expect(readPieceSelection(`?piece=${P}`)).toBeNull();
  });
});
