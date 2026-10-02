import { NextResponse } from "next/server";
import { codeHttpSante, controlesSupabase, creerLecteurEtatIncident, chargeurPostgrest, evaluerSante } from "@elsatia/incident-control";
import { clePubliqueSupabaseConfiguree, urlSupabaseConfiguree } from "@/lib/supabase/cles";

// Santé publique de Réserves : noms de contrôles et ok/ko uniquement, jamais de secret.
export const dynamic = "force-dynamic";

const url = urlSupabaseConfiguree();
const cle = clePubliqueSupabaseConfiguree();
const lecteur = creerLecteurEtatIncident({
  charger: url && cle ? chargeurPostgrest({ urlSupabase: url, clePublique: cle }) : async () => null,
});

export async function GET() {
  const rapport = await evaluerSante({
    app: "reserves",
    controles: controlesSupabase({ urlSupabase: url, clePublique: cle }),
    etat: await lecteur.lire(),
  });
  return NextResponse.json(
    { application: "reserves", ...rapport },
    { status: codeHttpSante(rapport), headers: { "Cache-Control": "no-store" } },
  );
}
