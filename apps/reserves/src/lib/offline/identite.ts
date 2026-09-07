import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Identité de la session, résolue SANS redirection.
 *
 * `getContexteReserves()` redirige vers /login quand la session manque : c'est le bon
 * comportement pour un écran, et le mauvais pour une route d'API. Un client hors-ligne
 * qui reçoit un 307 vers une page HTML ne peut pas le distinguer d'une réponse métier —
 * il classerait un simple « session expirée » en échec définitif, et abandonnerait des
 * mutations parfaitement valides. Ici, l'absence de session est une valeur de retour.
 */
export type IdentiteSession = { entrepriseId: string; utilisateurId: string };

export async function identiteCourante(): Promise<IdentiteSession | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("contexte_application_courant").maybeSingle();
  if (error) return null;
  const contexte = data as
    { utilisateur_id: string; entreprise_id: string | null } | null;

  // L'organisation active est exigée : une mutation appartient toujours à un tenant, et
  // une session sans organisation ne peut donc en rejouer aucune.
  if (!contexte || !contexte.entreprise_id || contexte.utilisateur_id !== user.id) return null;
  return { entrepriseId: contexte.entreprise_id, utilisateurId: user.id };
}
