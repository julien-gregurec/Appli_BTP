import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cheminInterneSur } from "@/lib/redirection-sure";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  const destination = cheminInterneSur(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(destination, url.origin));
}
