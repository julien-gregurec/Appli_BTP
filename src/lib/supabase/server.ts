import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { optionsCookieAuth } from "@/lib/security/cookies";

// Next.js 16 : cookies() est asynchrone.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, ...optionsCookieAuth() }),
            );
          } catch {
            // Appelé depuis un Server Component : ignoré, le proxy rafraîchit la session.
          }
        },
      },
    },
  );
}
