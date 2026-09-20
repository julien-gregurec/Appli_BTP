import { NextResponse } from "next/server";
import { logErreur, logWarn } from "@/lib/observability/logger";

type ErreurStorage = { status?: number; statusCode?: string; message?: string } | null | undefined;

// Sans ceci, une signature/download Storage en échec devenait systématiquement un 503
// générique : un fichier réellement absent (déjà supprimé, chemin invalide) était
// indiscernable d'une vraie panne réseau/service Supabase Storage.
function estObjetIntrouvable(erreur: ErreurStorage): boolean {
  if (!erreur) return false;
  if (erreur.status === 404) return true;
  const code = erreur.statusCode?.toString().toLowerCase();
  return code === "404" || code === "not_found" || code === "nosuchkey" || code === "object_not_found";
}

export function reponseErreurStorage(
  erreur: ErreurStorage,
  messagesPublics: { introuvable: string; indisponible: string },
  contexte: { requestId?: string; route?: string; operation?: string },
) {
  if (estObjetIntrouvable(erreur)) {
    logWarn("storage", "Objet de stockage introuvable (404 métier)", contexte);
    return NextResponse.json({ error: messagesPublics.introuvable }, { status: 404 });
  }
  logErreur("storage", "Échec Storage (service indisponible ou erreur réseau)", contexte, erreur?.message);
  return NextResponse.json({ error: messagesPublics.indisponible }, { status: 503 });
}
