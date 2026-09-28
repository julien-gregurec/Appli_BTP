import { NextResponse, type NextRequest } from "next/server";
import { decisionIncident, reponseIncident, type ApplicationIncident } from "@elsatia/incident-control";
import { lecteurEtatIncident } from "@/lib/incident/etat";

/**
 * Garde « mode sûr » du proxy : rend la réponse 503 à servir, ou `null` pour continuer.
 * Appelée AVANT toute autre étape (limitation de débit, session) : une application coupée ne
 * doit plus solliciter ni la base ni Auth.
 */
export async function reponseModeSur(
  request: NextRequest,
  app: ApplicationIncident = "gestion_pro",
): Promise<NextResponse | null> {
  const decision = decisionIncident({
    app,
    chemin: request.nextUrl.pathname,
    methode: request.method,
    estServerAction: request.headers.has("next-action"),
    etat: await lecteurEtatIncident().lire(),
  });
  if (decision.action === "continuer") return null;
  const accepteHtml =
    !request.nextUrl.pathname.startsWith("/api/") && (request.headers.get("accept") ?? "").includes("text/html");
  const { statut, corps, entetes } = reponseIncident(decision, accepteHtml);
  return new NextResponse(corps, { status: statut, headers: entetes });
}
