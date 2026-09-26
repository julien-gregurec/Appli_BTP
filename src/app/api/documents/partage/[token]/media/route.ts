import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Sert les photos/signatures affichées sur un document commercial partagé
// (/document/[token], /imprimer/partage/[token]) : ces pages n'ont pas de
// session, donc les routes authentifiées habituelles (/api/devis/pieces-
// jointes/[id], /api/employes/[id]/signature) leur renvoient 401/redirigent
// vers /login — l'image ne charge jamais (GP-EXTERNAL-PILOT-CLOSURE-V1,
// mission §9, finding confirmé). Résolution scopée par LE MÊME jeton que la
// page elle-même (document_partage_media_path, security definer, service_role
// seul) : aucun fichier interne n'est rendu public au-delà de ce document précis.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recherche = new URL(request.url).searchParams;
  const type = recherche.get("type");
  const id = recherche.get("id");
  if ((type !== "photo" && type !== "signature") || !id) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("document_partage_media_path", {
    p_token: token,
    p_type: type,
    p_media_id: id,
  });
  if (error || !data) {
    return NextResponse.json({ error: "Lien invalide, expiré, ou média introuvable" }, { status: 404 });
  }

  const { data: signee, error: erreurSignature } = await admin.storage
    .from((data as { bucket: string; storage_path: string }).bucket)
    .createSignedUrl((data as { bucket: string; storage_path: string }).storage_path, 300);
  if (erreurSignature || !signee?.signedUrl) {
    return NextResponse.json({ error: "Le fichier ne peut pas être ouvert" }, { status: 503 });
  }
  return NextResponse.redirect(signee.signedUrl);
}
