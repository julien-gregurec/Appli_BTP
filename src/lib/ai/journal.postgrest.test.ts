// Consommation IA du mois contre un PostgREST réel plafonné à 1 000 lignes,
// comparée à la vérité PostgreSQL (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
import { describe, expect, it } from "vitest";
import { consommationIAMensuelle } from "@/lib/ai/journal";
import { bancActif, clientBanc, entrepriseBanc, PREFIXE_TEMOIN, veritePg, VOLUMES_BANC } from "@/lib/test-support/banc-postgrest";

describe.skipIf(!bancActif)("quota IA — PostgREST réel (max_rows = 1000) vs PostgreSQL", { timeout: 300_000 }, () => {
  it.each(VOLUMES_BANC)("$volume opérations : consommation et coût du mois exacts", async ({ prefixe }) => {
    const e = entrepriseBanc(prefixe);
    const verite = veritePg<{ operations: number; cout: number }>(`select json_build_object('operations', coalesce(sum(greatest(0, coalesce(operations_decomptees, 1))), 0), 'cout', coalesce(sum(cout_estime_ht), 0)) from journal_ia where entreprise_id = '${e}' and statut = 'succes' and annule_at is null and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'`);
    const consommation = await consommationIAMensuelle(clientBanc(prefixe), e);
    expect(consommation.utilise).toBe(verite.operations);
    expect(Math.round(consommation.coutEstimeHT * 10000)).toBe(Math.round(verite.cout * 10000));
  });
  it("aucune opération d'une autre entreprise, aucune pour un membre sans droit qui n'a rien consommé", async () => {
    expect((await consommationIAMensuelle(clientBanc("f1462"), entrepriseBanc(PREFIXE_TEMOIN))).utilise).toBe(0);
    expect((await consommationIAMensuelle(clientBanc("f1462", "OUVRIER"), entrepriseBanc("f1462"))).utilise).toBe(0);
  });
});
