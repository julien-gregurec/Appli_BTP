import { NextResponse } from "next/server";
import { cheminInterneStrict } from "@elsatia/email";
import { createClient } from "@/lib/supabase/server";
import { urlApplicationReserves } from "@/lib/invitations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const suivant = url.searchParams.get("next");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  // `startsWith("/") && !startsWith("//")` laissait passer `/\evil.example`, que
  // l'analyseur WHATWG normalise en `//evil.example` : redirection ouverte.
  const destination = suivant && cheminInterneStrict(suivant) ? suivant : "/dashboard";
  // Base de redirection : l'origine CONFIGURÉE, pas l'hôte de la requête (en-tête `Host`
  // falsifiable hors plateforme). L'hôte reçu ne sert que si l'origine est inutilisable.
  let base = url.origin;
  try {
    base = urlApplicationReserves();
  } catch {
    // Origine mal configurée : le build l'interdit déjà hors local ; on ne bloque pas la connexion.
  }
  return NextResponse.redirect(new URL(destination, base));
}
