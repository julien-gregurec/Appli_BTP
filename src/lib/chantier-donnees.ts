import type { SupabaseClient } from "@supabase/supabase-js";

// Lectures de la fiche chantier dont dépendent ses totaux (heures prévues et
// réalisées, factures fournisseurs, notes de frais, facturé / encaissé)
// — ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1.

type Personne = { prenom: string; nom: string };
export type PointageChantier = { id: string; date: string; heures_normales: number; heures_supplementaires: number; tache: string | null; verification_statut: string; employe: Personne | Personne[] | null };
export type FactureFournisseurChantier = { id: string; numero_piece: string; categorie: string; date_piece: string; statut: string; montant_ttc: number; montant_regle: number; justificatif_storage_path: string | null; fournisseur: { nom: string } | { nom: string }[] | null };
export type NoteFraisChantier = { id: string; reference: string; date_frais: string; fournisseur: string | null; categorie: string | null; statut: string; montant_ttc: number; employe: Personne | Personne[] | null };
export type FactureChantier = { id: string; numero: string | null; statut: string; montant_ttc: number; montant_paye: number };

// Toutes les listes chiffrées du chantier en une RPC (jsonb, non plafonnée
// par `max_rows`, mêmes colonnes, ordres et contrôles d'accès que les lectures
// RLS d'origine : migration 20260928000815). Une lecture paginée côté Next
// était exacte mais payait la policy de chaque ligne (108 s à 10 000 lignes).
export async function chargerDonneesChiffreesChantier(supabase: SupabaseClient, entrepriseId: string, chantierId: string, droits: { heures: boolean; achats: boolean; notes: boolean }) {
  const { data, error } = await supabase.rpc("chantier_donnees_chiffrees", { p_entreprise_id: entrepriseId, p_chantier_id: chantierId, p_heures: droits.heures, p_achats: droits.achats, p_notes: droits.notes });
  if (error) throw new Error(`Données du chantier indisponibles : ${error.message}`);
  const d = data as { factures: FactureChantier[]; affectations: { heures: number }[]; pointages: PointageChantier[]; factures_fournisseurs: FactureFournisseurChantier[]; notes_frais: NoteFraisChantier[] };
  return { factures: d.factures, affectations: d.affectations, pointages: d.pointages, facturesFournisseurs: d.factures_fournisseurs, notesFrais: d.notes_frais };
}

export const STATUTS_NOTES_VALIDEES = new Set(["valide", "exporte_comptabilite", "verrouille", "archive", "validee", "remboursee"]);

export function totauxChantier(d: Awaited<ReturnType<typeof chargerDonneesChiffreesChantier>>) {
  const totalFacture = d.factures.filter((item) => item.statut !== "annulee").reduce((total, item) => total + Number(item.montant_ttc ?? 0), 0);
  const totalPaye = d.factures.reduce((total, item) => total + Number(item.montant_paye ?? 0), 0);
  const totalHeures = d.affectations.reduce((total, item) => total + Number(item.heures ?? 0), 0);
  const pointagesValides = d.pointages.filter((p) => p.verification_statut === "valide");
  const totalHeuresRealisees = pointagesValides.reduce((s, p) => s + Number(p.heures_normales) + Number(p.heures_supplementaires), 0);
  const totalFacturesFournisseurs = d.facturesFournisseurs.filter((item) => item.statut !== "annulee").reduce((total, item) => total + Number(item.montant_ttc ?? 0), 0);
  const totalRegleFournisseurs = d.facturesFournisseurs.reduce((total, item) => total + Number(item.montant_regle ?? 0), 0);
  const notesFraisValidees = d.notesFrais.filter((note) => STATUTS_NOTES_VALIDEES.has(note.statut));
  const notesFraisEnCours = d.notesFrais.filter((note) => !STATUTS_NOTES_VALIDEES.has(note.statut) && !["refuse", "refusee"].includes(note.statut));
  const totalNotesFraisValidees = notesFraisValidees.reduce((total, note) => total + Number(note.montant_ttc ?? 0), 0);
  const totalNotesFraisEnCours = notesFraisEnCours.reduce((total, note) => total + Number(note.montant_ttc ?? 0), 0);
  return { totalFacture, totalPaye, totalHeures, pointagesValides, totalHeuresRealisees, totalFacturesFournisseurs, totalRegleFournisseurs, notesFraisValidees, notesFraisEnCours, totalNotesFraisValidees, totalNotesFraisEnCours };
}
