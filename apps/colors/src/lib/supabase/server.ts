import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clePubliqueSupabase, urlSupabase } from "./cles";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    urlSupabase(),
    clePubliqueSupabase(),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Un Server Component ne peut pas écrire les cookies ; le proxy les rafraîchit.
          }
        },
      },
    },
  );
}
