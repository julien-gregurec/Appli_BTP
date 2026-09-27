import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import {
  messageErreurSynchronisation,
  messageSynchronisation,
  synchroniserChantierReserves,
  type ClientReservesGp,
} from "@/lib/reserves-gp";

type ContexteRoute = { params: Promise<{ id: string }> };

/*
 * « Utiliser dans ELSATIA Réserves » / « Mettre à jour depuis Gestion Pro ».
 *
 * Route dédiée plutôt qu'action serveur de la fiche : l'action n'écrit RIEN dans Gestion
 * Pro, elle écrit dans Réserves. Elle ne doit donc pas hériter de la garde « gerer_chantiers »
 * des mutations de /chantiers/[id] — un chef de chantier affecté, responsable des réserves,
 * doit pouvoir l'utiliser. Le proxy exige l'accès au chantier (module-permissions) ; la
 * décision réelle est prise par la base, des deux côtés, sur l'entreprise du chantier
 * (`reserves_synchroniser_chantier_gp`). Relançable à volonté : idempotent.
 */
export async function POST(request: Request, { params }: ContexteRoute) {
  const { id } = await params;
  const parametres = new URLSearchParams();

  // Formulaire HTML classique : on exige une soumission de même origine (anti-CSRF).
  const site = request.headers.get("sec-fetch-site");
  const origine = request.headers.get("origin");
  const hote = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const origineEtrangere = (() => {
    if (!origine) return false;
    try { return new URL(origine).host !== hote; } catch { return true; }
  })();
  if ((site && site !== "same-origin") || origineEtrangere) {
    return NextResponse.json({ error: "Origine refusée" }, { status: 403 });
  }

  await getContexteEntreprise();
  const supabase = await createClient();
  try {
    const { rapport, copies } = await synchroniserChantierReserves(supabase as unknown as ClientReservesGp, id);
    parametres.set("success", messageSynchronisation(rapport, copies));
  } catch (erreur) {
    parametres.set("error", messageErreurSynchronisation(erreur instanceof Error ? erreur.message : ""));
  }
  // Redirection RELATIVE : l'hôte vu par le serveur peut différer de celui du navigateur
  // (proxy, 127.0.0.1 / localhost) et une URL absolue ferait perdre la session.
  return new Response(null, {
    status: 303,
    headers: { Location: `/chantiers/${encodeURIComponent(id)}?${parametres.toString()}#reserves`, "Cache-Control": "no-store" },
  });
}
