import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { construireCsp, entetesSecurite } from "@/lib/securite/entetes";

/**
 * Proxy de Réserves (l'ancien « middleware » de Next 15).
 *
 * Il fait deux choses, dans cet ordre :
 *   1. il pose les en-têtes de sécurité — politique de contenu comprise — sur la REQUÊTE,
 *      pour que Next applique lui-même le nonce à ses scripts d'hydratation ;
 *   2. il rafraîchit la session Supabase, comme auparavant.
 *
 * L'ordre compte : le nonce doit exister avant que Next ne rende quoi que ce soit.
 */
export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  // L'origine réellement servie, telle que le navigateur l'a demandée : c'est elle qui
  // décide de `upgrade-insecure-requests`, pas le mode de construction. Derrière un
  // terminateur TLS, `x-forwarded-proto` est la seule source qui dise la vérité.
  const protocole = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
    ?? request.nextUrl.protocol.replace(":", "");
  const csp = construireCsp({
    nonce,
    developpement: process.env.NODE_ENV !== "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    origineSecurisee: protocole === "https",
  });

  const entetesRequete = new Headers(request.headers);
  entetesRequete.set("content-security-policy", csp);
  entetesRequete.set("x-nonce", nonce);
  const requete = new NextRequest(request, { headers: entetesRequete });

  let response = NextResponse.next({ request: requete });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => requete.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => requete.cookies.set(name, value));
          response = NextResponse.next({ request: requete });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser();

  response.headers.set("Content-Security-Policy", csp);
  for (const { cle, valeur } of entetesSecurite(protocole === "https")) {
    response.headers.set(cle, valeur);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw-reserves.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)"],
};
