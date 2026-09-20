import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { secureSessionStorage } from "./secure-storage";

let client: SupabaseClient | null = null;

/**
 * Nom courant de la clé publique : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, comme Gestion Pro et
 * Colors. L'ancien `NEXT_PUBLIC_SUPABASE_ANON_KEY` reste accepté en TRANSITION pour ne pas
 * casser un déploiement déjà configuré ; il n'est lu qu'en repli. Les deux lectures sont
 * littérales : Next ne remplace que `process.env.NEXT_PUBLIC_X`, et cette valeur est figée au build.
 */
function clePubliqueSupabase() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function isElsatiaAccountConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && clePubliqueSupabase());
}

export function getElsatiaClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = clePubliqueSupabase();
  if (!url || !anonKey) throw new Error("Le compte ELSATIA n’est pas configuré dans cet environnement.");
  client = createClient(url, anonKey, {
    auth: {
      storage: secureSessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}
