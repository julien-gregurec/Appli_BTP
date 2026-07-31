import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinationInterneSure } from "@/lib/security/redirects";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = destinationInterneSure(request.nextUrl.searchParams.get("next"), "/dashboard");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, request.url));
  }
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("Lien de connexion invalide ou expiré.")}`, request.url));
}
