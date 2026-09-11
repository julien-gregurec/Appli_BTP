import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identiteClientDocument, type ClientFicheMinimale, type OrigineIdentiteClient } from "@/lib/client-snapshot";
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

type LigneDocumentBrute = {
  designation: string;
  description: string | null;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  remise_ligne: number;
  taux_tva: number;
};

type PhotoDocumentBrute = { id: string; nom_original: string; legende: string | null };

type DevisBrut = {
  numero: string | null;
  statut: string;
  date_emission: string;
  date_validite: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  notes_client: string | null;
  email_envoye_le?: string | null;
  client_snapshot: unknown;
  client_snapshot_at: string | null;
};

type FactureBrute = Omit<DevisBrut, "date_validite"> & {
  type: string;
  date_echeance: string | null;
  entreprise_snapshot: unknown;
};

function versLignesImprimables(lignes: LigneDocumentBrute[] | null): LigneImprimable[] {
  return (lignes ?? []).map((l) => ({
    designation: l.designation,
    description: l.description,
    quantite: l.quantite,
    unite: l.unite,
    prix_unitaire_ht: l.prix_unitaire_ht,
    remise_ligne: l.remise_ligne,
    taux_tva: l.taux_tva,
  }));
}

function construireDonneesDevis(
  devis: DevisBrut,
  sources: {
    fiche: ClientFicheMinimale;
    lignes: LigneDocumentBrute[] | null;
    entreprise: EntrepriseEntete | null;
    signatures: SignatureImprimable[] | null;
    photos: PhotoDocumentBrute[] | null;
  },
): DonneesDocumentImprimable {
  // Un devis émis (numéroté) porte l'identité destinataire figée à ce moment-là ;
  // seul un brouillon reflète encore la fiche client courante.
  const identiteClient = identiteClientDocument({
    snapshot: devis.client_snapshot,
    fiche: sources.fiche,
    captureeLe: devis.client_snapshot_at,
  });

  return {
    typeDoc: "Devis",
    numero: devis.numero ?? "BROUILLON",
    dateEmission: devis.date_emission,
    dateSecondaire: devis.date_validite ? { label: "Valable jusqu'au", valeur: devis.date_validite } : null,
    entreprise: sources.entreprise ?? { nom: "" },
    client: identiteClient.entete,
    lignes: versLignesImprimables(sources.lignes),
    montantHt: devis.montant_ht,
    montantTva: devis.montant_tva,
    montantTtc: devis.montant_ttc,
    notesClient: devis.notes_client,
    estFacture: false,
    estAvoir: false,
    signatures: sources.signatures ?? [],
    photos: (sources.photos ?? []).map((p) => ({ id: p.id, nom: p.nom_original, legende: p.legende })),
    statut: devis.statut,
    clientEmail: identiteClient.email,
    clientOrigine: identiteClient.origine,
    clientSnapshotAt: devis.client_snapshot_at ?? null,
    emailEnvoyeLe: devis.email_envoye_le ?? null,
    entrepriseNom: sources.entreprise?.nom ?? "",
  };
}

function construireDonneesFacture(
  facture: FactureBrute,
  sources: {
    fiche: ClientFicheMinimale;
    lignes: LigneDocumentBrute[] | null;
    entrepriseCourante: EntrepriseEntete | null;
    signatures: SignatureImprimable[] | null;
  },
): DonneesDocumentImprimable {
  // Symétrique de entreprise_snapshot : une facture ou un avoir déjà émis garde
  // à vie l'identité du destinataire telle qu'elle était à l'émission.
  const identiteClient = identiteClientDocument({
    snapshot: facture.client_snapshot,
    fiche: sources.fiche,
    captureeLe: facture.client_snapshot_at,
  });
  const typeDoc = facture.type === "simple" ? "Facture" : `Facture — ${typeFactureLabel(facture.type)}`;
  // Une facture déjà émise garde à vie l'identité de l'entreprise telle qu'elle
  // était à ce moment-là (voir 20260812000200_documents_commerciaux_p9.sql) ;
  // seul un brouillon (jamais encore émis) reflète l'entreprise actuelle.
  const entreprise = facture.entreprise_snapshot
    ? entrepriseSnapshotVersEntete(facture.entreprise_snapshot as Record<string, unknown>)
    : (sources.entrepriseCourante ?? { nom: "" });

  return {
    typeDoc,
    numero: facture.numero ?? "BROUILLON",
    dateEmission: facture.date_emission,
    dateSecondaire: facture.date_echeance ? { label: "Échéance le", valeur: facture.date_echeance } : null,
    entreprise,
    client: identiteClient.entete,
    lignes: versLignesImprimables(sources.lignes),
    montantHt: facture.montant_ht,
    montantTva: facture.montant_tva,
    montantTtc: facture.montant_ttc,
    notesClient: facture.notes_client,
    estFacture: true,
    estAvoir: facture.type === "avoir",
    signatures: sources.signatures ?? [],
    photos: [],
    statut: facture.statut,
    clientEmail: identiteClient.email,
    clientOrigine: identiteClient.origine,
    clientSnapshotAt: facture.client_snapshot_at ?? null,
    emailEnvoyeLe: facture.email_envoye_le ?? null,
    entrepriseNom: sources.entrepriseCourante?.nom ?? "",
  };
}

export async function chargerDonneesDevisImprimable(
  supabase: SupabaseClient,
  params: { id: string; entrepriseId: string },
): Promise<DonneesDocumentImprimable | null> {
  const { data: devis } = await supabase
    .from("devis")
    .select(
      "id,numero,statut,date_emission,date_validite,montant_ht,montant_tva,montant_ttc,notes_client,email_envoye_le,email_envoye_a,client_snapshot,client_snapshot_at,client:clients!devis_client_id_fkey(nom,prenom,societe,email,adresse_facturation,code_postal,ville,siret)",
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
  return construireDonneesDevis(devis, { fiche: client, lignes, entreprise, signatures, photos });
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
  return construireDonneesFacture(facture, { fiche: client, lignes, entrepriseCourante, signatures });
}

type DocumentPartageBrut =
  | {
      type_document: "devis";
      document: DevisBrut;
      client: ClientFicheMinimale;
      lignes: LigneDocumentBrute[];
      entreprise: EntrepriseEntete | null;
      signatures: SignatureImprimable[];
      photos: PhotoDocumentBrute[];
    }
  | {
      type_document: "facture";
      document: FactureBrute;
      client: ClientFicheMinimale;
      lignes: LigneDocumentBrute[];
      entreprise: EntrepriseEntete | null;
      signatures: SignatureImprimable[];
      photos: PhotoDocumentBrute[];
    };

// Accès externe par jeton (client sans compte) : /document/[token] et
// /imprimer/partage/[token], donc aussi le PDF joint aux e-mails. Une seule
// fonction SECURITY DEFINER résout le jeton et ne renvoie que ce document,
// réduit aux champs imprimés (voir
// docs/migrations-proposees/document-partage-public-par-jeton-v1.sql.proposed).
// Appelée avec le client service_role, seul rôle autorisé à l'exécuter : depuis
// 20260902000255_acl_reconciliation_v1.sql ce rôle ne lit plus devis, factures,
// leurs lignes ni les clients, et n'obtient un document qu'avec son jeton.
export async function chargerDonneesDocumentPartage(
  supabase: SupabaseClient,
  token: string,
): Promise<DonneesDocumentImprimable | null> {
  if (!token) return null;
  const { data, error } = await supabase.rpc("document_commercial_public_par_token", { p_token: token });
  // Une panne (fonction absente, droit retiré) ne doit pas se déguiser en lien
  // introuvable : c'est exactement ce qui masquait la régression de la 255.
  if (error) throw new Error(`Lecture du document partagé impossible : ${error.message}`);
  const brut = data as DocumentPartageBrut | null;
  if (!brut) return null;

  if (brut.type_document === "devis") {
    return construireDonneesDevis(brut.document, {
      fiche: brut.client,
      lignes: brut.lignes,
      entreprise: brut.entreprise,
      signatures: brut.signatures,
      photos: brut.photos,
    });
  }
  if (brut.type_document === "facture") {
    return construireDonneesFacture(brut.document, {
      fiche: brut.client,
      lignes: brut.lignes,
      entrepriseCourante: brut.entreprise,
      signatures: brut.signatures,
    });
  }
  return null;
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
