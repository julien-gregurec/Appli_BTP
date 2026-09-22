import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinationInterneSure } from "@/lib/security/redirects";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    const repli = type === "recovery" ? "/nouveau-mot-de-passe" : "/onboarding";
    if (!error) return NextResponse.redirect(new URL(destinationInterneSure(request.nextUrl.searchParams.get("next"), repli), request.url));
  }
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("Lien de confirmation invalide ou expiré.")}`, request.url));
}
