import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";

// Demandes d'export RGPD (asynchrones). L'entreprise d'un export ENTREPRISE vient TOUJOURS du
// contexte de session, jamais du corps de la requête ; un export UTILISATEUR ne porte jamais
// d'entreprise. Les droits sont vérifiés par la RPC (membre actif + gerer_parametres, pas de
// session d'assistance) ; la réponse ne contient ni chemin ni donnée.
export const dynamic = "force-dynamic";

const CLE = /^[A-Za-z0-9_.:-]{8,120}$/;

export async function POST(request: Request) {
  let corps: { type?: unknown; cle?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const type = corps.type === "ENTREPRISE" ? "ENTREPRISE" : corps.type === "UTILISATEUR" ? "UTILISATEUR" : null;
  if (!type) return NextResponse.json({ error: "Type d'export invalide" }, { status: 400 });
  const cle = typeof corps.cle === "string" && CLE.test(corps.cle) ? corps.cle : crypto.randomUUID();
  const entrepriseId = type === "ENTREPRISE" ? (await getContexteEntreprise()).entrepriseId : null;
  if (type === "ENTREPRISE" && !entrepriseId) return NextResponse.json({ error: "Aucune entreprise active" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rgpd_export_demander", {
    p_type: type, p_entreprise_id: entrepriseId, p_cle_idempotence: cle,
  });
  if (error) return NextResponse.json({ error: "Demande impossible" }, { status: 403 });
  const r = data as { statut: string; code?: string; job_id?: string; rejoue?: boolean };
  if (r.statut === "REFUSE") return NextResponse.json({ error: "Export non autorisé", code: r.code }, { status: 403 });
  return NextResponse.json({ job_id: r.job_id, statut: r.statut, rejoue: r.rejoue === true }, { status: r.rejoue ? 200 : 202 });
}

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rgpd_export_mes_demandes");
  if (error) return NextResponse.json({ error: "Lecture impossible" }, { status: 403 });
  return NextResponse.json({ exports: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
