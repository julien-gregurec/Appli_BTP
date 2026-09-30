import { NextResponse } from "next/server";
import { cheminInterneStrict } from "@elsatia/email";
import { createClient } from "@/lib/supabase/server";
import { urlApplicationReserves } from "@/lib/invitations";
import { cheminInterneSur } from "@/lib/redirection-sure";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const suivant = url.searchParams.get("next");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  // Double validation (convergence V8) : `cheminInterneStrict` (V7, refuse `//`, `/\`, les
  // caractères de contrôle et leurs formes encodées) ET `cheminInterneSur` (REDTEAM-V2 F2,
  // renvoie la forme normalisée : `/.//evil.com` écarté).
  const destination = suivant && cheminInterneStrict(suivant)
    ? cheminInterneSur(suivant, "/dashboard")
    : "/dashboard";
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
