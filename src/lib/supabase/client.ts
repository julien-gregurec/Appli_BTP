import { createBrowserClient } from "@supabase/ssr";
import { optionsCookieAuth } from "@/lib/security/cookies";
import { clePubliqueSupabase } from "@/lib/supabase/keys";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    clePubliqueSupabase(),
    { cookieOptions: optionsCookieAuth() },
  );
}
