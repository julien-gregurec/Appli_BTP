import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sonde de joignabilité.
 *
 * Elle ne dit rien, volontairement : ni identité, ni état applicatif. Sa seule fonction
 * est d'échouer quand le serveur est hors d'atteinte — ce que `navigator.onLine` ne sait
 * pas faire de façon fiable dès qu'un service worker contrôle la page, puisqu'il peut
 * alors répondre lui-même et faire croire à une connexion.
 *
 * Le service worker laisse passer `/api/` sans jamais le mettre en cache : la réponse
 * vient donc du réseau, ou pas du tout.
 */
export function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
