import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import {
  detecterMimeMediaDevis,
  DEVIS_MEDIA_NOMBRE_MAX,
  estMimeMediaDevis,
  mimeDetecteCompatible,
  nomMediaDevisSecurise,
  typeMediaDevis,
  validerMediaDevis,
} from "@/lib/devis-medias";
import { createClient } from "@/lib/supabase/server";
import { messageErreurUtilisateur } from "@/lib/erreurs-utilisateur";

type ContexteRoute = { params: Promise<{ id: string }> };
type PieceRequete = {
  path?: string;
  nom?: string;
  mime?: string;
  type?: string;
  taille?: number;
  legende?: string;
};

function erreur(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, { params }: ContexteRoute) {
  const { id: devisId } = await params;
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const body = await request.json().catch(() => null) as { pieces?: PieceRequete[] } | null;
  const pieces = Array.isArray(body?.pieces) ? body.pieces : [];
  if (pieces.length < 1 || pieces.length > DEVIS_MEDIA_NOMBRE_MAX) {
    return erreur("Ajoutez entre une et six pièces");
  }

  const { data: devis } = await supabase
    .from("devis")
    .select("id")
    .eq("id", devisId)
    .eq("entreprise_id", ctx.entrepriseId)
    .maybeSingle();
  if (!devis) return erreur("Devis inaccessible", 403);

  const { count: nombreExistant, error: countError } = await supabase
    .from("pieces_jointes_devis")
    .select("id", { count: "exact", head: true })
    .eq("devis_id", devisId)
    .eq("entreprise_id", ctx.entrepriseId);
  if (countError) return erreur("Les pièces existantes ne peuvent pas être vérifiées", 503);
  if ((nombreExistant ?? 0) + pieces.length > DEVIS_MEDIA_NOMBRE_MAX) {
    return erreur(`Un devis ne peut contenir que ${DEVIS_MEDIA_NOMBRE_MAX} photos ou explications vocales`);
  }

  const prefix = `${ctx.entrepriseId}/${devisId}/`;
  const chemins = pieces
    .map((piece) => piece.path)
    .filter((path): path is string => typeof path === "string" && path.startsWith(prefix));
  const valides: Array<{
    path: string;
    nom: string;
    mime: string;
    type: "image" | "audio";
    taille: number;
    legende: string | null;
  }> = [];

  for (const piece of pieces) {
    const path = piece.path?.trim() ?? "";
    const nom = piece.nom?.trim() ?? "";
    const mime = piece.mime?.trim() ?? "";
    const taille = Number(piece.taille ?? 0);
    const legende = piece.legende?.trim().slice(0, 1000) || null;
    const validation = validerMediaDevis({ nom, mime, taille });
    if (
      validation
      || !path.startsWith(prefix)
      || path.slice(prefix.length).includes("/")
      || !estMimeMediaDevis(mime)
      || piece.type !== typeMediaDevis(mime)
    ) {
      await supabase.storage.from("devis-medias").remove(chemins);
      return erreur(validation ?? "Pièce jointe incohérente");
    }

    const { data: fichier, error: downloadError } = await supabase.storage
      .from("devis-medias")
      .download(path);
    if (downloadError || !fichier || fichier.size !== taille) {
      await supabase.storage.from("devis-medias").remove(chemins);
      return erreur("Le fichier téléversé est incomplet ou introuvable");
    }
    const signature = new Uint8Array(await fichier.slice(0, 32).arrayBuffer());
    const detecte = detecterMimeMediaDevis(signature);
    if (!detecte || !mimeDetecteCompatible(mime, detecte)) {
      await supabase.storage.from("devis-medias").remove(chemins);
      return erreur("Le contenu du fichier ne correspond pas à son format");
    }
    valides.push({
      path,
      nom: nomMediaDevisSecurise(nom),
      mime,
      type: typeMediaDevis(mime),
      taille,
      legende,
    });
  }

  const { error } = await supabase.rpc("enregistrer_pieces_jointes_devis", {
    p_devis_id: devisId,
    p_pieces: valides,
  });
  if (error) {
    await supabase.storage.from("devis-medias").remove(chemins);
    return erreur(messageErreurUtilisateur("financeDevisPiecesJointes:rpc", error, "Les pièces jointes n’ont pas pu être enregistrées"), 500);
  }
  return NextResponse.json({ ok: true });
}
