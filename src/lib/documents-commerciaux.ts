import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nomClient } from "@/lib/chantier-statuts";
import { typeFactureLabel } from "@/lib/factures";
import type { EntrepriseEntete, ClientEntete, LigneImprimable, SignatureImprimable } from "@/components/DocumentImprimable";

// Chargeur de données partagé entre /imprimer/{devis,factures}/[id], la
// génération PDF serveur et l'accès externe par token : une seule requête,
// un seul mapping vers les props de DocumentImprimable, pour ne jamais faire
// diverger le rendu imprimé, le PDF et la page publique.

export type DonneesDocumentImprimable = {
  typeDoc: string;
  numero: string;
  dateEmission: string;
  dateSecondaire: { label: string; valeur: string } | null;
  entreprise: EntrepriseEntete;
  client: ClientEntete;
  lignes: LigneImprimable[];
  montantHt: number;
  montantTva: number;
  montantTtc: number;
  notesClient: string | null;
  estFacture: boolean;
  signatures: SignatureImprimable[];
  photos: Array<{ id: string; nom: string; legende?: string | null }>;
  // Métadonnées hors DocumentImprimable, utiles aux appelants (email, nom de fichier PDF, statut).
  statut: string;
  clientEmail: string | null;
  emailEnvoyeLe: string | null;
  entrepriseNom: string;
};

function entrepriseSnapshotVersEntete(snapshot: Record<string, unknown>): EntrepriseEntete {
  return snapshot as EntrepriseEntete;
}

export async function chargerDonneesDevisImprimable(
  supabase: SupabaseClient,
  params: { id: string; entrepriseId: string },
): Promise<DonneesDocumentImprimable | null> {
  const { data: devis } = await supabase
    .from("devis")
    .select(
      "id,numero,statut,date_emission,date_validite,montant_ht,montant_tva,montant_ttc,notes_client,email_envoye_le,email_envoye_a,client:clients!devis_client_id_fkey(nom,prenom,societe,email,adresse_facturation,code_postal,ville,siret)",
    )
    .eq("id", params.id)
    .eq("entreprise_id", params.entrepriseId)
    .maybeSingle();
  if (!devis) return null;

  const [{ data: lignes }, { data: entreprise }, { data: signatures }, { data: photos }] = await Promise.all([
    supabase.from("lignes_devis").select("*").eq("devis_id", params.id).order("ordre"),
    supabase.from("entreprises").select("*").eq("id", params.entrepriseId).single(),
    supabase
      .from("signatures_documents")
      .select("id,employe_id,nom_signataire,fonction_signataire,signed_at,document_sha256")
      .eq("entreprise_id", params.entrepriseId)
      .eq("type_document", "devis")
      .eq("document_id", params.id)
      .order("signed_at"),
    supabase
      .from("pieces_jointes_devis")
      .select("id,nom_original,legende")
      .eq("entreprise_id", params.entrepriseId)
      .eq("devis_id", params.id)
      .eq("type_media", "image")
      .order("created_at"),
  ]);

  const client = Array.isArray(devis.client) ? devis.client[0] : devis.client;

  return {
    typeDoc: "Devis",
    numero: devis.numero ?? "BROUILLON",
    dateEmission: devis.date_emission,
    dateSecondaire: devis.date_validite ? { label: "Valable jusqu'au", valeur: devis.date_validite } : null,
    entreprise: entreprise ?? { nom: "" },
    client: {
      nom_affiche: client ? nomClient(client) : "—",
      adresse_facturation: client?.adresse_facturation,
      code_postal: client?.code_postal,
      ville: client?.ville,
      siret: client?.siret,
    },
    lignes: (lignes ?? []).map((l) => ({
      designation: l.designation,
      description: l.description,
      quantite: l.quantite,
      unite: l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      remise_ligne: l.remise_ligne,
      taux_tva: l.taux_tva,
    })),
    montantHt: devis.montant_ht,
    montantTva: devis.montant_tva,
    montantTtc: devis.montant_ttc,
    notesClient: devis.notes_client,
    estFacture: false,
    signatures: signatures ?? [],
    photos: (photos ?? []).map((p) => ({ id: p.id, nom: p.nom_original, legende: p.legende })),
    statut: devis.statut,
    clientEmail: client?.email ?? null,
    emailEnvoyeLe: devis.email_envoye_le,
    entrepriseNom: entreprise?.nom ?? "",
  };
}

export async function chargerDonneesFactureImprimable(
  supabase: SupabaseClient,
  params: { id: string; entrepriseId: string },
): Promise<DonneesDocumentImprimable | null> {
  const { data: facture } = await supabase
    .from("factures")
    .select(
      "id,numero,statut,type,date_emission,date_echeance,montant_ht,montant_tva,montant_ttc,notes_client,email_envoye_le,email_envoye_a,entreprise_snapshot,client:clients!factures_client_id_fkey(nom,prenom,societe,email,adresse_facturation,code_postal,ville,siret)",
    )
    .eq("id", params.id)
    .eq("entreprise_id", params.entrepriseId)
    .maybeSingle();
  if (!facture) return null;

  const [{ data: lignes }, { data: entrepriseCourante }, { data: signatures }] = await Promise.all([
    supabase.from("lignes_factures").select("*").eq("facture_id", params.id).order("ordre"),
    supabase.from("entreprises").select("*").eq("id", params.entrepriseId).single(),
    supabase
      .from("signatures_documents")
      .select("id,employe_id,nom_signataire,fonction_signataire,signed_at,document_sha256")
      .eq("entreprise_id", params.entrepriseId)
      .eq("type_document", "facture")
      .eq("document_id", params.id)
      .order("signed_at"),
  ]);

  const client = Array.isArray(facture.client) ? facture.client[0] : facture.client;
  const typeDoc = facture.type === "simple" ? "Facture" : `Facture — ${typeFactureLabel(facture.type)}`;
  // Une facture déjà émise garde à vie l'identité de l'entreprise telle qu'elle
  // était à ce moment-là (voir 20260812000200_documents_commerciaux_p9.sql) ;
  // seul un brouillon (jamais encore émis) reflète l'entreprise actuelle.
  const entreprise = facture.entreprise_snapshot
    ? entrepriseSnapshotVersEntete(facture.entreprise_snapshot as Record<string, unknown>)
    : (entrepriseCourante ?? { nom: "" });

  return {
    typeDoc,
    numero: facture.numero ?? "BROUILLON",
    dateEmission: facture.date_emission,
    dateSecondaire: facture.date_echeance ? { label: "Échéance le", valeur: facture.date_echeance } : null,
    entreprise,
    client: {
      nom_affiche: client ? nomClient(client) : "—",
      adresse_facturation: client?.adresse_facturation,
      code_postal: client?.code_postal,
      ville: client?.ville,
      siret: client?.siret,
    },
    lignes: (lignes ?? []).map((l) => ({
      designation: l.designation,
      description: l.description,
      quantite: l.quantite,
      unite: l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      remise_ligne: l.remise_ligne,
      taux_tva: l.taux_tva,
    })),
    montantHt: facture.montant_ht,
    montantTva: facture.montant_tva,
    montantTtc: facture.montant_ttc,
    notesClient: facture.notes_client,
    estFacture: true,
    signatures: signatures ?? [],
    photos: [],
    statut: facture.statut,
    clientEmail: client?.email ?? null,
    emailEnvoyeLe: facture.email_envoye_le,
    entrepriseNom: entrepriseCourante?.nom ?? "",
  };
}

export const ENTETE_ENTREPRISE_COLONNES = [
  "nom",
  "raison_sociale",
  "siret",
  "adresse",
  "code_postal",
  "ville",
  "logo_url",
  "assurance_decennale_numero",
  "assurance_decennale_assureur",
  "assurance_rc_pro_numero",
  "taux_penalites_retard",
  "texte_entete",
  "texte_pied_page",
  "police_documents",
  "taille_police_documents",
  "logo_largeur_documents",
  "couleur_documents",
  "couleur_secondaire_documents",
  "mise_en_page_documents",
  "position_logo_documents",
  "afficher_logo_documents",
  "afficher_descriptions_documents",
  "afficher_tva_lignes_documents",
] as const;

export function construireSnapshotEntreprise(entreprise: Record<string, unknown>): EntrepriseEntete {
  const snapshot: Record<string, unknown> = {};
  for (const colonne of ENTETE_ENTREPRISE_COLONNES) snapshot[colonne] = entreprise[colonne] ?? null;
  return snapshot as EntrepriseEntete;
}
