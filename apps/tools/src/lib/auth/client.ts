import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { secureSessionStorage } from "./secure-storage";

let client: SupabaseClient | null = null;

export function isElsatiaAccountConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function getElsatiaClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Le compte ELSATIA n’est pas configuré dans cet environnement.");
  client = createClient(url, publishableKey, {
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
