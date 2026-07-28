import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  detecterMimeMediaMessagerie,
  estMimeMediaMessagerie,
  MESSAGERIE_MEDIA_NOMBRE_MAX,
  mimeDetecteCompatible,
  nomMediaMessagerieSecurise,
  typeMediaMessagerie,
  validerMediaMessagerie,
} from "@/lib/messagerie-medias";
import { createClient } from "@/lib/supabase/server";

type PieceRequete = {
  path?: string;
  nom?: string;
  mime?: string;
  type?: string;
  taille?: number;
};

function erreur(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const body = await request.json().catch(() => null) as {
    conversationId?: string;
    contenu?: string;
    pieces?: PieceRequete[];
  } | null;
  const conversationId = body?.conversationId?.trim() ?? "";
  const contenu = body?.contenu?.trim() ?? "";
  const pieces = Array.isArray(body?.pieces) ? body.pieces : [];
  if (!conversationId || pieces.length < 1 || pieces.length > MESSAGERIE_MEDIA_NOMBRE_MAX) {
    return erreur("Ajoutez entre une et cinq photos ou vidéos");
  }
  if (contenu.length > 5000) return erreur("Le message dépasse 5 000 caractères");

  const { data: conversation } = await supabase
    .from("conversations_internes")
    .select("id")
    .eq("id", conversationId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!conversation) return erreur("Conversation inaccessible", 403);

  const prefix = `${ctx.entrepriseId}/${conversationId}/`;
  const valides: Array<{
    path: string;
    nom: string;
    mime: string;
    type: "image" | "video";
    taille: number;
  }> = [];
  const chemins = pieces
    .map((piece) => piece.path)
    .filter((path): path is string => typeof path === "string" && path.startsWith(prefix));

  for (const piece of pieces) {
    const path = piece.path?.trim() ?? "";
    const nom = piece.nom?.trim() ?? "";
    const mime = piece.mime?.trim() ?? "";
    const taille = Number(piece.taille ?? 0);
    const validation = validerMediaMessagerie({ nom, mime, taille });
    if (validation || !path.startsWith(prefix) || path.slice(prefix.length).includes("/")) {
      await supabase.storage.from("messagerie-medias").remove(chemins);
      return erreur(validation ?? "Chemin de stockage invalide");
    }
    if (!estMimeMediaMessagerie(mime) || piece.type !== typeMediaMessagerie(mime)) {
      await supabase.storage.from("messagerie-medias").remove(chemins);
      return erreur("Type de média incohérent");
    }

    const { data: fichier, error: downloadError } = await supabase.storage
      .from("messagerie-medias")
      .download(path);
    if (downloadError || !fichier || fichier.size !== taille) {
      await supabase.storage.from("messagerie-medias").remove(chemins);
      return erreur("Le fichier téléversé est incomplet ou introuvable");
    }
    const signature = new Uint8Array(await fichier.slice(0, 32).arrayBuffer());
    const mimeDetecte = detecterMimeMediaMessagerie(signature);
    if (!mimeDetecte || !mimeDetecteCompatible(mime, mimeDetecte)) {
      await supabase.storage.from("messagerie-medias").remove(chemins);
      return erreur("Le contenu du fichier ne correspond pas à son format");
    }
    valides.push({
      path,
      nom: nomMediaMessagerieSecurise(nom),
      mime,
      type: typeMediaMessagerie(mime),
      taille,
    });
  }

  const { data: messageId, error: publicationError } = await supabase.rpc(
    "publier_message_avec_pieces",
    {
      p_conversation_id: conversationId,
      p_contenu: contenu,
      p_pieces: valides,
    },
  );
  if (publicationError || !messageId) {
    await supabase.storage.from("messagerie-medias").remove(chemins);
    return erreur(publicationError?.message ?? "Le message n’a pas pu être publié", 500);
  }
  return NextResponse.json({ ok: true, messageId });
}
