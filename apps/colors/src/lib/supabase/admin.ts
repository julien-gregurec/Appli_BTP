import "server-only";
import { createClient } from "@supabase/supabase-js";

// Client service_role réservé aux vérifications serveur qui ne peuvent pas
// s'appuyer sur la session utilisateur (compteur anti-bruteforce du second
// facteur). Ne jamais l'exposer au navigateur.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("Configuration serveur Colors incomplète");
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
}
