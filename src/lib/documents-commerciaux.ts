import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identiteClientDocument, type OrigineIdentiteClient } from "@/lib/client-snapshot";
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
  // Uniquement vrai pour une facture de type "avoir" (jamais pour un devis) — permet à l'email
  // (documents-envoi.ts) de distinguer le wording sans dupliquer la lecture de facture.type.
  estAvoir: boolean;
  signatures: SignatureImprimable[];
  photos: Array<{ id: string; nom: string; legende?: string | null }>;
  // Métadonnées hors DocumentImprimable, utiles aux appelants (email, nom de fichier PDF, statut).
  statut: string;
  clientEmail: string | null;
  // Origine de l'identité destinataire affichée : figée à l'émission, reconstituée
  // par le rattrapage des documents antérieurs, ou lue en direct (brouillon).
  clientOrigine: OrigineIdentiteClient;
  clientSnapshotAt: string | null;
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
      "id,numero,statut,date_emission,date_validite,montant_ht,montant_tva,montant_ttc,notes_client,email_envoye_le,email_envoye_a,entreprise_snapshot,client_snapshot,client_snapshot_at,client:clients!devis_client_id_fkey(nom,prenom,societe,email,adresse_facturation,code_postal,ville,siret)",
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
  // Un devis émis (numéroté) porte l'identité destinataire figée à ce moment-là ;
  // seul un brouillon reflète encore la fiche client courante.
  const identiteClient = identiteClientDocument({
    snapshot: devis.client_snapshot,
    fiche: client,
    captureeLe: devis.client_snapshot_at,
  });

  return {
    typeDoc: "Devis",
    numero: devis.numero ?? "BROUILLON",
    dateEmission: devis.date_emission,
    dateSecondaire: devis.date_validite ? { label: "Valable jusqu'au", valeur: devis.date_validite } : null,
    // Un devis émis (statut <> brouillon) garde à vie l'identité de l'entreprise
    // telle qu'elle était à son envoi (voir 20260922000308) ; seul un brouillon
    // reflète l'entreprise actuelle.
    entreprise: devis.entreprise_snapshot
      ? entrepriseSnapshotVersEntete(devis.entreprise_snapshot as Record<string, unknown>)
      : (entreprise ?? { nom: "" }),
    client: identiteClient.entete,
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
    estAvoir: false,
    signatures: signatures ?? [],
    photos: (photos ?? []).map((p) => ({ id: p.id, nom: p.nom_original, legende: p.legende })),
    statut: devis.statut,
    clientEmail: identiteClient.email,
    clientOrigine: identiteClient.origine,
    clientSnapshotAt: devis.client_snapshot_at ?? null,
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
      "id,numero,statut,type,date_emission,date_echeance,montant_ht,montant_tva,montant_ttc,notes_client,email_envoye_le,email_envoye_a,entreprise_snapshot,client_snapshot,client_snapshot_at,client:clients!factures_client_id_fkey(nom,prenom,societe,email,adresse_facturation,code_postal,ville,siret)",
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
  // Symétrique de entreprise_snapshot : une facture ou un avoir déjà émis garde
  // à vie l'identité du destinataire telle qu'elle était à l'émission.
  const identiteClient = identiteClientDocument({
    snapshot: facture.client_snapshot,
    fiche: client,
    captureeLe: facture.client_snapshot_at,
  });
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
    client: identiteClient.entete,
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
    estAvoir: facture.type === "avoir",
    signatures: signatures ?? [],
    photos: [],
    statut: facture.statut,
    clientEmail: identiteClient.email,
    clientOrigine: identiteClient.origine,
    clientSnapshotAt: facture.client_snapshot_at ?? null,
    emailEnvoyeLe: facture.email_envoye_le,
    entrepriseNom: entrepriseCourante?.nom ?? "",
  };
}

// Lecture publique par jeton (/document/[token], /imprimer/partage/[token]) :
// contrairement aux deux chargeurs ci-dessus (RLS standard, client authentifié
// scopé à son entreprise), ce chemin est appelé avec service_role — depuis
// 20260911000297_gp_v1_rc_acl_prerequisites.sql, service_role n'a plus AUCUN
// privilège sur devis/factures/lignes/clients. On passe donc par la fonction
// SECURITY DEFINER dédiée (20260922000305_document_partage_public_par_jeton.sql),
// qui résout elle-même le jeton, vérifie révocation/expiration/tenance/statut
// (jamais un brouillon), et ne renvoie que les colonnes imprimées — jamais les
// tables elles-mêmes. `supabaseAdmin` n'est là que pour porter l'appel RPC.
export async function chargerDonneesDocumentPartage(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<DonneesDocumentImprimable | null> {
  const { data, error } = await supabaseAdmin.rpc("document_commercial_public_par_token", { p_token: token });
  if (error || !data) return null;

  const typeDocument = data.type_document as "devis" | "facture";
  const document = data.document as Record<string, unknown>;
  const lignes = (data.lignes as Array<Record<string, unknown>>) ?? [];
  const entreprise = (data.entreprise as Record<string, unknown> | null) ?? { nom: "" };
  const client = data.client as { nom?: string | null; prenom?: string | null; societe?: string | null; adresse_facturation?: string | null; code_postal?: string | null; ville?: string | null; siret?: string | null } | null;

  const identiteClient = identiteClientDocument({
    snapshot: document.client_snapshot,
    fiche: client,
    captureeLe: (document.client_snapshot_at as string | null) ?? null,
  });

  const estFacture = typeDocument === "facture";
  const type = (document.type as string | undefined) ?? "simple";
  const typeDoc = !estFacture ? "Devis" : type === "simple" ? "Facture" : `Facture — ${typeFactureLabel(type)}`;
  const dateSecondaire = !estFacture
    ? document.date_validite
      ? { label: "Valable jusqu'au", valeur: document.date_validite as string }
      : null
    : document.date_echeance
      ? { label: "Échéance le", valeur: document.date_echeance as string }
      : null;

  return {
    typeDoc,
    numero: (document.numero as string | null) ?? "BROUILLON",
    dateEmission: document.date_emission as string,
    dateSecondaire,
    entreprise: entrepriseSnapshotVersEntete(entreprise),
    client: identiteClient.entete,
    lignes: lignes.map((l) => ({
      designation: l.designation as string,
      description: l.description as string | null,
      quantite: l.quantite as number,
      unite: l.unite as string,
      prix_unitaire_ht: l.prix_unitaire_ht as number,
      remise_ligne: l.remise_ligne as number,
      taux_tva: l.taux_tva as number,
    })),
    montantHt: document.montant_ht as number,
    montantTva: document.montant_tva as number,
    montantTtc: document.montant_ttc as number,
    notesClient: (document.notes_client as string | null) ?? null,
    estFacture,
    estAvoir: estFacture && type === "avoir",
    signatures: (data.signatures as SignatureImprimable[]) ?? [],
    photos: ((data.photos as Array<{ id: string; nom_original: string; legende?: string | null }>) ?? []).map((p) => ({
      id: p.id,
      nom: p.nom_original,
      legende: p.legende,
    })),
    statut: document.statut as string,
    clientEmail: identiteClient.email,
    clientOrigine: identiteClient.origine,
    clientSnapshotAt: (document.client_snapshot_at as string | null) ?? null,
    emailEnvoyeLe: null,
    entrepriseNom: (entreprise.nom as string | undefined) ?? "",
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
