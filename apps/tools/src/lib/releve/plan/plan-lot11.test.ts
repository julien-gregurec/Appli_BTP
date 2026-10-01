import { describe, expect, it } from "vitest";
import type { EstimationGpPayload } from "@elsatia/releve-domain";
import type { ReleveSupabaseClient } from "../supabase-repository";
import { GpEnvoiError, SupabaseGpHandoffRepository } from "./supabase-gp-handoff-repository";

const R = "db000000-0000-0000-0000-000000000001";
type Call = { name: string; args: unknown };
function fakeClient(rpc: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>, calls: Call[]): ReleveSupabaseClient {
  return { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return rpc(name, args); } } as unknown as ReleveSupabaseClient;
}
const payload = { contract: { name: "elsatia.tools.estimation", version: "1.0.0" }, lignes: [] } as unknown as EstimationGpPayload;

describe("Lot 11 — envoi vers Gestion Pro (adaptateur Supabase)", () => {
  it("une seule RPC d'import GP, contrat transmis tel quel ; aucun devis demandé", async () => {
    const calls: Call[] = [];
    const repo = new SupabaseGpHandoffRepository(fakeClient(async () => ({ data: { statut: "importe", importId: "i1", version: 1, montant: "1007.00", lignes: 4, ouvrages: 4 }, error: null }), calls));
    const r = await repo.envoyer(R, "existant", payload);
    expect(r).toMatchObject({ statut: "importe", importId: "i1", version: 1, montant: 1007 });
    expect(calls).toEqual([{ name: "gp_tools_importer_estimation", args: { p_releve_id: R, p_etat: "existant", p_payload: payload } }]);
    expect(JSON.stringify(calls)).not.toMatch(/creer_devis|"(tva|marge|remise|prixVente)"/i);
  });
  it("double envoi : le serveur répond « déjà importé » (même import id), sans doublon", async () => {
    const repo = new SupabaseGpHandoffRepository(fakeClient(async () => ({ data: { statut: "deja_importe", importId: "i1", version: 1 }, error: null }), []));
    expect(await repo.envoyer(R, "existant", payload)).toMatchObject({ statut: "deja_importe", importId: "i1" });
  });
  it("erreurs typées : GP inaccessible, contrat invalide / version inconnue, source obsolète (ouvrage supprimé), droits", async () => {
    const cas: [Record<string, string>, string][] = [
      [{ code: "42501", message: "Gestion Pro n'est pas accessible pour cette entreprise", hint: "GP_INACCESSIBLE" }, "gp_inaccessible"],
      [{ code: "22023", message: "Version de contrat non prise en charge : 2.0.0 (Gestion Pro accepte elsatia.tools.estimation 1.x)", hint: "CONTRAT_INVALIDE" }, "contrat"],
      [{ code: "PT409", message: "L'estimation a changé depuis son chargement", hint: "SOURCE_OBSOLETE" }, "obsolete"],
      [{ code: "42501", message: "Envoi vers Gestion Pro non autorisé" }, "droits"],
    ];
    for (const [error, type] of cas) {
      const repo = new SupabaseGpHandoffRepository(fakeClient(async () => ({ data: null, error }), []));
      const e = await repo.envoyer(R, "existant", payload).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(GpEnvoiError);
      expect((e as GpEnvoiError).erreur.type).toBe(type);
    }
  });
  it("réseau coupé / Gestion Pro injoignable / import interrompu : erreur « réessayable », renvoi sûr", async () => {
    const repo = new SupabaseGpHandoffRepository(fakeClient(async () => { throw new TypeError("Failed to fetch"); }, []));
    const e = (await repo.envoyer(R, "existant", payload).catch((x: unknown) => x)) as GpEnvoiError;
    expect(e.erreur).toMatchObject({ type: "reseau", reessayable: true });
    expect(e.message).toContain("vous pouvez renvoyer sans risque");
    const proxy = new SupabaseGpHandoffRepository(fakeClient(async () => ({ data: null, error: { code: "", message: "Bad Gateway" } }), []));
    expect(((await proxy.envoyer(R, "existant", payload).catch((x: unknown) => x)) as GpEnvoiError).erreur.type).toBe("reseau");
  });
  it("réponse illisible : refusée plutôt qu'interprétée", async () => {
    const repo = new SupabaseGpHandoffRepository(fakeClient(async () => ({ data: { statut: "devis_cree" }, error: null }), []));
    await expect(repo.envoyer(R, "existant", payload)).rejects.toThrow("illisible");
  });
  it("historique des envois (RPC dédiée, lecture seule)", async () => {
    const calls: Call[] = [];
    const repo = new SupabaseGpHandoffRepository(fakeClient(async () => ({ data: [{ importId: "i2", etat: "existant", version: 2, le: "2026-10-01T08:00:00Z", montant: "1067.00", lignes: 3, ouvrages: 3, priseEnCharge: false, nouvelleVersion: false }], error: null }), calls));
    expect(await repo.envois(R)).toEqual([expect.objectContaining({ importId: "i2", version: 2, montant: 1067 })]);
    expect(calls).toEqual([{ name: "gp_tools_imports_releve", args: { p_releve_id: R } }]);
  });
});
