import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

type ContexteRoute = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: ContexteRoute) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: piece } = await supabase
    .from("pieces_jointes_devis")
    .select("storage_path,nom_original,mime_type")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!piece) return NextResponse.json({ error: "Pièce jointe inaccessible" }, { status: 404 });

  const url = new URL(request.url);
  const telecharger = url.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from("devis-medias")
    .createSignedUrl(piece.storage_path, 300, telecharger
      ? { download: piece.nom_original }
      : undefined);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Le fichier ne peut pas être ouvert" }, { status: 503 });
  }
  return NextResponse.redirect(data.signedUrl);
}
