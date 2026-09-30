import { NextResponse } from "next/server";
import { creerGardeProxy } from "@elsatia/incident-control";

/**
 * Mode sûr (incident) pour Réserves — voir `packages/incident-control` et la migration
 * `20260928000807_incident_safe_mode_v1`. La base reste l'autorité (gardes d'écriture sur toutes
 * les tables `reserves_*`) ; le proxy répond 503 avant de solliciter la base ou Auth quand
 * Réserves est coupée, et bloque exports / invitations / uploads ciblés.
 */
const garde = creerGardeProxy({
  app: "reserves",
  urlSupabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
  clePublique: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export async function reponseModeSur(chemin: string, methode: string, entetes: Headers): Promise<NextResponse | null> {
  const reponse = await garde({ chemin, methode, entetes });
  return reponse ? new NextResponse(reponse.corps, { status: reponse.statut, headers: reponse.entetes }) : null;
}
