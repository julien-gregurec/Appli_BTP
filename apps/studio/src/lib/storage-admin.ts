import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";
// Privileged credential confined to the server. Callers first authorize an asset by RLS.
export function storageAdmin() {
  const key = process.env.STUDIO_STORAGE_SERVICE_KEY;
  if (!key) throw new Error("Stockage Studio non configuré.");
  return createClient(supabaseConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export const STUDIO_BUCKET = "studio-originals";
export const PREVIEW_SECONDS = 60;
