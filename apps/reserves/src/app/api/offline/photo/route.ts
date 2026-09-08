import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BUCKET_PHOTOS } from "@/lib/donnees";
import { MIMES_PHOTO, TAILLE_MAX_PHOTO } from "@/lib/images";
import { estCleIdempotence } from "@/lib/offline/contrat";
import { identiteCourante } from "@/lib/offline/identite";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Dépôt différé d'une photo de chantier.
 *
 * Corrige le P1 du lot V4 : `reserves_ajouter_photo()` acceptait déjà une clé
 * d'idempotence — et savait renvoyer la photo existante — mais AUCUN appelant ne la
 * transmettait. La protection était donc du code mort, et un double envoi créait deux
 * photos. Ici, l'identifiant de la mutation locale EST la clé.
 *
 * Le dépôt se fait en trois temps, comme le chemin en ligne : la base réserve la ligne et
 * compose le chemin, l'objet est téléversé, puis la base confirme. Ce qui change, c'est
 * que chacun de ces temps est REPRENABLE — une coupure au milieu ne laisse ni doublon,
 * ni photo fantôme qui satisferait à tort l'exigence de preuve à la levée.
 */
export async function POST(requete: Request) {
  const identite = await identiteCourante();
  if (!identite) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const formulaire = await requete.formData().catch(() => null);
  if (!formulaire) {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }

  const mutationId = String(formulaire.get("mutationId") ?? "");
  const reserveId = String(formulaire.get("reserveId") ?? "");
  const usage = String(formulaire.get("usage") ?? "constat");
  const legendeBrute = formulaire.get("legende");
  const legende = typeof legendeBrute === "string" && legendeBrute.trim() !== ""
    ? legendeBrute.trim() : null;
  const entrepriseId = String(formulaire.get("entrepriseId") ?? "");
  const utilisateurId = String(formulaire.get("utilisateurId") ?? "");

  if (!estCleIdempotence(mutationId) || !estCleIdempotence(reserveId)) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 400 });
  }

  // Cloisonnement : une photo préparée par A ne part jamais sous la session de B.
  if (entrepriseId !== identite.entrepriseId || utilisateurId !== identite.utilisateurId) {
    return NextResponse.json({
      issue: "refus",
      motif: "Cette photo a été préparée sous une autre identité : elle ne peut pas être "
           + "envoyée depuis cette session.",
    }, { status: 403 });
  }

  const fichier = formulaire.get("photo");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return NextResponse.json({ issue: "refus", motif: "Aucun fichier reçu." }, { status: 400 });
  }
  if (!(MIMES_PHOTO as readonly string[]).includes(fichier.type)) {
    const motif = fichier.type === "image/heic" || fichier.type === "image/heif"
      ? "Le format HEIC n’est pas pris en charge. Réglez l’appareil photo sur « Le plus compatible »."
      : `Format non pris en charge (${fichier.type || "inconnu"}).`;
    return NextResponse.json({ issue: "refus", motif }, { status: 415 });
  }
  if (fichier.size > TAILLE_MAX_PHOTO) {
    return NextResponse.json({ issue: "refus", motif: "Fichier trop volumineux." }, { status: 413 });
  }

  const supabase = await createClient();

  // 1. Réservation de la ligne et du chemin. Sur un rejeu, la base renvoie la MÊME photo :
  //    c'est ce qui rend le double envoi inoffensif.
  const { data, error } = await supabase
    .rpc("reserves_ajouter_photo", {
      p_reserve_id: reserveId,
      p_usage: usage,
      p_legende: legende,
      p_mime_type: fichier.type,
      p_taille_octets: fichier.size,
      p_nom_fichier: fichier.name || "photo.jpg",
      p_origine_client_id: mutationId,
    })
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({
      issue: "refus", motif: error?.message ?? "Photo refusée.",
    }, { status: 409 });
  }
  const { photo_id: photoId, storage_path: chemin } = data as {
    photo_id: string; storage_path: string;
  };

  // 2. Téléversement. `upsert: true` est ici le comportement JUSTE, et non un laxisme :
  //    le chemin a été composé par la base à partir de la clé d'idempotence, donc écrire
  //    deux fois signifie forcément « même photo, même mutation ». Sans lui, une reprise
  //    après coupure échouerait sur « l'objet existe déjà » alors que tout va bien.
  const { error: erreurDepot } = await supabase.storage
    .from(BUCKET_PHOTOS)
    .upload(chemin, fichier, { contentType: fichier.type, upsert: true });

  if (erreurDepot) {
    // La ligne reste en attente (`disponible_at` nul) : elle n'apparaît dans aucun export
    // et le client conservera sa copie locale. Le rejeu reprendra au même point.
    return NextResponse.json({
      issue: "echec",
      motif: "Le téléversement a été interrompu. La photo reste sur l’appareil et sera renvoyée.",
    }, { status: 503 });
  }

  // 3. Confirmation : c'est elle seule qui rend la photo visible.
  const { error: erreurConfirmation } = await supabase.rpc("reserves_confirmer_photo", {
    p_photo_id: photoId,
  });
  if (erreurConfirmation) {
    return NextResponse.json({
      issue: "echec", motif: erreurConfirmation.message,
    }, { status: 503 });
  }

  return NextResponse.json(
    { issue: "applique", identifiant: photoId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
