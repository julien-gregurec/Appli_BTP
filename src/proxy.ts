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
    // Le passage d'identité poste le jeton vers Studio : seule cette route l'autorise.
    formActionOrigins:
      request.nextUrl.pathname === "/identity/studio/handoff" && process.env.ELSATIA_STUDIO_EXCHANGE_URL
        ? [process.env.ELSATIA_STUDIO_EXCHANGE_URL]
        : [],
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);
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
  // L'exclusion par extension ne vaut que pour un fichier À LA RACINE
  // (`[^/]+`) : `.*\.png$` exemptait aussi `/<route dynamique>/<x>.png`, donc
  // une page rendue sans CSP ni contrôles du proxy. Les dossiers statiques
  // imbriqués de public/ sont listés nommément.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|guides/|videos/|icons/|demo/|[^/]+\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|mp3|wav|vtt|pdf|woff|woff2|ttf|txt)$).*)",
  ],
};
