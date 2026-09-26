import { NextResponse, type NextRequest } from "next/server";
import { createStudioClient } from "../../../lib/supabase";
import { safeStudioDestination } from "@elsatia/studio-domain";
import { studioOrigin } from "../../../lib/config";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const client = await createStudioClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL(
          safeStudioDestination(request.nextUrl.searchParams.get("next")),
          studioOrigin(),
        ),
      );
  }
  return NextResponse.redirect(
    new URL("/login?error=Lien+invalide+ou+expiré", studioOrigin()),
  );
}
