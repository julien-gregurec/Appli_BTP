import { describe, expect, it } from "vitest";
import { prixGlobal, type PhotoMedia, type ReleveElement } from "@elsatia/releve-domain";
import { estimationHref, readEstimationSelection } from "../navigation";
import { ReleveRemoteError, type ReleveSupabaseClient } from "../supabase-repository";
import { estimationPiecesJointes } from "./estimation-export";
import { SupabaseEstimationRepository } from "./supabase-estimation-repository";

const R = "e1000000-0000-0000-0000-000000000001";
const P = "e7000000-0000-0000-0000-000000000001";
type Call = { name: string; args: unknown };
function fakeClient(responses: Record<string, { data: unknown; error: unknown }>, calls: Call[]): ReleveSupabaseClient {
  return { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return responses[name] ?? { data: null, error: null }; } } as unknown as ReleveSupabaseClient;
}

describe("navigation Lot 10 : estimation", () => {
  it("état et niveau de sous-total (lot par défaut) en paramètres ; valeurs forgées ignorées", () => {
    expect(estimationHref({ releveId: R })).toBe(`/releves/estimation?id=${R}`);
    expect(estimationHref({ releveId: R, etat: "projete", niveau: "piece" })).toBe(`/releves/estimation?id=${R}&etat=projete&niveau=piece`);
    expect(readEstimationSelection(`?id=${R}&etat=projete&niveau=ouvrage`)).toEqual({ releveId: R, etat: "projete", niveau: "ouvrage" });
    expect(readEstimationSelection(`?id=${R}&etat=x&niveau=<script>`)).toEqual({ releveId: R, etat: "existant", niveau: "lot" });
    expect(readEstimationSelection("?id=../x")).toBeNull();
  });
});

describe("SupabaseEstimationRepository : RPC seulement, aucun montant calculé envoyé", () => {
  it("lecture normalisée, écritures par RPC dédiées", async () => {
    const calls: Call[] = [];
    const estimation = { version: 1, planId: P, etageId: "e", etat: "projete", numero: 2, base: "HT", devise: "EUR", prix: [], moteur: "estimation-v1",
      lignes: [{ ouvrageId: "o", pieceId: null, etatProjet: "nouveau", nature: "quantite", unite: "m2", quantite: "1.500", prixDefini: true, prixUnitaire: "10.0000",
        materiau: "15.00", mainOeuvre: "0.00", forfait: "0.00", autre: "0.00", heures: null, montantCalcule: "15.00", ajustement: null, montantRetenu: "15.00" }],
      anomalies: [], totaux: { montant: "15.00", parEtat: { existant: 0, a_deposer: 0, nouveau: "15.00", deplace: 0 }, parType: { materiau: "15.00", main_d_oeuvre: 0, forfait: 0, autre: 0 },
        ecartAjustements: 0, heures: 0, lignes: 1, lignesChiffrees: 1, lignesSansPrix: 0, lignesAjustees: 0 } };
    const repo = new SupabaseEstimationRepository(fakeClient({
      tools_releve_estimation_synthese: { data: [{ etageId: "e", planId: P, numero: "2", etat: "projete", figeLe: null, libelle: "Solution A",
        quantitatif: { version: 1, planId: P, etageId: "e", etat: "projete", numero: 2, ouvrages: [], moteur: "quantitatif-v1", lignes: [], anomalies: [] }, estimation }], error: null },
      tools_releve_estimation_prix_importer: { data: 2, error: null },
      tools_releve_estimation_appliquer_bibliotheque: { data: 3, error: null },
    }, calls));
    const sources = await repo.synthese(R, "projete");
    expect(sources[0]).toMatchObject({ numero: 2, libelle: "Solution A" });
    expect(sources[0].estimation.lignes[0]).toMatchObject({ quantite: 1.5, montantRetenu: 15 });
    expect(sources[0].estimation.totaux.montant).toBe(15);
    await repo.savePrix(P, "o", prixGlobal(10));
    expect(await repo.importPrix(P, [{ ouvrageId: "o", donnees: prixGlobal(1) }, { ouvrageId: "p", donnees: prixGlobal(2) }])).toBe(2);
    expect(await repo.appliquerBibliotheque(P, false)).toBe(3);
    await repo.corriger(P, { ouvrageId: "o", pieceId: null, etatProjet: "nouveau", nature: "forfait" }, 120.5, "Raison");
    await repo.saveBibliothequePrix(R, "lib", prixGlobal(4));
    expect(calls.map((c) => c.name)).toEqual(["tools_releve_estimation_synthese", "tools_releve_estimation_prix_enregistrer", "tools_releve_estimation_prix_importer",
      "tools_releve_estimation_appliquer_bibliotheque", "tools_releve_estimation_ajuster", "tools_releve_bibliotheque_prix_enregistrer"]);
    expect(calls[4].args).toEqual({ p_plan_id: P, p_ouvrage_id: "o", p_piece_id: null, p_etat: "nouveau", p_nature: "forfait", p_valeur_retenue: 120.5, p_raison: "Raison" });
    expect(JSON.stringify(calls.map((c) => c.args))).not.toMatch(/montantCalcule|montantRetenu|quantite/);
    expect(JSON.stringify(calls.map((c) => c.args))).not.toMatch(/"(tva|marge|remise|numeroDevis)"/i);
  });
  it("refus serveur → message métier", async () => {
    const repo = new SupabaseEstimationRepository(fakeClient({ tools_releve_estimation_prix_enregistrer: { data: null, error: { code: "42501", message: "Plan figé : son quantitatif est figé" } } }, []));
    await expect(repo.savePrix(P, "o", prixGlobal(1))).rejects.toBeInstanceOf(ReleveRemoteError);
    await expect(repo.savePrix(P, "o", prixGlobal(1))).rejects.toThrow("Enregistrement du prix : Plan figé : son quantitatif est figé");
  });
});

describe("pièces jointes du contrat d'estimation", () => {
  it("photos (chemin, légende, pièce) et annotations (texte, pièce, cible), sans octet", () => {
    const media = { id: "m1", storagePath: "t/r/photos/m1.jpg", mimeType: "image/jpeg", commentaire: "Commentaire", etatDocumente: "initial", metadata: { priseLe: "2026-09-30T08:00:00Z" }, deletedAt: null } as unknown as PhotoMedia;
    const elements = [
      { id: "a1", type: "photo_anchor", pieceId: "p1", donnees: { mediaId: "m1", legende: "Mur humide", ancre: { kind: "entite", ref: { kind: "piece", id: "p1" } } } },
      { id: "n1", type: "annotation", pieceId: null, donnees: { texte: "Fissure", forme: "fleche", ancre: { kind: "entite", ref: { kind: "piece", id: "p2" } } } },
    ] as unknown as ReleveElement[];
    const { photos, annotations } = estimationPiecesJointes([media], elements);
    expect(photos).toEqual([{ ref: "m1", storagePath: "t/r/photos/m1.jpg", mimeType: "image/jpeg", legende: "Mur humide", pieceRef: "p1", etatDocumente: "initial", priseLe: "2026-09-30T08:00:00Z" }]);
    expect(annotations).toEqual([{ ref: "n1", texte: "Fissure", forme: "fleche", pieceRef: "p2", cible: { kind: "piece", ref: "p2" } }]);
  });
});
