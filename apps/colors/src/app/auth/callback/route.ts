import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinationInterneSure } from "@/lib/securite/redirections";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const suivant = url.searchParams.get("next");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const destination = destinationInterneSure(suivant);
  return NextResponse.redirect(new URL(destination, url.origin));
}
