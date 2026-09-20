import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  studioCookieAttributes,
  studioCookieOptions,
  studioEnabled,
  supabaseConfig,
} from "./lib/config";
const suspendedHeaders = {
  "Cache-Control": "no-store",
  "Retry-After": "300",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
};
const suspendedPage =
  '<!doctype html><html lang="fr"><meta charset="utf-8">' +
  "<title>ELSATIA Studio</title>" +
  '<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">' +
  "<h1>Service temporairement indisponible</h1>" +
  "<p>ELSATIA Studio est en maintenance. Vos projets et vos médias sont conservés. Réessayez dans quelques minutes.</p>" +
  "</body></html>";
function suspended(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/"))
    return Response.json(
      { error: "ELSATIA Studio est temporairement indisponible." },
      { status: 503, headers: suspendedHeaders },
    );
  return new Response(
    suspendedPage,
    {
      status: 503,
      headers: {
        ...suspendedHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}
export async function proxy(request: NextRequest) {
  if (!studioEnabled()) return suspended(request);
  const storageOrigin = new URL(supabaseConfig().url).origin;
  const directOrigin = storageOrigin.replace(
    /\.supabase\.co$/,
    ".storage.supabase.co",
  );
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${storageOrigin}; media-src 'self' ${storageOrigin}; font-src 'self'; connect-src 'self' ${storageOrigin} ${directOrigin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
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
  // Thumbnails are private but browser-cacheable (they set their own Cache-Control); all else is uncacheable.
  if (!request.nextUrl.pathname.endsWith("/thumbnail"))
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
