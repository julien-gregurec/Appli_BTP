import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Identité de la session, résolue SANS redirection.
 *
 * `getContexteReserves()` redirige vers /login quand la session manque : c'est le bon
 * comportement pour un écran, et le mauvais pour une route d'API. Un client hors-ligne
 * qui reçoit un 307 vers une page HTML ne peut pas le distinguer d'une réponse métier.
 *
 * Trois issues, et non deux. Confondre « pas de session » et « service d'authentification
 * injoignable » ferait annoncer « session expirée » à un utilisateur parfaitement
 * connecté dont le serveur a simplement mis trop de temps à répondre — il se
 * reconnecterait pour rien, et sa file resterait bloquée en échec alors qu'un simple
 * réessai suffisait.
 */
export type IdentiteSession = { entrepriseId: string; utilisateurId: string };

export type ResolutionIdentite =
  | { etat: "ok"; identite: IdentiteSession }
  | { etat: "anonyme" }
  | { etat: "indisponible"; motif: string };

/** Une panne de service se reconnaît au statut, jamais au message, qui est localisé. */
function estIndisponibilite(erreur: { status?: number } | null): boolean {
  if (!erreur) return false;
  if (typeof erreur.status === "number") return erreur.status >= 500 || erreur.status === 429;
  // Aucun statut : la requête n'a pas abouti du tout (réseau, délai dépassé).
  return true;
}

export async function resoudreIdentite(): Promise<ResolutionIdentite> {
  const supabase = await createClient();

  const { data: { user }, error: erreurAuth } = await supabase.auth.getUser();
  if (erreurAuth && estIndisponibilite(erreurAuth)) {
    return { etat: "indisponible", motif: "Service d’authentification injoignable." };
  }
  if (!user) return { etat: "anonyme" };

  const { data, error } = await supabase.rpc("contexte_application_courant").maybeSingle();
  if (error) {
    return estIndisponibilite(error as { status?: number })
      ? { etat: "indisponible", motif: "Contexte applicatif indisponible." }
      : { etat: "anonyme" };
  }
  const contexte = data as { utilisateur_id: string; entreprise_id: string | null } | null;

  // L'organisation active est exigée : une mutation appartient toujours à un tenant.
  if (!contexte || !contexte.entreprise_id || contexte.utilisateur_id !== user.id) {
    return { etat: "anonyme" };
  }
  return {
    etat: "ok",
    identite: { entrepriseId: contexte.entreprise_id, utilisateurId: user.id },
  };
}
