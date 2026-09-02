import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { secureSessionStorage } from "./secure-storage";

let client: SupabaseClient | null = null;

export function isElsatiaAccountConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getElsatiaClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
