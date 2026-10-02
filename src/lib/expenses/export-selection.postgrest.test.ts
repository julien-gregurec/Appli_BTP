// Export ZIP des notes de frais : sélection, justificatifs et historique contre
// un PostgREST réel plafonné à 1 000 lignes, comparés à la vérité PostgreSQL
// (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).
import { describe, expect, it } from "vitest";
import { LIMITE_EXPORT_NOTES_FRAIS, lireJustificatifsExport, lireValidationsExport, selectionnerNotesExport } from "@/lib/expenses/export-selection";
import { bancActif, clientBanc, entrepriseBanc, PERIODE_BANC, PREFIXE_TEMOIN, veritePg, VOLUMES_BANC } from "@/lib/test-support/banc-postgrest";

const SANS_FILTRE = { employe: null, chantier: null, categorie: null, fournisseur: null, taux_tva: null, statut_export: null };
const { debut, fin } = PERIODE_BANC;

describe.skipIf(!bancActif)("export notes de frais — PostgREST réel (max_rows = 1000) vs PostgreSQL", { timeout: 300_000 }, () => {
  it.each(VOLUMES_BANC)("$volume notes : jamais de sélection tronquée en silence", async ({ prefixe, volume }) => {
    const selection = await selectionnerNotesExport(clientBanc(prefixe), entrepriseBanc(prefixe), debut, fin, SANS_FILTRE);
    if (volume <= LIMITE_EXPORT_NOTES_FRAIS) {
      expect(selection.statut).toBe("ok");
      expect(selection.statut === "ok" && selection.notes).toHaveLength(volume);
    } else {
      expect(selection).toEqual({ statut: "trop_volumineux", limite: LIMITE_EXPORT_NOTES_FRAIS });
    }
  });

  it.each(VOLUMES_BANC)("$volume notes : sur une sélection de 500 notes, tous les justificatifs et tout l'historique", async ({ prefixe }) => {
    const e = entrepriseBanc(prefixe);
    // Une période qui tient sous la limite : les 500 premières notes par date.
    const borne = veritePg<string>(`select to_json(max(date_frais)) from (select date_frais from notes_frais where entreprise_id = '${e}' order by date_frais, id limit ${LIMITE_EXPORT_NOTES_FRAIS}) s`);
    const n = veritePg<number>(`select count(*) from notes_frais where entreprise_id = '${e}' and date_frais between '${debut}' and '${borne}'`);
    const fenetre = n <= LIMITE_EXPORT_NOTES_FRAIS ? borne : veritePg<string>(`select to_json(max(date_frais) - 1) from (select date_frais from notes_frais where entreprise_id = '${e}' order by date_frais, id limit ${LIMITE_EXPORT_NOTES_FRAIS}) s`);
    const selection = await selectionnerNotesExport(clientBanc(prefixe), e, debut, fenetre, SANS_FILTRE);
    expect(selection.statut).toBe("ok");
    const notes = selection.statut === "ok" ? selection.notes : [];
    const ids = notes.map((note) => note.id);
    const liste = ids.map((id) => `'${id}'`).join(",");
    const verite = veritePg<{ notes: number; documents: number; versions: number; validations: number }>(`select json_build_object(
      'notes', (select count(*) from notes_frais where entreprise_id = '${e}' and date_frais between '${debut}' and '${fenetre}' and statut in ('valide','validee','remboursee','exporte_comptabilite','verrouille','archive')),
      'documents', (select count(*) from documents_notes_frais where note_frais_id in (${liste})),
      'versions', (select count(*) from versions_documents_notes_frais v join documents_notes_frais d on d.id = v.document_id where d.note_frais_id in (${liste}) and v.role_fichier in ('original','archive_figee','consultation')),
      'validations', (select count(*) from validations_notes_frais where note_frais_id in (${liste})))`);
    expect(notes).toHaveLength(verite.notes);
    const { documents, versions } = await lireJustificatifsExport(clientBanc(prefixe), ids);
    expect(documents).toHaveLength(verite.documents);
    expect(versions).toHaveLength(verite.versions);
    expect(new Set(versions.map((v) => v.id)).size).toBe(verite.versions);
    const validations = await lireValidationsExport(clientBanc(prefixe), ids);
    expect(validations).toHaveLength(verite.validations);
  });

  it("aucune note d'une autre entreprise ni pour un ouvrier sans droit notes de frais", async () => {
    for (const [client, e] of [[clientBanc("f0500"), entrepriseBanc(PREFIXE_TEMOIN)], [clientBanc("f0500", "OUVRIER"), entrepriseBanc("f0500")]] as const) {
      expect(await selectionnerNotesExport(client, e, debut, fin, SANS_FILTRE)).toEqual({ statut: "ok", notes: [] });
    }
  });
});
