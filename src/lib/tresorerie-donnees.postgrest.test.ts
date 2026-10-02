// Trésorerie contre un PostgREST réel plafonné à 1 000 lignes, comparée à la
// vérité PostgreSQL (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
import { describe, expect, it } from "vitest";
import { chargerDonneesTresorerie, indicateursTresorerie } from "@/lib/tresorerie-donnees";
import { bancActif, clientBanc, entrepriseBanc, PREFIXE_TEMOIN, veritePg, VOLUMES_BANC } from "@/lib/test-support/banc-postgrest";

const centimes = (n: number) => Math.round(n * 100);
const DEPUIS = "2026-06-01";

describe.skipIf(!bancActif)("trésorerie — PostgREST réel (max_rows = 1000) vs PostgreSQL", { timeout: 300_000 }, () => {
  describe.each(VOLUMES_BANC)("$volume lignes par table", ({ prefixe }) => {
    const e = entrepriseBanc(prefixe);
    it("à encaisser, à payer et flux réalisés exacts", async () => {
      const verite = veritePg<{ n_factures: number; n_depenses: number; a_encaisser: number; a_payer: number; entrees: number; sorties: number }>(`select json_build_object(
        'n_factures', (select count(*) from factures f where f.entreprise_id = '${e}' and f.statut not in ('payee','annulee','avoir_emis','brouillon')),
        'n_depenses', (select count(*) from depenses_fournisseurs d where d.entreprise_id = '${e}' and d.statut not in ('payee','annulee')),
        'a_encaisser', (select coalesce(sum(greatest(0, f.montant_ttc - f.montant_paye + coalesce((select sum(a.montant_ttc) from factures a where a.entreprise_id = f.entreprise_id and a.type = 'avoir' and a.statut <> 'annulee' and a.facture_origine_id = f.id), 0))), 0) from factures f where f.entreprise_id = '${e}' and f.statut not in ('payee','annulee','avoir_emis','brouillon')),
        'a_payer', (select coalesce(sum(greatest(0, d.montant_ttc - d.montant_regle)), 0) from depenses_fournisseurs d where d.entreprise_id = '${e}' and d.statut not in ('payee','annulee')),
        'entrees', (select coalesce(sum(p.montant), 0) from paiements p join factures f on f.id = p.facture_id where f.entreprise_id = '${e}' and p.date >= '${DEPUIS}'),
        'sorties', (select coalesce(sum(r.montant), 0) from reglements_fournisseurs r join depenses_fournisseurs d on d.id = r.depense_id where d.entreprise_id = '${e}' and r.date >= '${DEPUIS}'))`);
      const resultat = indicateursTresorerie(await chargerDonneesTresorerie(clientBanc(prefixe), e, DEPUIS));
      expect(resultat.facturesOuvertes).toHaveLength(verite.n_factures);
      expect(resultat.depensesOuvertes).toHaveLength(verite.n_depenses);
      expect([resultat.aEncaisser, resultat.aPayer, resultat.entrees30, resultat.sorties30].map(centimes))
        .toEqual([verite.a_encaisser, verite.a_payer, verite.entrees, verite.sorties].map(centimes));
    });
  });

  it("aucune donnée d'une autre entreprise, aucune donnée pour un ouvrier sans droits", async () => {
    const autre = indicateursTresorerie(await chargerDonneesTresorerie(clientBanc("f1462"), entrepriseBanc(PREFIXE_TEMOIN), DEPUIS));
    const ouvrier = indicateursTresorerie(await chargerDonneesTresorerie(clientBanc("f1462", "OUVRIER"), entrepriseBanc("f1462"), DEPUIS));
    for (const r of [autre, ouvrier]) {
      expect(r.facturesOuvertes).toHaveLength(0);
      expect(r.depensesOuvertes).toHaveLength(0);
      expect([r.aEncaisser, r.aPayer, r.entrees30, r.sorties30]).toEqual([0, 0, 0, 0]);
    }
  });
});
