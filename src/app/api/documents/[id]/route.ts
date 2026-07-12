import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: document } = await supabase.from("documents_chantier")
    .select("nom, storage_path").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  const { data, error } = await supabase.storage.from("chantier-documents")
    .createSignedUrl(document.storage_path, 60, { download: document.nom });
  if (error || !data) return NextResponse.json({ error: "Téléchargement indisponible" }, { status: 503 });
  return NextResponse.redirect(data.signedUrl);
}
