import { NextResponse } from "next/server";
import { codeHttpSante, controlesSupabase, creerLecteurEtatIncident, chargeurPostgrest, evaluerSante } from "@elsatia/incident-control";

// Santé publique de Réserves : noms de contrôles et ok/ko uniquement, jamais de secret.
export const dynamic = "force-dynamic";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
