import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  estMimeMediaDevis,
  extensionMediaDevis,
  typeMediaDevis,
  validerMediaDevis,
} from "@/lib/devis-medias";
import { createClient } from "@/lib/supabase/server";

type ContexteRoute = { params: Promise<{ id: string }> };

function erreur(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, { params }: ContexteRoute) {
  const { id: devisId } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const body = await request.json().catch(() => null) as {
    nom?: string;
    mime?: string;
    taille?: number;
  } | null;
  const nom = body?.nom?.trim() ?? "";
  const mime = body?.mime?.trim() ?? "";
  const taille = Number(body?.taille ?? 0);
  const validation = validerMediaDevis({ nom, mime, taille });
  if (validation || !estMimeMediaDevis(mime)) return erreur(validation ?? "Format invalide");

  const { data: devis } = await supabase
    .from("devis")
    .select("id")
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!devis) return erreur("Devis inaccessible", 403);

  const path = `${ctx.entrepriseId}/${devisId}/${crypto.randomUUID()}.${extensionMediaDevis(mime)}`;
  const { data, error } = await supabase.storage
    .from("devis-medias")
    .createSignedUploadUrl(path);
  if (error || !data) return erreur("Le téléversement ne peut pas être préparé", 503);

  return NextResponse.json({ path, token: data.token, type: typeMediaDevis(mime) });
}

export async function DELETE(request: Request, { params }: ContexteRoute) {
  const { id: devisId } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const body = await request.json().catch(() => null) as { paths?: string[] } | null;
  const prefix = `${ctx.entrepriseId}/${devisId}/`;
  const paths = Array.isArray(body?.paths)
    ? body.paths.filter((path) => typeof path === "string" && path.startsWith(prefix)).slice(0, 6)
    : [];
  if (paths.length) await supabase.storage.from("devis-medias").remove(paths);
  return NextResponse.json({ ok: true });
}
