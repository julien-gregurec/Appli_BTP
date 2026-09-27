import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { IdentityError, supabaseStudioSessions } from "@elsatia/identity";
import { safeStudioDestination } from "@elsatia/studio-domain";
import { studioAuthAdmin, studioBroker } from "../../../../lib/identity";
import { decodeHandoffCookie, HANDOFF_COOKIE } from "../../../../lib/identity-policy";
import { createStudioClient } from "../../../../lib/supabase";
import { studioOrigin } from "../../../../lib/config";

// Retour de l'identité centrale : POST (formulaire auto-soumis) portant le jeton de passage.
// Vérification complète (signature, iss, aud, exp, nonce = cookie, jti à usage unique) puis
// session émise par GoTrue Studio (cookies Studio). Aucune donnée plateforme n'est conservée.
const fail = (code: string) =>
  NextResponse.redirect(new URL(`/login?error_code=${encodeURIComponent(code)}`, studioOrigin()), 303);

export async function POST(request: NextRequest) {
  const store = await cookies();
  const started = decodeHandoffCookie(store.get(HANDOFF_COOKIE)?.value);
  store.set(HANDOFF_COOKIE, "", { path: "/auth/elsatia", maxAge: 0, secure: true, sameSite: "none", httpOnly: true });
  if (!started) return fail("NONCE_MISMATCH");
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string") return fail("MALFORMED");

  const client = await createStudioClient();
  // Une session Studio déjà présente sur ce navigateur est fermée : jamais deux identités mêlées.
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  try {
    await studioBroker().exchange(token, started.state, supabaseStudioSessions(studioAuthAdmin(), client));
  } catch (error) {
    const code = error instanceof IdentityError ? error.code : "STUDIO_AUTH_UNAVAILABLE";
    console.warn(JSON.stringify({ scope: "studio-identity", event: "exchange_refused", code }));
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return fail(code);
  }
  return NextResponse.redirect(new URL(safeStudioDestination(started.next), studioOrigin()), 303);
}
