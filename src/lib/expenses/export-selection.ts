import type { SupabaseClient } from "@supabase/supabase-js";
import { lireParLots } from "@/lib/supabase/lecture-complete";

// Sélection des données de l'export ZIP des notes de frais
// (/api/notes-frais/exports), isolée de la route pour être vérifiable contre
// la base (ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1).

export const ELIGIBLES_EXPORT_NOTES_FRAIS = ["valide", "validee", "remboursee", "exporte_comptabilite", "verrouille", "archive"];
export const LIMITE_EXPORT_NOTES_FRAIS = 500;
export type FiltresExportNotesFrais = { employe: string | null; chantier: string | null; categorie: string | null; fournisseur: string | null; taux_tva: string | null; statut_export: string | null };
export type NoteExport = { id: string; reference: string; date_frais: string; fournisseur: string | null; categorie: string | null; montant_ht: number | null; montant_tva: number | null; taux_tva: number | null; montant_ttc: number; devise: string; moyen_paiement: string | null; statut: string; statut_export: string; reference_comptable: string | null; employe_id: string | null; chantier_id: string | null; employe: unknown; chantier: unknown };
export type DocumentExport = { id: string; note_frais_id: string; type_document: string };
export type VersionExport = { id: string; document_id: string; numero_page: number; role_fichier: string; storage_path: string; nom_fichier_original: string; type_mime_detecte: string; taille_octets: number; empreinte_sha256: string };
export type ValidationExport = { note_frais_id: string; action: string; ancien_statut: string | null; nouveau_statut: string; message: string | null; utilisateur_id: string | null; role_utilisateur: string | null; created_at: string };

export type SelectionExport =
  | { statut: "ok"; notes: NoteExport[] }
  | { statut: "trop_volumineux"; limite: number };

// Au-delà de LIMITE_EXPORT_NOTES_FRAIS notes, l'export est refusé
// explicitement (« réduisez la période ») au lieu d'être tronqué en silence :
// le ZIP embarque chaque justificatif et doit tenir dans la durée de la route.
// Le dépassement se détecte en lisant une ligne de plus que la limite (une
// seule passe ; un `count: "exact"` doublait le coût RLS de la lecture). Cela
// suppose LIMITE + 1 ≤ max_rows PostgREST (1 000, supabase/config.toml).
export async function selectionnerNotesExport(supabase: SupabaseClient, entrepriseId: string, debut: string, fin: string, filtres: FiltresExportNotesFrais): Promise<SelectionExport> {
  let q = supabase.from("notes_frais").select("id,reference,date_frais,fournisseur,categorie,montant_ht,montant_tva,taux_tva,montant_ttc,devise,moyen_paiement,statut,statut_export,reference_comptable,employe_id,chantier_id,employe:employes(prenom,nom),chantier:chantiers!notes_frais_chantier_entreprise_fkey(nom)").eq("entreprise_id", entrepriseId).gte("date_frais", debut).lte("date_frais", fin).in("statut", ELIGIBLES_EXPORT_NOTES_FRAIS);
  if (filtres.employe) q = q.eq("employe_id", filtres.employe); if (filtres.chantier) q = q.eq("chantier_id", filtres.chantier); if (filtres.categorie) q = q.eq("categorie", filtres.categorie); if (filtres.fournisseur) q = q.ilike("fournisseur", `%${filtres.fournisseur.replace(/[%_]/g, "")}%`); if (filtres.taux_tva) q = q.eq("taux_tva", Number(filtres.taux_tva)); if (filtres.statut_export) q = q.eq("statut_export", filtres.statut_export);
  const { data, error } = await q.order("date_frais").order("id").range(0, LIMITE_EXPORT_NOTES_FRAIS); if (error) throw new Error(error.message);
  const notes = (data ?? []) as NoteExport[];
  if (notes.length > LIMITE_EXPORT_NOTES_FRAIS) return { statut: "trop_volumineux", limite: LIMITE_EXPORT_NOTES_FRAIS };
  return { statut: "ok", notes };
}

// Justificatifs et historique : lecture par lots d'identifiants, chaque lot lu
// en entier (pagination), puis ordre stable restitué. Toute erreur interrompt
// l'export : un ZIP sans une partie de ses pièces ne doit jamais être produit.
export async function lireJustificatifsExport(supabase: SupabaseClient, noteIds: string[]): Promise<{ documents: DocumentExport[]; versions: VersionExport[] }> {
  const documents = await lireParLots<DocumentExport>(noteIds, (lot, options) => supabase.from("documents_notes_frais").select("id,note_frais_id,type_document", options).in("note_frais_id", lot).order("id"));
  if (documents.error) throw new Error(documents.error.message);
  const documentIds = documents.data.map((d) => d.id); if (!documentIds.length) return { documents: [], versions: [] };
  const versions = await lireParLots<VersionExport>(documentIds, (lot, options) => supabase.from("versions_documents_notes_frais").select("id,document_id,numero_page,role_fichier,storage_path,nom_fichier_original,type_mime_detecte,taille_octets,empreinte_sha256", options).in("document_id", lot).in("role_fichier", ["original", "archive_figee", "consultation"]).order("numero_page").order("id"));
  if (versions.error) throw new Error(versions.error.message);
  return { documents: documents.data, versions: versions.data.sort((a, b) => a.numero_page - b.numero_page || a.id.localeCompare(b.id)) };
}

export async function lireValidationsExport(supabase: SupabaseClient, noteIds: string[]): Promise<ValidationExport[]> {
  const validations = await lireParLots<ValidationExport & { id: string }>(noteIds, (lot, options) => supabase.from("validations_notes_frais").select("id,note_frais_id,action,ancien_statut,nouveau_statut,message,utilisateur_id,role_utilisateur,created_at", options).in("note_frais_id", lot).order("created_at").order("id"));
  if (validations.error) throw new Error(validations.error.message);
  return validations.data.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map((validation) => { const { id, ...sansId } = validation; void id; return sansId; });
}
