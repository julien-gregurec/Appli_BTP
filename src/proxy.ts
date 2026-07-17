import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 a renommé "middleware" en "proxy" (même mécanisme).
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Les fichiers servis tels quels n'ont aucune règle d'accès à appliquer :
  // les exclure évite un aller-retour d'authentification vers Supabase pour
  // chacun. Le manuel (9,7 Mo) et les vidéos (20 Mo) le payaient à chaque
  // téléchargement.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|guides/|videos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|mp3|wav|vtt|pdf|woff|woff2|ttf|txt)$).*)",
  ],
};
