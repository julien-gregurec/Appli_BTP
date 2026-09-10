import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estCleIdempotence } from "@/lib/mobile/offline/contrat";
import { resoudreIdentite } from "@/lib/mobile/offline/identite-serveur";

export const runtime = "nodejs";

/**
 * Ce justificatif a-t-il déjà été déposé sous cette note ?
 *
 * C'est ce qui rend le dépôt IDEMPOTENT sans migration. `documents_notes_frais` ne porte
 * aucune contrainte d'unicité sur (note, empreinte) : rejouer la route de dépôt créerait un
 * second document identique. Et `existe_doublon_note_frais` ne répond pas à cette question —
 * il EXCLUT la note courante, parce qu'il cherche les doublons ailleurs dans l'entreprise.
 *
 * Mêmes principes que la route de rejeu :
 *   — aucun droit nouveau : lecture sous la session, donc sous `peut_consulter_note_frais` ;
 *   — l'identité déclarée par l'appareil doit être EXACTEMENT celle de la session ;
 *   — une panne de service répond 503, jamais 401, pour ne pas faire croire à une session
 *     expirée.
 *
 * La route ne dépose rien. Le dépôt reste l'affaire de `/api/notes-frais/upload`, unique
 * chemin d'import (empreinte, horodatage, archivage renforcé, audit) : un second chemin
 * finirait par diverger du premier, et ce sont les pièces comptables qui en paieraient le prix.
 */
export async function GET(requete: Request) {
  const resolution = await resoudreIdentite();
  if (resolution.etat === "indisponible") return NextResponse.json({ erreur: resolution.motif }, { status: 503 });
  if (resolution.etat === "anonyme") return NextResponse.json({ erreur: "Session absente ou expirée." }, { status: 401 });
  const { identite } = resolution;

  const url = new URL(requete.url);
  const noteId = url.searchParams.get("note_id") ?? "";
  const empreinte = (url.searchParams.get("empreinte") ?? "").toLowerCase();
  const entrepriseId = url.searchParams.get("entreprise_id") ?? "";
  const utilisateurId = url.searchParams.get("utilisateur_id") ?? "";

  if (!estCleIdempotence(noteId)) return NextResponse.json({ erreur: "Note invalide." }, { status: 400 });
  if (!/^[0-9a-f]{64}$/.test(empreinte)) return NextResponse.json({ erreur: "Empreinte invalide." }, { status: 400 });

  // Une saisie préparée par A n'est jamais interrogée — ni envoyée — sous la session de B.
  if (entrepriseId !== identite.entrepriseId || utilisateurId !== identite.utilisateurId) {
    return NextResponse.json(
      { erreur: "Ce justificatif a été préparé sous un autre compte." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents_notes_frais")
    .select("id")
    .eq("entreprise_id", identite.entrepriseId)
    .eq("note_frais_id", noteId)
    .eq("empreinte_sha256_originale", empreinte)
    .limit(1);

  if (error) return NextResponse.json({ erreur: "Vérification impossible." }, { status: 503 });
  const document = data?.[0];
  return NextResponse.json({ present: Boolean(document), documentId: document?.id ?? null });
}
