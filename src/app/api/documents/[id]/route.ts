import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { estUuid } from "@/lib/security/validation";
import { urlExterneAutorisee } from "@/lib/security/redirects";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!estUuid(id)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: document } = await supabase.from("documents_chantier")
    .select("nom, storage_path").eq("id", id).eq("entreprise_id", ctx.entrepriseId).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  const telecharger = new URL(request.url).searchParams.get("download") === "1";
  const { data, error } = await supabase.storage.from("chantier-documents")
    .createSignedUrl(document.storage_path, 60, telecharger ? { download: document.nom } : undefined);
  if (error || !data) return NextResponse.json({ error: "Téléchargement indisponible" }, { status: 503 });
  const hoteSupabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
  if (!urlExterneAutorisee(data.signedUrl, [hoteSupabase])) {
    return NextResponse.json({ error: "Téléchargement indisponible" }, { status: 503 });
  }
  return NextResponse.redirect(data.signedUrl);
}
