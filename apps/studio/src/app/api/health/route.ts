import { NextResponse } from "next/server";
import {
  chargeurPostgrest,
  codeHttpSante,
  controlesSupabase,
  creerLecteurEtatIncident,
  evaluerSante,
} from "@elsatia/incident-control";
import { controleWorker, sondeProfondeAutorisee } from "../../../lib/incident";
import { storageAdmin } from "../../../lib/storage-admin";

// Santé publique de Studio (projet dédié) : noms de contrôles et ok/ko, jamais de secret.
// Sonde profonde (Bearer STUDIO_CRON_SECRET) : ajoute l'état du worker de rendu vu depuis la base.
export const dynamic = "force-dynamic";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const lecteur = creerLecteurEtatIncident({
  charger: url && cle ? chargeurPostgrest({ urlSupabase: url, clePublique: cle }) : async () => null,
});

export async function GET(request: Request) {
  const profonde = sondeProfondeAutorisee(request.headers.get("authorization"));
  const controles = controlesSupabase({ urlSupabase: url, clePublique: cle });
  if (profonde) {
    let lire: (() => Promise<{ data: unknown; error: unknown }>) | null = null;
    try {
      const admin = storageAdmin();
      lire = async () => admin.rpc("incident_worker_sante");
    } catch {
      lire = null; // clé service absente : non configuré
    }
    controles.push(controleWorker(lire));
  }
  const rapport = await evaluerSante({ app: "studio", controles, etat: await lecteur.lire() });
  return NextResponse.json(
    { application: "studio", profondeur: profonde ? "complete" : "publique", ...rapport },
    { status: codeHttpSante(rapport), headers: { "Cache-Control": "no-store" } },
  );
}
