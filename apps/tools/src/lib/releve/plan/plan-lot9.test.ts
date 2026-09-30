import { describe, expect, it } from "vitest";
import { OUVRAGE_CATALOGUE_STANDARD, ouvrageModele } from "@elsatia/releve-domain";
import { quantitatifsHref, readQuantitatifsSelection } from "../navigation";
import { ReleveRemoteError, type ReleveSupabaseClient } from "../supabase-repository";
import { SupabaseQuantitatifRepository } from "./supabase-quantitatif-repository";

const R = "e1000000-0000-0000-0000-000000000001";
const P = "e7000000-0000-0000-0000-000000000001";
type Call = { name: string; args: unknown };
function fakeClient(responses: Record<string, { data: unknown; error: unknown }>, calls: Call[]): ReleveSupabaseClient {
  return { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return responses[name] ?? { data: null, error: null }; } } as unknown as ReleveSupabaseClient;
}

describe("navigation Lot 9 : quantitatifs", () => {
  it("état et niveau d'agrégation en paramètres ; valeurs forgées ignorées", () => {
    expect(quantitatifsHref({ releveId: R })).toBe(`/releves/quantitatifs?id=${R}`);
    expect(quantitatifsHref({ releveId: R, etat: "projete", niveau: "lot" })).toBe(`/releves/quantitatifs?id=${R}&etat=projete&niveau=lot`);
    expect(readQuantitatifsSelection(`?id=${R}&etat=projete&niveau=piece`)).toEqual({ releveId: R, etat: "projete", niveau: "piece" });
    expect(readQuantitatifsSelection(`?id=${R}&etat=x&niveau=<script>`)).toEqual({ releveId: R, etat: "existant", niveau: "ouvrage" });
    expect(readQuantitatifsSelection("?id=../x")).toBeNull();
  });
});

describe("SupabaseQuantitatifRepository : RPC seulement, aucune quantité envoyée", () => {
  it("lecture normalisée, écritures par RPC dédiées", async () => {
    const calls: Call[] = [];
    const repo = new SupabaseQuantitatifRepository(fakeClient({
      tools_releve_quantitatif_synthese: { data: [{ etageId: "e", planId: P, numero: "2", etat: "projete", figeLe: null,
        quantitatif: { version: 1, planId: P, etageId: "e", etat: "projete", numero: 2, ouvrages: [], moteur: "quantitatif-v1",
          lignes: [{ ouvrageId: "o", pieceId: null, etatProjet: "nouveau", quantiteRetenue: "1.500", quantiteCalculee: "1.500", elements: "1", nonCalculables: 0, ajustement: null, annotations: [] }], anomalies: [] } }], error: null },
      tools_releve_ouvrages_importer: { data: 2, error: null },
    }, calls));
    const sources = await repo.synthese(R, "projete");
    expect(sources[0].numero).toBe(2);
    expect(sources[0].quantitatif.lignes[0].quantiteRetenue).toBe(1.5);
    const donnees = OUVRAGE_CATALOGUE_STANDARD[0];
    expect(await repo.importOuvrages(P, [{ id: "a", donnees }, { id: "b", donnees, bibliothequeId: "lib" }])).toBe(2);
    await repo.saveOuvrage(P, "c", donnees);
    await repo.ajuster(P, { ouvrageId: "c", pieceId: null, etatProjet: "nouveau" }, 12.5, "Raison");
    await repo.saveBibliotheque(R, "l", ouvrageModele({ ...donnees, id: "x", pieceIds: [P] }));
    expect(calls.map((c) => c.name)).toEqual(["tools_releve_quantitatif_synthese", "tools_releve_ouvrages_importer", "tools_releve_ouvrage_enregistrer",
      "tools_releve_quantitatif_ajuster", "tools_releve_bibliotheque_enregistrer"]);
    expect(calls[3].args).toEqual({ p_plan_id: P, p_ouvrage_id: "c", p_piece_id: null, p_etat: "nouveau", p_valeur_retenue: 12.5, p_raison: "Raison" });
    expect(JSON.stringify(calls[4].args)).not.toContain("pieceIds");
    expect(JSON.stringify(calls.map((c) => c.args))).not.toMatch(/quantiteCalculee|quantiteRetenue/);
  });
  it("refus serveur → message métier", async () => {
    const repo = new SupabaseQuantitatifRepository(fakeClient({ tools_releve_ouvrage_enregistrer: { data: null, error: { code: "22023", message: "Unité incohérente" } } }, []));
    await expect(repo.saveOuvrage(P, "c", OUVRAGE_CATALOGUE_STANDARD[0])).rejects.toBeInstanceOf(ReleveRemoteError);
    await expect(repo.saveOuvrage(P, "c", OUVRAGE_CATALOGUE_STANDARD[0])).rejects.toThrow("Enregistrement de l'ouvrage : Unité incohérente");
  });
});
