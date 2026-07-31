import { createBrowserClient } from "@supabase/ssr";
import { optionsCookieAuth } from "@/lib/security/cookies";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: optionsCookieAuth() },
  );
}
