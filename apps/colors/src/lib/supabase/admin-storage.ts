import "server-only";
import { createClient } from "@supabase/supabase-js";
import { urlSupabase } from "./cles";

export function createAdminStorageClient() {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) throw new Error("Configuration Storage serveur Colors absente");
  // La clé de service reste lue ici, et nulle part ailleurs : elle est serveur-only et ne doit
  // jamais rejoindre le module des variables publiques.
  return createClient(urlSupabase(),serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
}
