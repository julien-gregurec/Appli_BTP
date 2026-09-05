import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brevoEstConfigure, envoyerEmailBrevo } from "@/lib/brevo";
import { contenuEmailDocument, corpsHtmlEmailDocument } from "@/lib/email";
import { chargerDonneesDevisImprimable, chargerDonneesFactureImprimable } from "@/lib/documents-commerciaux";
import { genererPdfDepuisUrl, nomFichierPdf } from "@/lib/pdf/generer";
import { obtenirNouveauTokenPartage, urlDocumentPartage, urlImpressionPartage } from "@/lib/documents-partage";

// Au-delà de cette taille, on n'attache plus le PDF (l'e-mail resterait
// bloqué par Brevo) : le lien sécurisé /document/[token] reste toujours
// présent et suffit à consulter/télécharger le document.
const TAILLE_MAX_PIECE_JOINTE_OCTETS = 8 * 1024 * 1024;

type TypeDocument = "devis" | "facture";

export async function envoyerDocumentCommercialParEmail(
  supabase: SupabaseClient,
  params: {
    entrepriseId: string;
    entrepriseNom: string;
    prenomEmetteur: string | null;
    userId: string;
    typeDocument: TypeDocument;
    documentId: string;
    complementCorps?: string;
  },
): Promise<{ error: string } | { ok: true }> {
  const donnees =
    params.typeDocument === "devis"
      ? await chargerDonneesDevisImprimable(supabase, { id: params.documentId, entrepriseId: params.entrepriseId })
      : await chargerDonneesFactureImprimable(supabase, { id: params.documentId, entrepriseId: params.entrepriseId });
  if (!donnees) return { error: `${params.typeDocument === "devis" ? "Devis" : "Facture"} introuvable` };

  if (!brevoEstConfigure()) return { error: "L'envoi automatique par e-mail n'est pas encore configuré" };

  const email = contenuEmailDocument({
    typeDoc: params.typeDocument === "facture" && donnees.estAvoir ? "avoir" : params.typeDocument,
    numero: donnees.numero,
    client: { nom: donnees.client.nom_affiche, prenom: null, societe: null, email: donnees.clientEmail },
    montantTtc: Number(donnees.montantTtc),
    entrepriseNom: params.entrepriseNom,
    prenomEmetteur: params.prenomEmetteur,
  });
  if (!email) return { error: "Ce client n'a pas d'adresse e-mail renseignée" };
  const corpsComplet = params.complementCorps ? `${email.corps}\n\n${params.complementCorps}` : email.corps;

  let token: string;
  try {
    token = await obtenirNouveauTokenPartage(supabase, {
      entrepriseId: params.entrepriseId,
      typeDocument: params.typeDocument,
      documentId: params.documentId,
      creePar: params.userId,
    });
  } catch {
    return { error: "Impossible de créer le lien d'accès sécurisé" };
  }
  const lien = urlDocumentPartage(token);
  const urlImpression = urlImpressionPartage(token);

  // Le PDF joint est généré via la même page publique que le lien de
  // consultation (/imprimer/partage/[token]) : un seul mécanisme pour les
  // deux usages, jamais de rendu dupliqué.
  let pdf: Buffer | null = null;
  if (urlImpression) {
    try {
      pdf = await genererPdfDepuisUrl(urlImpression);
    } catch {
      pdf = null; // Le lien de consultation reste envoyé même si la PJ échoue.
    }
  }

  try {
    await envoyerEmailBrevo({
      to: email.to,
      sujet: email.sujet,
      texte: corpsComplet,
      html: corpsHtmlEmailDocument(corpsComplet, lien),
      piecesJointes:
        pdf && pdf.byteLength <= TAILLE_MAX_PIECE_JOINTE_OCTETS
          ? [{ nom: nomFichierPdf(donnees.estFacture, donnees.numero), contenuBase64: pdf.toString("base64") }]
          : undefined,
    });
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Envoi de l'e-mail impossible" };
  }

  const table = params.typeDocument === "devis" ? "devis" : "factures";
  await supabase
    .from(table)
    .update({ email_envoye_le: new Date().toISOString(), email_envoye_a: email.to })
    .eq("id", params.documentId)
    .eq("entreprise_id", params.entrepriseId);

  return { ok: true };
}
