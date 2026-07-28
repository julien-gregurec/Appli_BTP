import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  estMimeMediaMessagerie,
  extensionMediaMessagerie,
  typeMediaMessagerie,
  validerMediaMessagerie,
} from "@/lib/messagerie-medias";
import { createClient } from "@/lib/supabase/server";

type DemandePreparation = {
  conversationId?: string;
  nom?: string;
  mime?: string;
  taille?: number;
};

function erreur(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const body = await request.json().catch(() => null) as DemandePreparation | null;
  const conversationId = body?.conversationId?.trim() ?? "";
  const nom = body?.nom?.trim() ?? "";
  const mime = body?.mime?.trim() ?? "";
  const taille = Number(body?.taille ?? 0);
  const validation = validerMediaMessagerie({ nom, mime, taille });
  if (!conversationId || validation || !estMimeMediaMessagerie(mime)) {
    return erreur(validation ?? "Conversation manquante");
  }

  const { data: conversation } = await supabase
    .from("conversations_internes")
    .select("id")
    .eq("id", conversationId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!conversation) return erreur("Conversation inaccessible", 403);

  const type = typeMediaMessagerie(mime);
  const extension = extensionMediaMessagerie(mime);
  const path = `${ctx.entrepriseId}/${conversationId}/${crypto.randomUUID()}.${extension}`;
  const { data, error: storageError } = await supabase.storage
    .from("messagerie-medias")
    .createSignedUploadUrl(path);
  if (storageError || !data) return erreur("Le téléversement ne peut pas être préparé", 503);

  return NextResponse.json({ path, token: data.token, type });
}

export async function DELETE(request: Request) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const body = await request.json().catch(() => null) as {
    conversationId?: string;
    paths?: string[];
  } | null;
  const conversationId = body?.conversationId?.trim() ?? "";
  const prefix = `${ctx.entrepriseId}/${conversationId}/`;
  const paths = Array.isArray(body?.paths)
    ? body.paths.filter((path) => typeof path === "string" && path.startsWith(prefix)).slice(0, 5)
    : [];
  if (!conversationId || paths.length === 0) return NextResponse.json({ ok: true });

  const { data: conversation } = await supabase
    .from("conversations_internes")
    .select("id")
    .eq("id", conversationId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!conversation) return erreur("Conversation inaccessible", 403);
  await supabase.storage.from("messagerie-medias").remove(paths);
  return NextResponse.json({ ok: true });
}
