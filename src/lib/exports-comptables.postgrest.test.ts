// Exports comptables / TVA contre un PostgREST réel plafonné à 1 000 lignes,
// comparés à la vérité PostgreSQL (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
// Ignoré sans banc : voir src/lib/test-support/banc-postgrest.ts.
import { describe, expect, it } from "vitest";
import { construireExportComptable, type TypeExportComptable } from "@/lib/exports-comptables";
import { bancActif, clientBanc, entrepriseBanc, PERIODE_BANC, PREFIXE_TEMOIN, veritePg, VOLUMES_BANC } from "@/lib/test-support/banc-postgrest";

const centimes = (n: number) => Math.round(n * 100);
const { debut, fin } = PERIODE_BANC;

async function exporter(prefixe: string, type: TypeExportComptable, entrepriseId = entrepriseBanc(prefixe), profil: "ADMIN" | "OUVRIER" = "ADMIN") {
  const { data, error } = await construireExportComptable(clientBanc(prefixe, profil), entrepriseId, type, PERIODE_BANC);
  expect(error).toBeNull();
  const lignes = data!.lignes.slice(1);
  const fin = lignes.findIndex((l) => l.length === 0);
  return { detail: fin < 0 ? lignes : lignes.slice(0, fin), synthese: fin < 0 ? [] : lignes.slice(fin + 2) };
}
const somme = (lignes: unknown[][], colonne: number) => lignes.reduce((s, l) => s + Number(l[colonne]), 0);
const parTaux = (synthese: unknown[][], colTaux: number, cols: number[]) =>
  Object.fromEntries(synthese.map((l) => [String(Number(l[colTaux])), cols.map((c) => centimes(Number(l[c])))]));

describe.skipIf(!bancActif)("exports comptables — PostgREST réel (max_rows = 1000) vs PostgreSQL", { timeout: 300_000 }, () => {
  describe.each(VOLUMES_BANC)("$volume lignes par table", ({ prefixe, volume }) => {
    const e = entrepriseBanc(prefixe);

    it("journal des ventes : toutes les factures, totaux exacts", async () => {
      const verite = veritePg<{ n: number; ht: number; tva: number; ttc: number; paye: number; reste: number }>(`select json_build_object('n', count(*), 'ht', sum(montant_ht), 'tva', sum(montant_tva), 'ttc', sum(montant_ttc), 'paye', sum(montant_paye), 'reste', sum(greatest(0, montant_ttc - montant_paye))) from factures where entreprise_id = '${e}' and numero is not null and date_emission between '${debut}' and '${fin}'`);
      expect(verite.n).toBe(volume);
      const { detail } = await exporter(prefixe, "ventes");
      expect(detail).toHaveLength(verite.n);
      expect(new Set(detail.map((l) => l[1])).size).toBe(verite.n);
      expect([6, 7, 8, 9, 10].map((c) => centimes(somme(detail, c)))).toEqual([verite.ht, verite.tva, verite.ttc, verite.paye, verite.reste].map(centimes));
    });

    it("règlements clients : tous les paiements, avoirs en négatif", async () => {
      const verite = veritePg<{ n: number; total: number }>(`select json_build_object('n', count(*), 'total', sum(case when f.type = 'avoir' then -p.montant else p.montant end)) from paiements p join factures f on f.id = p.facture_id where f.entreprise_id = '${e}' and p.date between '${debut}' and '${fin}'`);
      const { detail } = await exporter(prefixe, "reglements");
      expect(detail).toHaveLength(verite.n);
      expect(centimes(somme(detail, 6))).toBe(centimes(verite.total));
    });

    it("journal des achats : toutes les pièces non annulées", async () => {
      const verite = veritePg<{ n: number; ht: number; tva: number; ttc: number; regle: number }>(`select json_build_object('n', count(*), 'ht', sum(montant_ht), 'tva', sum(montant_tva), 'ttc', sum(montant_ttc), 'regle', sum(montant_regle)) from depenses_fournisseurs where entreprise_id = '${e}' and date_piece between '${debut}' and '${fin}' and statut <> 'annulee'`);
      const { detail } = await exporter(prefixe, "achats");
      expect(detail).toHaveLength(verite.n);
      expect([6, 8, 9, 10].map((c) => centimes(somme(detail, c)))).toEqual([verite.ht, verite.tva, verite.ttc, verite.regle].map(centimes));
    });

    it("TVA déductible : synthèse par taux exacte", async () => {
      const verite = veritePg<Record<string, number[]>>(`select json_object_agg(taux_tva::float8::text, json_build_array(round(ht * 100), round(tva * 100), round(ttc * 100))) from (select taux_tva, sum(montant_ht) ht, sum(montant_tva) tva, sum(montant_ttc) ttc from depenses_fournisseurs where entreprise_id = '${e}' and date_piece between '${debut}' and '${fin}' and statut <> 'annulee' group by taux_tva) t`);
      const n = veritePg<number>(`select count(*) from depenses_fournisseurs where entreprise_id = '${e}' and date_piece between '${debut}' and '${fin}' and statut <> 'annulee'`);
      const { detail, synthese } = await exporter(prefixe, "tva-achats");
      expect(detail).toHaveLength(n);
      expect(parTaux(synthese, 3, [4, 5, 6])).toEqual(verite);
    });

    it("TVA collectée : détail par facture et synthèse par taux exacts", async () => {
      const base = `from lignes_factures l join factures f on f.id = l.facture_id where f.entreprise_id = '${e}' and f.numero is not null and f.date_emission between '${debut}' and '${fin}' and f.statut <> 'annulee'`;
      const verite = veritePg<Record<string, number[]>>(`select json_object_agg(taux::float8::text, json_build_array(round(ht * 100), round(tva * 100), round((ht + tva) * 100))) from (select l.taux_tva taux, sum(l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100)) ht, sum(l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100) * l.taux_tva / 100) tva ${base} group by l.taux_tva) t`);
      const groupes = veritePg<number>(`select count(*) from (select 1 ${base} group by f.id, l.taux_tva) g`);
      const { detail, synthese } = await exporter(prefixe, "tva");
      expect(detail).toHaveLength(groupes);
      expect(parTaux(synthese, 2, [3, 4, 5])).toEqual(verite);
    });
  });

  describe("sécurité", () => {
    it("un administrateur ne lit rien d'une autre entreprise, même en forçant son identifiant", async () => {
      for (const type of ["ventes", "reglements", "achats", "tva-achats", "tva"] as const) {
        const { detail } = await exporter("f1462", type, entrepriseBanc(PREFIXE_TEMOIN));
        expect(detail).toHaveLength(0);
      }
    });
    it("un ouvrier sans accès factures / dépenses ne lit aucune donnée comptable", async () => {
      for (const type of ["ventes", "reglements", "achats", "tva-achats", "tva"] as const) {
        const { detail } = await exporter("f1462", type, entrepriseBanc("f1462"), "OUVRIER");
        expect(detail).toHaveLength(0);
      }
    });
  });
});
