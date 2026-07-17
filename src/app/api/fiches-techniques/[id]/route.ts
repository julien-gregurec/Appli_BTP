import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteEntreprise } from "@/lib/entreprise";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: fiche } = await supabase
    .from("fiches_techniques_articles")
    .select("nom_original,storage_path")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!fiche) return NextResponse.json({ error: "Fiche technique introuvable" }, { status: 404 });

  const telecharger = new URL(request.url).searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from("fiches-techniques")
    .createSignedUrl(fiche.storage_path, 60, telecharger ? { download: fiche.nom_original } : undefined);
  if (error || !data) return NextResponse.json({ error: "Téléchargement indisponible" }, { status: 503 });
  return NextResponse.redirect(data.signedUrl);
}
