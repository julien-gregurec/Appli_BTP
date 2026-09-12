import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  studioCookieAttributes,
  studioCookieOptions,
  supabaseConfig,
} from "./lib/config";
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  let response = NextResponse.next({ request: { headers } });
  const { url, key } = supabaseConfig();
  const client = createServerClient(url, key, {
    cookieOptions: studioCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values, cacheHeaders) => {
        for (const { name, value } of values) request.cookies.set(name, value);
        headers.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers } });
        for (const { name, value, options } of values)
          response.cookies.set(name, value, {
            ...options,
            ...studioCookieAttributes,
          });
        for (const [name, value] of Object.entries(cacheHeaders))
          response.headers.set(name, value);
      },
    },
  });
  await client.auth.getUser(); // Refresh only; pages and actions independently verify identity and membership.
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  if (process.env.NODE_ENV === "production")
    response.headers.set("Strict-Transport-Security", "max-age=31536000");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
