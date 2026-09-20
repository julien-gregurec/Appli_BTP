import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { reponseErreurStorage } from "@/lib/observability/storage-error";
import { obtenirIdCorrelation } from "@/lib/observability/request-id";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = obtenirIdCorrelation(request);
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: document } = await supabase.from("documents_chantier")
    .select("nom, storage_path").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  const telecharger = new URL(request.url).searchParams.get("download") === "1";
  const { data, error } = await supabase.storage.from("chantier-documents")
    .createSignedUrl(document.storage_path, 60, telecharger ? { download: document.nom } : undefined);
  if (error || !data) {
    return reponseErreurStorage(error, { introuvable: "Document introuvable", indisponible: "Téléchargement indisponible" }, { requestId, route: "/api/documents/[id]", operation: "createSignedUrl" });
  }
  return NextResponse.redirect(data.signedUrl);
}
