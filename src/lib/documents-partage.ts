import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BRAND } from "@/lib/brand";

// Accès externe (client, sans compte ELSATIA) à un devis/une facture par
// token. Le token n'est jamais stocké en clair : seule son empreinte SHA-256
// va en base (table acces_externes_documents). Voir
// supabase/migrations/20260812000200_documents_commerciaux_p9.sql pour le
// schéma et la fonction security definer de résolution.

const DUREE_VALIDITE_JOURS = 60;

export function genererTokenPartage(): string {
  return randomBytes(32).toString("base64url");
}

export function hacherTokenPartage(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type TypeDocumentPartage = "devis" | "facture";

// Révoque tout token actif existant pour ce document puis en émet un nouveau.
// Appelé avec le client Supabase authentifié de l'utilisateur (RLS standard :
// il doit être membre actif avec le droit de gérer devis/factures).
export async function obtenirNouveauTokenPartage(
  supabase: SupabaseClient,
  params: { entrepriseId: string; typeDocument: TypeDocumentPartage; documentId: string; creePar: string },
): Promise<string> {
  await supabase
    .from("acces_externes_documents")
    .update({ revoque_le: new Date().toISOString() })
    .eq("entreprise_id", params.entrepriseId)
    .eq("type_document", params.typeDocument)
    .eq("document_id", params.documentId)
    .is("revoque_le", null);

  const token = genererTokenPartage();
  const expireLe = new Date(Date.now() + DUREE_VALIDITE_JOURS * 24 * 3600 * 1000).toISOString();

  const { error } = await supabase.from("acces_externes_documents").insert({
    entreprise_id: params.entrepriseId,
    type_document: params.typeDocument,
    document_id: params.documentId,
    token_hash: hacherTokenPartage(token),
    cree_par: params.creePar,
    expire_le: expireLe,
  });
  if (error) throw new Error("Impossible de créer le lien d'accès sécurisé");

  return token;
}

export type ResolutionTokenPartage = { typeDocument: TypeDocumentPartage; documentId: string; entrepriseId: string };

// Résout un token en clair (reçu depuis l'URL publique) vers l'identité du
// document, via la fonction security definer côté base — jamais de lecture
// directe de acces_externes_documents ici. `supabase` peut être anonyme (page
// publique) : la fonction est accordée à `anon`.
export async function resoudreTokenPartage(supabase: SupabaseClient, token: string): Promise<ResolutionTokenPartage | null> {
  if (!token) return null;
  const { data, error } = await supabase.rpc("document_commercial_par_token", { p_token_hash: hacherTokenPartage(token) });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const ligne = Array.isArray(data) ? data[0] : data;
  if (!ligne?.document_id) return null;
  return { typeDocument: ligne.type_document, documentId: ligne.document_id, entrepriseId: ligne.entreprise_id };
}

export function urlDocumentPartage(token: string): string | null {
  if (!BRAND.urlPublique) return null;
  return new URL(`/document/${token}`, BRAND.urlPublique).toString();
}

// Page publique pure document (sans chrome), utilisée par Chromium pour
// générer le PDF — aussi bien pour le téléchargement externe que pour la
// pièce jointe des e-mails devis/facture.
export function urlImpressionPartage(token: string): string | null {
  if (!BRAND.urlPublique) return null;
  return new URL(`/imprimer/partage/${token}`, BRAND.urlPublique).toString();
}
