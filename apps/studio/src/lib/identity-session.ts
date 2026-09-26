import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { decideSession, identityMode, sessionAges, type SessionDecision, type SessionStatus } from "./identity-policy";
import { StudioAuthUnavailable } from "./verified-user";

/**
 * Contrôle serveur de la session Studio, après `auth.getUser()` : compte ELSATIA toujours actif,
 * session ouverte PAR le pont (pas un lien magique direct), âge dans les bornes. Une seule RPC,
 * exécutée avec les droits de l'utilisateur (aucune clé service dans le chemin des requêtes).
 */
export async function studioSessionDecision(
  client: SupabaseClient<Database>,
  navigation: boolean,
): Promise<SessionDecision> {
  if (identityMode() === "local") return { kind: "allow", access: "full" };
  const { soft, hard } = sessionAges();
  const { data, error } = await client.rpc("studio_identity_session_status", {
    p_soft_max_age_s: soft,
    p_hard_max_age_s: hard,
  });
  if (error) throw new StudioAuthUnavailable();
  return decideSession((data ?? { status: "anonymous" }) as SessionStatus, navigation);
}
