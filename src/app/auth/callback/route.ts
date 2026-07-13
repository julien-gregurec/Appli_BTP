import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function destinationSure(valeur: string | null) {
  return valeur?.startsWith("/") && !valeur.startsWith("//") ? valeur : "/dashboard";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = destinationSure(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, request.url));
  }
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("Lien de connexion invalide ou expiré.")}`, request.url));
}
