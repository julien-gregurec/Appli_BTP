import { NextResponse } from "next/server";
import { creerGardeProxy } from "@elsatia/incident-control";
import { clePubliqueSupabaseConfiguree, urlSupabaseConfiguree } from "@/lib/supabase/cles";

/**
 * Mode sûr (incident) pour Colors — voir `packages/incident-control` et la migration
 * `20260928000807_incident_safe_mode_v1`. La base reste l'autorité (gardes d'écriture sur les
 * tables `colors_*`, politique restrictive sur le bucket `colors-seaux`).
 */
const garde = creerGardeProxy({
  app: "colors",
  urlSupabase: urlSupabaseConfiguree(),
  clePublique: clePubliqueSupabaseConfiguree(),
});

export async function reponseModeSur(chemin: string, methode: string, entetes: Headers): Promise<NextResponse | null> {
  const reponse = await garde({ chemin, methode, entetes });
  return reponse ? new NextResponse(reponse.corps, { status: reponse.statut, headers: reponse.entetes }) : null;
}
