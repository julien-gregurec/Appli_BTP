// Stock et inventaires contre un PostgREST réel plafonné à 1 000 lignes,
// comparés à la vérité PostgreSQL (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
import { describe, expect, it } from "vitest";
import { calculerSyntheseInventaire } from "@/lib/inventaires";
import { chargerArticlesStock, chargerIdsLignesInventaire, chargerLignesInventaire, indicateursStock } from "@/lib/stock-donnees";
import { bancActif, clientBanc, entrepriseBanc, PREFIXE_TEMOIN, veritePg, VOLUMES_BANC } from "@/lib/test-support/banc-postgrest";

const centimes = (n: number) => Math.round(n * 100);
const inventaireBanc = (prefixe: string) => `${prefixe}5b0-0000-0000-0000-000000000001`;

describe.skipIf(!bancActif)("stock et inventaires — PostgREST réel (max_rows = 1000) vs PostgreSQL", { timeout: 300_000 }, () => {
  describe.each(VOLUMES_BANC)("$volume articles", ({ prefixe }) => {
    const e = entrepriseBanc(prefixe);
    it.each([true, false])("page /stock (prix visibles : %s) : articles, alertes et valeur exacts", async (avecPrix) => {
      const verite = veritePg<{ n: number; alertes: number; valeur: number }>(`select json_build_object('n', count(*), 'alertes', count(*) filter (where quantite_stock <= seuil_alerte), 'valeur', sum(quantite_stock * coalesce(prix_achat_ht, 0))) from articles_stock where entreprise_id = '${e}' and actif`);
      const articles = await chargerArticlesStock(clientBanc(prefixe), e, avecPrix);
      expect(articles).toHaveLength(verite.n);
      expect(new Set(articles.map((a) => a.id)).size).toBe(verite.n);
      const { alertes, valeur } = indicateursStock(articles, avecPrix);
      expect(alertes).toHaveLength(verite.alertes);
      if (avecPrix) expect(centimes(valeur!)).toBe(centimes(verite.valeur));
    });
    it("inventaire : synthèse de clôture et comptage portent sur toutes les lignes", async () => {
      const inv = inventaireBanc(prefixe);
      const verite = veritePg<{ n: number; theorique: number; comptee: number; ecarts: number }>(`select json_build_object('n', count(*), 'theorique', sum(quantite_theorique * prix_achat_ht_snapshot), 'comptee', sum(quantite_comptee * prix_achat_ht_snapshot), 'ecarts', count(*) filter (where quantite_comptee <> quantite_theorique)) from lignes_inventaire where inventaire_id = '${inv}'`);
      const lignes = await chargerLignesInventaire(clientBanc(prefixe), e, inv, true);
      expect(lignes).toHaveLength(verite.n);
      const synthese = calculerSyntheseInventaire(lignes.map((l) => ({ quantiteTheorique: Number(l.quantite_theorique), quantiteComptee: l.quantite_comptee === null ? null : Number(l.quantite_comptee), prixAchatHt: Number(l.prix_achat_ht_snapshot) })));
      expect(synthese.articles).toBe(verite.n);
      expect(synthese.articlesAvecEcart).toBe(verite.ecarts);
      expect([synthese.valeurTheoriqueHt, synthese.valeurCompteeHt].map(centimes)).toEqual([verite.theorique, verite.comptee].map(centimes));
      expect(await chargerLignesInventaire(clientBanc(prefixe), e, inv, false)).toHaveLength(verite.n);
      expect(await chargerIdsLignesInventaire(clientBanc(prefixe), e, inv)).toHaveLength(verite.n);
    });
  });
  it("rien d'une autre entreprise", async () => {
    expect(await chargerArticlesStock(clientBanc("f1462"), entrepriseBanc(PREFIXE_TEMOIN), false)).toHaveLength(0);
    expect(await chargerLignesInventaire(clientBanc("f1462"), entrepriseBanc(PREFIXE_TEMOIN), inventaireBanc(PREFIXE_TEMOIN), false)).toHaveLength(0);
    await expect(chargerArticlesStock(clientBanc("f1462", "OUVRIER"), entrepriseBanc("f1462"), true)).rejects.toThrow();
  });
});
