import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";

/**
 * Déconnexion par une route dédiée, et non par une Server Action.
 *
 * Une Server Action est postée à l'adresse de la PAGE COURANTE. Le proxy, lui, refuse toute
 * écriture (POST) sur un chemin dont l'utilisateur n'a pas le droit de gestion, en la
 * renvoyant vers `?lecture=seule` (303). Un salarié qui consulte un chantier — en lecture
 * seule, par construction — ne pouvait donc PAS se déconnecter depuis cette page : la
 * déconnexion était interceptée, l'écran d'erreur s'affichait, et la session restait ouverte
 * sur un téléphone partagé. Constaté en recette, trace réseau à l'appui.
 *
 * `/auth` est un chemin public du proxy : aucun garde de gestion ne s'y applique, quelle que
 * soit la page d'où l'on part. Le comportement reste celui de `logoutAction` à l'identique :
 * compte dépôt renvoyé vers la borne, connexion par e-mail désactivée respectée.
 */
function rediriger(chemin: string) {
  // Location relative (RFC 9110) : aucune origine à reconstruire derrière un proxy TLS.
  return new NextResponse(null, { status: 303, headers: { Location: chemin } });
}

export async function POST(request: NextRequest) {
  // Défense contre la déconnexion forcée depuis un autre site. Les cookies de session sont
  // déjà `SameSite=Lax` ; l'origine, quand le navigateur la donne, doit être la nôtre.
  const origine = request.headers.get("origin");
  const hote = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origine) {
    let hoteOrigine: string | null = null;
    try { hoteOrigine = new URL(origine).host; } catch { hoteOrigine = null; }
    if (!hote || hoteOrigine !== hote) {
      return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
    }
  }

  if (isEmailLoginDisabled()) return rediriger("/dashboard");

  const supabase = await createClient();
  // Un compte dépôt ne se déconnecte pas d'un clic : la borne propose la déconnexion
  // protégée par mot de passe.
  const { data: compteDepot } = await supabase.rpc("est_compte_depot_courant");
  if (compteDepot === true) return rediriger("/stock/borne?deconnexion=1");

  await supabase.auth.signOut();
  return rediriger("/login");
}
