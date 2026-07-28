import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: piece } = await supabase
    .from("pieces_jointes_messages")
    .select("nom_original,storage_path")
    .eq("id", id)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!piece) return NextResponse.json({ error: "Pièce jointe introuvable" }, { status: 404 });

  const telecharger = new URL(request.url).searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from("messagerie-medias")
    .createSignedUrl(
      piece.storage_path,
      300,
      telecharger ? { download: piece.nom_original } : undefined,
    );
  if (error || !data) {
    return NextResponse.json({ error: "Média temporairement indisponible" }, { status: 503 });
  }
  return NextResponse.redirect(data.signedUrl);
}
