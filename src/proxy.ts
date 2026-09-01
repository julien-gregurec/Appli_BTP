import { NextRequest, type NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { construireContentSecurityPolicy, headersSecurite } from "@/lib/security/headers";

// Next.js 16 a renommé "middleware" en "proxy" (même mécanisme).
export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = construireContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV !== "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);
  // Transmis aux Server Components (via next/headers) pour un routage ponctuel
  // fondé sur le chemin courant (ex. admin plateforme sans entreprise cliente) ;
  // ne remplace aucun contrôle d'accès existant, purement indicatif.
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const requeteSecurisee = new NextRequest(request, { headers: requestHeaders });
  const response: NextResponse = await updateSession(requeteSecurisee);
  response.headers.set("Content-Security-Policy", csp);
  for (const { key, value } of headersSecurite(process.env.NODE_ENV === "production")) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  // Les fichiers servis tels quels n'ont aucune règle d'accès à appliquer :
  // les exclure évite un aller-retour d'authentification vers Supabase pour
  // chacun. Le manuel (9,7 Mo) et les vidéos (20 Mo) le payaient à chaque
  // téléchargement.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|guides/|videos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|mp3|wav|vtt|pdf|woff|woff2|ttf|txt)$).*)",
  ],
};
