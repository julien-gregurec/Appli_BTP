// Totaux /depenses contre un PostgREST réel plafonné à 1 000 lignes, comparés
// à la vérité PostgreSQL (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
import { describe, expect, it } from "vitest";
import { chargerTotauxDepenses } from "@/lib/depenses-totaux";
import { bancActif, clientBanc, entrepriseBanc, PREFIXE_TEMOIN, veritePg, VOLUMES_BANC } from "@/lib/test-support/banc-postgrest";

const centimes = (n: number) => Math.round(n * 100);

describe.skipIf(!bancActif)("totaux /depenses — PostgREST réel (max_rows = 1000) vs PostgreSQL", { timeout: 300_000 }, () => {
  it.each(VOLUMES_BANC)("$volume pièces : total TTC, réglé et nombre exacts", async ({ prefixe }) => {
    const e = entrepriseBanc(prefixe);
    const verite = veritePg<{ total: number; regle: number; n: number }>(`select json_build_object('total', coalesce(sum(montant_ttc) filter (where statut <> 'annulee'), 0), 'regle', coalesce(sum(montant_regle), 0), 'n', count(*)) from depenses_fournisseurs where entreprise_id = '${e}'`);
    const totaux = await chargerTotauxDepenses(clientBanc(prefixe), e);
    expect(totaux.nombre).toBe(verite.n);
    expect([totaux.totalTtc, totaux.regle].map(centimes)).toEqual([verite.total, verite.regle].map(centimes));
  });
  it("rien d'une autre entreprise ni pour un ouvrier sans accès achats", async () => {
    for (const totaux of [await chargerTotauxDepenses(clientBanc("f1462"), entrepriseBanc(PREFIXE_TEMOIN)), await chargerTotauxDepenses(clientBanc("f1462", "OUVRIER"), entrepriseBanc("f1462"))]) {
      expect(totaux).toEqual({ totalTtc: 0, regle: 0, nombre: 0 });
    }
  });
});
