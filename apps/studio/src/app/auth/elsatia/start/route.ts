import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createHandoffState } from "@elsatia/identity";
import { safeStudioDestination } from "@elsatia/studio-domain";
import { handoffUrl } from "../../../../lib/identity";
import { encodeHandoffCookie, HANDOFF_COOKIE } from "../../../../lib/identity-policy";
import { studioOrigin } from "../../../../lib/config";

// Départ « Continuer avec mon compte ELSATIA » : secret aléatoire en cookie httpOnly (SameSite=None,
// car le retour est un POST inter-sites depuis l'identité centrale), seule son empreinte part.
export async function GET(request: NextRequest) {
  const next = safeStudioDestination(request.nextUrl.searchParams.get("next"));
  const { state, nonce } = createHandoffState();
  let target: URL;
  try {
    target = handoffUrl(nonce);
  } catch {
    return NextResponse.redirect(new URL("/login?error_code=PLATFORM_UNAVAILABLE", studioOrigin()));
  }
  (await cookies()).set(HANDOFF_COOKIE, encodeHandoffCookie(state, next), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/auth/elsatia",
    maxAge: 600,
  });
  return NextResponse.redirect(target, { headers: { "Cache-Control": "no-store" } });
}
