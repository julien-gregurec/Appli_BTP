import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { POLITIQUE_RESSOURCES_PUBLIQUES, construireCspColors } from "@/lib/security/en-tetes";

/**
 * Ressources publiques servies telles quelles. Elles reçoivent une CSP — une
 * SVG ouverte au premier plan peut porter du script — mais celle des documents,
 * noncée, y serait nuisible : voir `POLITIQUE_RESSOURCES_PUBLIQUES`. Elles n'ont
 * par ailleurs aucune session à rafraîchir, ce qui évite un aller-retour
 * Supabase par icône.
 */
const RESSOURCES_PUBLIQUES =
  /^\/(?:icons\/|sw-colors\.js$|favicon\.ico$|manifest\.webmanifest$|robots\.txt$)/;

/**
 * Nonce de 128 bits, régénéré à chaque requête.
 *
 * `crypto.getRandomValues` est disponible tel quel dans le runtime du proxy ;
 * on n'y suppose ni `Buffer` ni module Node.
 */
function nonceRequete(): string {
  const octets = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...octets));
}

export async function proxy(request: NextRequest) {
  if (RESSOURCES_PUBLIQUES.test(request.nextUrl.pathname)) {
    const reponse = NextResponse.next();
    reponse.headers.set("Content-Security-Policy", POLITIQUE_RESSOURCES_PUBLIQUES);
    return reponse;
  }

  const nonce = nonceRequete();
  const csp = construireCspColors({
    nonce,
    estDeveloppement: process.env.NODE_ENV === "development",
    urlSupabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  // Next 16 lit le nonce sur l'en-tête `Content-Security-Policy` **de la
  // requête** et le recopie sur les balises qu'il génère. Sans cette recopie
  // dans les en-têtes de requête, le nonce de la réponse ne correspondrait à
  // aucune balise et le bootstrap serait bloqué.
  const enTetesRequete = new Headers(request.headers);
  enTetesRequete.set("x-nonce", nonce);
  enTetesRequete.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: enTetesRequete } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: enTetesRequete } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // `_next/static` et `_next/image` sont exclus : ce sont des sous-ressources,
  // jamais des documents de premier plan, et les en-têtes constants de
  // `next.config.ts` les couvrent déjà. Tout le reste — pages, routes d'API,
  // icônes, service worker, manifeste — passe par le proxy et reçoit la CSP.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
