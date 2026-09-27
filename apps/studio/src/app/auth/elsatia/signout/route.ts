import { NextResponse, type NextRequest } from "next/server";
import { createStudioClient } from "../../../../lib/supabase";
import { studioOrigin } from "../../../../lib/config";

// Session refusée par le contrôle d'identité (compte désactivé, session hors pont, âge maximal) :
// les Server Components ne peuvent pas écrire de cookie, ils redirigent ici pour les effacer.
export async function GET(request: NextRequest) {
  const client = await createStudioClient();
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  const reason = request.nextUrl.searchParams.get("reason");
  const code = reason === "disabled" ? "ACCOUNT_DISABLED" : "REVOKED";
  return NextResponse.redirect(new URL(`/login?error_code=${code}`, studioOrigin()), { headers: { "Cache-Control": "no-store" } });
}
