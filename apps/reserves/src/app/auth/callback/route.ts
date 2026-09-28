import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cheminInterneSur } from "@/lib/redirection-sure";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const suivant = url.searchParams.get("next");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  // Le validateur durci écarte `/\evil.com`, `/%5Cevil.com`, `/%09/evil.com`
  // et `/.//evil.com` que l'ancien test laissait devenir une origine externe.
  const destination = cheminInterneSur(suivant, "/dashboard");
  return NextResponse.redirect(new URL(destination, url.origin));
}
