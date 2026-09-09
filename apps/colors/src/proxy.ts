import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { POLITIQUE_RESSOURCES_PUBLIQUES, construireCspColors } from "@/lib/security/en-tetes";
import { clePubliqueSupabase, urlSupabase, urlSupabaseConfiguree } from "@/lib/supabase/cles";
import { porteCookieSession } from "@/lib/destination-connexion";
import {
  EN_TETE_CHEMIN,
  EN_TETE_SESSION,
  VALEUR_SESSION_ABSENTE,
  VALEUR_SESSION_PRESENTE,
} from "@/lib/en-tetes-requete";

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
    urlSupabase: urlSupabaseConfiguree(),
  });

  // Next 16 lit le nonce sur l'en-tête `Content-Security-Policy` **de la
  // requête** et le recopie sur les balises qu'il génère. Sans cette recopie
  // dans les en-têtes de requête, le nonce de la réponse ne correspondrait à
  // aucune balise et le bootstrap serait bloqué.
  const enTetesRequete = new Headers(request.headers);
  enTetesRequete.set("x-nonce", nonce);
  enTetesRequete.set("Content-Security-Policy", csp);

  // Le proxy est le seul endroit où le chemin demandé et les cookies de la
  // requête sont tous deux lisibles ; un composant serveur ne voit ni l'un ni
  // l'autre. Ces deux en-têtes sont posés avec `set` — jamais `append` — pour
  // qu'une valeur envoyée par le client soit écrasée et non ajoutée : elles
  // décrivent la requête telle que le serveur la constate, et rien d'autre.
  // Elles sont relues par `en-tetes-requete.ts`, qui revalide le chemin.
  enTetesRequete.set(EN_TETE_CHEMIN, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  enTetesRequete.set(
    EN_TETE_SESSION,
    porteCookieSession(request.cookies.getAll().map((cookie) => cookie.name)) ? VALEUR_SESSION_PRESENTE : VALEUR_SESSION_ABSENTE,
  );

  let response = NextResponse.next({ request: { headers: enTetesRequete } });
  const supabase = createServerClient(
    urlSupabase(),
    clePubliqueSupabase(),
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
