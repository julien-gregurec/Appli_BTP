import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database";
import {
  studioCookieAttributes,
  studioCookieOptions,
  supabaseConfig,
} from "./config";
export async function createStudioClient() {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient<Database>(url, key, {
    cookieOptions: studioCookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          for (const { name, value, options } of values)
            store.set(name, value, { ...options, ...studioCookieAttributes });
        } catch {
          /* Server Component: refreshed cookies are written by proxy. */
        }
      },
    },
  });
}
