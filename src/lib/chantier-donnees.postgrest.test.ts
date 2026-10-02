// Fiche chantier contre un PostgREST réel plafonné à 1 000 lignes, comparée à
// la vérité PostgreSQL (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
import { describe, expect, it } from "vitest";
import { chargerDonneesChiffreesChantier, totauxChantier } from "@/lib/chantier-donnees";
import { bancActif, clientBanc, entrepriseBanc, PREFIXE_TEMOIN, veritePg, VOLUMES_BANC } from "@/lib/test-support/banc-postgrest";

const centimes = (n: number) => Math.round(n * 100);
const grosChantier = (prefixe: string) => `${prefixe}ca0-0000-0000-0000-000000000001`;
const TOUS_DROITS = { heures: true, achats: true, notes: true };

describe.skipIf(!bancActif)("fiche chantier — PostgREST réel (max_rows = 1000) vs PostgreSQL", { timeout: 300_000 }, () => {
  it.each(VOLUMES_BANC)("$volume lignes : totaux du gros chantier exacts", async ({ prefixe }) => {
    const e = entrepriseBanc(prefixe); const c = grosChantier(prefixe);
    const v = veritePg<{ facture: number; paye: number; heures: number; realisees: number; n_pointages: number; ff: number; ff_regle: number; n_ff: number; nf: number; n_nf: number }>(`select json_build_object(
      'facture', (select coalesce(sum(montant_ttc) filter (where statut <> 'annulee'), 0) from factures where entreprise_id = '${e}' and chantier_id = '${c}'),
      'paye', (select coalesce(sum(montant_paye), 0) from factures where entreprise_id = '${e}' and chantier_id = '${c}'),
      'heures', (select coalesce(sum(heures), 0) from affectations where entreprise_id = '${e}' and chantier_id = '${c}'),
      'realisees', (select coalesce(sum(heures_normales + heures_supplementaires) filter (where verification_statut = 'valide'), 0) from pointages where entreprise_id = '${e}' and chantier_id = '${c}'),
      'n_pointages', (select count(*) from pointages where entreprise_id = '${e}' and chantier_id = '${c}'),
      'ff', (select coalesce(sum(montant_ttc) filter (where statut <> 'annulee'), 0) from depenses_fournisseurs where entreprise_id = '${e}' and chantier_id = '${c}'),
      'ff_regle', (select coalesce(sum(montant_regle), 0) from depenses_fournisseurs where entreprise_id = '${e}' and chantier_id = '${c}'),
      'n_ff', (select count(*) from depenses_fournisseurs where entreprise_id = '${e}' and chantier_id = '${c}'),
      'nf', (select coalesce(sum(montant_ttc) filter (where statut in ('valide','exporte_comptabilite','verrouille','archive','validee','remboursee')), 0) from notes_frais where entreprise_id = '${e}' and chantier_id = '${c}'),
      'n_nf', (select count(*) from notes_frais where entreprise_id = '${e}' and chantier_id = '${c}'))`);
    const d = await chargerDonneesChiffreesChantier(clientBanc(prefixe), e, c, TOUS_DROITS);
    expect([d.pointages.length, d.facturesFournisseurs.length, d.notesFrais.length]).toEqual([v.n_pointages, v.n_ff, v.n_nf]);
    const t = totauxChantier(d);
    expect([t.totalFacture, t.totalPaye, t.totalHeures, t.totalHeuresRealisees, t.totalFacturesFournisseurs, t.totalRegleFournisseurs, t.totalNotesFraisValidees].map(centimes))
      .toEqual([v.facture, v.paye, v.heures, v.realisees, v.ff, v.ff_regle, v.nf].map(centimes));
  });
  it("rien d'une autre entreprise", async () => {
    const d = await chargerDonneesChiffreesChantier(clientBanc("f1462"), entrepriseBanc(PREFIXE_TEMOIN), grosChantier(PREFIXE_TEMOIN), TOUS_DROITS);
    expect([d.factures, d.affectations, d.pointages, d.facturesFournisseurs, d.notesFrais].map((l) => l.length)).toEqual([0, 0, 0, 0, 0]);
  });
});
