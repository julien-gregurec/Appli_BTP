import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client de service. Réservé à la distribution des notifications, qui traverse par nature
 * les organisations : préparer les envois du parc entier ne peut pas se faire sous la
 * session d'un utilisateur. Les fonctions appelées avec ce client sont, côté base,
 * exécutables par le seul rôle `service_role` (migration 00270, section 13).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("Configuration serveur Supabase incomplète");
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
