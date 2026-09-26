import { NextResponse, type NextRequest } from "next/server";
import {
  IdentityError,
  isAuthUnavailable,
  isNonce,
  issuePlatformHandoff,
  preparePlatformHandoff,
  STUDIO_AUDIENCE,
} from "@elsatia/identity";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { identityIssuer, studioAccessDecision, studioExchangeUrl } from "@/lib/elsatia-identity/config";

// « Continuer avec mon compte ELSATIA » : Studio envoie ici le navigateur avec nonce = SHA-256 du
// secret qu'il a posé en cookie. Si la session GP est valide, on émet un jeton de passage (60 s,
// usage unique, aud=studio) et le navigateur le POSTe à Studio (jamais en URL : ni journaux, ni
// Referer, ni historique). La destination est fixée par la configuration, jamais par la requête.
export const dynamic = "force-dynamic";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function backToStudio(exchange: URL, code: string) {
  const url = new URL("/login", exchange.origin);
  url.searchParams.set("error_code", code);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  let exchange: URL;
  try {
    exchange = studioExchangeUrl();
  } catch {
    return new NextResponse("Passage vers Studio non configuré.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const nonce = request.nextUrl.searchParams.get("nonce");
  if (!isNonce(nonce)) return backToStudio(exchange, "NONCE_MISMATCH");

  const supabase = await createClient();
  let token: string;
  try {
    ({ token } = await issuePlatformHandoff(
      {
        issuer: identityIssuer(),
        currentUser: async () => {
          const { data, error } = await supabase.auth.getUser();
          if (isAuthUnavailable(error)) throw error;
          return data.user ? { id: data.user.id } : null;
        },
        prepare: (input) => preparePlatformHandoff(createAdminClient(), input),
        entitlementFor: studioAccessDecision,
      },
      { audience: STUDIO_AUDIENCE, nonce },
    ));
  } catch (error) {
    if (error instanceof IdentityError && error.code === "PLATFORM_SESSION_INVALID") {
      // Pas de session ELSATIA : connexion GP, puis retour ici avec le même nonce.
      const login = new URL("/login", request.nextUrl.origin);
      login.searchParams.set("next", `${request.nextUrl.pathname}?nonce=${nonce}`);
      return NextResponse.redirect(login, { headers: { "Cache-Control": "no-store" } });
    }
    const code = error instanceof IdentityError ? error.code : "PLATFORM_UNAVAILABLE";
    return backToStudio(exchange, code === "CONFIG_INVALID" ? "PLATFORM_UNAVAILABLE" : code);
  }

  const cspNonce = request.headers.get("x-nonce") ?? "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>ELSATIA Studio</title></head>
<body><form method="post" action="${escapeHtml(exchange.toString())}"><input type="hidden" name="token" value="${escapeHtml(token)}"><noscript><button type="submit">Continuer vers ELSATIA Studio</button></noscript></form>
<script nonce="${escapeHtml(cspNonce)}">document.forms[0].submit();</script></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
  });
}
