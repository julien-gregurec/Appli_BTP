import { NextResponse, type NextRequest } from "next/server";
import { createStudioClient } from "../../../lib/supabase";
import { studioOrigin } from "../../../lib/config";
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (token_hash && type === "email") {
    const client = await createStudioClient();
    const { error } = await client.auth.verifyOtp({
      token_hash,
      type: "email",
    });
    if (!error)
      return NextResponse.redirect(new URL("/dashboard", studioOrigin()));
  }
  return NextResponse.redirect(
    new URL("/login?error=Lien+invalide+ou+expiré", studioOrigin()),
  );
}
