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
  //
  // `sw.js` a été ajouté après MESURE, pas par précaution : servi par le proxy, il
  // répondait 307 vers /login. L'extension `.js` ne figure pas dans la liste ci-dessous,
  // et rien d'autre ne le couvrait. Un service worker qui reçoit une page HTML au lieu de
  // son script ne s'enregistre pas — et l'échec est silencieux, puisque l'appel
  // `navigator.serviceWorker.register()` est déjà entouré d'un `.catch()`. L'application
  // perdait donc son hors-ligne sans le dire dès que la session manquait ou expirait.
  // `manifest.webmanifest` était exclu pour exactement cette raison ; `sw.js` ne l'était pas.
  //
  // `.well-known/` doit être exclu pour une raison plus forte qu'une économie de
  // requête : ces fichiers sont récupérés par des ROBOTS SANS SESSION — la CDN
  // d'Apple pour `apple-app-site-association`, celle de Google pour
  // `assetlinks.json`. Passés par le proxy, ils recevraient une redirection 307
  // vers /login, et l'association d'application échouerait sans message d'erreur
  // exploitable. Apple met de surcroît le résultat en cache, ce qui rend le
  // symptôme durable et déroutant.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|\\.well-known/|guides/|videos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|mp3|wav|vtt|pdf|woff|woff2|ttf|txt)$).*)",
  ],
};
