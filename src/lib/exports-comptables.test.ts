import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { construireExportComptable, exportTropVolumineux } from "./exports-comptables";

// Client factice : chaque RPC d'export rend la valeur jsonb fournie.
const client = (reponses: Record<string, unknown>, appels: unknown[] = []) => ({
  rpc: async (fonction: string, args: unknown) => {
    appels.push({ fonction, args });
    return fonction in reponses ? { data: reponses[fonction], error: null } : { data: null, error: { message: `inconnue ${fonction}` } };
  },
}) as unknown as SupabaseClient;
const PERIODE = { debut: "2026-01-01", fin: "2026-03-31" };

describe("construireExportComptable", () => {
  it("journal des ventes : une ligne par facture, identité figée prioritaire, reste dû borné à 0", async () => {
    const appels: unknown[] = [];
    const { data } = await construireExportComptable(client({ export_comptable_ventes: [
      { numero: "F-1", date_emission: "2026-01-02", date_echeance: null, type: "simple", statut: "envoyee", montant_ht: 100, montant_tva: 20, montant_ttc: 120, montant_paye: 150, client_snapshot: { reference_interne: "FIG-1", nom: "Figé" }, client: { reference_interne: "CLI-1", nom: "Fiche", prenom: null, societe: null } },
    ] }, appels), "e1", "ventes", PERIODE);
    expect(appels).toEqual([{ fonction: "export_comptable_ventes", args: { p_entreprise_id: "e1", p_debut: "2026-01-01", p_fin: "2026-03-31" } }]);
    expect(data!.lignes).toHaveLength(2);
    expect(data!.lignes[1]).toEqual(["2026-01-02", "F-1", "simple", "envoyee", "FIG-1", expect.any(String), 100, 20, 120, 150, 0, ""]);
    expect(data!.nom).toBe("journal-ventes-2026-01-01-2026-03-31");
  });

  it("règlements : les paiements d'avoir sont négatifs", async () => {
    const { data } = await construireExportComptable(client({ export_comptable_reglements: [
      { date: "2026-01-03", montant: 40, mode: "virement", reference: null, facture: { numero: "A-1", type: "avoir", client_snapshot: null, client: null } },
    ] }), "e1", "reglements", PERIODE);
    expect(data!.lignes[1][6]).toBe(-40);
  });

  it("TVA déductible : synthèse par taux triée", async () => {
    const achat = (taux: number, ht: number, tva: number) => ({ numero_piece: `P${ht}`, date_piece: "2026-01-01", date_echeance: null, categorie: "materiaux", statut: "a_payer", montant_ht: ht, taux_tva: taux, montant_tva: tva, montant_ttc: ht + tva, montant_regle: 0, fournisseur: { nom: "F" }, chantier: null });
    const { data } = await construireExportComptable(client({ export_comptable_achats: [achat(20, 100, 20), achat(5.5, 10, 0.55), achat(20, 50, 10)] }), "e1", "tva-achats", PERIODE);
    expect(data!.lignes.filter((l) => l[0] === "TOTAL")).toEqual([["TOTAL", "", "", 5.5, 10, 0.55, 10.55], ["TOTAL", "", "", 20, 150, 30, 180]]);
  });

  it("TVA collectée : la synthèse est celle calculée en base, pas un cumul flottant", async () => {
    const { data } = await construireExportComptable(client({ export_comptable_tva_collectee: {
      details: [
        { date_emission: "2026-01-02", numero: "F-2", taux_tva: 5.5, base_ht: 0.1, tva: 0.0055 },
        { date_emission: "2026-01-01", numero: "F-1", taux_tva: 5.5, base_ht: 0.2, tva: 0.011 },
      ],
      synthese: [{ taux_tva: 5.5, base_ht: 0.3, tva: 0.0165, ttc: 0.3165 }],
    } }), "e1", "tva", PERIODE);
    expect(data!.lignes.slice(1, 3).map((l) => l[1])).toEqual(["F-1", "F-2"]);
    expect(data!.lignes.at(-1)).toEqual(["TOTAL", "", 5.5, 0.3, 0.0165, 0.3165]);
  });

  it("propage l'erreur et refuse une réponse inattendue au lieu d'un export vide", async () => {
    expect((await construireExportComptable(client({}), "e1", "ventes", PERIODE)).error).toEqual({ message: "inconnue export_comptable_ventes" });
    expect((await construireExportComptable(client({ export_comptable_achats: { pas: "un tableau" } }), "e1", "achats", PERIODE)).error).toBeInstanceOf(Error);
    expect((await construireExportComptable(client({ export_comptable_tva_collectee: [] }), "e1", "tva", PERIODE)).error).toBeInstanceOf(Error);
  });

  it("reconnaît le refus de volume de la base", () => {
    expect(exportTropVolumineux({ message: "EXPORT_TROP_VOLUMINEUX", code: "54000" })).toBe(true);
    expect(exportTropVolumineux({ message: "autre" })).toBe(false);
    expect(exportTropVolumineux(null)).toBe(false);
  });
});
